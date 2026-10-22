package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gitlab.com/m2ke-group/kubelogs/kubelogs"
)

func TestSaveLogsArtifactsAndWriteFailure(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LOG_OUTPUT_DIR", dir)
	// A collector with no collection still exports an explicitly incomplete report.
	collector, err := kubelogs.New(kubelogs.Kubernetes{}, kubelogs.Options{Namespace: "test"})
	if err != nil {
		t.Fatal(err)
	}
	if err := saveLogs(collector); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "logs.txt"))
	if err != nil || !strings.Contains(string(data), "collection_complete=false") {
		t.Fatalf("artifact=%q err=%v", data, err)
	}
	t.Setenv("LOG_OUTPUT_DIR", filepath.Join(dir, "logs.json"))
	if err := saveLogs(collector); err == nil {
		t.Fatal("artifact write failure swallowed")
	}
}

func TestCLICollectsAndExportsBeforeUnimplementedUUTSetup(t *testing.T) {
	// Log setup no longer requires any rule groups or JSON configuration.
	t.Setenv("LOG_RULES", "")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/log") {
			fmt.Fprintf(w, "%s ready\n", time.Now().Format(time.RFC3339Nano))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"apiVersion":"v1","kind":"PodList","metadata":{},"items":[{"metadata":{"name":"uut","namespace":"test","uid":"uid"},"spec":{"containers":[{"name":"app"}]},"status":{"containerStatuses":[{"name":"app","containerID":"cid","restartCount":0,"state":{"running":{}}}]}}]}`)
	}))
	defer server.Close()
	dir := t.TempDir()
	config := filepath.Join(dir, "config")
	yaml := fmt.Sprintf("apiVersion: v1\nkind: Config\nclusters:\n- name: test\n  cluster:\n    server: %s\ncontexts:\n- name: test\n  context:\n    cluster: test\n    user: test\ncurrent-context: test\nusers:\n- name: test\n  user: {}\n", server.URL)
	if err := os.WriteFile(config, []byte(yaml), 0600); err != nil {
		t.Fatal(err)
	}
	for name, value := range map[string]string{
		"KUBECONFIG": config, "KUBERNETES_SERVICE_HOST": "", "KUBERNETES_SERVICE_PORT": "",
		"LOG_NAMESPACE": "test", "LOG_POD": "uut", "LOG_CONTAINER": "app", "LOG_SELECTOR": "", "LOG_OUTPUT_DIR": dir,
		"X310_LISTEN": "127.0.0.1:0", "UUT_ENDPOINT": "uut:50051", "ALERT_ID": "a", "HEALTH_ID": "h",
	} {
		t.Setenv(name, value)
	}
	err := run()
	if err == nil || !strings.Contains(err.Error(), "multi-step observation setup") {
		t.Fatalf("expected remaining UUT integration point, got %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "logs.txt"))
	if err != nil || !strings.Contains(string(data), "test/uut/app ready") {
		t.Fatalf("initial evidence not exported on setup failure: %q %v", data, err)
	}
}
