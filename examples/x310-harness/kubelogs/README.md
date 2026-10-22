# kubelogs

A public, reusable Go package for test harnesses. It depends on the official
`k8s.io/client-go` client, not this harness's sensor model, observation interfaces,
or private libraries. Import `gitlab.com/m2ke-group/kubelogs/kubelogs`. The repository also includes
an X-310 harness demonstrating its use.

```go
config, err := kubelogs.ClientConfig("") // in-cluster or standard local kubeconfig
if err != nil { return err }
client, err := corev1.NewForConfig(config) // typed/core/v1 client-go package
if err != nil { return err }
collector, err := kubelogs.New(kubelogs.Kubernetes{Client: client}, kubelogs.Options{
    Namespace: "application",
    LabelSelector: "app=uut", // omit to collect the entire namespace
})
if err != nil { return err }
logs := kubelogs.Waiter{Source: collector}
ctx, cancel := context.WithTimeout(parent, 30*time.Second)
defer cancel()
hits, err := logs.WaitFor(ctx, kubelogs.Query{Pod: "uut-0", Container: "app"},
    kubelogs.Rule{Exact: "ready"})
if err != nil {
    // Retain readable evidence even on failure.
    _ = collector.Archive().WriteText(os.Stdout)
    return err
}
fmt.Println(hits[0].Message)
```

This needs no rule groups, environment variables, X-310 configuration, or
observation interfaces. The caller supplies only the messages it needs to check.
Use `Collector` alone when all you need is log collection.

## Waiting and assertions

| Method | Success condition | Result |
| --- | --- | --- |
| `WaitFor(ctx, query, rule)` | At least one matching record | Matching entries |
| `WaitForAll(ctx, query, rules...)` | Every rule matches a complete snapshot | Matching entries |
| `WaitForAny(ctx, query, rules...)` | At least one rule matches a complete snapshot | Matching entries |
| `WaitForSequence(ctx, query, rules...)` | Every rule matches a later, distinct record from one pod/container | One matching entry per rule, in sequence order |
| `RequireAbsent(ctx, query, window, rules...)` | No rule matches throughout the observation, including a final successful snapshot | Error or nil |

```go
query := kubelogs.Query{Pod: "uut-0", Container: "app", Since: actionStarted}

// Build expected values directly from this test's input.
hits, err := logs.WaitFor(ctx, query, kubelogs.Rule{
    Exact: fmt.Sprintf("probe %d value=%d", probe, temperature),
})

// Or accept one of several messages.
hits, err = logs.WaitForAny(ctx, query,
    kubelogs.Rule{Exact: "connected"},
    kubelogs.Rule{Regex: `^connection [0-9]+ established$`},
)

// Check silence over a defined window; query.Since must be set before the action.
err = logs.RequireAbsent(ctx, query, time.Second,
    kubelogs.Rule{Regex: `^unexpected reconnect`},
)
```

`Rule.Exact` matches the entire message. `Rule.Regex` uses Go regular expressions;
anchor with `^` and `$` for whole-message matching. Set exactly one per rule.
All/any/sequence helpers require at least one rule. For all/any, a record can
satisfy several rules; it is returned once per snapshot occurrence. Repeated
identical records remain separate occurrences. All/any do not assert counts or
ordering. None of the helpers consume records between calls.

### Ordered messages

```go
hits, err := logs.WaitForSequence(ctx,
    kubelogs.Query{Pod: "uut-0", Container: "app", Since: actionStarted},
    kubelogs.Rule{Exact: "Starting"},
    kubelogs.Rule{Regex: `^Connected to device .+$`},
    kubelogs.Rule{Exact: "Ready"},
)
```

`WaitForSequence` requires both `Pod` and `Container`, and exactly one collected
target must match. It uses that container's log-stream order, not timestamp
sorting. Two records with equal timestamps are still distinct; a backward clock
adjustment does not reorder them. A custom `Source` must preserve stream order
within each container in its returned `Report.Entries`.

This checks for an **ordered subsequence**. Unrelated messages may occur between
matches. For rules A then B, `B, A, B` passes using the last two records; `B, A`
does not pass. Earlier out-of-order occurrences are ignored. Repeated or
overlapping rules each need their own record: one `ready` record cannot satisfy
two consecutive `ready` rules. The result contains exactly one record per rule,
selected in order from the first complete snapshot containing the sequence.

