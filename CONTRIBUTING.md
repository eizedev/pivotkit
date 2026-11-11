# Contributing

Thanks for helping. Bug reports and ideas go into [issues](https://github.com/eizedev/pivotkit/issues),
questions into [discussions](https://github.com/eizedev/pivotkit/discussions),
security reports privately (see [SECURITY.md](SECURITY.md)).

## Changes

1. Fork, create a branch named after the change (`feat/...`, `fix/...`, `docs/...`).
2. Follow [AGENTS.md](AGENTS.md): layout, commands and the rules that keep the packages safe and small.
3. Run `npm ci`, `npm run lint`, `npm run types` and `npm test`; for engine changes also
   `npm run bench -w pivotkit-core` and compare with the baseline on the documentation site
   ([pivotkit-core reference, Performance](https://pivotkit.eize.dev/reference/core/#performance),
   `docs/reference/core.md`); for UI
   changes `npm run test:browser` (Playwright's browsers: `npx playwright install` once) and a look
   at the playground (`npm run playground`) in light and dark, wide and narrow; for the web component
   also `npm run size -w pivotkit-element` and the example (`examples/element/`, served after
   `npm run build:playground` with `node examples/playground/serve.js` at `/examples/element/`);
   for a reader (`pivotkit-core/import`, pivotkit-xlsx) tests on real files of its format (see
   `packages/pivotkit-core/test/import-fixtures/SOURCES.md`), and for pivotkit-xlsx also
   `npm run size -w pivotkit-xlsx` and `npm run bench -w pivotkit-xlsx`.
   The type declarations in `packages/pivotkit-core/types/` are generated, not committed: run
   `npm run types` before a TypeScript consumer in this repository (a later package) imports the core.
4. Describe what people see on the [documentation site](https://pivotkit.eize.dev/) too: its pages are
   in `docs/`. Preview them with `npm run docs:demo` (the live demo), then
   `curl -fsSo docs/assets/site.css https://raw.githubusercontent.com/eizedev/brand/main/docs-site/site.css`
   and `uvx zensical@<version> serve` (the version is in eizedev/brand's
   `docs-site/requirements.txt`); `zensical build --strict` is what CI runs. A change of the UI takes
   the screenshots again: `npm run docs:screenshots`.
5. Add an entry under `[Unreleased]` in the `CHANGELOG.md` of each package you changed.
6. Open a pull request with a short description and what you tested; use Conventional Commits
   (`feat(core): ...`, `fix(react): ...`, `feat(element): ...`).

## Dependencies

Every package of a third party is pinned to an exact version with the lock file; a package of this
repository that another one depends on takes a caret range on its current version (`pivotkit-react`
depends on `^<version of pivotkit-core>`); `tests/ci.test.js` checks both. In 0.x a caret range
spans patch versions only (`^0.4.0` matches 0.4.x, `^0.0.1` matches 0.0.1 alone), so a host that
also uses pivotkit-core directly must use a version inside that range; npm shares one copy only
when the ranges overlap.
`pivotkit-element` bundles everything it needs: each bundled package (React, ReactDOM, @dnd-kit,
ECharts, and pivotkit-core and pivotkit-react at the version in this repository) is an exact
devDependency, and the package has no runtime dependency. A change of a bundled version changes what
the element ships; its license lands in `dist/THIRD_PARTY_LICENSES.txt` by itself.
React 19 for the browser tests is a separate install with its own lock file in `tests/react19/` (an
alias in the workspace would clash with React 18's peer dependencies). Check the license of every library
you add: permissive (MIT, Apache-2.0, BSD) and free for companies. `pivotkit-core` has no runtime
dependency except `fflate` for the XLSX zip; keep it that way.
`pivotkit-xlsx` depends on pivotkit-core (a caret range, as above), fflate and read-excel-file (exact
versions); its `dist/` bundles them for pages without a bundler, with their licenses (and saxen's, of
which read-excel-file carries a copy) in `dist/THIRD_PARTY_LICENSES.txt`, written by `build.js`
through `scripts/third-party-licenses.js`.

## Package commands

The commands for the whole repository (lint, types, tests, coverage, benchmark, bundle size,
playground, browser tests, React 19) are in [AGENTS.md](AGENTS.md#commands). Per package:

```bash
npm test -w pivotkit-core              # node --test
npm run coverage -w pivotkit-core      # the same with a coverage report
npm run types -w pivotkit-core         # type check and generated .d.ts in types/

npm run build -w pivotkit-react        # dist/index.js and dist/styles.css (esbuild)
npm test -w pivotkit-react             # build, then node --test: view changes, history, keyboard moves, labels, chart text, files, server render, contrast

npm run build -w pivotkit-element      # pivotkit-react's dist, then dist/ of this package (esbuild)
npm test -w pivotkit-element           # build, then node --test: attributes, events, stylesheet, bundle, Node import
npm run types -w pivotkit-element      # tsc: types/ from the JSDoc, plus src/global.d.ts and src/jsx.d.ts

npm test -w pivotkit-xlsx              # node --test on generated workbooks (test/make-xlsx.js): types, sheets, used range, refusals
npm run build -w pivotkit-xlsx         # dist/: the plugin for pages without a bundler, THIRD_PARTY_LICENSES.txt
npm run size -w pivotkit-xlsx          # build, gzip size of the plugin and its reader, fails above SIZE_BUDGET_KIB
npm run bench -w pivotkit-xlsx         # read time and memory of a 94,000-row workbook (-- --browser: Chromium too)
```

`npm run coverage -w pivotkit-react` covers its `.js` modules; the `.jsx` components are covered by
the browser tests, without a number.

pivotkit-react's build compiles JSX to `React.createElement`, so the host needs `react` and
`react-dom` only (no JSX runtime), and keeps every dependency as an import for the host's bundler.

pivotkit-element's `build.js` bundles pivotkit-react as it ships (its `dist/`), with
`process.env.NODE_ENV` set to `production` and the package's version as
`PivotReportElement.version`, and writes `dist/THIRD_PARTY_LICENSES.txt` with the license texts of
every bundled package, once per name and version (React, ReactDOM, scheduler and @dnd-kit: MIT;
ECharts: Apache-2.0 with its NOTICE; zrender: BSD-3-Clause; tslib: 0BSD; fflate: MIT). The browser
test pages of the element are in `tests/browser/pages/element/`.

## Adding a view feature

The vocabulary of a view lives in tables, so a new name is one entry plus its tests:

| Feature | Table | Also |
| --- | --- | --- |
| Aggregator | `AGGREGATORS` in `src/aggregators.js` (kernel, result type, `numeric`, `dates`, `additive`, `keepsValues` when it stores a value per row, which counts heavier against `limits.work`) | its label in `DEFAULT_LABELS.aggregators` (`src/labels.js`) |
| Date grouping or bin unit | `DERIVED` in `src/derive.js` (source type, result type, value, label) | |
| Filter type | `FILTERS` in `src/filters.js` (stage, `normalize`, `allowed` or `keep`) | |
| "Show values as" | `SHOW_AS` in `src/show-as.js` (default format, `alongAxis`, `additive`, `compute`) | |
| Format | `FORMAT_NAMES` and `formatterFor` in `src/format.js` | its Excel code in `excelNumberFormat`, or the gap in `docs/concepts/values.md` (Export) |
| A new view key | a section function in `src/view.js`, added to `SECTIONS`, and the key in `emptyView()` | if old views must change: raise `VIEW_VERSION` and add the step to `MIGRATIONS` |

`CATALOG` (`src/catalog.js`) reads these tables, so a UI offers the new name without further changes.
Then: tests (below), the view on the documentation site (`docs/concepts/views.md` and the concept
page of the key), the API in `docs/reference/core.md`, and the changelog. A new public function is
exported from `src/index.js` (or `src/export.js`) and listed in `test/api.test.js` and
`docs/reference/core.md`; anything else stays internal. The package READMEs are short npm landing
pages: they link to the site and repeat none of it.

## Adding a test

- Tests live in `packages/pivotkit-core/test/*.test.js` and run with `node --test`; shared rows are in
  `test/fixtures.js`. Test through the public API (`../src/index.js`, `../src/export.js`); import an
  internal module only for a helper the public API cannot reach precisely.
- A fix comes with a test that fails without it. Write the test first, watch it fail, then fix.
- Never weaken or delete a test to get green: a failing test means the code or the test is wrong, and
  the pull request says which.
- Behaviour that depends on the machine (time zone, locale) is tested in child processes with `TZ` and
  `LANG` set, as in `test/time-zones.test.js`.
- A type change: `test/types/consumer.ts` compiles against the generated declarations
  (`npm run types`).
- UI logic of `pivotkit-react` (view changes, the history, keyboard moves, names, the chart's text)
  lives in plain `.js` modules and is tested with `node --test` in `packages/pivotkit-react/test/`;
  `npm run coverage` measures those modules only. What needs a browser (drag and drop, menus, focus,
  downloads, themes, layouts) is a Playwright test in `tests/browser/` against the playground and the
  pages of `tests/browser/pages/` (a host page with React from an import map, a shadow root, the web
  component's pages in `pages/element/`); it fails on any console error or warning. A test that measures layout waits until it has settled.

## Releasing

The release workflow (`.github/workflows/release.yml`) publishes every package. It was set up once
with the steps below, and a new package needs steps 2 and 3 again: a trusted publisher is configured
in a package's settings on npm, so each package is published once by hand before the workflow takes
over.

1. Make the repository public: npm generates no provenance for private repositories (npm's
   documentation, "Generating provenance statements").
2. Publish the first version of each package by hand, in the order `pivotkit-core`, `pivotkit-react`,
   `pivotkit-element`, `pivotkit-xlsx`, from tarballs built from `main` (`npm ci --ignore-scripts`, `npm run build`,
   `npm pack -w <package>`), with an npm account that has two-factor authentication:
   `npm publish <tarball> --access public`. Provenance is not in `publishConfig`: the workflow
   asks for it with `--provenance`, which needs the CI's OIDC token.
3. Configure trusted publishing for each package on npm: owner `eizedev`, repository `pivotkit`,
   workflow file `release.yml`, environment `npm`. No npm token is stored in GitHub. A new trusted
   publisher must publish once within two days, or it expires (npm's documentation, "Trusted
   publishers"), so set it up when the next release is ready. Then set the package's publishing
   access to "Require two-factor authentication and disallow tokens". The split of the workflow into
   a "build" and a "publish" job keeps the OIDC token away from the dependencies; it does not prove
   the tarball: "build" runs the dev dependencies that make `dist/`, and provenance attests the
   workflow and the commit, not that `dist/` is unaltered. "publish" checks only that the tarball's
   name and version match the tag.
4. In the repository settings, create the environment `npm` with required reviewers and deployments
   from tags only (deployment branch and tag rule `*@*`).
5. Add a tag ruleset for `*@*`: only maintainers create, move or delete release tags.
6. Set the repository variable `NPM_RELEASE_ENABLED` to `true`.

Then for each release of a package, in the order `pivotkit-core`, `pivotkit-react`,
`pivotkit-element`, `pivotkit-xlsx` (pivotkit-react and pivotkit-xlsx depend on a published
pivotkit-core; the element bundles core and react):

1. Move the `[Unreleased]` entries in `packages/<package>/CHANGELOG.md` under the new version and
   date; set `version` in `packages/<package>/package.json`, and the caret range or the
   devDependency of the packages that use it (`tests/ci.test.js` checks that every own range takes
   the version in this repository); merge that pull request.
2. Wait for CI on main, then tag the merge commit `<package>@<version>` and push the tag.
3. The workflow's `build` job checks that the tag matches the version, that the commit is on main
   and that CI passed for it, runs lint, types, tests and the package check, and packs the tarball;
   it has no publishing right. The `publish` job waits for an environment reviewer, then publishes
   only that tarball with an npm provenance attestation, with npm 11.21.1 (trusted publishing needs
   11.5.1 or later and Node 22.14.0 or later).
4. Publish a GitHub release for each tag, with a short text and a link to the package's CHANGELOG.
   Publishing a release also publishes the documentation site from its tag
   (`.github/workflows/docs.yml`), not a push to main, so the site describes what is on npm. To publish it again by hand: Actions > Docs site > Run workflow with the input `tag` (a release
   tag that exists, or `main` for a preview of unreleased docs; the next release replaces it).

`npm run pack:check` shows locally what would be published (LICENSE, README, CHANGELOG, `src/` or
`dist/`, `types/`, and for pivotkit-element and pivotkit-xlsx `dist/THIRD_PARTY_LICENSES.txt`); it fails while a
package is marked `"private": true`.
