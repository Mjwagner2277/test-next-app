# test-next-app

A Next.js + TypeScript sensor fault interface for calling a server-hosted gRPC service through Envoy with gRPC-Web.

## Stack

- Next.js renders the app and runs the local development server.
- React stores the selected fault variants and the current on-screen fault state.
- MUI provides the table, buttons, selects, chips, panels, layout, theme, and icons.
- Protocol Buffers define the service contract in `proto/controlpanel/v1/control_panel.proto`.
- Buf generates TypeScript from the `.proto` file into `src/gen`.
- ConnectRPC creates a typed browser client from the generated service definition.
- ConnectRPC's `createGrpcWebTransport` sends browser requests with the gRPC-Web protocol.
- Envoy listens for browser gRPC-Web calls and forwards them to the native gRPC server over HTTP/2.
- Helm describes how the Next.js app, Envoy proxy, Services, and Envoy config are deployed to Kubernetes.

The app uses the ConnectRPC TypeScript library, and the selected browser protocol is gRPC-Web. The browser gets the Envoy URL from the Next.js `/api/grpc-config` endpoint. That endpoint reads server-side environment variables, which the Helm chart fills from `helm/test-next-app/values.yaml`. Envoy then translates gRPC-Web requests and forwards them to the native gRPC server configured under `upstreamGrpc`.

## Run

```sh
npm install
npm run proto:gen
npm run dev
```

The Next.js app runs at `http://localhost:3000`.

In Kubernetes, Envoy is deployed by the Helm chart and listens for browser gRPC-Web requests on the chart's Envoy Service.

## What The App Shows

The main screen is a 27-inch-display-oriented sensor fault matrix.

- Each row represents one sensor, such as `Pressure B` or `Flow D`.
- The `Fault variant` column lets an operator choose `High`, `Low`, or `Unknown`.
- The row action button calls the configured gRPC-Web service through ConnectRPC.
- Inserted faults are highlighted in the table.
- The header chip shows the total number of faults currently in the system.
- The right-side panel lists the active faults.
- `System reset` calls the reset RPC and clears all injected faults when accepted.

The page starts with a couple of seeded active faults so the injected state is visible during UI review even if no local gRPC server is running yet.

## Configuration

Copy `.env.example` to `.env`:

```sh
GRPC_WEB_PROXY_URL=http://localhost:8080
GRPC_WEB_AUTH_TOKEN=
```

The UI does not accept a server URL. Connection details are configured in files:

- Browser-to-Envoy endpoint: `.env` locally, or Helm `grpcWebProxyUrl` in Kubernetes.
- Envoy-to-native-gRPC-server endpoint: `helm/test-next-app/values.yaml`, under `upstreamGrpc`.

The browser still needs the Envoy URL because it makes the gRPC-Web request directly. The app exposes that value through `/api/grpc-config` so Helm can change it when the container starts. This avoids rebuilding the Docker image just to point at a different Envoy URL.

For Helm deployments, set the native gRPC server target in values:

```yaml
grpcWebProxyUrl: https://your-envoy.example.com

upstreamGrpc:
  host: fault-coordinator-grpc.default.svc.cluster.local
  port: 9090

envoy:
  cors:
    allowedOriginPrefixes:
      - https://your-app.example.com
```

Change those values to point Envoy at your real server-hosted gRPC endpoint and to allow the web app origin that will call Envoy.

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
  --set grpcWebProxyUrl=https://your-envoy.example.com \
  --set upstreamGrpc.host=your-grpc-service.default.svc.cluster.local \
  --set upstreamGrpc.port=9090
```

For local review with the chart defaults, the Services are `ClusterIP`. Port-forward both Services:

```sh
kubectl port-forward svc/test-next-app-app 3000:3000
kubectl port-forward svc/test-next-app-envoy 8080:8080
```

Then open `http://localhost:3000`. The app will fetch `/api/grpc-config`, receive `http://localhost:8080`, and call Envoy through the port-forward.

The chart deploys:

- a Next.js app Deployment and Service
- an Envoy Deployment and Service
- an Envoy ConfigMap generated from Helm values

## Build

Docker-related build files live in `build`.

Build the app image from the repository root:

```sh
docker build -f build/Dockerfile -t test-next-app:latest .
```

The `.` at the end is important. It tells Docker to use the repo root as the build context, so `build/Dockerfile` can copy `package.json`, `src`, `proto`, and the other app files. `build/Dockerfile.dockerignore` keeps local-only folders such as `node_modules` and `.next` out of that context.

## Request Flow

1. The user picks a fault variant in `src/app/ControlPanelConsole.tsx`.
2. The user clicks `Inject`, `Remove`, `Refresh state`, or `System reset`.
3. The page fetches `/api/grpc-config` to get the configured Envoy gRPC-Web URL.
4. The page calls the typed ConnectRPC client in `src/rpc/faultCoordinatorClient.ts`.
5. ConnectRPC sends a gRPC-Web request to Envoy.
6. Envoy receives that browser-compatible request on port `8080`.
7. Envoy's `grpc_web` filter translates the request for the native gRPC server.
8. Envoy forwards the request to the `native_grpc_server` upstream.
9. The response comes back through Envoy and updates the connection path panel.

## Service Contract

The schema is in `proto/controlpanel/v1/control_panel.proto`.

The generated TypeScript lives under `src/gen` and is created with:

```sh
npm run proto:gen
```

The UI expects the backend to implement `controlpanel.v1.FaultCoordinatorService`:

- `GetFaultState` returns the active faults currently inserted in the coordinator.
- `InjectSensorFault` inserts one sensor fault with a selected `FaultVariant`.
- `ClearSensorFault` removes one active sensor fault.
- `ResetSystem` clears all injected sensor faults.

The protobuf enum `FaultVariant` contains the variants shown in the UI: `High`, `Low`, and `Unknown`.

## App Structure

- `src/app` contains the Next.js app-router page, layout, MUI provider, and theme.
- `src/features/faults` contains the sensor fault UI, model helpers, and fault-specific presentation components.
- `src/rpc` contains the ConnectRPC transport/client setup.
- `src/app/api/grpc-config` contains the runtime config endpoint used by Helm deployments.
- `src/gen` contains Buf-generated TypeScript from `proto/controlpanel/v1/control_panel.proto`.
- `helm/test-next-app` contains the Helm deployment for the app and Envoy.
- `build` contains Docker image build files.
- `envoy/envoy.yaml` is a plain Envoy reference config; Helm renders the deployable config from chart values.
