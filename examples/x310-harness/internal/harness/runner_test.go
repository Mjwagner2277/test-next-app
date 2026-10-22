package harness

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/containerlogs"
	"gitlab.com/m2ke-group/kubelogs/internal/observation"
	"gitlab.com/m2ke-group/kubelogs/kubelogs"
)

func TestRunCleansUpFailedSetup(t *testing.T) {
	for _, alertEndpoint := range []string{"", "alerts:50052"} {
		t.Run("alert endpoint="+alertEndpoint, func(t *testing.T) {
			wantErr := errors.New("registration failed")
			cleaned := false
			config := Config{Listen: "127.0.0.1:0", Observation: observation.Config{Endpoint: "health:50051", AlertEndpoint: alertEndpoint, AlertID: "sensor-alert", HealthID: "sensor-health"}, SetupTimeout: time.Second, StepTimeout: time.Second}
			setup := func(setupCtx, lifetime context.Context, got observation.Config) (observation.Subscriber, func(), error) {
				want := config.Observation
				if want.AlertEndpoint == "" {
					want.AlertEndpoint = want.Endpoint
				}
				if got != want {
					t.Fatalf("configuration: got %+v, want %+v", got, want)
				}
				if _, ok := setupCtx.Deadline(); !ok {
					t.Fatal("setup must have deadline")
				}
				return nil, func() {
					cleaned = true
					if lifetime.Err() == nil {
						t.Error("cleanup must receive a canceled lifetime")
					}
				}, wantErr
			}
			err := Run(context.Background(), config, setup, &subscriberSpy{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
			if !errors.Is(err, wantErr) || !cleaned {
				t.Fatalf("err=%v cleaned=%v", err, cleaned)
			}
		})
	}
}

func TestRunRequiresObservationIDs(t *testing.T) {
	for _, missing := range []string{"alert", "health"} {
		t.Run(missing, func(t *testing.T) {
			config := Config{
				Listen:       "127.0.0.1:0",
				Observation:  observation.Config{Endpoint: "uut:50051", AlertID: "alert", HealthID: "health"},
				SetupTimeout: time.Second, StepTimeout: time.Second,
			}
			if missing == "alert" {
				config.Observation.AlertID = ""
			} else {
				config.Observation.HealthID = ""
			}
			setup := func(context.Context, context.Context, observation.Config) (observation.Subscriber, func(), error) {
				t.Fatal("setup must not run with a missing observation ID")
				return nil, nil, nil
			}
			err := Run(context.Background(), config, setup, &subscriberSpy{}, nil)
			if err == nil || err.Error() != "listen address, health endpoint, alert ID and health ID are required" {
				t.Fatalf("expected missing ID validation, got %v", err)
			}
		})
	}
}

func TestRunFailsOnMissingStartupLogs(t *testing.T) {
	failure := errors.New("startup missing")
	cleaned := false
	config := Config{Listen: "127.0.0.1:0", Observation: observation.Config{Endpoint: "uut", AlertID: "alert", HealthID: "health"}, SetupTimeout: time.Second, StepTimeout: time.Second}
	setup := func(context.Context, context.Context, observation.Config) (observation.Subscriber, func(), error) {
		return &subscriberSpy{}, func() { cleaned = true }, nil
	}
	err := Run(context.Background(), config, setup, &subscriberSpy{logErr: failure}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if !errors.Is(err, failure) || !cleaned {
		t.Fatalf("err=%v cleaned=%t", err, cleaned)
	}
}

// This executes the whole 66-step lifecycle through the real collector and log
// matcher. Only the UUT's protocol and Kubernetes transport are simulated.
func TestRunCompleteLifecycleWithCollectedLogs(t *testing.T) {
	var output bytes.Buffer
	backend := &runnerLogBackend{lines: []string{time.Now().Format(time.RFC3339Nano) + " ready"}}
	collector, err := kubelogs.New(backend, kubelogs.Options{Namespace: "test"})
	if err != nil {
		t.Fatal(err)
	}
	verifier := &containerlogs.Verifier{
		Logs: kubelogs.Waiter{Source: collector, PollInterval: time.Millisecond},
		Pod:  "uut", Container: "app", QuietWindow: time.Millisecond,
	}
	cleaned := false
	var activeAlerts, clearedAlerts, healthUpdates int
	setup := func(_ context.Context, lifetime context.Context, _ observation.Config) (observation.Subscriber, func(), error) {
		var event struct {
			URL string `json:"url"`
		}
		if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &event); err != nil {
			t.Fatal(err)
		}
		startPolling(t, event.URL)
		sub := injectedSubscriber{
			alert: func(_ context.Context, w observation.Observation, active bool) (time.Time, error) {
				if active {
					activeAlerts++
				} else {
					clearedAlerts++
				}
				return w.Since.Add(time.Millisecond), nil
			},
			health: func(_ context.Context, w observation.Observation) error {
				healthUpdates++
				backend.mu.Lock()
				defer backend.mu.Unlock()
				for i, v := range w.State.Breakers {
					if v != w.Previous.Breakers[i] {
						backend.lines = append(backend.lines, fmt.Sprintf("%s breaker %d value=%t", time.Now().Format(time.RFC3339Nano), i+1, v))
					}
				}
				for i, v := range w.State.Temperatures {
					if v != w.Previous.Temperatures[i] {
						backend.lines = append(backend.lines, fmt.Sprintf("%s probe %d value=%d", time.Now().Format(time.RFC3339Nano), i+1, v))
					}
				}
				return nil
			},
		}
		return sub, func() {
			cleaned = true
			if lifetime.Err() == nil {
				t.Error("lifetime not canceled before cleanup")
			}
		}, nil
	}
	config := Config{Listen: "127.0.0.1:0", Observation: observation.Config{Endpoint: "uut", AlertID: "a", HealthID: "h"}, SetupTimeout: time.Second, StepTimeout: time.Second}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = Run(ctx, config, setup, verifier, slog.New(slog.NewJSONHandler(&output, nil)))
	if err != nil {
		t.Fatal(err)
	}
	if !cleaned || !bytes.Contains(output.Bytes(), []byte("all scenarios passed")) {
		t.Fatal("run/cleanup did not finish")
	}
	if activeAlerts != 12 || clearedAlerts != 12 || healthUpdates != 32 {
		t.Fatalf("got %d active, %d clear, %d health checks; want 12, 12, 32", activeAlerts, clearedAlerts, healthUpdates)
	}
	if count := bytes.Count(output.Bytes(), []byte(`"msg":"scenario passed"`)); count != 66 {
		t.Fatalf("got %d completed scenarios, want 66", count)
	}
	if len(collector.Archive().Entries) != 33 {
		t.Fatalf("want startup + 32 changes, got %d", len(collector.Archive().Entries))
	}
}

type runnerLogBackend struct {
	mu    sync.Mutex
	lines []string
}

func (b *runnerLogBackend) Targets(context.Context, string, string) ([]kubelogs.Target, error) {
	return []kubelogs.Target{{Namespace: "test", Pod: "uut", UID: "uid", Container: "app", ContainerID: "cid"}}, nil
}
func (b *runnerLogBackend) Read(context.Context, kubelogs.Target, time.Time) (io.ReadCloser, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return io.NopCloser(strings.NewReader(strings.Join(b.lines, "\n") + "\n")), nil
}
