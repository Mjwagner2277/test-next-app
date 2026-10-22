# kubelogs and X-310 test harness

The reusable [kubelogs package](kubelogs/README.md) provides Kubernetes log collection,
exact/regex assertions, and ordered message checks. Import it as
`gitlab.com/m2ke-group/kubelogs/kubelogs` from other Go test harnesses.

The included X-310 harness serves mutable X-310 XML, observes UUT health/alerts, and verifies
application logs. It runs 33 scenarios plus an unchanged repeat of each (66
checks). It fails on assertions, deadlines, cancellation, incomplete Kubernetes
log evidence, or artifact-write errors.

**Logging is implemented. The UUT protobuf registration and health/alert methods
remain integration points in `internal/uut/adapter.go`: generated clients and
protocol details are not available in this repository.** The binary intentionally
cannot report a real integration pass until those methods are implemented.

## Layout

- `kubelogs/`: public reusable namespace collector, official Kubernetes client,
  readable evidence, exact/regex matching, and failure handling. See its README.
- `internal/containerlogs/`: X-310 assertions written in Go using the shared waiter.
- `internal/observation/`: separate `Subscriber` and `LogVerifier` contracts.
- `internal/uut/`: protobuf integration only; no duplicate log methods/wrapper.
- `internal/fixture/`: HTTP fixture and poll tracking.
- `internal/x310/`: state, threshold and XML encoding.
- `internal/scenario/`: breaker/probe changes, recoveries and unchanged repeats.
- `internal/harness/`: lifecycle and assertions; receives subscriber and logger
  verifier independently.
- `cmd/x310-harness/`: environment configuration, Kubernetes setup, signals,
  overall deadline and artifact export.

Requires Go 1.25 or newer. The Docker build uses Go 1.26.

```sh
go test -race ./...
go vet ./...
go build -o /tmp/x310-harness ./cmd/x310-harness
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `X310_LISTEN` | `:8310` | HTTP fixture bind address |
| `HEALTH_ENDPOINT` | Required, or legacy `UUT_ENDPOINT` | Health server receiving UUT publications |
| `ALERT_ENDPOINT` | Health endpoint | Server hosting the separate alert subscription |
| `ALERT_ID` | Required | Alert item to observe |
| `HEALTH_ID` | Required | Health item to check |
| `SETUP_TIMEOUT` | `15s` | Initial collection and protobuf setup deadlines (each) |
| `STEP_TIMEOUT` | `30s` | Shared per-scenario deadline for polling, health/alert delivery, clearing and logs |
| `RUN_TIMEOUT` | `20m` | Overall run deadline |
| `LOG_NAMESPACE` | Required | Namespace to collect |
| `LOG_SELECTOR` | Empty | Optional pod label selector; empty means all pods |
| `LOG_POD` | Required | UUT pod used for assertions |
| `LOG_CONTAINER` | Required | UUT container used for assertions |
| `LOG_QUIET_WINDOW` | `1s` | Observation time for unchanged-state logging |
| `LOG_OUTPUT_DIR` | `/tmp/x310-logs` | `logs.json` and `logs.txt` artifact directory |
| `KUBECONFIG` | Standard client-go loading | Local Kubernetes credentials |

The Kubernetes client uses mounted service-account credentials inside a cluster,
or standard kubeconfig loading locally. No manual token-file reader or private
logging library is required. Signal handling and the run context are established
before Kubernetes API operations. Namespace collection runs before UUT setup so
setup failures still leave log evidence. A final collection uses a separate
5-second cleanup deadline to include logs written near failure/shutdown.

## Log assertions in Go

Log expectations live in `internal/containerlogs/verifier.go`. There is no
required rules map, JSON environment variable, or template syntax. The harness
compares each scenario's previous and current values:

- Startup calls `WaitFor` for the startup message in the current container's
  retained logs. This does not reboot the UUT.
- Changed input calls `WaitForAll`, constructing each expected breaker/probe
  message with its 1-based index and new boolean/integer value.
- A repeated whole state calls `RequireAbsent` to reject new state-change logs.
  Unrelated messages such as heartbeats are allowed.

**The Go assertions currently use the documented example messages:** `ready`,
`breaker 2 value=false`, and `probe 1 value=123`. Replace those strings/patterns
in `internal/containerlogs/verifier.go` with the actual UUT format during
integration. They are not a requirement of the reusable package.

A different harness can use only the reusable waiting functionality:

```go
logs := kubelogs.Waiter{Source: collector}
ctx, cancel := context.WithTimeout(parent, 30*time.Second)
defer cancel()

