# test-next-app

A Next.js + TypeScript signal-stim interface for calling a server-hosted gRPC service through Envoy with gRPC-Web.

## Stack

- Next.js renders the app, runs the local development server, and logs and relays RPC requests.
- React stores the selected fault variants and the current on-screen fault state.
- MUI provides the table, buttons, selects, chips, panels, layout, theme, and icons.
- Protocol Buffers define the service contract in `proto/controlpanel/v1/control_panel.proto`.
- Buf generates TypeScript from the `.proto` file into `src/gen`.
- ConnectRPC creates a typed browser client from the generated service definition.
- ConnectRPC's `createGrpcWebTransport` sends browser requests with the gRPC-Web protocol.
- Envoy Gateway receives the browser's normal GUI requests and gRPC-Web requests on the same external port.
- Helm describes how the Next.js app, optional Envoy proxy, Services, and Envoy config are deployed to Kubernetes.

The app uses the ConnectRPC TypeScript library, and the selected browser protocol is gRPC-Web. The ConnectRPC client uses the same origin that served the GUI. Envoy Gateway routes both GUI and `/controlpanel.v1.SignalStimService/*` requests to Next.js. The server decodes and logs each RPC request, forwards it to the internal Envoy gRPC-Web endpoint, and logs its response before returning it to the browser.

## Run

```sh
npm install
npm run proto:gen
cp .env.example .env.local
npm run dev
```

The Next.js app runs at `http://localhost:3000`.

For local RPC calls, run or port-forward Envoy on `127.0.0.1:8080`, or set `SIGNAL_STIM_UPSTREAM_URL` in `.env.local` to another reachable gRPC-Web endpoint. The browser can call Next.js directly on port 3000; RPC request and response logs appear in the Next.js terminal.

## What The App Shows

The main screen is a 27-inch-display-oriented sensor fault matrix.

- Each row represents one signal-backed sensor, such as `Temperature A` or `Interlock B`.
- The `Fault variant` column lets an operator choose only the variants allowed by that row's fault class.
- The row action button calls the configured gRPC-Web service through ConnectRPC.
- Inserted faults are highlighted in the table.
- The header chip shows the total number of faults currently in the system.
- The right-side panel lists the active faults tracked by this browser session.
- `Reset faults` calls `ResetAll` and clears all injected faults when the response enum is `STATUS_SUCCESS`.
- `System reset` is intentionally left as a blank UI action until the proto exposes a system reset RPC.

The page starts with sample rows and zero active faults. Because this proto does not include a fault-state query response, the UI cannot rehydrate active faults from the backend after a page refresh. It updates the display locally after successful command responses.

## Configuration

The browser does not need an environment variable for the gRPC-Web URL in the default deployment shape. It calls the same origin that served the GUI.

That means the browser sends ConnectRPC requests to paths like:

```text
/controlpanel.v1.SignalStimService/SetSignal
/controlpanel.v1.SignalStimService/RemoveSignals
/controlpanel.v1.SignalStimService/ResetAll
```

Envoy Gateway should route traffic by path:

```text
/controlpanel.v1.SignalStimService/* -> Next.js RPC relay
/*                                  -> Next.js GUI

Next.js RPC relay -> internal Envoy -> native gRPC coordinator
```

The browser does not receive Kubernetes service DNS names such as `control-panel-grpc.default.svc.cluster.local`. The relay uses the server-only `SIGNAL_STIM_UPSTREAM_URL`; requests cannot select an arbitrary upstream. Routing RPCs directly to Envoy bypasses the app's request and response logging, so update any separately managed Gateway or ingress rules when adopting the relay.

Server settings are read at runtime:

| Environment variable | Helm value | Default |
| --- | --- | --- |
| `SIGNAL_STIM_UPSTREAM_URL` | `app.rpc.upstreamUrl` | Helm uses `http://<release-fullname>-envoy:<envoy.service.port>`; local `.env.example` uses `http://127.0.0.1:8080` |
| `SIGNAL_STIM_TIMEOUT_MS` | `app.rpc.timeoutMs` | `30000` milliseconds |
| `RPC_LOG_MAX_PAYLOAD_BYTES` | `app.rpc.logMaxPayloadBytes` | `65536` bytes per decoded log payload |

The relay preserves caller cancellation and shorter deadlines, with a 30-second default maximum for an upstream call. Incoming RPC messages are limited to 1 MiB. The logging limit is separate: it only shortens the logged preview and does not alter the forwarded signals. Keep these settings server-side; they do not use `NEXT_PUBLIC_` variables.

