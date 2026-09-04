# Local Development

## Start The GUI

Use the local-only dev script from the repository root:

```sh
npm run dev:local
```

Open:

```text
http://127.0.0.1:3000
```

Stop the dev server with `Ctrl-C` in the terminal running the command.

## Regenerate Proto Types

Run this after changing files under `proto/`:

```sh
npm run proto:gen
```

## Validate The App

```sh
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
