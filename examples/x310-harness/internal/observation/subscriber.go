// Package observation defines the contracts for receiving and asserting UUT output.
package observation

import (
	"context"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/x310"
)

type Config struct {
	Endpoint      string // Health server gRPC address (the UUT publishes here).
	AlertEndpoint string // Alert service address; defaults to Endpoint.
	AlertID       string // Alert item to observe.
	HealthID      string // Health item whose status is checked.
}

type SetupFunc func(setupCtx, lifetimeCtx context.Context, config Config) (Subscriber, func(), error)

// HealthTarget identifies one changed input for health and alert assertions.
// ID is 1-based. Only the value corresponding to Kind is meaningful.
type HealthTarget struct {
	Kind             string // "breaker" or "temperature"
	ID               int
	BreakerValue     bool
	TemperatureValue int
}

// Observation describes an expected UUT result, never a result manufactured by
// the fixture. Since is a freshness boundary; Revision is local diagnostics only
// and is not sent in the device XML or expected to appear in protobuf messages.
type Observation struct {
	HealthTarget HealthTarget // Used by health and alert assertions; unused by logs.
	State        x310.State
	Previous     x310.State
	Since        time.Time
	Revision     uint64
}

// Subscriber checks received UUT output. Setup deliberately lives outside this
// interface: your protocol may need several RPCs, callback registration, streams,
// or an existing subscription manager rather than a single Subscribe RPC.
type Subscriber interface {
	// AwaitHealth asserts only want.HealthTarget for the configured HealthID.
	// Called once per changed input; unchanged inputs require no health event.
	// Temperature targets also require the corresponding health classification.
	AwaitHealth(context.Context, Observation) error
	// AwaitAlert uses the separate alert subscription to assert the known alert
	// identity for want.HealthTarget has the requested active/cleared state.
	// Match Kind AND ID; breaker 1 and temperature probe 1 are different inputs.
	// For active=true return the UUT's creation timestamp for THIS activation,
	// never local receipt/validation time. The harness checks its 100 ms limit.
	// For active=false verify a fresh clear (update time or sequence); its original
	// creation timestamp can predate recovery and the returned time is ignored.
	// Honor ctx for delivery/clearing. Buffer both subscriptions continuously so
	// waiting for 1 Hz health does not lose an earlier alert. Errors must fail.
	AwaitAlert(ctx context.Context, want Observation, active bool) (time.Time, error)
}

// LogVerifier is independent of the protobuf subscriber.
type LogVerifier interface {
	AwaitStartup(context.Context) error
	AwaitState(context.Context, Observation) error
}