If you use the chart-managed Envoy proxy, configure the native gRPC server target in Helm values:

```yaml
upstreamGrpc:
  host: fault-coordinator-grpc.default.svc.cluster.local
  port: 9090
```

Change those values to point Envoy at your real server-hosted gRPC endpoint.

## Helm

The chart lives in `helm/test-next-app`.

Render the manifests locally:

```sh
helm template test-next-app ./helm/test-next-app
```

Install or upgrade:

```sh
helm upgrade --install test-next-app ./helm/test-next-app \
  --set image.repository=your-registry/test-next-app \
  --set image.tag=your-tag \
  --set upstreamGrpc.host=your-grpc-service.default.svc.cluster.local \
  --set upstreamGrpc.port=9090
```

The chart deploys:

- a Next.js app Deployment and Service
- an Envoy Deployment and Service
- an Envoy ConfigMap generated from Helm values
- an optional Gateway API `HTTPRoute` when `gateway.enabled=true`

For Envoy Gateway same-port routing, enable the chart's `HTTPRoute` and point it at your existing Gateway:

```sh
helm upgrade --install test-next-app ./helm/test-next-app \
  --set image.repository=your-registry/test-next-app \
  --set image.tag=your-tag \
  --set gateway.enabled=true \
  --set 'gateway.parentRefs[0].name=your-gateway' \
  --set 'gateway.parentRefs[0].namespace=your-gateway-namespace' \
  --set 'gateway.hostnames[0]=your-app.example.com'
```

The rendered `HTTPRoute` makes the GUI and gRPC-Web paths share the same hostname and listener. The route shape is:

```yaml
rules:
  - matches:
      - path:
          type: PathPrefix
          value: /controlpanel.v1.SignalStimService/
    backendRefs:
      - name: test-next-app-app
        port: 3000
  - matches:
      - path:
          type: PathPrefix
          value: /
    backendRefs:
      - name: test-next-app-app
        port: 3000
```

Both rules target `test-next-app-app`. The app's server-side upstream URL points to `test-next-app-envoy:8080`, so the internal forwarding hop does not loop through the public Gateway.

## Local Kind

For a local Kubernetes-in-Docker loop, use `kind` plus Envoy Gateway.

Install the local tools:

```sh
brew install kind helm
```

Create the cluster:

```sh
kind create cluster --name test-next-app
```

Install Envoy Gateway:

```sh
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.9.1 \
  -n envoy-gateway-system \
  --create-namespace
```

Wait for the controller:

```sh
kubectl wait --timeout=5m \
  -n envoy-gateway-system \
  deployment/envoy-gateway \
  --for=condition=Available
```

Build the GUI image and load it into kind:

```sh
docker build -f build/Dockerfile -t test-next-app:kind .
kind load docker-image test-next-app:kind --name test-next-app
```

Install the app using the kind profile:

```sh
helm upgrade --install test-next-app ./helm/test-next-app \
  -f helm/test-next-app/values-kind.yaml
```

Wait for the app and chart-managed Envoy proxy:

```sh
kubectl wait --timeout=5m \
  deployment/test-next-app-app \
  deployment/test-next-app-envoy \
  --for=condition=Available
```

Find the Envoy Gateway-managed proxy Service and port-forward it:

```sh
ENVOY_SERVICE=$(kubectl get svc -n envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=default,gateway.envoyproxy.io/owning-gateway-name=test-next-app \
  -o jsonpath='{.items[0].metadata.name}')

kubectl -n envoy-gateway-system port-forward service/${ENVOY_SERVICE} 8888:80
```

Open `http://localhost:8888`. This is the important local test: the GUI and gRPC-Web requests both go through the same forwarded Envoy Gateway port.

## Build

Docker-related build files live in `build`.

Build the app image from the repository root:

```sh
docker build -f build/Dockerfile -t test-next-app:latest .
```

The `.` at the end is important. It tells Docker to use the repo root as the build context, so `build/Dockerfile` can copy `package.json`, `src`, `proto`, and the other app files. `build/Dockerfile.dockerignore` keeps local-only folders such as `node_modules` and `.next` out of that context.

For the cyber-hardened UBI 9.6 image path, use:

```sh
npm run image:build:ubi-hardened
```

That build uses `build/Dockerfile.ubi-hardened` and is documented in `docs/container-hardening.md`.

## Request Flow

