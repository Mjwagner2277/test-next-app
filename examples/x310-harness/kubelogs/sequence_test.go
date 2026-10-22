package kubelogs

import (
	"context"
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestWaitForSequenceOrderAndDistinctRecords(t *testing.T) {
	for _, tt := range []struct {
		name     string
		messages []string
		rules    []Rule
		want     []string
	}{
		{"ordered with unrelated logs", []string{"A", "heartbeat", "B42", "C"}, []Rule{{Exact: "A"}, {Regex: `^B[0-9]+$`}, {Exact: "C"}}, []string{"A", "B42", "C"}},
		{"reversed", []string{"C", "B", "A"}, []Rule{{Exact: "A"}, {Exact: "B"}, {Exact: "C"}}, nil},
		{"later valid subsequence", []string{"B", "A", "A", "B", "C", "C"}, []Rule{{Exact: "A"}, {Exact: "B"}, {Exact: "C"}}, []string{"A", "B", "C"}},
		{"repeated rule needs two records", []string{"A"}, []Rule{{Exact: "A"}, {Exact: "A"}}, nil},
		{"two identical records", []string{"A", "A"}, []Rule{{Exact: "A"}, {Exact: "A"}}, []string{"A", "A"}},
		{"overlapping patterns need two records", []string{"AB"}, []Rule{{Regex: `^A`}, {Regex: `B$`}}, nil},
		{"overlapping patterns with distinct records", []string{"AB", "AB"}, []Rule{{Regex: `^A`}, {Regex: `B$`}}, []string{"AB", "AB"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			r := snapshot(tt.messages...)
			// Identical timestamps must not collapse distinct log occurrences.
			stamp := time.Now()
			for i := range r.Entries {
				r.Entries[i].Time = stamp
			}
			w := Waiter{PollInterval: time.Millisecond, Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
				return r, nil
			})}
			ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
			defer cancel()
			hits, err := w.WaitForSequence(ctx, Query{Pod: "uut", Container: "app"}, tt.rules...)
			if tt.want == nil {
				if !errors.Is(err, context.DeadlineExceeded) || len(hits) != 0 {
					t.Fatalf("invalid sequence accepted: hits=%v err=%v", hits, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var messages []string
			for _, hit := range hits {
				messages = append(messages, hit.Message)
			}
			if !reflect.DeepEqual(messages, tt.want) {
				t.Fatalf("matches=%v want=%v", messages, tt.want)
			}
		})
	}
}

func TestWaitForSequenceUsesOneCompleteSnapshot(t *testing.T) {
	for _, tt := range []struct {
		name      string
		snapshots [][]string
		pass      bool
	}{
		{"growing history", [][]string{{"A"}, {"A", "B"}, {"A", "B", "C"}}, true},
		{"disjoint snapshots", [][]string{{"A"}, {"B"}, {"C"}}, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			w := Waiter{PollInterval: time.Millisecond, Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
				messages := tt.snapshots[min(calls, len(tt.snapshots)-1)]
				calls++
				return snapshot(messages...), nil
			})}
			ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
			defer cancel()
			hits, err := w.WaitForSequence(ctx, Query{Pod: "uut", Container: "app"}, Rule{Exact: "A"}, Rule{Exact: "B"}, Rule{Exact: "C"})
			if tt.pass {
				if err != nil || calls != 3 || len(hits) != 3 {
					t.Fatalf("calls=%d hits=%v err=%v", calls, hits, err)
				}
			} else if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("separate snapshots combined: %v", err)
			}
		})
	}
}

func TestWaitForSequenceScopesRecords(t *testing.T) {
	since := time.Now().Add(-time.Second)
	until := time.Now().Add(time.Second)
	r := snapshot("A", "B", "B", "B", "B", "B")
	r.Entries[1].Time = since.Add(-time.Nanosecond)
	r.Entries[2].Pod = "other"
	r.Entries[3].Container = "sidecar"
	r.Entries[4].Time = until.Add(time.Nanosecond)
	w := Waiter{Source: snapshotFunc(func(_ context.Context, got time.Time) (Report, error) {
		if !got.Equal(since) {
			t.Fatal("Since not passed to source")
		}
		return r, nil
	})}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	hits, err := w.WaitForSequence(ctx, Query{Pod: "uut", Container: "app", Since: since, Until: until}, Rule{Exact: "A"}, Rule{Exact: "B"})
	if err != nil || len(hits) != 2 || hits[1] != r.Entries[5] {
		t.Fatalf("out-of-scope record matched: %v %v", hits, err)
	}
}

