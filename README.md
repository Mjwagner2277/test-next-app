# test-next-app

A Next.js + TypeScript control panel for calling a native server-hosted gRPC service through Envoy.

## Stack

- Next.js renders the app and runs the local development server.
- MUI provides the buttons, fields, cards, alerts, layout, theme, and icons.
- Protocol Buffers define the service contract in `proto/controlpanel/v1/control_panel.proto`.
- Buf generates TypeScript from the `.proto` file into `src/gen`.
- ConnectRPC creates a typed browser client from the generated service definition.
- Envoy listens for browser gRPC-Web calls and forwards them to the native gRPC server over HTTP/2.
- Helm describes how the Next.js app, Envoy proxy, Services, and Envoy config are deployed to Kubernetes.

Browsers cannot call native gRPC directly, so the app calls Envoy over gRPC-Web. The browser gets the Envoy URL from the Next.js `/api/grpc-config` endpoint. That endpoint reads server-side environment variables, which the Helm chart fills from `charts/test-next-app/values.yaml`. Envoy then forwards requests to the native gRPC server configured under `upstreamGrpc`.

## Run

```sh
npm install
npm run proto:gen
npm run dev
```

The Next.js app runs at `http://localhost:3000`.

In Kubernetes, Envoy is deployed by the Helm chart and listens for browser gRPC-Web requests on the chart's Envoy Service.

## Configuration

Copy `.env.example` to `.env`:

```sh
GRPC_WEB_PROXY_URL=http://localhost:8080
GRPC_AUTH_TOKEN=
```

The UI does not accept a server URL. Connection details are configured in files:

- Browser-to-Envoy endpoint: `.env` locally, or Helm `grpcWebProxyUrl` in Kubernetes.
- Envoy-to-gRPC-server endpoint: `charts/test-next-app/values.yaml`, under `upstreamGrpc`.

The browser still needs the Envoy URL because it makes the gRPC-Web request directly. The app exposes that value through `/api/grpc-config` so Helm can change it when the container starts. This avoids rebuilding the Docker image just to point at a different Envoy URL.

For Helm deployments, set the native gRPC server target in values:

```yaml
grpcWebProxyUrl: https://your-envoy.example.com

upstreamGrpc:
  host: control-panel-grpc.default.svc.cluster.local
  port: 9090

envoy:
  cors:
    allowedOriginPrefixes:
      - https://your-app.example.com
```

Change those values to point Envoy at your real server-hosted gRPC endpoint and to allow the web app origin that will call Envoy.

## Helm

The chart lives in `charts/test-next-app`.

Render the manifests locally:

```sh
helm template test-next-app ./charts/test-next-app
```

Install or upgrade:

```sh
helm upgrade --install test-next-app ./charts/test-next-app \
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

## Request Flow

1. The user clicks a MUI button in `src/app/ControlPanelConsole.tsx`.
2. The page fetches `/api/grpc-config` to get the configured Envoy gRPC-Web URL.
3. The page calls the typed ConnectRPC client in `src/grpc/controlPanelClient.ts`.
4. ConnectRPC sends a gRPC-Web request to Envoy.
5. Envoy receives that browser-compatible request on port `8080`.
6. Envoy's `grpc_web` filter translates the request for the native gRPC server.
7. Envoy forwards the request to the `native_grpc_server` upstream.
8. The response comes back through Envoy and is displayed in the response log.

## Service Contract

The sample schema is in `proto/controlpanel/v1/control_panel.proto`.

The generated TypeScript lives under `src/gen` and is created with:

```sh
npm run proto:gen
```

Replace the sample proto with your real service definition, rerun `npm run proto:gen`, then update the button handlers in `src/app/ControlPanelConsole.tsx`.

## App Structure

- `src/app` contains the Next.js app-router page, layout, MUI provider, and theme.
- `src/grpc` contains the ConnectRPC transport/client setup.
- `src/app/api/grpc-config` contains the runtime config endpoint used by Helm deployments.
- `src/gen` contains Buf-generated TypeScript from `proto/controlpanel/v1/control_panel.proto`.
- `charts/test-next-app` contains the Helm deployment for the app and Envoy.
- `envoy/envoy.yaml` is a plain Envoy reference config; Helm renders the deployable config from chart values.
