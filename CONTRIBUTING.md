# Contributing

Thanks for helping. Bug reports and ideas go into [issues](https://github.com/eizedev/pivotkit/issues),
questions into [discussions](https://github.com/eizedev/pivotkit/discussions),
security reports privately (see [SECURITY.md](SECURITY.md)).

## Changes

1. Fork, create a branch named after the change (`feat/...`, `fix/...`, `docs/...`).
2. Follow [AGENTS.md](AGENTS.md): layout, commands and the rules that keep the packages safe and small.
3. Run `npm ci`, `npm run lint`, `npm run types` and `npm test`; for engine changes also
   `npm run bench -w pivotkit-core` and compare with the baseline in the package README.
4. Add an entry under `[Unreleased]` in the `CHANGELOG.md` of each package you changed.
5. Open a pull request with a short description and what you tested; use Conventional Commits
   (`feat(core): ...`, `fix(react): ...`).

## Dependencies

Every package is pinned to an exact version with the lock file. Check the license of every library
you add: permissive (MIT, Apache-2.0, BSD) and free for companies. `pivotkit-core` has no runtime
dependency except `fflate` for the XLSX zip; keep it that way.

## Adding a view feature

The vocabulary of a view lives in tables, so a new name is one entry plus its tests:

| Feature | Table | Also |
| --- | --- | --- |
| Aggregator | `AGGREGATORS` in `src/aggregators.js` (kernel, result type, `numeric`, `dates`, `additive`) | its label in `DEFAULT_LABELS.aggregators` (`src/labels.js`) |
| Date grouping or bin unit | `DERIVED` in `src/derive.js` (source type, result type, value, label) | |
| Filter type | `FILTERS` in `src/filters.js` (stage, `normalize`, `allowed` or `keep`) | |
| "Show values as" | `SHOW_AS` in `src/show-as.js` (default format, `alongAxis`, `additive`, `compute`) | |
| Format | `FORMAT_NAMES` and `formatterFor` in `src/format.js` | its Excel code in `excelNumberFormat`, or the gap in the README |
| A new view key | a section function in `src/view.js`, added to `SECTIONS`, and the key in `emptyView()` | if old views must change: raise `VIEW_VERSION` and add the step to `MIGRATIONS` |

`CATALOG` (`src/catalog.js`) reads these tables, so a UI offers the new name without further changes.
Then: tests (below), the view and API sections of `packages/pivotkit-core/README.md`, and the
changelog. A new public function is exported from `src/index.js` (or `src/export.js`) and listed in
`test/api.test.js` and the README; anything else stays internal.

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

## Releasing

Nothing is published yet, and there is no npm account for the packages. The release workflow
(`.github/workflows/release.yml`) is prepared but skipped until it is switched on. To switch it on
once:

1. Create the package on npm and configure trusted publishing for this repository and the workflow
   file `release.yml` (npm's documentation: "Trusted publishers"). No npm token is stored in GitHub.
2. In the repository settings, create the environment `npm` with required reviewers.
3. Set the repository variable `NPM_RELEASE_ENABLED` to `true`.

Then for each release of `pivotkit-core`:

1. Move the `[Unreleased]` entries in `packages/pivotkit-core/CHANGELOG.md` under the new version and
   date; set `version` in `packages/pivotkit-core/package.json`; merge that pull request.
2. Tag the merge commit `pivotkit-core@<version>` and push the tag.
3. The workflow checks that the tag matches the version, runs lint, types, tests and the package
   check, waits for an environment reviewer, and publishes with an npm provenance attestation.

`npm run pack:check` shows locally what would be published (LICENSE, README, CHANGELOG, `src/`,
`types/`). Verify against npm's current documentation which npm CLI version trusted publishing needs
before the first release; the workflow uses the npm that ships with Node 24.
