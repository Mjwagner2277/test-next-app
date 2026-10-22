package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/harness"
	"gitlab.com/m2ke-group/kubelogs/internal/observation"
	"gitlab.com/m2ke-group/kubelogs/internal/uut"
)

func run() (runErr error) {
	setupTimeout, err := durationEnv("SETUP_TIMEOUT", 15*time.Second)
	if err != nil {
		return err
	}
	stepTimeout, err := durationEnv("STEP_TIMEOUT", 30*time.Second)
	if err != nil {
		return err
	}
	runTimeout, err := durationEnv("RUN_TIMEOUT", 20*time.Minute)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, runTimeout)
	defer cancel()
	logs, collector, err := logVerifierFromEnv()
	if err != nil {
		return err
	}
	defer func() {
		// Preserve output emitted during setup failure or final cleanup as well.
		// A separate bounded context still works after run cancellation.
		finalCtx, stopFinal := context.WithTimeout(context.Background(), 5*time.Second)
		_, finalErr := collector.Collect(finalCtx, time.Time{})
		stopFinal()
		if finalErr != nil {
			runErr = errors.Join(runErr, fmt.Errorf("final namespace logs: %w", finalErr))
		}
		report := collector.Archive()
		for _, entry := range report.Entries {
			slog.Info("UUT container log", "namespace", entry.Namespace, "pod", entry.Pod, "container", entry.Container, "source_time", entry.Time, "message", entry.Message)
		}
		for _, issue := range report.Issues {
			slog.Warn("log collection attempt failed", "attempt", issue.Attempt, "error", issue.Error)
		}
		if err := saveLogs(collector); err != nil {
			runErr = errors.Join(runErr, fmt.Errorf("save collected logs: %w", err))
		} else {
			slog.Info("collected logs written", "directory", envOrDefault("LOG_OUTPUT_DIR", "/tmp/x310-logs"), "collection_complete", report.Complete)
		}
	}()
	collectCtx, stopCollect := context.WithTimeout(ctx, setupTimeout)
	_, err = collector.Collect(collectCtx, time.Time{})
	stopCollect()
	if err != nil {
		return fmt.Errorf("initial namespace logs: %w", err)
	}
	return harness.Run(ctx, harness.Config{
		Listen:       envOrDefault("X310_LISTEN", ":8310"),
		Observation:  observationConfigFromEnv(),
		SetupTimeout: setupTimeout, StepTimeout: stepTimeout,
	}, uut.SetupUUTObservation, logs, slog.Default())
}

// UUT_ENDPOINT is retained as a legacy alias; the subscriber connects to the
// health server that receives UUT publications, not the XML-polling application.
func observationConfigFromEnv() observation.Config {
	return observation.Config{
		Endpoint:      envOrDefault("HEALTH_ENDPOINT", os.Getenv("UUT_ENDPOINT")),
		AlertEndpoint: os.Getenv("ALERT_ENDPOINT"),
		AlertID:       os.Getenv("ALERT_ID"), HealthID: os.Getenv("HEALTH_ID"),
	}
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func durationEnv(name string, fallback time.Duration) (time.Duration, error) {
	value := envOrDefault(name, fallback.String())
	duration, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", name, err)
	}
	if duration <= 0 {
		return 0, fmt.Errorf("%s must be positive", name)
	}
	return duration, nil
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("harness failed", "error", err)
		os.Exit(1)
	}
}
