package kubelogs

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type snapshotFunc func(context.Context, time.Time) (Report, error)

func (f snapshotFunc) Collect(ctx context.Context, since time.Time) (Report, error) {
	return f(ctx, since)
}

func snapshot(messages ...string) Report {
	r := Report{Complete: true, Targets: []Target{target()}}
	for _, message := range messages {
		r.Entries = append(r.Entries, Entry{Target: target(), Time: time.Now(), Message: message})
	}
	return r
}

func TestWaitForPollsAndScopesRecords(t *testing.T) {
	since := time.Now().Add(-time.Second)
	until := time.Now().Add(time.Hour)
	query := Query{Pod: "uut", Container: "app", Since: since, Until: until}
	calls := 0
	w := Waiter{PollInterval: time.Millisecond, Source: snapshotFunc(func(_ context.Context, got time.Time) (Report, error) {
		calls++
		if !got.Equal(since) {
			t.Fatal("freshness boundary lost")
		}
		r := snapshot("ready", "ready", "ready", "ready", "not ready")
		r.Entries[0].Time = since.Add(-time.Nanosecond)
		r.Entries[1].Pod = "other"
		r.Entries[2].Container = "sidecar"
		r.Entries[3].Time = until.Add(time.Nanosecond)
		if calls == 2 {
			r.Entries = append(r.Entries, snapshot("ready").Entries...)
		}
		return r, nil
	})}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	hits, err := w.WaitFor(ctx, query, Rule{Exact: "ready"})
	if err != nil || calls != 2 || len(hits) != 1 || hits[0].Message != "ready" {
		t.Fatalf("hits=%v calls=%d err=%v", hits, calls, err)
	}
}

func TestWaitForAllAndAny(t *testing.T) {
	for _, any := range []bool{false, true} {
		calls := 0
		w := Waiter{PollInterval: time.Millisecond, Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
			calls++
			if calls == 1 {
				return snapshot("ready"), nil
			}
			// Two occurrences remain two hits, even with overlapping rules.
			return snapshot("ready", "probe 1 value=123", "probe 1 value=123"), nil
		})}
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		rules := []Rule{{Exact: "ready"}, {Regex: `^probe [0-9]+ value=123$`}, {Exact: "probe 1 value=123"}}
		var hits []Entry
		var err error
		if any {
			hits, err = w.WaitForAny(ctx, Query{}, rules...)
		} else {
			hits, err = w.WaitForAll(ctx, Query{}, rules...)
		}
		cancel()
		if err != nil {
			t.Fatal(err)
		}
		if any && (calls != 1 || len(hits) != 1) || !any && (calls != 2 || len(hits) != 3) {
			t.Fatalf("any=%t calls=%d hits=%v", any, calls, hits)
		}
	}
}

func TestWaitRejectsInvalidEvidence(t *testing.T) {
	failure := errors.New("API failure")
	for _, mode := range []string{"error with matches", "incomplete", "archive", "missing target", "canceled during read"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			w := Waiter{Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
				r := snapshot("ready")
				switch mode {
				case "error with matches":
					return r, failure
				case "incomplete":
					r.Complete = false
				case "archive":
					r.DiagnosticOnly = true
				case "missing target":
					r.Targets = nil
				case "canceled during read":
					cancel()
				}
				return r, nil
			})}
			hits, err := w.WaitFor(ctx, Query{Pod: "uut"}, Rule{Exact: "ready"})
			var diagnostic *WaitError
			if len(hits) != 0 || !errors.As(err, &diagnostic) || len(diagnostic.Report.Entries) != 1 {
				t.Fatalf("invalid evidence accepted/lost: hits=%v err=%v", hits, err)
			}
			if mode == "error with matches" && !errors.Is(err, failure) {
				t.Fatal("collection error lost")
			}
			if mode == "canceled during read" && !errors.Is(err, context.Canceled) {
				t.Fatal("cancellation lost")
			}
		})
	}
}

func TestWaitDeadlineIncludesReadableEvidence(t *testing.T) {
	w := Waiter{PollInterval: time.Millisecond, Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
		return snapshot("probe 4 value=70"), nil
	})}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err := w.WaitFor(ctx, Query{Pod: "uut"}, Rule{Exact: "probe 1 value=123"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("deadline lost: %v", err)
	}
	for _, text := range []string{"probe 1 value=123", "probe 4 value=70", "test/uut/app"} {
		if !strings.Contains(err.Error(), text) {
			t.Fatalf("missing diagnostic %q: %v", text, err)
		}
	}
}

func TestRequireAbsentChecksThroughFinalSnapshot(t *testing.T) {
	for _, mode := range []string{"quiet", "later match", "final API failure", "incomplete", "missing target", "cancel"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			started := time.Now()
			window := 15 * time.Millisecond
			calls := 0
			var lastRead time.Time
			failure := errors.New("final read failed")
			w := Waiter{PollInterval: 2 * time.Millisecond, Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
				calls++
				lastRead = time.Now()
				r := snapshot("heartbeat")
				switch mode {
				case "later match":
					if calls > 1 {
						return snapshot("changed"), nil
					}
				case "final API failure":
					if time.Since(started) >= window {
						return r, failure
					}
				case "incomplete":
					r.Complete = false
				case "missing target":
					r.Targets = nil
				case "cancel":
					cancel()
				}
				return r, nil
			})}
			err := w.RequireAbsent(ctx, Query{Pod: "uut", Since: started}, window, Rule{Exact: "changed"})
			if mode == "quiet" {
				if err != nil || calls < 2 || lastRead.Before(started.Add(window)) {
					t.Fatalf("absence ended early: calls=%d lastRead=%v err=%v", calls, lastRead, err)
				}
			} else if err == nil {
				t.Fatal("invalid silence passed")
			}
			if mode == "final API failure" && !errors.Is(err, failure) {
				t.Fatalf("final error lost: %v", err)
			}
			if mode == "cancel" && !errors.Is(err, context.Canceled) {
				t.Fatalf("cancellation lost: %v", err)
			}
		})
	}
}

func TestWaitRejectsInvalidArgumentsBeforeCollecting(t *testing.T) {
	w := Waiter{Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
		t.Fatal("invalid arguments must not collect")
		return Report{}, nil
	})}
	ctx := context.Background()
	for _, rule := range []Rule{{}, {Exact: "ready", Regex: "ready"}, {Regex: "["}} {
		if _, err := w.WaitFor(ctx, Query{}, rule); err == nil {
			t.Fatalf("invalid rule accepted: %+v", rule)
		}
	}
	if _, err := w.WaitForAll(ctx, Query{}); err == nil {
		t.Fatal("empty all accepted")
	}
	if _, err := w.WaitForAny(ctx, Query{}); err == nil {
		t.Fatal("empty any accepted")
	}
	for _, query := range []Query{{}, {Since: time.Now().Add(time.Hour)}, {Since: time.Now(), Until: time.Now().Add(time.Hour)}} {
		if err := w.RequireAbsent(ctx, query, time.Second, Rule{Exact: "ready"}); err == nil {
			t.Fatalf("invalid absence query accepted: %+v", query)
		}
	}
	if err := w.RequireAbsent(ctx, Query{Since: time.Now()}, 0, Rule{Exact: "ready"}); err == nil {
		t.Fatal("zero absence window accepted")
	}
}