1. The user picks a fault variant in `src/app/ControlPanelConsole.tsx`.
2. The user clicks `Inject`, `Remove`, or `Reset faults`.
3. The page calls the typed ConnectRPC client in `src/rpc/faultCoordinatorClient.ts`.
4. The ConnectRPC client uses the browser's current origin as its gRPC-Web base URL.
5. ConnectRPC sends a gRPC-Web request to `/controlpanel.v1.SignalStimService/...`.
6. Envoy Gateway receives the request on the same host and port that served the GUI.
7. Envoy Gateway routes the service path to the Next.js app's RPC relay.
8. The relay assigns a request ID, logs the decoded request, and forwards the RPC to its configured internal gRPC-Web endpoint.
9. Envoy's `grpc_web` filter translates the request and sends it to the native gRPC coordinator.
10. The response comes back through Envoy as either `SignalsResponse` for set/remove or `ResponseStatus` for reset.
11. The relay logs the decoded response, duration, and application outcome, or logs a transport error, then returns the result to the browser. Authorization and the request ID are forwarded; headers and cookies are excluded from logs.
12. For set/remove, the browser updates its local active fault display only when the response status is `STATUS_SUCCESS` and `signal_errors` is empty. Reset requires `STATUS_SUCCESS`.
13. Failed commands leave the local fault display unchanged and keep `Reset faults` available, even if no complete fault is active, so the operator can clear signals after a partial batch or lost response.

## RPC Container Logs

`SetSignal`, `RemoveSignals`, and `ResetAll` produce structured JSON lines on the Next.js process's stdout. In Kubernetes, follow the app container:

```sh
kubectl logs deployment/test-next-app-app -c next-app --follow
```

Use your release name and namespace if different. With Docker, use:

```sh
docker logs --follow <app-container-name>
```

During `npm run dev:local`, the same records appear in the terminal. Each record includes a timestamp, level, event, request ID, service, and method. Match `request_id` across records to follow one operation even when calls overlap.

| Event | Meaning |
| --- | --- |
| `rpc.received` | The relay received the HTTP request, including requests that cannot be decoded. |
| `rpc.request` | The decoded protobuf request is ready to forward; `payload` contains every signal in the suite. |
| `rpc.response` | The coordinator returned a decoded response; `duration_ms` and `application_status` describe the outcome. |
| `rpc.error` | The call failed, including unavailable upstreams, timeouts, and cancellations; `error.code` and `error.message` identify the failure. |
| `rpc.rejected` | The relay rejected the request before invoking the coordinator. |

For example, injecting two signals produces request and response records like these; timestamps, IDs, and duration here are illustrative:

```json
{"timestamp":"2026-10-10T12:00:00.000Z","level":"info","event":"rpc.request","request_id":"example-request","service":"controlpanel.v1.SignalStimService","method":"SetSignal","payload":{"signals":[{"signalId":"3001","cardModel":"CARD_MODEL_TYPE2","discrete":false},{"signalId":"3002","cardModel":"CARD_MODEL_TYPE2","discrete":true}]}}
{"timestamp":"2026-10-10T12:00:00.012Z","level":"info","event":"rpc.response","request_id":"example-request","service":"controlpanel.v1.SignalStimService","method":"SetSignal","duration_ms":12,"application_status":"success","payload":{"responseStatus":{"status":"STATUS_SUCCESS"},"signalErrors":[]}}
```

Payloads use ProtoJSON: 64-bit signal IDs are decimal strings, enums use their protobuf names, and default values such as `false` and `STATUS_SUCCESS` remain visible. A partial batch response is logged with `application_status: "failure"` and its returned `signalErrors`, even when `responseStatus.status` is `STATUS_SUCCESS`. A failed `ResetAll` status is also an application failure. HTTP 200 alone does not imply that a fault was applied or removed successfully.

Payloads larger than `RPC_LOG_MAX_PAYLOAD_BYTES` use `payload_truncated: true`, `payload_bytes`, and `payload_preview` in place of the full `payload`. Increase the cap when full payloads for larger suites are required. Header values, cookies, and authorization credentials are not logged; configured signal values and backend error messages are logged for diagnosis. Container log collection and retention are managed by your Docker or Kubernetes logging setup.

## Service Contract

The schema is in `proto/controlpanel/v1/control_panel.proto`.

The generated TypeScript lives under `src/gen` and is created with:

```sh
npm run proto:gen
```

The UI expects the backend to implement `controlpanel.v1.SignalStimService`:

