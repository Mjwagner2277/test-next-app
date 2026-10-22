// Package fixture serves mutable X-310 state over HTTP and tracks polling.
package fixture

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"gitlab.com/m2ke-group/kubelogs/internal/x310"
)

type Server struct {
	URL      string
	mu       sync.Mutex
	state    x310.State
	revision uint64
	served   map[uint64]bool
	changed  chan struct{}
	encode   x310.Encoder
	http     *http.Server
}

// Start accepts 127.0.0.1:0 for an allocated port or a fixed address for an
// externally running UUT. Configure that UUT to poll the returned URL.
func Start(address string, initial x310.State, encode x310.Encoder) (*Server, error) {
	if encode == nil {
		encode = x310.EncodeXML
	}
	l, err := net.Listen("tcp", address)
	if err != nil {
		return nil, err
	}
	s := &Server{URL: "http://" + l.Addr().String() + "/state.xml", state: initial,
		served: make(map[uint64]bool), changed: make(chan struct{}), encode: encode}
	s.http = &http.Server{Handler: http.HandlerFunc(s.handle), ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = s.http.Serve(l) }()
	return s, nil
}

func (s *Server) Close() error { return s.http.Close() }

// State returns a snapshot of the current sensor inputs.
func (s *Server) State() x310.State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

// Set atomically replaces every input. Hold this state until its assertions
// complete so the polling UUT cannot skip an intermediate test step. The change
// timestamp is captured under the same lock before the new XML becomes visible.
func (s *Server) Set(state x310.State) (revision uint64, changedAt time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state = state
	s.revision++
	return s.revision, time.Now()
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/state.xml" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "GET required", http.StatusMethodNotAllowed)
		return
	}
	s.mu.Lock()
	state, revision := s.state, s.revision
	s.mu.Unlock()
	body, err := s.encode(state)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if _, err := w.Write(body); err != nil {
		return
	}
	s.mu.Lock()
	s.served[revision] = true
	close(s.changed)
	s.changed = make(chan struct{})
	s.mu.Unlock()
}

// WaitPolled proves the revision was written to an HTTP response, not that the
// UUT processed it. Only the subscriber assertions in harness.Check establish that.
func (s *Server) WaitPolled(ctx context.Context, revision uint64) error {
	for {
		s.mu.Lock()
		served, changed := s.served[revision], s.changed
		s.mu.Unlock()
		if served {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("waiting for XML revision %d: %w", revision, ctx.Err())
		case <-changed:
		}
	}
}
