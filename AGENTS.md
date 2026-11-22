# AGENTS.md

Read [PRODUCT.md](PRODUCT.md) before you plan or build anything.
It says what pivotkit is, who it is for and what it is not. A feature issue answers its five questions.
Read the [decision records](docs/decisions/index.md) too: accepted is binding, proposed is context,
superseded is history. A task that conflicts with an accepted record stops and proposes a new one.

This file holds what you need on every task. Packages and some folders have their own `AGENTS.md`.

## How we build

pivotkit is one product. Judge code, tests, docs and these rules as a whole.

- **Look at the whole.** Before and after a change, read the whole files, pages and flows it touches,
  as the people who use, run, and build on pivotkit. A change is done when the product is better.
- **Shape what exists.** Edit, merge, move or delete until the result reads as if written today.
  Adding is the last option.
- **One place per fact.** A rule, a fact or a piece of logic lives in one place. Others link or import it.
- **Small units.** A file holds one concept, a function one job. When a second place needs
  something, build the shared piece first.
- **Common practice first.** Write JavaScript, React, and Node the way their communities do.
  A deviation names its reason.
- **Say what does not fit.** Duplication, a growing function or a page nobody can read: name it in the
  pull request and propose the fix.

## Packages

pivotkit is a pivot report builder in the spirit of Excel's PivotTable, as npm workspaces.
The [README](README.md#packages) lists each package and what it is.
The root `package.json` lists the workspaces in build order. `npm run types` and the builds need it.

## Layout

- `packages/<name>/` - one package each: `src/`, `test/`, `README.md`, `CHANGELOG.md`.
- `examples/` - the playground, the web component and Angular examples, print templates, a reader plugin.
- `tests/` - repository-wide tests and the Playwright browser tests.
- `bench/` - benchmarks, not tests: `browser/` the report in browsers, `server/` an HTTP source's memory.
- `scripts/` - generators and checks. Each script says in its header what it does.
- `docker/` - the container image and its examples.
- `docs/` - the documentation site, built with Zensical.
- `assets/` - icon, header and social preview. They are made in eizedev/brand. Never change them here.

## Commands

Set up and check, as CI does:

```bash
npm ci                 # install every workspace from the lock file
npm run lint           # ESLint
npm run types          # tsc with checkJs, generated .d.ts, TypeScript consumers
npm test               # node --test in every workspace and tests/*.test.js
npm run coverage       # the tests with a coverage report
npm run pack:check     # what npm pack would publish, checked
npm run growth         # functions, unused exports, duplication, docs pages may not grow
```
`npm run growth` compares with `scripts/growth-baseline.json`; when an offender shrinks, `node scripts/growth.js --update` lowers it.

One package, the UI and the browser tests. A package's `AGENTS.md` lists its size and benchmark commands:

```bash
npm test -w pivotkit-server        # any workspace name works
npm run build -w pivotkit-react    # packages with a dist/ build first
npm run playground                 # http://localhost:5173 with rebuilds
npm run test:browser               # three browsers. React 19 and ports: tests/AGENTS.md
```

Generated files. Run the generator after a change. A test fails until you do:

```bash
node scripts/schemas.js                                 # pivotkit-core's JSON Schemas
node scripts/examples.js                                # the CLI's example files
node scripts/openapi.js                                 # docs/openapi.json
node scripts/decisions.js                               # docs/decisions/index.md
PIVOTKIT_UPDATE_GOLDEN=1 npm test -w pivotkit-report    # golden files; review the diff
```

Docs site: build and preview commands are in [CONTRIBUTING.md](CONTRIBUTING.md#docs).

## Hard rules

- **Data stays protected.** What a policy hides reaches no report, log, error or model answer.
- **Never weaken a test to get green.** Say whether the code or the test is wrong.
- **A fix comes with a test that fails without it.**
- **CI is green on the exact head** before anything is merged, dependency updates included.
- **Clean up.** Temporary directories only through `tempDir()` ([tests/AGENTS.md](tests/AGENTS.md)).
- **Commit no `node_modules/` and no build output.**
- **No secrets, host names or real data** in code, examples or tests.
  The exceptions are public data with their licences: `examples/playground/data/`,
  the weather example built from it in `packages/pivotkit-cli/examples/` with `weather-SOURCE.txt`,
  and `packages/pivotkit-core/test/import-fixtures/`.

## Code rules for every package

### Views and files from outside

- A view is user input. It holds names only.
- Resolve names against fixed lists or the data's schema. Never evaluate a string from a view.
- Never use a name from a view as an object key without an own-property check.
- A loaded file is user input too. Never evaluate or fetch anything a file names.
- A view from a link, pasted JSON, storage or an API passes `normalize()` with `outsideLimits()`.
- Cap its size before you decode or parse it. Say in plain words what was dropped.

### Limits

- Whatever grows with the view or the data counts against `LIMITS` before it is allocated.
- A new structure that grows gets a limit. `docs/concepts/limits.md` explains each one.

### Errors and API shape

- A bad view never throws: `normalize()` reports issues.
- A programmer error or a limit throws `PivotkitError` with a code.
- Required inputs come first. Every optional setting goes into one trailing options object.
- Locale: the view's, then `options.locale`, then `"en-US"`. Never the runtime's locale.
- Dates are wall clock. Instants use `encode`'s `timeZone`, default `"UTC"`. Never the machine's zone.
- Caches are bounded (`createCache` in pivotkit-core's `util.js`).

### Dependencies

- Pin every third-party package exactly. CI runs `npm ci --ignore-scripts`.
- A package of this repository takes a caret range on another one. `tests/ci.test.js` checks it.
- Prefer a small wrapper of our own over a chart wrapper package. Those have been hijacked on npm.
- Licences and the rest: [CONTRIBUTING.md](CONTRIBUTING.md#dependencies).

### Never

- Add a runtime dependency to `pivotkit-core` other than `fflate`.
- Bundle React or ECharts into `pivotkit-react`. `pivotkit-element` is the package that bundles them.
- Add a UI framework or an animation library to `pivotkit-react`.

## Docs and changelogs

- Docs describe the current state. History goes into changelogs, commits and pull requests.
- Add an `[Unreleased]` entry to the `CHANGELOG.md` of each package you change.
- Use Conventional Commits with the package as scope: `feat(core): ...`.
- Describe a change people see on the one page that owns its topic. Rewrite that page's
  section instead of adding a paragraph beside the old one.
- Check the overview pages (README top, `docs/index.md`, `docs/features.md`, `docs/compare.md`,
  package READMEs, getting-started). Correct what the change made false; link instead of copying.
- The commands and examples on those pages still run as written.

### Audiences

- `docs/use/` is for people who build reports. Plain words, one task per page.
- `docs/embed/`, `getting-started/`, `concepts/` and `reference/` are for developers.
- `docs/features.md` links to the pages. It never copies the behaviour.
- A `use/` page gives the task in a few lines, then steps, then details folded in `???` blocks.
- Prop names appear in `use/` only in a "For developers" box.
- A props table has one short line per prop. The full text goes into the "Props in detail" section.

### Pages and screenshots

- A new page goes into one `llmstxt` section in `zensical.toml` (`tests/llms-sections.test.js`).
- A list needs a blank line before it, or the item joins the paragraph (`tests/docs-lists.test.js`).
- A page or anchor that moves keeps its address with a redirect in `zensical.toml`.
- Screenshots come in light and dark pairs. A UI change takes them again (`npm run docs:screenshots`).
- The Excel screenshot `xlsx-result-*.png` is taken by hand. Its steps are in `scripts/docs-screenshots.js`.
- Facts in `docs/compare.md` are linked and dated. Check them again when they change.
- Docs name no version of pivotkit. `tests/ci.test.js` lists the few exceptions.

### READMEs and build output

- Package READMEs are short npm pages. Their install facts must match `package.json` and the site.
- README links are absolute and are a contract: a published README cannot change.
- `docs/playground/`, `docs/schema/`, `site.css`, the social preview and `robots.txt` are build output.

## Working rules

For agents and the maintainer. See also [PRODUCT.md](PRODUCT.md#what-a-contribution-delivers).

### Reviews

- A review judges the product after the change, not the diff: whole files, pages and flows.
- Whoever wrote a change does not review it. AI-written changes get an independent review before
  the pull request. The maintainer reviews every pull request; findings come back as change requests.
- A larger feature gets reviews as user, operator and developer, run with the packed packages.
- A change to what a caller may see gets an adversarial privacy review until it finds nothing new.
  Limits that cannot be closed go into `docs/privacy.md`.

### Pull requests and interfaces

- Write `Fixes #n` only in the pull request description, never in intermediate commits.
- A changed MCP tool description or schema: the upgrading page says clients must reconnect.
- A public interface change follows [docs/versioning.md](docs/versioning.md). Deprecate as [CONTRIBUTING.md](CONTRIBUTING.md#deprecate-something) says.
- A product decision that changes PRODUCT.md updates it in the same pull request.

## Where details live

- [packages/pivotkit-core/AGENTS.md](packages/pivotkit-core/AGENTS.md) - engine, view format, readers, exports
- [packages/pivotkit-react/AGENTS.md](packages/pivotkit-react/AGENTS.md) - UI rules, tokens, first load
- [packages/pivotkit-element/AGENTS.md](packages/pivotkit-element/AGENTS.md) - shadow root, bundle, size
- [packages/pivotkit-xlsx/AGENTS.md](packages/pivotkit-xlsx/AGENTS.md) - workbook reader safety
- [packages/pivotkit-report/AGENTS.md](packages/pivotkit-report/AGENTS.md) - rendering, operations table
- [packages/pivotkit-node/AGENTS.md](packages/pivotkit-node/AGENTS.md) - files and the REST contract, shared
- [packages/pivotkit-cli/AGENTS.md](packages/pivotkit-cli/AGENTS.md) - commands, remote mode, sign-in
- [packages/pivotkit-server/AGENTS.md](packages/pivotkit-server/AGENTS.md) - options, sources, policy, REST
- [packages/pivotkit-mcp/AGENTS.md](packages/pivotkit-mcp/AGENTS.md) - MCP tools and plugin
- [tests/AGENTS.md](tests/AGENTS.md) - browser tests, temporary directories, repository checks
- [examples/AGENTS.md](examples/AGENTS.md) - playground, Angular, templates
- [docker/AGENTS.md](docker/AGENTS.md) - the container image
- [CONTRIBUTING.md](CONTRIBUTING.md) - how to contribute, [RELEASING.md](RELEASING.md) - releases
