package harness

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"testing"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/fixture"
	"gitlab.com/m2ke-group/kubelogs/internal/observation"
	"gitlab.com/m2ke-group/kubelogs/internal/x310"
)

// These fakes exercise harness orchestration; they do not validate real UUT or
// protobuf behavior. The production adapter must assert actual received data.
type alertCall struct {
	target observation.HealthTarget
	active bool
}

type subscriberSpy struct {
	health                      []observation.HealthTarget
	alerts                      []alertCall
	healthErr, alertErr, logErr error
}

func (s *subscriberSpy) AwaitHealth(_ context.Context, w observation.Observation) error {
	s.health = append(s.health, w.HealthTarget)
	return s.healthErr
}
func (s *subscriberSpy) AwaitAlert(_ context.Context, w observation.Observation, active bool) (time.Time, error) {
	s.alerts = append(s.alerts, alertCall{w.HealthTarget, active})
	return w.Since.Add(time.Millisecond), s.alertErr
}
func (s *subscriberSpy) AwaitStartup(context.Context) error                        { return s.logErr }
func (s *subscriberSpy) AwaitState(context.Context, observation.Observation) error { return s.logErr }

type injectedSubscriber struct {
	alert  func(context.Context, observation.Observation, bool) (time.Time, error)
	health func(context.Context, observation.Observation) error
	logs   func(context.Context, observation.Observation) error
}

func (s injectedSubscriber) AwaitAlert(ctx context.Context, w observation.Observation, active bool) (time.Time, error) {
	if s.alert == nil {
		return w.Since.Add(time.Millisecond), nil
	}
	return s.alert(ctx, w, active)
}
func (s injectedSubscriber) AwaitHealth(ctx context.Context, w observation.Observation) error {
	if s.health == nil {
		return nil
	}
	return s.health(ctx, w)
}
func (s injectedSubscriber) AwaitStartup(context.Context) error { return nil }
func (s injectedSubscriber) AwaitState(ctx context.Context, w observation.Observation) error {
	if s.logs == nil {
		return nil
	}
	return s.logs(ctx, w)
}
func startPolling(t *testing.T, url string) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		client := &http.Client{Timeout: time.Second}
		ticker := time.NewTicker(time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				request, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
				response, err := client.Do(request)
				if err == nil {
					_, _ = io.Copy(io.Discard, response.Body)
					response.Body.Close()
				}
			}
		}
	}()
	t.Cleanup(func() { cancel(); <-done })
}
func TestChangedHealthAndAlertLifecycle(t *testing.T) {
	for _, kind := range []string{"breaker", "temperature"} {
		for id := 1; id <= 4; id++ {
			t.Run(fmt.Sprintf("%s/%d", kind, id), func(t *testing.T) {
				initial := x310.State{Breakers: [4]bool{true, true, true, true}, Temperatures: [4]int{121, 121, 121, 121}}
				s, err := fixture.Start("127.0.0.1:0", initial, nil)
				if err != nil {
					t.Fatal(err)
				}
				defer s.Close()
				startPolling(t, s.URL)
				sub := &subscriberSpy{}
				ctx, cancel := context.WithTimeout(context.Background(), time.Second)
				defer cancel()
				fault := initial
				on := observation.HealthTarget{Kind: kind, ID: id}
				off := on
				if kind == "breaker" {
					fault.Breakers[id-1] = false
					off.BreakerValue = true
				} else {
					fault.Temperatures[id-1] = 122
					on.TemperatureValue = 122
					off.TemperatureValue = 121
				}
				// Repeating an unchanged value must require neither another health
				// update nor another alert, even for a currently active fault.
				for _, state := range []x310.State{fault, fault} {
					if err := Check(ctx, s, sub, sub, state); err != nil {
						t.Fatal(err)
					}
				}
				wantHealth := []observation.HealthTarget{on}
				if kind == "temperature" {
					// A changed hot value needs health validation, but it is not a
					// new alert activation with a new creation timestamp.
					fault.Temperatures[id-1] = 123
					if err := Check(ctx, s, sub, sub, fault); err != nil {
						t.Fatal(err)
					}
					wantHealth = append(wantHealth, observation.HealthTarget{Kind: kind, ID: id, TemperatureValue: 123})
				}
				if err := Check(ctx, s, sub, sub, initial); err != nil {
					t.Fatal(err)
				}
				wantHealth = append(wantHealth, off)
				if !reflect.DeepEqual(sub.health, wantHealth) {
					t.Fatalf("health targets: got %+v, want %+v", sub.health, wantHealth)
				}
				wantAlerts := []alertCall{{on, true}, {off, false}}
				if !reflect.DeepEqual(sub.alerts, wantAlerts) {
					t.Fatalf("alert transitions: got %+v, want %+v", sub.alerts, wantAlerts)
				}
			})
		}
	}
}

