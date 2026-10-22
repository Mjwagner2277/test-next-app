package kubelogs

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Source supplies complete snapshots, honoring ctx and reporting read failures.
// Entries must preserve log-stream order within each container, including when
// timestamps are equal or go backwards. Collector implements Source; callers
// can also provide a source for testing.
type Source interface {
	Collect(context.Context, time.Time) (Report, error)
}

// Waiter polls a Source for caller-defined messages. It has no rule groups,
// environment variables, or application-specific expectations. Zero PollInterval
// uses 100 ms. Use a deadline/cancellable context to bound presence checks.
type Waiter struct {
	Source       Source
	PollInterval time.Duration
}

// WaitError preserves the last collected report for readable diagnostics. Its
// report may be incomplete and must not be used as successful assertion evidence.
// errors.Is works with the underlying context or collection error.
type WaitError struct {
	Operation string
	Query     Query
	Rules     []Rule
	Report    Report
	Err       error
}

func (e *WaitError) Unwrap() error { return e.Err }

func (e *WaitError) Error() string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s pod=%q container=%q since=%s until=%s rules=%+v: %v",
		e.Operation, e.Query.Pod, e.Query.Container, e.Query.Since.Format(time.RFC3339Nano),
		e.Query.Until.Format(time.RFC3339Nano), e.Rules, e.Err)
	// Keep the error readable; the full evidence remains available in Report.
	var recent []Entry
	for i := len(e.Report.Entries) - 1; i >= 0 && len(recent) < 5; i-- {
		if e.Query.Includes(e.Report.Entries[i]) {
			recent = append(recent, e.Report.Entries[i])
		}
	}
	if len(recent) == 0 {
		b.WriteString("; no collected entries in query scope")
	}
	for i := len(recent) - 1; i >= 0; i-- {
		entry := recent[i]
		message := entry.Message
		if len(message) > 240 {
			message = message[:240] + "..."
		}
		fmt.Fprintf(&b, "\n  %s %s %q", entry.Time.Format(time.RFC3339Nano), entry.key(), message)
	}
	return b.String()
}

// WaitFor returns the matching entries from the first complete snapshot that
// contains a match. It does not consume records; use Query.Since for freshness.
func (w Waiter) WaitFor(ctx context.Context, query Query, rule Rule) ([]Entry, error) {
	return w.wait(ctx, query, "wait for logs", matchAll, 0, []Rule{rule})
}

// WaitForAll requires every rule to match in one complete snapshot. One entry
// may satisfy multiple rules, but is returned only once per snapshot occurrence.
// This checks presence, not ordering or an exact occurrence count.
func (w Waiter) WaitForAll(ctx context.Context, query Query, rules ...Rule) ([]Entry, error) {
	return w.wait(ctx, query, "wait for all logs", matchAll, 0, rules)
}

// WaitForAny succeeds when at least one rule matches in a complete snapshot.
func (w Waiter) WaitForAny(ctx context.Context, query Query, rules ...Rule) ([]Entry, error) {
	return w.wait(ctx, query, "wait for any logs", matchAny, 0, rules)
}

// WaitForSequence requires the rules to match distinct records in log-stream
// order within one complete snapshot. Query.Pod and Query.Container are required.
// Unrelated and earlier out-of-order occurrences are skipped: this checks for
// an ordered subsequence, not adjacency or the order of every occurrence.
// It returns exactly one entry per rule, in rule order. Replayed snapshots never
// advance a sequence; the full sequence is checked afresh on every collection.
func (w Waiter) WaitForSequence(ctx context.Context, query Query, rules ...Rule) ([]Entry, error) {
	if query.Pod == "" || query.Container == "" {
		return nil, errors.New("log sequence requires a specific pod and container")
	}
	return w.wait(ctx, query, "wait for log sequence", matchSequence, 0, rules)
}

