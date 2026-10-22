// Package kubelogs collects Kubernetes namespace logs for reusable test assertions.
// Failed or incomplete collections are errors, never evidence of absent logs.
package kubelogs

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"sort"
	"strings"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

type Target struct {
	Namespace   string `json:"namespace"`
	Pod         string `json:"pod"`
	UID         string `json:"uid"`
	Container   string `json:"container"`
	ContainerID string `json:"containerID"`
	Restarts    int32  `json:"restarts"`
}

func (t Target) key() string { return t.Namespace + "/" + t.Pod + "/" + t.Container }

// Backend permits deterministic testing without a live cluster. Read returns a
// finite timestamped snapshot; read failures must be returned by the reader.
type Backend interface {
	Targets(context.Context, string, string) ([]Target, error)
	Read(context.Context, Target, time.Time) (io.ReadCloser, error)
}

type Options struct {
	Namespace      string
	LabelSelector  string
	Attempts       int
	RetryDelay     time.Duration
	RequestTimeout time.Duration
	MaxBytes       int
	MaxLineBytes   int
}
type Entry struct {
	Target
	Time        time.Time `json:"time"`
	CollectedAt time.Time `json:"collectedAt"`
	Message     string    `json:"message"`
}
type Issue struct {
	Time      time.Time `json:"time"`
	Operation string    `json:"operation"`
	Attempt   int       `json:"attempt"`
	Error     string    `json:"error"`
}
type Report struct {
	DiagnosticOnly bool     `json:"diagnosticOnly,omitempty"`
	Targets        []Target `json:"targets"`
	// Collect preserves log-stream order within each container. Archive sorts
	// entries by timestamp for diagnostics and cannot be used for assertions.
	Entries  []Entry `json:"entries"`
	Issues   []Issue `json:"issues"`
	Complete bool    `json:"complete"`
}

// Collector pins pod/container identity after its first successful collection.
// Replacement, restart, disappearance or additions invalidate subsequent test
// evidence. Create a new collector when intentionally changing the target set.
// Collect calls are serialized. Archive returns copies and retains retry diagnostics.
type Collector struct {
	backend Backend
	opts    Options
	mu      sync.Mutex
	pinned  map[string]Target
	archive Report
	counts  map[string]int
	bytes   int
	started bool
	since   time.Time
}

