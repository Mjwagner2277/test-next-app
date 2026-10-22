// Package containerlogs defines the X-310 harness's application log assertions.
// Other harnesses can use kubelogs.Waiter directly without importing this package.
package containerlogs

import (
	"context"
	"fmt"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/observation"
	"gitlab.com/m2ke-group/kubelogs/kubelogs"
)

type Verifier struct {
	Logs           kubelogs.Waiter
	Pod, Container string
	QuietWindow    time.Duration
}

// These are the documented EXAMPLE UUT messages. Adapt the strings/patterns in
// this file to the actual application's output when integrating the UUT. They
// are ordinary Go test expectations, not mandatory kubelogs configuration.
func (v *Verifier) AwaitStartup(ctx context.Context) error {
	_, err := v.Logs.WaitFor(ctx, kubelogs.Query{Pod: v.Pod, Container: v.Container},
		kubelogs.Rule{Exact: "ready"})
	return err
}

// AwaitState checks the actual old/new values supplied by this scenario. A
// repeated whole state must produce no new state-change log. Otherwise every
// changed item must have a fresh message containing its index and new value.
func (v *Verifier) AwaitState(ctx context.Context, want observation.Observation) error {
	query := kubelogs.Query{Pod: v.Pod, Container: v.Container, Since: want.Since}
	if want.Previous == want.State {
		return v.Logs.RequireAbsent(ctx, query, v.QuietWindow,
			kubelogs.Rule{Regex: `^(probe|breaker) `})
	}

	var expected []kubelogs.Rule
	for i, value := range want.State.Breakers {
		if value != want.Previous.Breakers[i] {
			expected = append(expected, kubelogs.Rule{
				Exact: fmt.Sprintf("breaker %d value=%t", i+1, value),
			})
		}
	}
	for i, value := range want.State.Temperatures {
		if value != want.Previous.Temperatures[i] {
			expected = append(expected, kubelogs.Rule{
				Exact: fmt.Sprintf("probe %d value=%d", i+1, value),
			})
		}
	}
	_, err := v.Logs.WaitForAll(ctx, query, expected...)
	return err
}