// Capture since BEFORE the action whose logs you are checking.
since := time.Now()
// Perform the test action here.
hits, err := logs.WaitFor(ctx, kubelogs.Query{
    Pod: "uut-0", Container: "app", Since: since,
}, kubelogs.Rule{Regex: `^Connected to device .+ successfully$`})
if err != nil { return err }
fmt.Println(hits[0].Message)
```

See `kubelogs/README.md` for `WaitFor`, `WaitForAll`, `WaitForAny`,
`WaitForSequence`, `RequireAbsent`, and lower-level collection/matching. Sequence
checks require a single pod/container and match distinct records in stream order,
allowing unrelated messages between matches. No X-310 packages are needed by
another harness. The X-310 value checks use `WaitForAll` because they require
each changed value to be logged without imposing an order between sensors.

Exact matching checks the whole message after the Kubernetes-added timestamp
is removed; application prefixes remain. Regex uses Go syntax. State assertions
are restricted to the selected pod/container and source times since insertion.
A message about probe 4 at 70 cannot satisfy an exact check for probe 1 at 123.

For unchanged input, the harness observes `LOG_QUIET_WINDOW` after polling.
No new health event is required for an unchanged input. The waiter polls during that interval and requires a final
successful snapshot started after the interval. Any matching message since state
insertion fails. A failed read, incomplete report, missing target, or cancellation
never counts as silence. Set the window to cover polling and log flush delay;
`STEP_TIMEOUT` must also allow API reads. Absence is bounded to retained logs in
the observed interval, not forever.

All collected messages remain available for inspection. JSON/text artifacts
include source identity and timestamps, partial logs and retry diagnostics. On
shutdown the CLI also emits retained entries as structured `UUT container log`
records, readable through `helm test --logs` or `kubectl logs`.

Migration: remove `LOG_RULES` and `logs.rules` from existing deployment settings.
Matching expectations now belong in the harness's Go code; operational settings
(namespace, selector, target, timeouts and artifact location) remain configurable.

## Alert timing and protobuf integration

Implement `SetupUUTObservation`, `AwaitHealth` and `AwaitAlert` in
`internal/uut/adapter.go`. Setup must return only when both receivers are ready.
Use the setup context for registration and lifetime context for ongoing delivery.
Cleanup must cancel receivers, unregister/close owned resources and join workers.

The UUT polls the XML every 100 ms, detects faults and creates/sends alerts,
while publishing its health snapshots separately at 1 Hz. The harness subscribes
to the health server and to the separate alert interface before changing XML.
These may be hosted at the same address or different configured endpoints.

| Input transition | Expected alert state |
| --- | --- |
| Breaker true → false | Active |
| Breaker false → true | Cleared |
| Temperature below 122 → at least 122 | Active |
| Temperature at least 122 → below 122 | Cleared |

An unchanged fault, or a temperature change that remains above threshold,
does not require a new activation. Health still verifies each changed value.

`AwaitAlert(ctx, want, active)` uses `want.HealthTarget` to identify the input
and matches its known alert identity and requested status. For activation it
returns the **UUT message's creation timestamp for this activation**, never local
receipt or validation time. `Check` asserts:

```text
XML change time <= alert creation time <= XML change time + 100 ms
```

The fixture records the change time under its state lock. Harness and UUT clocks
must be synchronized with timestamp precision sufficient for the 100 ms test.
Stale, missing, or late creation timestamps fail. For clearing, the adapter must
verify a fresh cleared status using an update timestamp or sequence watermark.
A cleared message may retain the original creation timestamp; the harness does
not apply the activation-time bound to it.

The 100 ms bound measures creation, not subscription delivery. `STEP_TIMEOUT`
bounds polling, 1 Hz health delivery, alert delivery/clearing and log checks as
one scenario. Set it above roughly 1.1 seconds plus processing and log-observation
time. Receivers must honor cancellation and continuously buffer/demultiplex both
subscriptions: `Check` waits for health before validating alerts that may already
have arrived. The XML remains unchanged until all checks complete. A missing
health message, active/cleared alert or required log fails the step.

Known protobuf identities must be mapped explicitly from `(Kind, ID)` in the
adapter, using the configured health/alert IDs or your service's per-input ID
mapping. Breaker 1 and temperature probe 1 are distinct. Placeholder methods
still return errors until real registration and assertions are implemented.

The HTTP response proves only polling, not UUT processing. For each changed
input, `Check` calls `AwaitHealth` once with `want.HealthTarget`: a 1-based ID,
kind (`breaker` or `temperature`), and the scalar expected value. Match that
specific item and value, including recovery transitions. Do not wait for all
four breakers or probes on each call. Multiple changes produce separate calls;
buffer other items' events for their own calls. Baseline and unchanged repeats
require polling/log checks but do not assert a fresh health event.

Health checks must verify the targeted reading, breaker polarity and
classification. Logs are independent
and cannot substitute for protobuf health/alert evidence.

For a custom breaker step in Go, preserve the other XML values and change only
the input you intend to assert:

```go
next := server.State()
next.Breakers[1] = false // input2state=0; expect breaker 2 health=false and active alert.
err := harness.Check(ctx, server, subscriber, logVerifier, next)
// Restore next.Breakers[1] = true and call Check again to assert recovery/clear.
```

`Check` passes `HealthTarget{Kind: "breaker", ID: 2, BreakerValue: false}`
to both assertion methods for that step. The existing 66 checks exercise all
four inputs of each kind, including 12 activations and 12 clears in total.

## Helm deployment

Create a values file for your application:

```yaml
logs:
  namespace: application
  selector: app=uut
  pod: uut-0
  container: app
  quietWindow: 1s
