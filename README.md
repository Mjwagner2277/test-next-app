# test-next-app

A Next.js + TypeScript signal-stim interface for calling a server-hosted gRPC service through Envoy with gRPC-Web.

## Stack

- Next.js renders the app and runs the local development server.
- React stores the selected fault variants and the current on-screen fault state.
- MUI provides the table, buttons, selects, chips, panels, layout, theme, and icons.
- Protocol Buffers define the service contract in `proto/controlpanel/v1/control_panel.proto`.
- Buf generates TypeScript from the `.proto` file into `src/gen`.
- ConnectRPC creates a typed browser client from the generated service definition.
- ConnectRPC's `createGrpcWebTransport` sends browser requests with the gRPC-Web protocol.
- Envoy Gateway receives the browser's normal GUI requests and gRPC-Web requests on the same external port.
- Helm describes how the Next.js app, optional Envoy proxy, Services, and Envoy config are deployed to Kubernetes.

The app uses the ConnectRPC TypeScript library, and the selected browser protocol is gRPC-Web. The browser does not fetch a separate API URL from Next.js. Instead, the ConnectRPC client uses the same origin that served the GUI. Envoy Gateway owns the routing decision: normal Next.js paths go to the GUI service, while `/controlpanel.v1.SignalStimService/*` paths go to the gRPC-Web/backend path.

## Run

```sh
npm install
npm run proto:gen
npm run dev
```

The Next.js app runs at `http://localhost:3000`.

Direct local Next.js development shows the GUI. gRPC-Web calls require the app to be reached through an Envoy Gateway, ingress, or local reverse proxy that routes the service path to the gRPC-Web/backend endpoint.

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
/controlpanel.v1.SignalStimService/* -> gRPC-Web/backend route
/*                                      -> Next.js GUI service
```

The browser should not receive Kubernetes service DNS names such as `control-panel-grpc.default.svc.cluster.local`. Those are internal cluster details and should stay in Envoy/Gateway configuration.

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
      - name: test-next-app-envoy
        port: 8080
  - matches:
      - path:
          type: PathPrefix
          value: /
    backendRefs:
      - name: test-next-app-app
        port: 3000
```

The important part is order and specificity: the gRPC-Web service prefix must route to the gRPC-Web/backend path, and the general `/` route should go to the Next.js app.

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
7. Envoy Gateway routes the service path to the gRPC-Web/backend route instead of the Next.js app.
8. Envoy's `grpc_web` filter translates the request for the native gRPC server when using the chart-managed Envoy proxy.
9. Envoy forwards the request to the `native_grpc_server` upstream.
10. The response comes back through Envoy as either `SignalsResponse` for set/remove or `ResponseStatus` for reset.
11. If the response status is `STATUS_SUCCESS`, the browser updates its local active fault display. If the status is `STATUS_FAILURE`, the display is left unchanged.
12. `SignalsResponse.signal_errors` is generated and available to the browser for set/remove responses, but the current UI intentionally ignores it.

## Service Contract

The schema is in `proto/controlpanel/v1/control_panel.proto`.

The generated TypeScript lives under `src/gen` and is created with:

```sh
npm run proto:gen
```

The UI expects the backend to implement `controlpanel.v1.SignalStimService`:

- `SetSignal` sends a `SignalsRequest` with one mapped `Signal`.
- `RemoveSignals` sends a `SignalsRequest` with one mapped `Signal`.
- `ResetAll` accepts an empty `Empty` request, clears all injected signals, and returns `ResponseStatus` directly.

The UI still shows friendly variants such as `High`, `Low`, `Open`, or `Engaged`. `src/features/faults/faultModel.ts` maps those choices to generated `Signal` fields such as `signalId`, `cardModel`, and the `signalValue` oneof.

`SetSignal` and `RemoveSignals` return `SignalsResponse`, which contains a nested `ResponseStatus` message named `response_status` and repeated `SignalError` entries named `signal_errors`. `ResetAll` returns `ResponseStatus` directly. The UI currently treats only `Status.STATUS_SUCCESS` as successful and ignores the error list until the display needs richer failure details.

## App Structure

- `src/app` contains the Next.js app-router page, layout, MUI provider, and theme.
- `src/features/faults` contains the sensor fault UI, model helpers, and fault-specific presentation components.
- `src/rpc` contains the same-origin ConnectRPC transport/client setup.
- `src/gen` contains Buf-generated TypeScript from `proto/controlpanel/v1/control_panel.proto`.
- `helm/test-next-app` contains the Helm deployment for the app and Envoy.
- `build` contains Docker image build files.
- `envoy/envoy.yaml` is a plain Envoy reference config; Helm renders the deployable config from chart values.