func TestCheckPropagatesObservationFailures(t *testing.T) {
	for _, stage := range []string{"health", "active alert", "clear alert", "logs"} {
		t.Run(stage, func(t *testing.T) {
			initial := x310.State{Breakers: [4]bool{true, true, true, true}}
			if stage == "clear alert" {
				initial.Breakers[0] = false
			}
			s, err := fixture.Start("127.0.0.1:0", initial, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			startPolling(t, s.URL)
			next := initial
			next.Breakers[0] = !initial.Breakers[0]
			failure := errors.New("observation failed")
			sub := &subscriberSpy{}
			switch stage {
			case "health":
				sub.healthErr = failure
			case "active alert", "clear alert":
				sub.alertErr = failure
			case "logs":
				sub.logErr = failure
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			if err := Check(ctx, s, sub, sub, next); !errors.Is(err, failure) {
				t.Fatalf("lost %s failure: %v", stage, err)
			}
		})
	}
}

func TestActiveAlertCreationTimestamp(t *testing.T) {
	for _, tc := range []struct {
		name   string
		offset time.Duration
		zero   bool
		wantOK bool
	}{
		{name: "zero", zero: true},
		{name: "stale", offset: -time.Nanosecond},
		{name: "at insertion", wantOK: true},
		{name: "timely", offset: time.Millisecond, wantOK: true},
		{name: "exactly 100ms", offset: 100 * time.Millisecond, wantOK: true},
		{name: "late", offset: 100*time.Millisecond + time.Nanosecond},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, err := fixture.Start("127.0.0.1:0", x310.State{}, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			startPolling(t, s.URL)
			sub := injectedSubscriber{alert: func(_ context.Context, w observation.Observation, active bool) (time.Time, error) {
				if !active {
					t.Fatal("expected activation")
				}
				if tc.zero {
					return time.Time{}, nil
				}
				return w.Since.Add(tc.offset), nil
			}}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			err = Check(ctx, s, sub, sub, x310.State{Temperatures: [4]int{122}})
			if (err == nil) != tc.wantOK {
				t.Fatalf("creation timestamp validity: err=%v, wantOK=%t", err, tc.wantOK)
			}
		})
	}
}

func TestDeliveryCanTakeLongerThanDetection(t *testing.T) {
	for _, stage := range []string{"1Hz health", "active alert", "clear alert"} {
		t.Run(stage, func(t *testing.T) {
			initial := x310.State{Breakers: [4]bool{true, true, true, true}}
			if stage == "clear alert" {
				initial.Breakers[0] = false
			}
			s, err := fixture.Start("127.0.0.1:0", initial, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			startPolling(t, s.URL)
			next := initial
			next.Breakers[0] = !initial.Breakers[0]
			delay := 120 * time.Millisecond
			if stage == "1Hz health" {
				delay = time.Second
			}
			wait := func(ctx context.Context) error {
				timer := time.NewTimer(delay)
				defer timer.Stop()
				select {
				case <-timer.C:
					return nil
				case <-ctx.Done():
					return ctx.Err()
				}
			}
			sub := injectedSubscriber{
				health: func(ctx context.Context, _ observation.Observation) error {
					if stage == "1Hz health" {
						return wait(ctx)
					}
					return nil
				},
				alert: func(ctx context.Context, w observation.Observation, active bool) (time.Time, error) {
					if stage != "1Hz health" {
						if err := wait(ctx); err != nil {
							return time.Time{}, err
						}
					}
					if !active {
						// Clear freshness is checked by the adapter; a clear need
						// not carry a new creation timestamp.
						return time.Time{}, nil
					}
					return w.Since.Add(time.Millisecond), nil
				},
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			if err := Check(ctx, s, sub, sub, next); err != nil {
				t.Fatalf("timely detection failed because of %s delivery: %v", stage, err)
			}
		})
	}
}

func TestCheckTimeoutAndCancellation(t *testing.T) {
	for _, stage := range []string{"poll", "health", "active alert", "clear alert", "logs", "canceled"} {
		t.Run(stage, func(t *testing.T) {
			initial := x310.State{Breakers: [4]bool{true, true, true, true}}
			if stage == "clear alert" {
				initial.Breakers[0] = false
			}
			s, err := fixture.Start("127.0.0.1:0", initial, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			if stage != "poll" {
				startPolling(t, s.URL)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
			defer cancel()
			wait := func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() }
			sub := injectedSubscriber{
				health: func(ctx context.Context, _ observation.Observation) error {
					if stage == "canceled" {
						cancel()
						return nil // Check must still reject a canceled step.
					}
					if stage == "health" {
						return wait(ctx)
					}
					return nil
				},
				alert: func(ctx context.Context, w observation.Observation, _ bool) (time.Time, error) {
					if stage == "active alert" || stage == "clear alert" {
						return time.Time{}, wait(ctx)
					}
					return w.Since.Add(time.Millisecond), nil
				},
				logs: func(ctx context.Context, _ observation.Observation) error {
					if stage == "logs" {
						return wait(ctx)
					}
					return nil
				},
			}
			next := initial
			next.Breakers[0] = !initial.Breakers[0]
			wantErr := context.DeadlineExceeded
			if stage == "canceled" {
				wantErr = context.Canceled
			}
			if err := Check(ctx, s, sub, sub, next); !errors.Is(err, wantErr) {
				t.Fatalf("%s: got %v, want %v", stage, err, wantErr)
			}
		})
	}
}

func TestUnchangedPassesPreviousAndCurrentState(t *testing.T) {
	s, err := fixture.Start("127.0.0.1:0", x310.State{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	startPolling(t, s.URL)
	called := false
	logs := injectedSubscriber{logs: func(_ context.Context, w observation.Observation) error {
		called = true
		if w.Previous != w.State || w.Since.IsZero() {
			t.Fatal("not an unchanged assertion")
		}
		return nil
	}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := Check(ctx, s, &subscriberSpy{}, logs, x310.State{}); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("logs not checked")
	}
}

func TestHealthTargetsOnlyChangedInputs(t *testing.T) {
	initial := x310.State{Breakers: [4]bool{true, true, true, true}}
	s, err := fixture.Start("127.0.0.1:0", initial, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	startPolling(t, s.URL)
	var got []observation.HealthTarget
	sub := injectedSubscriber{health: func(_ context.Context, w observation.Observation) error {
		got = append(got, w.HealthTarget)
		return nil
	}, logs: func(context.Context, observation.Observation) error { return nil }}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	next := initial
	next.Breakers[2] = false
	if err := Check(ctx, s, sub, sub, next); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != (observation.HealthTarget{Kind: "breaker", ID: 3, BreakerValue: false}) {
		t.Fatalf("wrong target: %+v", got)
	}
	if err := Check(ctx, s, sub, sub, next); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatal("unchanged input required health event")
	}
	if err := Check(ctx, s, sub, sub, initial); err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || !got[1].BreakerValue || got[1].ID != 3 {
		t.Fatalf("wrong recovery target: %+v", got)
	}
	next = initial
	next.Breakers[0] = false
	next.Temperatures[1] = 70
	if err := Check(ctx, s, sub, sub, next); err != nil {
		t.Fatal(err)
	}
	if len(got) != 4 || got[2].ID != 1 || got[3] != (observation.HealthTarget{Kind: "temperature", ID: 2, TemperatureValue: 70}) {
		t.Fatalf("wrong multiple targets: %+v", got)
	}
}
