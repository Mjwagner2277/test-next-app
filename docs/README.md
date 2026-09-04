# Documentation

## Architecture Diagrams

These diagrams were generated with the third-party Archify skill.

- `code-architecture.html` shows the main code structure from the Next.js route
  through the fault UI components, model helpers, generated proto types, and
  ConnectRPC client.
- `kubernetes-deployment.html` shows the Helm, kind, Envoy Gateway, HTTPRoute,
  Next.js Service, gRPC-Web Envoy proxy, and native gRPC server routing model.

Each diagram also keeps its Archify JSON source beside the rendered HTML:

- `code-architecture.architecture.json`
- `kubernetes-deployment.architecture.json`

The `*.visual-check.*.png`, `*.visual-check.html`, and `*.visual-check.json`
files are Archify browser-evidence sidecars. They record the automated layout
checks and screenshot captures used to verify the generated HTML.

## Local Development

See `local-development.md` for the quickest way to start the GUI on demand.

## Container Hardening

See `container-hardening.md` for the Red Hat UBI 9.6 hardened image path,
build command, runtime security choices, and Kubernetes security-context notes.
