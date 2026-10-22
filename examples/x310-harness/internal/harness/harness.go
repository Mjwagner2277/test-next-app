// Package harness coordinates fixture states and assertions against UUT output.
package harness

import (
	"context"
	"fmt"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/fixture"
	"gitlab.com/m2ke-group/kubelogs/internal/observation"
	"gitlab.com/m2ke-group/kubelogs/internal/x310"
)

// AlertDetectionLimit bounds UUT alert creation after the XML change, not
// delivery to the harness. Subscription delivery uses the scenario's ctx.
const AlertDetectionLimit = 100 * time.Millisecond

// Check changes the XML, waits for a poll, then validates each changed input's
// health, alert transition and application logs. Calls must be serialized.
// Setup must buffer both subscriptions before Check: health publishes at 1 Hz,
// so an alert can arrive while this function is still waiting for health.
func Check(ctx context.Context, s *fixture.Server, sub observation.Subscriber, logs observation.LogVerifier, state x310.State) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	previous := s.State()
	revision, since := s.Set(state)
	want := observation.Observation{State: state, Previous: previous, Since: since, Revision: revision}
	if err := s.WaitPolled(ctx, revision); err != nil {
		return err
	}
	// Each call targets one changed input, including transitions back to normal.
	// Do not wait for events for unchanged inputs (including baseline/repeat steps).
	var targets []observation.HealthTarget
	for i, value := range state.Breakers {
		if value != previous.Breakers[i] {
			targets = append(targets, observation.HealthTarget{Kind: "breaker", ID: i + 1, BreakerValue: value})
		}
	}
	for i, value := range state.Temperatures {
		if value != previous.Temperatures[i] {
			targets = append(targets, observation.HealthTarget{Kind: "temperature", ID: i + 1, TemperatureValue: value})
		}
	}
	for _, target := range targets {
		if err := ctx.Err(); err != nil {
			return err
		}
		item := want
		item.HealthTarget = target
		if err := sub.AwaitHealth(ctx, item); err != nil {
			return fmt.Errorf("health %s %d revision %d: %w", target.Kind, target.ID, revision, err)
		}

		// Require an alert event only when this input enters or leaves a fault.
		var wasActive, active bool
		if target.Kind == "breaker" {
			wasActive = !previous.Breakers[target.ID-1]
			active = !target.BreakerValue
		} else {
			wasActive = x310.TemperatureAlert(previous.Temperatures[target.ID-1])
			active = x310.TemperatureAlert(target.TemperatureValue)
		}
		if wasActive == active {
			continue
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		created, err := sub.AwaitAlert(ctx, item, active)
		if err != nil {
			return fmt.Errorf("alert %s %d active=%t revision %d: %w", target.Kind, target.ID, active, revision, err)
		}
		// A cleared event may retain its original creation time. The adapter
		// verifies clear freshness using its update time or subscription sequence.
		if active && (created.IsZero() || created.Before(since) || created.After(since.Add(AlertDetectionLimit))) {
			return fmt.Errorf("alert %s %d revision %d: creation time %s outside [%s, %s] (100 ms detection limit)",
				target.Kind, target.ID, revision, created.Format(time.RFC3339Nano), since.Format(time.RFC3339Nano), since.Add(AlertDetectionLimit).Format(time.RFC3339Nano))
		}
	}
	if err := logs.AwaitState(ctx, want); err != nil {
		return fmt.Errorf("UUT logs revision %d: %w", revision, err)
	}
	return ctx.Err()
}
