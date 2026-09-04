# Container Hardening

This project has two Dockerfiles:

- `build/Dockerfile` is the small default image for ordinary scaffold work.
- `build/Dockerfile.ubi-hardened` is the cyber-hardened Red Hat UBI image path.

The hardened path uses `registry.access.redhat.com/ubi9/ubi-minimal:9.6` as its
base image. UBI is a redistributable subset of Red Hat Enterprise Linux user
space, so it gives us a RHEL-family base without requiring every developer or
CI worker to authenticate to `registry.redhat.io`.

## Why UBI 9.6 Minimal

UBI minimal gives us a smaller runtime surface than a full OS image while still
using Red Hat package repositories and metadata. The Dockerfile keeps the base
tag readable:

```Dockerfile
ARG UBI_MINIMAL_IMAGE=registry.access.redhat.com/ubi9/ubi-minimal:9.6
```

For a stricter release pipeline, replace that tag with a digest:

```sh
UBI_MINIMAL_IMAGE=registry.access.redhat.com/ubi9/ubi-minimal@sha256:<digest> \
  npm run image:build:ubi-hardened
```

A tag is easier to read and refresh. A digest is better for reproducibility
because it pins the exact base image bytes.

## Node Runtime Choice

Next.js 16 requires Node `>=20.9.0`. The default `nodejs` package in UBI 9.6 is
Node 16, so the Dockerfile explicitly enables Red Hat's Node.js 22 module:

```Dockerfile
RUN microdnf module enable -y nodejs:${NODEJS_MODULE_STREAM}
```

The builder stage installs `nodejs npm` because it needs `npm ci`,
`npm run proto:gen`, and `npm run build`.

The runtime stage installs only `nodejs` with weak dependencies disabled. That
keeps `npm`, docs, and build-time tools out of the final image.

## Hardened Build Command

Use:

```sh
npm run image:build:ubi-hardened
```

By default the script runs a local inspection build. It pulls the current base
tag, avoids cache reuse, and loads the result into Docker:

```sh
docker buildx build \
  --pull \
  --no-cache \
  --load \
  --platform "${PLATFORM}" \
  --build-arg "BUILD_DATE=${BUILD_DATE}" \
  --build-arg "VCS_REF=${VCS_REF}" \
  --build-arg "UBI_MINIMAL_IMAGE=${UBI_MINIMAL_IMAGE}" \
  --build-arg "NODEJS_MODULE_STREAM=${NODEJS_MODULE_STREAM}" \
  -f build/Dockerfile.ubi-hardened \
  -t "${IMAGE_TAG}" \
  .
```

Those flags are intentional:

- `--pull` checks the registry for the newest base matching the tag.
- `--no-cache` avoids accidentally reusing an older local layer.
- `--load` imports the single-platform result into local Docker for inspection.
- `VCS_REF` and `BUILD_DATE` become OCI image labels.

For CI publishing, use `OUTPUT_MODE=push` and tag the image with your registry
path:

```sh
OUTPUT_MODE=push \
IMAGE_TAG=registry.example.com/test-next-app:${GIT_SHA} \
npm run image:build:ubi-hardened
```

In push mode, the script adds:

- `--sbom=true` so BuildKit attaches a software bill of materials.
- `--provenance=true` so BuildKit attaches build provenance.

That split matters. Docker's default local `--load` path often uses the classic
Docker image store, which cannot preserve BuildKit attestations. Release builds
should push to a registry, where the attestations can travel with the image.

## Runtime Hardening Choices

The final image:

- starts from UBI 9.6 minimal
- installs only the Node.js runtime
- suppresses weak RPM dependencies
- cleans package-manager caches
- copies only `.next/standalone`, `.next/static`, and `public`
- excludes source files, TypeScript, Buf, npm, and dev dependencies
- runs as numeric user `10001:10001`
- sets `NODE_ENV=production`
- disables Next telemetry
- sets `NODE_OPTIONS=--disable-proto=delete`

The numeric user is deliberate. It avoids adding mutable `/etc/passwd` entries
just to name a user, and it works well with Kubernetes and OpenShift security
contexts.

## Suggested Verification

Build:

```sh
npm run image:build:ubi-hardened
```

Check the runtime user and Node version:

```sh
docker run --rm --entrypoint sh test-next-app:ubi9.6-hardened \
  -c 'id && node --version && command -v npm || true'
```

Expected shape:

- `uid=10001`
- Node is version 22 or newer
- `npm` is not present in the final runtime image

Run the image locally:

```sh
docker run --rm -p 3000:3000 test-next-app:ubi9.6-hardened
```

Then open:

```text
http://localhost:3000
```

## Kubernetes Runtime Policy

The image is designed to work with a hardened Kubernetes security context:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  runAsGroup: 10001
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL
```

If `readOnlyRootFilesystem: true` is enabled and the runtime ever needs a temp
directory, mount an `emptyDir` at `/tmp`.

## What This Does Not Claim

This is a hardened application image baseline, not a formal STIG certification
or FIPS validation. It improves the default container posture, but release
gates should still include vulnerability scanning, image signing, admission
policy, dependency review, and registry retention controls.

## References

- Red Hat UBI overview and image availability: https://access.redhat.com/articles/4238681
- Red Hat UBI content availability: https://access.redhat.com/support/policy/updates/ubi
- Red Hat container documentation for UBI minimal package installs: https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/htmlsingle/building_running_and_managing_containers/
