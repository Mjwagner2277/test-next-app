package harness

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/fixture"
	"gitlab.com/m2ke-group/kubelogs/internal/observation"
	"gitlab.com/m2ke-group/kubelogs/internal/scenario"
)

type Config struct {
	Listen       string
	Observation  observation.Config
	SetupTimeout time.Duration
	StepTimeout  time.Duration
}

// Run owns the HTTP fixture and observation lifecycle. Setup must respect its
// deadline and roll back partial registration on error. Cleanup must be bounded,
// cancel receivers and join workers; it runs on success, failure and cancellation.
func Run(ctx context.Context, config Config, setup observation.SetupFunc, logs observation.LogVerifier, logger *slog.Logger) error {
	if config.Listen == "" || config.Observation.Endpoint == "" || config.Observation.AlertID == "" || config.Observation.HealthID == "" {
		return fmt.Errorf("listen address, health endpoint, alert ID and health ID are required")
	}
	if config.SetupTimeout <= 0 || config.StepTimeout <= 0 || setup == nil || logs == nil {
		return fmt.Errorf("positive timeouts and observation setup are required")
	}
	if logger == nil {
		logger = slog.Default()
	}
	s, err := fixture.Start(config.Listen, scenario.Baseline(), nil)
	if err != nil {
		return fmt.Errorf("start HTTP fixture: %w", err)
	}
	defer s.Close()
	lifetime, cancel := context.WithCancel(ctx)
	defer cancel()
	logger.Info("HTTP fixture listening", "url", s.URL)
	setupCtx, stop := context.WithTimeout(lifetime, config.SetupTimeout)
	if config.Observation.AlertEndpoint == "" {
		config.Observation.AlertEndpoint = config.Observation.Endpoint
	}
	sub, cleanup, err := setup(setupCtx, lifetime, config.Observation)
	setupErr := setupCtx.Err()
	stop()
	if cleanup != nil {
		defer func() { cancel(); cleanup() }()
	}
	if err != nil {
		return fmt.Errorf("observation setup: %w", err)
	}
	if setupErr != nil {
		return fmt.Errorf("observation setup: %w", setupErr)
	}
	if sub == nil || cleanup == nil {
		return fmt.Errorf("observation setup must return subscriber and cleanup")
	}
	logCtx, stopLogs := context.WithTimeout(lifetime, config.StepTimeout)
	err = logs.AwaitStartup(logCtx)
	stopLogs()
	if err != nil {
		return fmt.Errorf("UUT startup container logs: %w", err)
	}
	logger.Info("UUT startup container logs verified")
	for _, scenario := range scenario.All() {
		if err := lifetime.Err(); err != nil {
			return err
		}
		logger.Info("scenario started", "scenario", scenario.Name)
		step, stop := context.WithTimeout(lifetime, config.StepTimeout)
		err := Check(step, s, sub, logs, scenario.State)
		stop()
		if err != nil {
			logger.Error("scenario failed", "scenario", scenario.Name, "error", err)
			return fmt.Errorf("scenario %s: %w", scenario.Name, err)
		}
		logger.Info("scenario passed", "scenario", scenario.Name)
	}
	logger.Info("all scenarios passed")
	return nil
}
