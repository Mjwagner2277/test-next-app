// Package uut implements the protocol-specific observation adapter.
package uut

import (
	"context"
	"errors"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/observation"
)

// This is a local Go adapter, NOT a protobuf message or generated gRPC service.
// Add fields with your actual types as you discover the API, for example:
// connection, generated clients, registration IDs, health/alert queues, receive
// errors and goroutine synchronization. An empty struct is just a placeholder;
// Go permits methods on it, but it cannot retain per-instance subscription state.
type grpcSubscriber struct{}

// SetupUUTObservation is OUR helper, not an RPC expected in your .proto files.
// Its body may call any number of functions in the order your protocol requires.
// setupCtx bounds registration; lifetimeCtx owns ongoing receivers. Do not use
// setupCtx as the lifetime of a stream that must survive setup cancellation.
// Success means health and alert observation are ready, with cleanup set.
// On failure, this helper must undo any partial setup before returning.
func SetupUUTObservation(setupCtx, lifetimeCtx context.Context, config observation.Config) (observation.Subscriber, func(), error) {
	// TODO: Register a health subscriber on config.Endpoint (the health server)
	// and a separate alert subscriber on config.AlertEndpoint.
	// TODO: Observe config.AlertID and check readings for config.HealthID.
	// Map (Kind, ID) to the known health/alert identities used by your service;
	// a local XML channel number alone is not a protobuf alert identity.
	// TODO: Inspect generated client interfaces and existing application call
	// sites to discover the actual handshake; no RPC names/order are assumed.
	// Implement connection/authentication, registration/filtering and delivery
	// setup as required. Delivery may use streams, callbacks, or a manager.
	// Store the resulting clients, handles and queues on a grpcSubscriber.
	// Confirm health and alert delivery are ready before returning. Start
	// concurrent receivers as required by the protocol, buffer without silently
	// dropping events. Buffer alerts while waiting for the 1 Hz health snapshot.
	// Bound setup using setupCtx; arrange cancellation of any lifetimeCtx-owned
	// streams if setup times out. Propagate registration and receive errors.
	// Return adapter, cleanup, nil only once fully wired. Cleanup must cancel
	// receivers, unregister if needed, close owned connections and join workers;
	// use a separate bounded context for unregister if lifetimeCtx is canceled.
	return nil, nil, errors.New("TODO: implement the UUT's multi-step observation setup")
}

func (*grpcSubscriber) AwaitHealth(ctx context.Context, want observation.Observation) error {
	// TODO ASSERT HERE: match the configured HealthID AND want.HealthTarget.ID.
	// Each call checks exactly one updated input, identified by HealthTarget.Kind.
	// For Kind == "breaker", compare the received Boolean directly to
	// want.HealthTarget.BreakerValue (false is a valid expected value).
	// For Kind == "temperature", compare to want.HealthTarget.TemperatureValue
	// and assert its health equals x310.TemperatureAlert(expectedTemperature).
	// Map the 1-based target ID to your protobuf's item identity. Buffer messages
	// for other inputs for their own AwaitHealth call; don't discard them.
	// A false breaker indicates a fault; true indicates normal. Map to the
	// actual UUT health representation; alert status comes from AwaitAlert.
	// Match source observation timestamps/sequence watermarks, not just local
	// receipt time: delayed/replayed messages must not satisfy a later step.
	// Return once this target matches; do not require a full-state snapshot.
	// Return an informative mismatch/last-observation error at ctx deadline;
	// fail immediately on stream errors or unexpected closure.
	return errors.New("TODO: assert received UUT health protobufs")
}

func (*grpcSubscriber) AwaitAlert(ctx context.Context, want observation.Observation, active bool) (time.Time, error) {
	// TODO ASSERT HERE: read the separate ALERT subscription. Resolve the known
	// alert identity for want.HealthTarget.Kind and want.HealthTarget.ID, then
	// assert its status is ACTIVE when active=true, or CLEARED when active=false.
	// Do not substitute a health message for alert evidence. Ignore unrelated
	// messages without discarding events needed by later target checks.
	// For activation, return the creation timestamp FROM THE UUT MESSAGE for
	// this activation. Harness.Check compares it with the XML change time;
	// harness and UUT clocks must be synchronized with adequate precision.
	// For clearing, reject stale/replayed clears using an update timestamp or
	// subscription sequence. Do not reject a clear for retaining the original
	// creation timestamp; return time.Time{} after its identity/status match.
	// Respect ctx (the configurable scenario deadline), propagate receive errors,
	// and retain buffered events while AwaitHealth waits for the next 1 Hz push.
	return time.Time{}, errors.New("TODO: assert received UUT alert protobuf")
}