func New(backend Backend, opts Options) (*Collector, error) {
	if backend == nil || opts.Namespace == "" {
		return nil, errors.New("log backend and namespace are required")
	}
	if opts.Attempts == 0 {
		opts.Attempts = 3
	}
	if opts.RetryDelay == 0 {
		opts.RetryDelay = 100 * time.Millisecond
	}
	if opts.RequestTimeout == 0 {
		opts.RequestTimeout = 10 * time.Second
	}
	if opts.MaxBytes == 0 {
		opts.MaxBytes = 32 << 20
	}
	if opts.MaxLineBytes == 0 {
		opts.MaxLineBytes = 1 << 20
	}
	if opts.Attempts < 1 || opts.RetryDelay < 0 || opts.RequestTimeout <= 0 || opts.MaxBytes < 1 || opts.MaxLineBytes < 1 {
		return nil, errors.New("invalid collection limits")
	}
	return &Collector{backend: backend, opts: opts, counts: map[string]int{}}, nil
}
func (c *Collector) Collect(ctx context.Context, since time.Time) (Report, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.started || since.IsZero() || (!c.since.IsZero() && since.Before(c.since)) {
		c.since = since
	}
	c.started = true
	var last error
	var result Report
	c.archive.Complete = false
	for attempt := 1; attempt <= c.opts.Attempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		result = Report{Issues: result.Issues}
		targets, err := c.targets(ctx)
		result.Targets = targets
		if err == nil {
			err = validateTargets(targets, c.pinned)
		}
		if err == nil {
			totalBytes := 0
			for _, target := range targets {
				entries, readErr := c.read(ctx, target, c.since)
				for _, entry := range entries {
					totalBytes += len(entry.Message)
				}
				if totalBytes > c.opts.MaxBytes {
					err = errors.New("namespace snapshot exceeds MaxBytes")
					break
				}
				result.Entries = append(result.Entries, entries...)
				if readErr != nil {
					err = fmt.Errorf("%s: %w", target.key(), readErr)
					break
				}
			}
		}
		if err == nil {
			after, afterErr := c.targets(ctx)
			if afterErr != nil {
				err = afterErr
			} else {
				err = validateTargets(after, targetMap(targets))
			}
		}
		if err == nil {
			err = ctx.Err()
		}
		if saveErr := c.retain(result.Entries); saveErr != nil {
			err = saveErr
		}
		if err == nil {
			if c.pinned == nil {
				c.pinned = targetMap(targets)
			}
			// Preserve each container's response order for sequence assertions;
			// timestamps can be equal or go backwards. Archive sorts for display.
			result.Complete = true
			c.archive.Complete = true
			c.archive.Targets = append([]Target(nil), targets...)
			return result, nil
		}
		last = err
		issue := Issue{Time: time.Now(), Operation: "collect", Attempt: attempt, Error: err.Error()}
		result.Issues = append(result.Issues, issue)
		c.archive.Issues = append(c.archive.Issues, issue)
		if !retryable(err) || attempt == c.opts.Attempts {
			break
		}
		timer := time.NewTimer(c.opts.RetryDelay * time.Duration(attempt))
		select {
		case <-ctx.Done():
			timer.Stop()
			return result, ctx.Err()
		case <-timer.C:
		}
	}
	return result, fmt.Errorf("namespace %q log collection incomplete: %w", c.opts.Namespace, last)
}
func (c *Collector) targets(ctx context.Context) ([]Target, error) {
	request, cancel := context.WithTimeout(ctx, c.opts.RequestTimeout)
	defer cancel()
	return c.backend.Targets(request, c.opts.Namespace, c.opts.LabelSelector)
}
func (c *Collector) read(ctx context.Context, target Target, since time.Time) ([]Entry, error) {
	request, cancel := context.WithTimeout(ctx, c.opts.RequestTimeout)
	defer cancel()
	body, err := c.backend.Read(request, target, since)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	stop := context.AfterFunc(request, func() { _ = body.Close() })
	defer stop()
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 4096), c.opts.MaxLineBytes)
	var entries []Entry
	total := 0
	for scanner.Scan() {
		if err := request.Err(); err != nil {
			return entries, err
		}
		line := scanner.Text()
		if len(line) > c.opts.MaxLineBytes {
			return entries, errors.New("log line exceeds MaxLineBytes")
		}
		total += len(line)
		if total > c.opts.MaxBytes {
			return entries, errors.New("log snapshot exceeds MaxBytes; evidence was not silently truncated")
		}
		stamp, message, ok := strings.Cut(line, " ")
		at, parseErr := time.Parse(time.RFC3339Nano, stamp)
		if !ok || parseErr != nil {
			return entries, fmt.Errorf("invalid Kubernetes log timestamp for %s", target.key())
		}
		if !since.IsZero() && at.Before(since) {
			continue
		}
		entries = append(entries, Entry{Target: target, Time: at, CollectedAt: time.Now(), Message: message})
	}
	if err := request.Err(); err != nil {
		return entries, err
	}
	if err := scanner.Err(); err != nil {
		return entries, err
	}
	return entries, nil
}
func validateTargets(targets []Target, pinned map[string]Target) error {
	if len(targets) == 0 {
		return errors.New("namespace/selector has no loggable containers")
	}
	seen := map[string]bool{}
	for _, t := range targets {
		if t.UID == "" || t.ContainerID == "" {
			return fmt.Errorf("container %s has no stable identity", t.key())
		}
		if seen[t.key()] {
			return fmt.Errorf("duplicate target %s", t.key())
		}
		seen[t.key()] = true
		if pinned != nil && pinned[t.key()] != t {
			return fmt.Errorf("container identity changed, restarted or added: %s", t.key())
		}
	}
	if pinned != nil && len(targets) != len(pinned) {
		return errors.New("pod/container disappeared during collection")
	}
	return nil
}
func targetMap(targets []Target) map[string]Target {
	m := map[string]Target{}
	for _, t := range targets {
		m[t.key()] = t
	}
	return m
}
func retryable(err error) bool {
	if apierrors.IsUnauthorized(err) || apierrors.IsForbidden(err) || apierrors.IsNotFound(err) {
		return false
	}
	if apierrors.IsTooManyRequests(err) || apierrors.IsServiceUnavailable(err) || apierrors.IsTimeout(err) || apierrors.IsServerTimeout(err) || apierrors.IsInternalError(err) {
		return true
	}
	var network net.Error
	return errors.As(err, &network) || errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, context.DeadlineExceeded)
}
func (c *Collector) retain(entries []Entry) error {
	counts := map[string]int{}
	for _, entry := range entries {
		key := fmt.Sprintf("%s/%s/%s/%d/%s/%s", entry.key(), entry.UID, entry.ContainerID, entry.Restarts, entry.Time.Format(time.RFC3339Nano), entry.Message)
		counts[key]++
		if counts[key] <= c.counts[key] {
			continue
		}
		if c.bytes+len(key) > c.opts.MaxBytes {
			return errors.New("log archive exceeds MaxBytes; evidence was not silently dropped")
		}
		c.bytes += len(key)
		c.archive.Entries = append(c.archive.Entries, entry)
		c.counts[key] = counts[key]
	}
	return nil
}
func sortEntries(entries []Entry) {
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].Time.Equal(entries[j].Time) {
			return entries[i].key() < entries[j].key()
		}
		return entries[i].Time.Before(entries[j].Time)
	})
}
func (c *Collector) Archive() Report {
	c.mu.Lock()
	defer c.mu.Unlock()
	r := Report{DiagnosticOnly: true, Targets: append([]Target(nil), c.archive.Targets...), Entries: append([]Entry(nil), c.archive.Entries...), Issues: append([]Issue(nil), c.archive.Issues...), Complete: c.archive.Complete}
	sortEntries(r.Entries)
	return r
}

// WriteText includes collected output and every failed attempt, even after recovery.
func (r Report) WriteText(w io.Writer) error {
	for _, e := range r.Entries {
		if _, err := fmt.Fprintf(w, "%s %s/%s/%s %s\n", e.Time.Format(time.RFC3339Nano), e.Namespace, e.Pod, e.Container, e.Message); err != nil {
			return err
		}
	}
	for _, i := range r.Issues {
		if _, err := fmt.Fprintf(w, "%s COLLECTION ERROR attempt=%d %s\n", i.Time.Format(time.RFC3339Nano), i.Attempt, i.Error); err != nil {
			return err
		}
	}
	_, err := fmt.Fprintf(w, "collection_complete=%t\n", r.Complete)
	return err
}
func (r Report) WriteJSON(w io.Writer) error { return json.NewEncoder(w).Encode(r) }