Every poll starts the sequence check afresh against a complete snapshot. It does
not advance using copies of old records across polls, combine disjoint snapshots,
or use failed read attempts. Keep logs retained for the full sequence. A missing
sequence waits until the context deadline; collection errors fail immediately.
Sequential calls to `WaitFor` do not establish ordering because each can match
retained history independently.

### Time windows and failures

Queries filter pod, container, and source timestamp interval. Capture `Since`
**before** the action you are testing. Zero `Since` permits retained history,
which is useful for checking startup. Presence checks honor an optional `Until`.
They poll until success or context cancellation; a missing/mismatched message
does not end the wait. Set a deadline. `PollInterval` defaults to 100 ms and can
be set on `Waiter`; the collector owns API retry policy.

`RequireAbsent` requires a positive window, a nonzero `Since` no later than now,
and zero `Until`. It polls from the start of the call, then requires a final
snapshot whose collection starts after the window. It also checks retained logs
between `Since` and the start of the call. An unexpected record fails immediately.
Cancellation before completion fails, even if no match has been seen. Choose a
window covering application polling/log flush delay and allow time for the final
API reads. A successful check establishes bounded absence in retained history.

All helpers reject collection errors, diagnostic archives, incomplete reports,
and queries with no matching collected target. They never treat missing evidence
as silence. `WaitForAll` and `WaitForSequence` evaluate one complete snapshot at
a time; they do not combine partial attempts or different snapshots into
successful evidence.

Failures return `*kubelogs.WaitError` with the query, rules, underlying error and
last report. The error text includes recent messages in query scope. Use
`errors.Is(err, context.DeadlineExceeded)` to detect a timeout, or `errors.As`
to inspect/export the report. Reports from failed reads are diagnostic only.

## Lower-level collection and matching

Existing `Collect`, `Compile`, and `Report.Find` remain available for callers
that want their own assertion flow:

```go
report, err := collector.Collect(ctx, actionStarted)
if err != nil { return err }
matcher, err := kubelogs.Compile(kubelogs.Rule{Exact: "ready"})
if err != nil { return err }
hits, err := report.Find(query, matcher)
```

Entries retain namespace, pod UID, container ID, restart count, source time,
collection time and message. Collection reports preserve each container's stream
order, grouping records by container rather than globally sorting by timestamp.
`Archive().WriteText` and `WriteJSON` export readable evidence including failed
attempts, sorted by source timestamp for inspection. Archives are diagnostic-only;
assert against complete collection reports. Replayed snapshots do not duplicate
the archive.

## Collection guarantees and limits

Each collection uses finite Kubernetes log responses with timestamps. All
selected current regular, init and ephemeral containers are read. The namespace
is listed before and after reading; identity and membership must stay stable.
The first successful collection pins that target set. Restarts/replacements,
missing containers, and new containers invalidate later assertions. Use a new
collector when intentionally changing the target set. A pending container or an
empty selection produces an error, not a successful empty result.

Authorization/not-found failures fail immediately. Transient network errors,
429, server timeouts, service-unavailable/internal errors and truncated HTTP
reads retry with bounded increasing delay. Defaults are 3 attempts, 100 ms base
delay, and a 10 s timeout per API operation, always bounded by the caller's
context. A successful retry retains earlier diagnostics. Errors after retries
return an incomplete report; `Find` refuses incomplete evidence.

The archive starts at the earliest requested boundary and rereads retained logs
from that boundary, so logs between assertion calls are also retained. This
favours correctness and inspection over bandwidth. This is a snapshot collector,
not a permanent logging service. Kubernetes can rotate/delete logs between reads;
no API client can recover unavailable history. Retain logs for the duration of
tests, avoid restarting selected pods, and keep node/harness clocks synchronized.
`previous` container logs and historical deleted pods are not included.

Defaults cap the namespace snapshot/archive at 32 MiB and each line at 1 MiB.
Limits fail explicitly rather than silently truncate/drop evidence; customize
`Options` for larger test runs. The archive cap counts stored message/identity
strings and is not an exact cap on Go process memory. Calls are serialized;
provide a deadline even for local tests. Export before discarding the collector.

Permissions: `list` on `pods`, `get` on `pods/log`, in the selected namespace.
Local kubeconfig supports standard credentials, including exec plugins. Those
plugins must be present in the runtime; the harness's scratch container is
intended for in-cluster service-account authentication.

Transport and failure tests inject the small `Backend` interface. Integration
unit tests also use the real typed client against local HTTP test servers.