func TestWaitForSequenceRejectsFailedEvidence(t *testing.T) {
	failure := errors.New("Kubernetes unavailable")
	for _, mode := range []string{"API error", "incomplete", "archive", "missing target", "ambiguous target", "canceled"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			w := Waiter{Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
				r := snapshot("A", "B")
				switch mode {
				case "API error":
					return r, failure
				case "incomplete":
					r.Complete = false
				case "archive":
					r.DiagnosticOnly = true
				case "missing target":
					r.Targets = nil
				case "ambiguous target":
					other := target()
					other.Namespace = "other"
					r.Targets = append(r.Targets, other)
				case "canceled":
					cancel()
				}
				return r, nil
			})}
			hits, err := w.WaitForSequence(ctx, Query{Pod: "uut", Container: "app"}, Rule{Exact: "A"}, Rule{Exact: "B"})
			var diagnostic *WaitError
			if len(hits) != 0 || !errors.As(err, &diagnostic) || diagnostic.Operation != "wait for log sequence" || len(diagnostic.Report.Entries) != 2 {
				t.Fatalf("invalid evidence accepted/lost: %v %v", hits, err)
			}
			if mode == "API error" && !errors.Is(err, failure) {
				t.Fatal("underlying error lost")
			}
			if mode == "canceled" && !errors.Is(err, context.Canceled) {
				t.Fatal("cancellation lost")
			}
		})
	}
}

func TestWaitForSequenceRejectsInvalidArguments(t *testing.T) {
	w := Waiter{Source: snapshotFunc(func(context.Context, time.Time) (Report, error) {
		t.Fatal("invalid sequence arguments must not collect")
		return Report{}, nil
	})}
	for _, query := range []Query{{}, {Pod: "uut"}, {Container: "app"}} {
		if _, err := w.WaitForSequence(context.Background(), query, Rule{Exact: "A"}); err == nil {
			t.Fatalf("ambiguous query accepted: %+v", query)
		}
	}
	for _, rules := range [][]Rule{nil, {{Regex: "["}}, {{Exact: "A", Regex: "A"}}} {
		if _, err := w.WaitForSequence(context.Background(), Query{Pod: "uut", Container: "app"}, rules...); err == nil {
			t.Fatalf("invalid sequence rules accepted: %+v", rules)
		}
	}
}

func TestSequenceUsesCollectedStreamOrderInsteadOfTimestamps(t *testing.T) {
	// A clock adjustment must not reorder B,A,A into a successful A,B sequence.
	stamp := time.Now()
	output := stamp.Format(time.RFC3339Nano) + " B\n" + stamp.Add(-time.Second).Format(time.RFC3339Nano) + " A\n" + stamp.Add(-time.Second).Format(time.RFC3339Nano) + " A\n"
	c := collector(t, fakeBackend{targets: fixedTargets, read: func(context.Context, Target, time.Time) (io.ReadCloser, error) {
		return io.NopCloser(strings.NewReader(output)), nil
	}})
	w := Waiter{Source: c, PollInterval: time.Millisecond}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	hits, err := w.WaitForSequence(ctx, Query{Pod: "uut", Container: "app"}, Rule{Exact: "B"}, Rule{Exact: "A"}, Rule{Exact: "A"})
	if err != nil || len(hits) != 3 {
		t.Fatalf("stream sequence lost: %v %v", hits, err)
	}
	archive := c.Archive()
	if archive.Entries[0].Message != "A" || !archive.DiagnosticOnly {
		t.Fatal("archive must still sort by time and remain diagnostic only")
	}
	short, stop := context.WithTimeout(ctx, 50*time.Millisecond)
	defer stop()
	if _, err := w.WaitForSequence(short, Query{Pod: "uut", Container: "app"}, Rule{Exact: "A"}, Rule{Exact: "B"}); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("timestamps reordered the log stream: %v", err)
	}
}
