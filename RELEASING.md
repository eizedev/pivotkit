# Releasing

Only maintainers release. This page is their checklist.

The release workflow (`.github/workflows/release.yml`) stages each package on npm.
A maintainer approves the staged version with two-factor authentication. Then it goes live.

## Publish order

Release packages in this order. It follows their run-time dependencies.

1. `pivotkit-core` - no dependency of its own
2. `pivotkit-xlsx` - core
3. `pivotkit-report` - core
4. `pivotkit-react` - core, report
5. `pivotkit-element` - bundles core, react and report as devDependencies
6. `pivotkit-cli` - core, report, xlsx
7. `pivotkit-server` - core, report, cli, xlsx
8. `pivotkit-mcp` - report, server

- pivotkit-server imports `pivotkit-report/operations` and `pivotkit-cli/files`.
  Release both before it when they changed.
- Release pivotkit-mcp after pivotkit-server whenever pivotkit-server changed.
- pivotkit-server loads pivotkit-mcp by name and does not depend on it. There is no cycle.
- When pivotkit-core's minor moves, release every package that depends on it.
  Do this even without changes of their own.
  In 0.x a caret range admits one minor only, so a host would otherwise get two copies.
- `tests/ci.test.js` requires every range to be the version in this repository.

## Each release

### 1. Walk through the docs

- `npm pack` every package.
- Install the tarballs in fresh projects.
- Follow each getting-started page and the CLI's "Try it" exactly as written.
- Fix what does not run.

### 2. Prepare one pull request

- Move the `[Unreleased]` entries of `packages/<package>/CHANGELOG.md` under the new version and date.
- Set `version` in `packages/<package>/package.json`.
  Pick it by [docs/versioning.md](docs/versioning.md). From 1.0.0, only a major removes a deprecated thing.
- Update the caret range or devDependency of every package that uses it.
- Update `examples/reader-plugin/package.json` too. It takes pivotkit-core from npm.
- Update the statements that name the current version. `tests/ci.test.js` checks them:
  - the pivotkit row of `docs/compare.md`, version and date
  - the example's `generator` in `docs/reference/view-file.md`
  - the pivotkit-core minor pivotkit-xlsx needs, in `docs/reference/plugins.md`
  - pivotkit-server's full version in `docs/getting-started/server-in-5-minutes.md`:
    every image tag, the release tag `pivotkit-server@<version>` and `PIVOTKIT_VERSION`
  - the release tag `pivotkit-server@<version>` in `docs/getting-started/kubernetes.md`
  - the example version in `docker/compose*.example.yml` and `docker/kubernetes.example.yaml`
- Two more files carry a version. Their package's tests check them:
  - `docs/openapi.json`. Run `node scripts/openapi.js`.
  - `packages/pivotkit-mcp/.claude-plugin/plugin.json`
- Merge the pull request.

### 3. Tag

- Wait for CI on main.
- Tag the merge commit `<package>@<version>`.
- Push one tag at a time, in publish order. Push the next only after the previous one is live.
- Push the pivotkit-server tag right after the release pull request is merged. The docs site deploys
  on every push to main, and `docs/getting-started/server-in-5-minutes.md` and
  `docs/getting-started/kubernetes.md` link files at the tag `pivotkit-server@<version>`. Until the
  tag exists, those links fail.
- The `build` job runs `scripts/check-release.js --published`. It fails when:
  - a dependency of this repository still has `[Unreleased]` entries, or
  - that dependency is not on npm at this commit's version.
- After such a failure, publish the dependency and re-run the job.

### 4. Approve on npm

- The `build` job checks tag, version, main and CI. It runs the checks and packs the tarball.
- The `publish` job waits for an environment reviewer.
- Before approving, read `.github/workflows/release.yml` at the tag. That version runs.
- `publish` stages the tarball with provenance (`npm stage publish`, npm 11.21.1).
- Provenance comes from the workflow's `--provenance`, not from `publishConfig`.
- Staging needs npm 11.15.0 or later. Trusted publishing needs Node 22.14.0 or later.
- Check name, version and publisher. Then approve with two-factor authentication:

```bash
npm stage list <package>
npm stage approve <stage-id>   # or: npm stage reject <stage-id>
```

- You can also approve on npmjs.com, account settings, tab Staged Packages.
- No workflow token can approve. An unapproved version never goes live.
- If nobody approves it, the next tag's `check-release.js --published` fails. The GitHub release waits too.
- Approve pivotkit-server promptly. Then push, and approve, pivotkit-mcp right away. The image is
  public as soon as you push the pivotkit-server tag ([below](#the-container-image)).

### 5. GitHub release

- Publish a GitHub release for each tag, with a short text and a link to the CHANGELOG.
- A release also publishes the documentation site (`.github/workflows/docs.yml`).
- The site build uses the newest release tag on main, whichever release started it.
- To publish the site by hand: Actions, Docs site, Run workflow, input `tag`.
- The input `tag` may be any release tag, or `main` for a preview.

## The container image

`.github/workflows/image.yml` builds `ghcr.io/eizedev/pivotkit` on each `pivotkit-server@<version>` tag.

- It pushes the image to ghcr as soon as you push the tag: `<version>`, `<major>.<minor>` and
  `latest`, for example `0.2.0`, `0.2` and `latest`. It does not wait for the npm approval.
- Until a maintainer approves pivotkit-server and pivotkit-mcp on npm, the image holds versions
  npm does not offer yet.
- It builds for linux/amd64 and linux/arm64.
- It attaches provenance and an SBOM and signs with cosign, keyless.
- Pull requests build and smoke-test it without pushing.
- The docs name the image by pivotkit-server's version.
- A new base image: update both digests in `docker/Dockerfile`.

```bash
docker buildx imagetools inspect <image>:<tag>   # shows the index digest
```

## One-time setup

Done once. A new package needs steps 1 and 2 at its first release.
`npm view <package>` answers E404 when a package is not on npm yet.
All eight packages publish through staging: their trusted publishers have "Allow npm publish" unchecked.

1. Publish the first version of each package by hand, in publish order:

   ```bash
   npm ci --ignore-scripts && npm run build && npm pack -w <package>
   npm publish <tarball> --access public
   ```

   Use an npm account with two-factor authentication.
2. On npm, add a trusted publisher to each package:
   - owner `eizedev`, repository `pivotkit`, workflow `release.yml`, environment `npm`
   - "Allow npm publish" unchecked and no dist-tag action. The workflow can then only stage.
   - A new trusted publisher expires unless it publishes within two days.
     Create it when the next release is ready.
   - Then set publishing access to "Require two-factor authentication and disallow tokens" on each package.
3. Create the environment `npm` with required reviewers. Deploy from tags `*@*` only.
4. Add a tag ruleset for `*@*`: only maintainers create, move or delete release tags.
5. Set the repository variable `NPM_RELEASE_ENABLED` to `true`.

For the container image:

1. The first publishing run creates the package on GHCR.
2. Make it public. Check that this repository has write access in the "Manage Actions access" section.
3. Set the repository variable `IMAGE_RELEASE_ENABLED` to `true`.

## Why the setup looks like this

- No npm token is stored in GitHub.
- The `build` job has no publishing right. Only `publish` holds the OIDC token.
- Provenance attests the workflow and the commit. It does not prove `dist/` is unaltered.
- `publish` only checks that the tarball's name and version match the tag.
- No check compares a package's imports with the lowest core version its range admits.
  Exact ranges and `check-release.js` cover that instead.
- `npm run pack:check` shows what would be published. It fails while a package is `"private": true`.