- `SetSignal` sends one `SignalsRequest` containing all signals mapped to the selected fault variant.
- `RemoveSignals` sends one `SignalsRequest` containing all signals mapped to the active fault variant.
- `ResetAll` accepts an empty `Empty` request, clears all injected signals, and returns `ResponseStatus` directly.

The UI still shows friendly variants such as `High`, `Low`, `Open`, `Engaged`, or `Unknown`. `src/features/faults/faultModel.ts` maps each choice to a nonempty list of signals. Each member has its own `signalId`, `cardModel`, and `signalValue` oneof. A suite remains one active fault, regardless of how many signals it sends. Existing single-signal rows use one-element lists.

`SetSignal` and `RemoveSignals` return `SignalsResponse`, which contains a nested `ResponseStatus` message named `response_status` and repeated `SignalError` entries named `signal_errors`. `ResetAll` returns `ResponseStatus` directly. Any per-signal error makes the whole fault command unsuccessful, including when the top-level status is success.

### Configuring a multi-signal fault

Fault classes define the choices available in a row's dropdown. The row defines the signals to send for each choice. A class does not send signals itself, and it does not require one physical sensor per row. Several named faults can share the `state` class while each configures its own three or four signals for `unknown`.

For a fault named **XXXX state unknown**, the mapping is:

| Field | Meaning | Example |
| --- | --- | --- |
| `name` | The user-facing fault target | `XXXX state unknown` |
| `faultClassId` | Which set of dropdown choices the row uses | `state` |
| `defaultVariant` | The initially selected choice | `unknown` |
| `signalMapping.unknown` | All signals sent together for that choice | A list of four signal payloads |

The `state` class supplies a single `Unknown` choice, so this fault needs only an `unknown` mapping. Choosing Inject sends all four signals in one request and records one active fault. Remove sends the same four signals in one removal request. No additional UI components are needed.

Use a row like this in `SENSOR_ROWS` after replacing the illustrative IDs and values with the combination that produces Unknown in your coordinator:

```ts
const unknownStateFault: SensorRow = {
  id: 'xxxx-state-unknown',
  name: 'XXXX state unknown',
  location: 'Subsystem XXXX',
  liveReading: 'Known',
  faultClassId: 'state',
  defaultVariant: 'unknown',
  signalMapping: {
    unknown: [
      {
        signalId: 3001n,
        cardModel: CardModel.TYPE2,
        signalValue: { case: 'discrete', value: false },
      },
      {
        signalId: 3002n,
        cardModel: CardModel.TYPE2,
        signalValue: { case: 'discrete', value: false },
      },
      {
        signalId: 3003n,
        cardModel: CardModel.TYPE2,
        signalValue: { case: 'discrete', value: true },
      },
      {
        signalId: 3004n,
        cardModel: CardModel.TYPE2,
        signalValue: { case: 'discrete', value: false },
      },
    ],
  },
}
```

The word `unknown` is a UI/configuration key; only the four signal payloads are sent to the coordinator. The example values do not automatically guarantee an Unknown state: configure the actual combination your fault-detection rules expect. Remove one entry for a three-signal fault, or append entries for a larger suite. Each row and variant may use different signal IDs, card models, and value types.

To introduce another dropdown choice, such as `Conflict`, add it to an appropriate entry in `FAULT_CLASSES`, then supply a signal list under that variant's ID for every row using the class. The model rejects missing variants, empty lists, and duplicate `(cardModel, signalId)` identities within a variant before sending a request. Signal IDs remain `bigint` to preserve the protobuf's `uint64` range.

The external coordinator implements the actual fault detection/rollup rules. Its server implementation is not in this repository. The existing repeated-signal RPC needs no schema change, but batching alone does not guarantee atomic application or removal. The coordinator must handle the full list and report failures; if it can apply only part of a batch, the operator can use `Reset faults` to clear all injected signals. Until the coordinator provides shared-signal ownership, avoid overlapping signal identities across rows that can be active together.

## App Structure

- `src/app` contains the Next.js app-router page, layout, MUI provider, and theme.
- `src/features/faults` contains the sensor fault UI, model helpers, and fault-specific presentation components.
- `src/rpc` contains the same-origin ConnectRPC browser client.
- `src/server` contains the RPC relay and structured container logging.
- `src/gen` contains Buf-generated TypeScript from `proto/controlpanel/v1/control_panel.proto`.
- `helm/test-next-app` contains the Helm deployment for the app and Envoy.
- `build` contains Docker image build files.
- `envoy/envoy.yaml` is a plain Envoy reference config; Helm renders the deployable config from chart values.
