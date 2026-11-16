# Contributing

Thanks for helping.

- Bug reports and ideas go into [issues](https://github.com/eizedev/pivotkit/issues).
- Questions go into [discussions](https://github.com/eizedev/pivotkit/discussions).
- Security reports go privately, see [SECURITY.md](SECURITY.md).

## Before you start

- Read [PRODUCT.md](PRODUCT.md). It says what pivotkit is and what a pull request delivers.
- A new feature answers PRODUCT.md's five questions in its issue.
- [AGENTS.md](AGENTS.md) holds the layout, the commands and the code rules.
  Packages have their own `AGENTS.md` with details. AI assistants read them on their own.

## Set up

You need Node.js 22 or later.

```bash
npm ci
npx playwright install   # once, for the browser tests
```

## Make a change

1. Fork the repository.
2. Create a branch named after the change: `feat/...`, `fix/...` or `docs/...`.
3. Write the test first for a fix. Watch it fail, then fix the code.
4. Run the checks below.
5. Update the docs and the changelog.
6. Open a pull request.

## Check your change

Every change:

```bash
npm run lint
npm run types
npm test
```

Then, depending on what you changed:

| You changed | Also run |
| --- | --- |
| the engine | `npm run bench -w pivotkit-core`, compare with the baseline in `docs/reference/core.md` |
| the UI | `npm run test:browser`, and look at `npm run playground` in light and dark, wide and narrow |
| the web component | `npm run size -w pivotkit-element` and the examples in `examples/` |
| a reader | tests on real files, see `packages/pivotkit-core/test/import-fixtures/SOURCES.md` |
| pivotkit-xlsx | `npm run size -w pivotkit-xlsx` and `npm run bench -w pivotkit-xlsx` |
| the HTML report's look | `npx playwright test tests/browser/report-` |

The package's `AGENTS.md` lists its commands and what its tests cover.

## Tests

- A fix comes with a test that fails without it.
- Never weaken or delete a test to get green.
- If a test fails, the code or the test is wrong. Say which in the pull request.
- Files on disk go into a directory from `tempDir()` ([tests/AGENTS.md](tests/AGENTS.md)).
- UI logic lives in plain `.js` modules, tested with `node --test`.
- What needs a browser is a Playwright test in `tests/browser/`.
  It fails on any console error or warning.

## Docs

Describe what people see on the [documentation site](https://pivotkit.eize.dev/). Its pages are in `docs/`.

- A new page goes into one section of `[project.plugins.llmstxt.sections]` in `zensical.toml`.
- A UI change takes the screenshots again with `npm run docs:screenshots`.
- A feature also updates the overview pages. [AGENTS.md](AGENTS.md#docs-and-changelogs) lists them.

Preview the site:

```bash
npm run docs:demo
curl -fsSo docs/assets/site.css https://raw.githubusercontent.com/eizedev/brand/main/docs-site/site.css
uvx zensical@<version> serve
```

- Take `<version>` from eizedev/brand's `docs-site/requirements.txt`.
- CI runs `zensical build --strict`.

## Changelog and commits

- Add an entry under `[Unreleased]` in the `CHANGELOG.md` of each package you changed.
- Use Conventional Commits with the package as scope: `feat(core): ...`, `fix(react): ...`.

## Pull request

- Link the issue. Write `Fixes #n` in the description, not in commit messages.
- Say what you tested.
- A larger feature is reviewed by a user, an operator and a developer, from the packed packages.
- Get an independent review first ([PRODUCT.md](PRODUCT.md#what-a-contribution-delivers) says why).

## Dependencies

- Check the licence of every library you add. It must be permissive and free for companies.
- Pin every third-party package to an exact version.
- A package of this repository takes a caret range on another one: `^<its version>`.
- A devDependency on one takes its exact version. `tests/ci.test.js` checks both.
- In 0.x a caret range spans patch versions only. `^0.y.z` matches later 0.y patches.
- A host that uses pivotkit-core directly must stay inside that range.
- `pivotkit-core` has no runtime dependency except `fflate`. Keep it that way.

### Bundles and overrides

- `pivotkit-element` and `pivotkit-xlsx` bundle their dependencies.
  Their licences land in `dist/THIRD_PARTY_LICENSES.txt` by themselves.
- React 19 for the browser tests has its own install and lock file in `tests/react19/`.
- The root override pins ESLint's `minimatch` to 11.0.1 for an advisory (#76).
  Remove it once ESLint requires a patched version itself.

## Adding to the engine

A new aggregator, filter type or view key is one table entry plus its tests.
See [Adding a view feature](packages/pivotkit-core/AGENTS.md#adding-a-view-feature).

## Releasing

Maintainers release. See [RELEASING.md](RELEASING.md).
