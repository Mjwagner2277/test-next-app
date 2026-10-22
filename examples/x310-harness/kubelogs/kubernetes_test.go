package kubelogs

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	typed "k8s.io/client-go/kubernetes/typed/core/v1"
	"k8s.io/client-go/rest"
)

const podList = `{"apiVersion":"v1","kind":"PodList","metadata":{},"items":[{"metadata":{"name":"uut","namespace":"test","uid":"uid1"},"spec":{"containers":[{"name":"app"}]},"status":{"containerStatuses":[{"name":"app","containerID":"cid1","restartCount":0,"state":{"running":{}}}]}}]}`

func TestOfficialClientNamespaceCollection(t *testing.T) {
	since := time.Now().Add(-time.Second)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("client authentication missing")
		}
		switch r.URL.Path {
		case "/api/v1/namespaces/test/pods":
			w.Header().Set("Content-Type", "application/json")
			if r.URL.Query().Get("labelSelector") != "app=uut" {
				t.Error("selector missing")
			}
			fmt.Fprint(w, podList)
		case "/api/v1/namespaces/test/pods/uut/log":
			q := r.URL.Query()
			if q.Get("timestamps") != "true" || q.Get("container") != "app" || q.Get("follow") == "true" || q.Get("sinceTime") == "" {
				t.Errorf("incorrect log options: %v", q)
			}
			fmt.Fprint(w, line("ready"))
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	client, err := typed.NewForConfig(&rest.Config{Host: server.URL, BearerToken: "test-token"})
	if err != nil {
		t.Fatal(err)
	}
	c, err := New(Kubernetes{Client: client}, Options{Namespace: "test", LabelSelector: "app=uut"})
	if err != nil {
		t.Fatal(err)
	}
	report, err := c.Collect(context.Background(), since)
	if err != nil || len(report.Entries) != 1 || !report.Complete {
		t.Fatalf("report=%+v err=%v", report, err)
	}
}
func TestOfficialClientAuthorizationFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(403)
		fmt.Fprint(w, `{"kind":"Status","apiVersion":"v1","status":"Failure","reason":"Forbidden","message":"denied","code":403}`)
	}))
	defer server.Close()
	client, err := typed.NewForConfig(&rest.Config{Host: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	c := collector(t, Kubernetes{Client: client})
	r, err := c.Collect(context.Background(), time.Time{})
	if err == nil || r.Complete || len(r.Issues) != 1 {
		t.Fatalf("authorization failure hidden: %+v %v", r, err)
	}
}
func TestLocalKubeconfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	data := `apiVersion: v1
kind: Config
clusters:
- name: test
  cluster:
    server: https://127.0.0.1:6443
contexts:
- name: test
  context:
    cluster: test
    user: test
current-context: test
users:
- name: test
  user:
    token: fake-test-token
`
	if err := os.WriteFile(path, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	config, err := ClientConfig(path)
	if err != nil || !strings.Contains(config.Host, "6443") || config.BearerToken != "fake-test-token" {
		t.Fatalf("local config: %v", err)
	}
}