// RequireAbsent polls throughout window and takes a final snapshot after it.
// Any matching record or collection failure fails the check. Query.Since must
// be nonzero and no later than now; Until must be zero. The window starts at
// this call, and records since Query.Since are checked, including earlier ones.
// Cancellation before the final successful collection is an error, not silence.
// This proves bounded absence only within logs retained by the source.
func (w Waiter) RequireAbsent(ctx context.Context, query Query, window time.Duration, rules ...Rule) error {
	if window <= 0 {
		return errors.New("absence requires a positive observation window")
	}
	if query.Since.IsZero() || query.Since.After(time.Now()) || !query.Until.IsZero() {
		return errors.New("absence requires a nonfuture Since and an open-ended Until")
	}
	_, err := w.wait(ctx, query, "require absent logs", matchAny, window, rules)
	return err
}

type matchMode uint8

const (
	matchAll matchMode = iota
	matchAny
	matchSequence
)

func (w Waiter) wait(ctx context.Context, query Query, operation string, mode matchMode, window time.Duration, rules []Rule) ([]Entry, error) {
	if w.Source == nil || w.PollInterval < 0 {
		return nil, errors.New("log source and nonnegative poll interval are required")
	}
	if len(rules) == 0 {
		return nil, errors.New("at least one log rule is required")
	}
	if !query.Until.IsZero() && query.Since.After(query.Until) {
		return nil, errors.New("query Since must not be after Until")
	}
	matchers := make([]Matcher, len(rules))
	for i, rule := range rules {
		matcher, err := Compile(rule)
		if err != nil {
			return nil, fmt.Errorf("log rule %d: %w", i+1, err)
		}
		matchers[i] = matcher
	}
	interval := w.PollInterval
	if interval == 0 {
		interval = 100 * time.Millisecond
	}
	end := time.Now().Add(window)
	var report Report
	fail := func(err error) ([]Entry, error) {
		return nil, &WaitError{Operation: operation, Query: query, Rules: append([]Rule(nil), rules...), Report: report, Err: err}
	}
	for {
		if err := ctx.Err(); err != nil {
			return fail(err)
		}
		// A final absence read must START after the window, not merely finish then.
		collectionStarted := time.Now()
		var err error
		report, err = w.Source.Collect(ctx, query.Since)
		if err != nil {
			return fail(fmt.Errorf("collect logs: %w", err))
		}
		if err := ctx.Err(); err != nil {
			return fail(err)
		}
		if err := report.assertable(); err != nil {
			return fail(err)
		}
		targets := 0
		for _, target := range report.Targets {
			if query.includesTarget(target) {
				targets++
			}
		}
		if targets == 0 {
			return fail(errors.New("no collected target matches the query"))
		}
		if mode == matchSequence && targets != 1 {
			return fail(errors.New("log sequence query must identify exactly one collected target"))
		}
		matched := make([]bool, len(matchers))
		var hits []Entry
		for _, entry := range report.Entries {
			if !query.Includes(entry) {
				continue
			}
			if mode == matchSequence {
				next := len(hits)
				if matchers[next].Matches(entry.Message) {
					matched[next] = true
					hits = append(hits, entry)
					if len(hits) == len(matchers) {
						break
					}
				}
				continue
			}
			hit := false
			for i, matcher := range matchers {
				if matcher.Matches(entry.Message) {
					matched[i], hit = true, true
				}
			}
			if hit {
				hits = append(hits, entry)
			}
		}
		if err := ctx.Err(); err != nil {
			return fail(err)
		}
		if window > 0 {
			if len(hits) > 0 {
				return fail(fmt.Errorf("unexpected log from %s: %q", hits[0].key(), hits[0].Message))
			}
			if !collectionStarted.Before(end) {
				return nil, nil
			}
		} else {
			all := true
			for _, hit := range matched {
				all = all && hit
			}
			if all || (mode == matchAny && len(hits) > 0) {
				return hits, nil
			}
		}
		delay := interval
		if window > 0 && time.Until(end) < delay {
			delay = max(0, time.Until(end))
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return fail(ctx.Err())
		case <-timer.C:
		}
	}
}
