package kubelogs

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

type fakeBackend struct {
	targets func(context.Context) ([]Target, error)
	read    func(context.Context, Target, time.Time) (io.ReadCloser, error)
}

func (f fakeBackend) Targets(ctx context.Context, _, _ string) ([]Target, error) {
	return f.targets(ctx)
}
func (f fakeBackend) Read(ctx context.Context, t Target, since time.Time) (io.ReadCloser, error) {
	return f.read(ctx, t, since)
}
func target() Target {
	return Target{Namespace: "test", Pod: "uut", UID: "uid1", Container: "app", ContainerID: "cid1"}
}
func line(message string) string {
	return time.Now().UTC().Format(time.RFC3339Nano) + " " + message + "\n"
}
func collector(t *testing.T, b Backend) *Collector {
	t.Helper()
	c, err := New(b, Options{Namespace: "test", RetryDelay: time.Millisecond, RequestTimeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	return c
}
func fixedTargets(context.Context) ([]Target, error) { return []Target{target()}, nil }

func TestCollectRetainsAllLogsAndDuplicateOccurrences(t *testing.T) {
	output := line("same")
	output += output
	b := fakeBackend{targets: fixedTargets, read: func(context.Context, Target, time.Time) (io.ReadCloser, error) {
		return io.NopCloser(strings.NewReader(output)), nil
	}}
	c := collector(t, b)
	for i := 0; i < 2; i++ {
		r, err := c.Collect(context.Background(), time.Time{})
		if err != nil || !r.Complete || len(r.Entries) != 2 {
			t.Fatalf("report=%+v err=%v", r, err)
		}
	}
	r := c.Archive()
	if len(r.Entries) != 2 {
		t.Fatalf("replayed logs duplicated or real duplicates lost: %d", len(r.Entries))
	}
	var text, json bytes.Buffer
	if err := r.WriteText(&text); err != nil {
		t.Fatal(err)
	}
	if err := r.WriteJSON(&json); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text.String(), "test/uut/app same") || !strings.Contains(json.String(), `"message":"same"`) {
		t.Fatal("logs not readable")
	}
}
func TestTransientReadRetryKeepsDiagnostics(t *testing.T) {
	calls := 0
	c := collector(t, fakeBackend{targets: fixedTargets, read: func(context.Context, Target, time.Time) (io.ReadCloser, error) {
		calls++
		if calls == 1 {
			return nil, apierrors.NewServiceUnavailable("kubelet unavailable")
		}
		return io.NopCloser(strings.NewReader(line("ready"))), nil
	}})
	r, err := c.Collect(context.Background(), time.Time{})
	if err != nil || !r.Complete || calls != 2 || len(r.Issues) != 1 {
		t.Fatalf("report=%+v calls=%d err=%v", r, calls, err)
	}
	if len(c.Archive().Issues) != 1 {
		t.Fatal("retry diagnosis lost")
	}
}
func TestFailuresNeverProduceCompleteReport(t *testing.T) {
	for _, mode := range []string{"forbidden", "exhausted", "empty namespace", "restart", "removed", "malformed", "truncated"} {
		t.Run(mode, func(t *testing.T) {
			lists, reads := 0, 0
			c := collector(t, fakeBackend{
				targets: func(context.Context) ([]Target, error) {
					lists++
					if mode == "empty namespace" {
						return nil, nil
					}
					if mode == "removed" && lists > 1 {
						return nil, nil
					}
					value := target()
					if mode == "restart" && lists > 1 {
						value.Restarts++
					}
					return []Target{value}, nil
				},
				read: func(context.Context, Target, time.Time) (io.ReadCloser, error) {
					reads++
					switch mode {
					case "forbidden":
						return nil, apierrors.NewForbidden(schema.GroupResource{Resource: "pods/log"}, "uut", errors.New("denied"))
					case "exhausted":
						return nil, apierrors.NewServiceUnavailable("unavailable")
					case "malformed":
						return io.NopCloser(strings.NewReader("not timestamped\n")), nil
					case "truncated":
						return &brokenRead{Reader: strings.NewReader(line("partial"))}, nil
					}
					return io.NopCloser(strings.NewReader("")), nil
				},
			})
			r, err := c.Collect(context.Background(), time.Time{})
			if err == nil || r.Complete || c.Archive().Complete {
				t.Fatalf("failure passed: report=%+v err=%v", r, err)
			}
			if mode == "forbidden" && reads != 1 {
				t.Fatal("authorization failure retried")
			}
			if mode == "exhausted" && reads != 3 {
				t.Fatalf("retry count=%d", reads)
			}
			if mode == "truncated" && len(c.Archive().Entries) == 0 {
				t.Fatal("partial diagnostic logs discarded")
			}
			if _, err := r.Find(Query{}, Matcher{}); err == nil {
				t.Fatal("incomplete data accepted for matching")
			}
		})
	}
}

type brokenRead struct{ io.Reader }

func (b *brokenRead) Read(p []byte) (int, error) {
	n, err := b.Reader.Read(p)
	if err == io.EOF {
		return n, io.ErrUnexpectedEOF
	}
	return n, err
}
func (b *brokenRead) Close() error { return nil }
func TestReadTimeoutAndCancellation(t *testing.T) {
	read, write := io.Pipe()
	defer write.Close()
	c := collector(t, fakeBackend{targets: fixedTargets, read: func(context.Context, Target, time.Time) (io.ReadCloser, error) { return read, nil }})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	r, err := c.Collect(ctx, time.Time{})
	if !errors.Is(err, context.DeadlineExceeded) || r.Complete {
		t.Fatalf("report=%+v err=%v", r, err)
	}
	if _, err := write.Write([]byte("late")); !errors.Is(err, io.ErrClosedPipe) {
		t.Fatal("reader leaked")
	}
}
func TestLimitsFailInsteadOfDroppingEvidence(t *testing.T) {
	c, err := New(fakeBackend{targets: fixedTargets, read: func(context.Context, Target, time.Time) (io.ReadCloser, error) {
		return io.NopCloser(strings.NewReader(line(strings.Repeat("x", 1000)))), nil
	}}, Options{Namespace: "test", MaxBytes: 100})
	if err != nil {
		t.Fatal(err)
	}
	if r, err := c.Collect(context.Background(), time.Time{}); err == nil || r.Complete {
		t.Fatalf("over limit passed: %v", err)
	}
}
func TestMatchers(t *testing.T) {
	for _, tt := range []struct {
		rule  Rule
		text  string
		match bool
	}{{Rule{Exact: "ready"}, "ready", true}, {Rule{Exact: "ready"}, "not ready", false}, {Rule{Regex: `^probe [0-9]+ value=123$`}, "probe 1 value=123", true}} {
		m, err := Compile(tt.rule)
		if err != nil {
			t.Fatal(err)
		}
		if m.Matches(tt.text) != tt.match {
			t.Fatalf("rule=%+v text=%q", tt.rule, tt.text)
		}
	}
	for _, rule := range []Rule{{}, {Exact: "a", Regex: "a"}, {Regex: "["}} {
		if _, err := Compile(rule); err == nil {
			t.Fatalf("bad rule accepted: %v", rule)
		}
	}
}
func ExampleReport_WriteText() {
	r := Report{Complete: true, Entries: []Entry{{Target: Target{Namespace: "test", Pod: "uut", Container: "app"}, Time: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Message: "ready"}}}
	var b bytes.Buffer
	_ = r.WriteText(&b)
	fmt.Print(b.String())
	// Output:
	// 2026-01-01T00:00:00Z test/uut/app ready
	// collection_complete=true
}

func TestArchiveCannotPromotePartialAttemptToEvidence(t *testing.T) {
	calls := 0
	c := collector(t, fakeBackend{targets: fixedTargets, read: func(context.Context, Target, time.Time) (io.ReadCloser, error) {
		calls++
		if calls == 1 {
			return &brokenRead{Reader: strings.NewReader(line("partial-only"))}, nil
		}
		return io.NopCloser(strings.NewReader(line("ready"))), nil
	}})
	report, err := c.Collect(context.Background(), time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	m, _ := Compile(Rule{Exact: "partial-only"})
	hits, err := report.Find(Query{}, m)
	if err != nil || len(hits) != 0 {
		t.Fatalf("partial attempt promoted to successful report: %v %v", hits, err)
	}
	if _, err := c.Archive().Find(Query{}, m); err == nil {
		t.Fatal("diagnostic archive allowed as assertion evidence")
	}
}

func TestCollectorDoesNotSkipLogsBetweenObservations(t *testing.T) {
	var requested []time.Time
	c := collector(t, fakeBackend{targets: fixedTargets, read: func(_ context.Context, _ Target, since time.Time) (io.ReadCloser, error) {
		requested = append(requested, since)
		return io.NopCloser(strings.NewReader("")), nil
	}})
	start := time.Now().Add(-time.Second)
	if _, err := c.Collect(context.Background(), start); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Collect(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if len(requested) != 2 || !requested[1].Equal(start) {
		t.Fatalf("collection left a gap: %v", requested)
	}
}
