package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/containerlogs"
	"gitlab.com/m2ke-group/kubelogs/kubelogs"
	typed "k8s.io/client-go/kubernetes/typed/core/v1"
)

func logVerifierFromEnv() (*containerlogs.Verifier, *kubelogs.Collector, error) {
	window, err := durationEnv("LOG_QUIET_WINDOW", time.Second)
	if err != nil {
		return nil, nil, err
	}
	config, err := kubelogs.ClientConfig("")
	if err != nil {
		return nil, nil, fmt.Errorf("Kubernetes configuration: %w", err)
	}
	client, err := typed.NewForConfig(config)
	if err != nil {
		return nil, nil, err
	}
	collector, err := kubelogs.New(kubelogs.Kubernetes{Client: client}, kubelogs.Options{Namespace: os.Getenv("LOG_NAMESPACE"), LabelSelector: os.Getenv("LOG_SELECTOR")})
	if err != nil {
		return nil, nil, err
	}
	pod, container := os.Getenv("LOG_POD"), os.Getenv("LOG_CONTAINER")
	if pod == "" || container == "" {
		return nil, nil, fmt.Errorf("LOG_POD and LOG_CONTAINER are required for item-specific assertions")
	}
	return &containerlogs.Verifier{Logs: kubelogs.Waiter{Source: collector}, Pod: pod, Container: container, QuietWindow: window}, collector, nil
}

func saveLogs(collector *kubelogs.Collector) error {
	dir := envOrDefault("LOG_OUTPUT_DIR", "/tmp/x310-logs")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	report := collector.Archive()
	jsonFile, err := os.OpenFile(filepath.Join(dir, "logs.json"), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	writeErr := report.WriteJSON(jsonFile)
	closeErr := jsonFile.Close()
	if writeErr != nil {
		return writeErr
	}
	if closeErr != nil {
		return closeErr
	}
	textFile, err := os.OpenFile(filepath.Join(dir, "logs.txt"), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	writeErr = report.WriteText(textFile)
	closeErr = textFile.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}