```

```sh
helm upgrade --install sensor-check helm/x310-harness \
  --namespace sensor-tests --create-namespace \
  --set image.repository=YOUR_REGISTRY/x310-harness \
  --set uut.healthEndpoint=health.application.svc:50051 \
  --set uut.alertEndpoint=alerts.application.svc:50051 \
  --set uut.alertID=YOUR_ALERT_ID --set uut.healthID=YOUR_HEALTH_ID \
  -f uut-log-values.yaml
helm test sensor-check --namespace sensor-tests --timeout 22m --logs
```

The UUT must poll `http://sensor-check-x310.sensor-tests.svc:8310/state.xml`.
The Service exists before the test Job; readiness is TCP so it cannot falsely
satisfy the polling assertion. Allow UUT-to-fixture and harness-to-UUT/API traffic.
The target namespace must already exist.

The chart creates a dedicated ServiceAccount and namespace-scoped Role/Binding
for `list pods` and `get pods/log`. To reuse an existing account, set
`serviceAccount.create=false` and `serviceAccount.name`; set `rbac.create=false`
when those permissions are already managed elsewhere. No cluster-wide role is
needed. The log selector does not narrow RBAC permissions below the namespace.

Artifacts are written to `/artifacts`, with an emptyDir mounted by default.
Set `logs.existingClaim` to retain files on a PVC after Job deletion. Structured
container output also carries the retained logs. The Job has no automatic retries,
a 24-hour TTL, and removes its previous instance before the next test. Avoid
concurrent tests against the same device. Keep its active deadline above the run
timeout plus cleanup (defaults: 1260 s versus 20 minutes).

## Evidence limits and validation

The collector reads current retained logs of all selected regular, init and
ephemeral containers. Pending containers, empty selections, target additions,
disappearances and restarts fail the collection. A new collector is needed for
an intentionally changed target set. Logs rotated/deleted before an API read
cannot be recovered; retain logs throughout tests and keep clocks synchronized.
The default archive/snapshot cap is 32 MiB and line cap is 1 MiB; exceeding a cap
fails rather than silently dropping evidence. Customize `kubelogs.Options` for
larger runs.

Tests include real client-go requests against local HTTP servers, authorization
and transient failures, truncated reads, malformed timestamps, restarts, resource
limits, cancellation, exact/regex matching, wrong-item rejection, wait-for-all/any, absence windows, alert creation
timing, delayed delivery, breaker/probe activation and clearing, and a complete 66-step lifecycle using the real collector/matcher with
simulated UUT and Kubernetes backends. No live-cluster or real-protobuf success
is implied by these tests.

The XML fixture uses `datavalues`, `input1state` through `input4state`, and
`sensor1` through `sensor4`. Configure `x310.Encoder` for firmware differences.
Temperatures are raw integer values; no unit conversion is performed.
