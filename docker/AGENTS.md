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
- The state directory is `/var/lib/pivotkit`, mode 0700. The image declares no `VOLUME`.
- The launcher `docker/pivotkit-server` puts `pivotkit-server` on the PATH.
- The image's paths are `IMAGE_PATHS` in pivotkit-server's `state.js`. `test/state.test.js` compares them with the Dockerfile.
- The image unpacks `sales.csv` from the CLI's example files for the built-in configuration.
- `pivotkit.example.json` and `compose.example.yml` are the minimal setup of the page "Server in 5 minutes" in the docs.
  The token comes from the first start. CI runs the Compose example.
- `pivotkit.secrets.example.json` and `compose.secrets.example.yml` use tokens of your own as secret files.
  CI's operator run uses them.
- The Compose and Kubernetes examples name pivotkit-server's version in full. `tests/ci.test.js` checks it.
- `kubernetes.example.yaml` is shown in `docs/getting-started/kubernetes.md` through `--8<--` snippets.
- `.github/workflows/image.yml` builds it on pull requests and publishes on `pivotkit-server@*` tags.
- Publishing steps: [RELEASING.md](../RELEASING.md#the-container-image).
