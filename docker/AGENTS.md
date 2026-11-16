# docker

The container image `ghcr.io/eizedev/pivotkit`. The root [AGENTS.md](../AGENTS.md) applies too.

## Commands

```bash
docker build -f docker/Dockerfile -t pivotkit .   # from the repository root
kubeconform -strict docker/kubernetes.example.yaml # after a change of the manifest
```

## Rules

- The image is built from the repository root at a release tag.
- It installs pivotkit-server, pivotkit-mcp and pivotkit-cli with `npm ci --omit=dev --ignore-scripts`.
- The base is a distroless Node 22 image, pinned by digest. It runs as user 10001.
- A new base image: update both digests in `Dockerfile`.
- `pivotkit.example.json` and `compose.example.yml` are the docs' example and CI's smoke test.
- `kubernetes.example.yaml` is shown in `docs/getting-started/kubernetes.md` through `--8<--` snippets.
- `.github/workflows/image.yml` builds it on pull requests and publishes on `pivotkit-server@*` tags.
- Publishing steps: [RELEASING.md](../RELEASING.md#the-container-image).
