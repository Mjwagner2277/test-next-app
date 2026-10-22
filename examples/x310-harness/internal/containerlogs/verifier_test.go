package containerlogs

import (
	"context"
	"errors"
	"testing"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/observation"
	"gitlab.com/m2ke-group/kubelogs/internal/x310"
	"gitlab.com/m2ke-group/kubelogs/kubelogs"
)

type sourceFunc func(context.Context, time.Time) (kubelogs.Report, error)

func (f sourceFunc) Collect(ctx context.Context, since time.Time) (kubelogs.Report, error) {
	return f(ctx, since)
}

func verifierFor(messages ...string) *Verifier {
	target := kubelogs.Target{Namespace: "test", Pod: "uut", Container: "app"}
	return &Verifier{
		Pod: "uut", Container: "app", QuietWindow: time.Millisecond,
		Logs: kubelogs.Waiter{PollInterval: time.Millisecond, Source: sourceFunc(func(context.Context, time.Time) (kubelogs.Report, error) {
			r := kubelogs.Report{Complete: true, Targets: []kubelogs.Target{target}}
			for _, message := range messages {
				r.Entries = append(r.Entries, kubelogs.Entry{Target: target, Time: time.Now(), Message: message})
			}
			return r, nil
		})},
	}
}

func TestStateUsesChangedItemAndValue(t *testing.T) {
	previous := x310.State{Breakers: [4]bool{true, true, true, true}, Temperatures: [4]int{70, 71, 72, 73}}
	next := previous
	next.Breakers[1] = false
	next.Temperatures[0] = 123
	for _, tt := range []struct {
		name     string
		messages []string
		pass     bool
	}{
		{"both changed items", []string{"breaker 2 value=false", "probe 1 value=123"}, true},
		{"wrong probe", []string{"breaker 2 value=false", "probe 4 value=123"}, false},
		{"wrong temperature", []string{"breaker 2 value=false", "probe 1 value=122"}, false},
		{"wrong breaker", []string{"breaker 1 value=false", "probe 1 value=123"}, false},
		{"wrong breaker value", []string{"breaker 2 value=true", "probe 1 value=123"}, false},
		{"missing breaker", []string{"probe 1 value=123"}, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
			defer cancel()
			err := verifierFor(tt.messages...).AwaitState(ctx, observation.Observation{
				Previous: previous, State: next, Since: time.Now().Add(-time.Second),
			})
			if tt.pass && err != nil {
				t.Fatal(err)
			}
			if !tt.pass && !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("incorrect match: %v", err)
			}
		})
	}
}

func TestUnchangedStateChecksAbsence(t *testing.T) {
	for _, tt := range []struct {
		message string
		pass    bool
	}{
		{"heartbeat", true}, {"probe 1 value=123", false}, {"breaker 2 value=false", false},
	} {
		t.Run(tt.message, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			state := x310.State{Temperatures: [4]int{123, 70, 70, 70}}
			err := verifierFor(tt.message).AwaitState(ctx, observation.Observation{
				State: state, Previous: state, Since: time.Now().Add(-time.Second),
			})
			if (err == nil) != tt.pass {
				t.Fatalf("pass=%t error=%v", tt.pass, err)
			}
		})
	}
}

func TestStartupUsesStandaloneWait(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := verifierFor("ready").AwaitStartup(ctx); err != nil {
		t.Fatal(err)
	}
}
