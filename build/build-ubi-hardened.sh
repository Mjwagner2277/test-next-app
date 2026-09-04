#!/usr/bin/env sh
set -eu

# Hardened build entrypoint. Defaults are intentionally conservative:
# pull the freshest base, avoid stale local cache, and load a single-platform
# image into local Docker for immediate inspection.
#
# SBOM/provenance attestations are enabled automatically when OUTPUT_MODE=push.
# Local `--load` builds often use Docker's classic image store, which cannot
# preserve attestations. Keeping that distinction explicit avoids a build that
# looks secure on paper but fails on a normal developer machine.

IMAGE_TAG="${IMAGE_TAG:-test-next-app:ubi9.6-hardened}"
PLATFORM="${PLATFORM:-linux/arm64}"
OUTPUT_MODE="${OUTPUT_MODE:-load}"
ATTESTATIONS="${ATTESTATIONS:-auto}"
VCS_REF="${VCS_REF:-$(git rev-parse HEAD)}"
BUILD_DATE="${BUILD_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
UBI_MINIMAL_IMAGE="${UBI_MINIMAL_IMAGE:-registry.access.redhat.com/ubi9/ubi-minimal:9.6}"
NODEJS_MODULE_STREAM="${NODEJS_MODULE_STREAM:-22}"

set -- docker buildx build \
  --pull \
  --no-cache \
  --platform "${PLATFORM}" \
  --build-arg "BUILD_DATE=${BUILD_DATE}" \
  --build-arg "VCS_REF=${VCS_REF}" \
  --build-arg "UBI_MINIMAL_IMAGE=${UBI_MINIMAL_IMAGE}" \
  --build-arg "NODEJS_MODULE_STREAM=${NODEJS_MODULE_STREAM}"

case "${OUTPUT_MODE}" in
  load)
    set -- "$@" --load
    ;;
  push)
    set -- "$@" --push
    ;;
  *)
    echo "OUTPUT_MODE must be 'load' or 'push'." >&2
    exit 2
    ;;
esac

case "${ATTESTATIONS}" in
  true)
    set -- "$@" --sbom=true --provenance=true
    ;;
  false)
    ;;
  auto)
    if [ "${OUTPUT_MODE}" = "push" ]; then
      set -- "$@" --sbom=true --provenance=true
    else
      echo "Skipping SBOM/provenance for local --load build; use OUTPUT_MODE=push for attested release builds." >&2
    fi
    ;;
  *)
    echo "ATTESTATIONS must be 'auto', 'true', or 'false'." >&2
    exit 2
    ;;
esac

exec "$@" \
  -f build/Dockerfile.ubi-hardened \
  -t "${IMAGE_TAG}" \
  .
