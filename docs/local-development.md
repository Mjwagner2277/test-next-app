# Local Development

## Start The GUI

Use the local-only dev script from the repository root:

```sh
cp .env.example .env.local
npm run dev:local
```

Open:

```text
http://127.0.0.1:3000
```

Stop the dev server with `Ctrl-C` in the terminal running the command.

## Send RPCs And View Logs

The browser sends `SetSignal`, `RemoveSignals`, and `ResetAll` to the Next.js
server on the same origin as the GUI. The server logs decoded requests and
responses to stdout, then relays calls through Envoy to the native gRPC
coordinator. The UI controls and fault model are unchanged.

The example environment file sets `SIGNAL_STIM_UPSTREAM_URL` to
`http://127.0.0.1:8080`. Run a local Envoy proxy there, or forward the chart's
Envoy Service from your cluster in another terminal:

```sh
kubectl port-forward service/test-next-app-envoy 8080:8080
```

If Envoy runs elsewhere, update `.env.local` with the gRPC-Web URL reachable
from the Next.js process, then restart the dev server. Use the internal Envoy
endpoint, not the public Gateway URL that routes back to Next.js. The upstream
is a server setting; browser requests cannot override it.

Click Inject, Remove, or Reset faults and inspect the dev terminal. JSON log
records share a `request_id` and include the RPC method, decoded signal values,
response or error, duration, and application outcome. Per-signal errors mark
the response as a failure even if the top-level status says success. Headers,
cookies, and authorization credentials are excluded from logs.

The default upstream timeout is 30 seconds (`SIGNAL_STIM_TIMEOUT_MS=30000`),
and shorter caller deadlines and cancellation are preserved. Incoming messages
are limited to 1 MiB. The separate payload logging cap is 64 KiB
(`RPC_LOG_MAX_PAYLOAD_BYTES=65536`): larger log payloads contain a marked preview
and byte count, while the forwarded signals remain unchanged.

For a deployed container, use one of:

```sh
kubectl logs deployment/test-next-app-app -c next-app --follow
docker logs --follow <app-container-name>
```

See `RPC Container Logs` in the root `README.md` for the event fields and examples.

## Regenerate Proto Types

Run this after changing files under `proto/`:

```sh
npm run proto:gen
```

## Validate The App

```sh
npm test
npm run lint
npm run build
```

## Local Kubernetes Loop

For the kind and Envoy Gateway path, use the commands in the root `README.md`
under `Local Kind`.

The short version is:

```sh
kind create cluster --name test-next-app
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.9.1 \
  -n envoy-gateway-system \
  --create-namespace
docker build -f build/Dockerfile -t test-next-app:kind .
kind load docker-image test-next-app:kind --name test-next-app
helm upgrade --install test-next-app ./helm/test-next-app \
  -f helm/test-next-app/values-kind.yaml
```

Then port-forward the Envoy Gateway data-plane Service as described in the
root `README.md` and open the forwarded URL.
