package main

import (
	"strings"
	"testing"
	"time"
)

func TestDurationEnv(t *testing.T) {
	for _, tt := range []struct {
		value   string
		want    time.Duration
		invalid bool
	}{
		{"", 15 * time.Second, false},
		{"2m", 2 * time.Minute, false},
		{"invalid", 0, true},
		{"0s", 0, true},
		{"-1s", 0, true},
	} {
		t.Run(tt.value, func(t *testing.T) {
			t.Setenv("SETUP_TIMEOUT", tt.value)
			got, err := durationEnv("SETUP_TIMEOUT", 15*time.Second)
			if tt.invalid {
				if err == nil || !strings.Contains(err.Error(), "SETUP_TIMEOUT") {
					t.Fatalf("expected error naming variable, got %v", err)
				}
				return
			}
			if err != nil || got != tt.want {
				t.Fatalf("got %v, %v; want %v", got, err, tt.want)
			}
		})
	}
}

func TestObservationEndpoints(t *testing.T) {
	t.Setenv("UUT_ENDPOINT", "legacy-health:50051")
	t.Setenv("HEALTH_ENDPOINT", "")
	t.Setenv("ALERT_ENDPOINT", "")
	if got := observationConfigFromEnv(); got.Endpoint != "legacy-health:50051" || got.AlertEndpoint != "" {
		t.Fatalf("legacy fallback: %+v", got)
	}
	t.Setenv("HEALTH_ENDPOINT", "health-server:50051")
	t.Setenv("ALERT_ENDPOINT", "alert-server:50052")
	if got := observationConfigFromEnv(); got.Endpoint != "health-server:50051" || got.AlertEndpoint != "alert-server:50052" {
		t.Fatalf("independent subscription endpoints: %+v", got)
	}
}
