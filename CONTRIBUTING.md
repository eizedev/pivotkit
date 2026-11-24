# Contributing

Thanks for helping.

- Bug reports and ideas go into [issues](https://github.com/eizedev/pivotkit/issues).
- Questions go into [discussions](https://github.com/eizedev/pivotkit/discussions).
- Security reports go privately, see [SECURITY.md](SECURITY.md).
- Everyone follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Read [PRODUCT.md](PRODUCT.md). It says what pivotkit is and what a pull request delivers.
- A new feature answers PRODUCT.md's five questions in its issue.
- [AGENTS.md](AGENTS.md) holds the layout, the commands and the code rules.
  Packages have their own `AGENTS.md` with details. AI assistants read them on their own.

## Set up

You need Node.js 24 or later.

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
npm run growth
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
| the XLSX export | open an exported `.xlsx` in Excel or LibreOffice |
| a package's files, exports or `package.json` | `npm run pack:check` |

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

The rules for pages, screenshots and overview pages are in [AGENTS.md](AGENTS.md#docs-and-changelogs).

Preview the site:

```bash
npm run docs:demo
curl -fsSo docs/assets/site.css https://raw.githubusercontent.com/eizedev/brand/<commit>/docs-site/site.css
uvx zensical@<version> serve
```

After `uvx zensical@<version> build --strict`, `node scripts/check-readme-links.js site` checks that README links resolve.

- Take `<commit>` from the line `uses: eizedev/brand/docs-site@<commit>` in `.github/workflows/docs.yml`.
  CI builds the site with that commit of the design.
- Take `<version>` from `docs-site/requirements.txt` of eizedev/brand at that commit.
- CI runs `zensical build --strict`.

## Changelog and commits

- Add an entry under `[Unreleased]` in the `CHANGELOG.md` of each package you changed.
- Use Conventional Commits with the package as scope: `feat(core): ...`, `fix(react): ...`.

## Pull request

- Link the issue. Write `Fixes #n` in the description, not in commit messages.
- Say what you tested.
- A larger feature is reviewed by a user, an operator and a developer, from the packed packages.
- An independent review before you open the pull request is strongly recommended.
  [PRODUCT.md](PRODUCT.md#what-a-contribution-delivers) says why.

## Dependencies

- Check the licence of every library you add. It must be permissive and free for companies.
- Pin every third-party package to an exact version.
- A package of this repository takes a caret range on another one: `^<its version>`.
- A devDependency on one takes its exact version. `tests/ci.test.js` checks both.
- In 0.x a caret range spans patch versions only. `^0.y.z` matches later 0.y patches.
- A host that uses pivotkit-core directly must stay inside that range.
- `pivotkit-core` has no runtime dependency except `fflate`. Keep it that way.

### Bundles

- `pivotkit-element` and `pivotkit-xlsx` bundle their dependencies.
  Their licences land in `dist/THIRD_PARTY_LICENSES.txt` by themselves.
- React 19 for the browser tests has its own install and lock file in `tests/react19/`.

## Deprecate something

[docs/versioning.md](docs/versioning.md) has the policy. In 0.x, every break is marked
**Breaking** in the changelog, and the upgrading page lists the next release's breaks with what to do. From 1.0.0, nothing public goes away without a deprecation first.

A pull request that deprecates something delivers:

- the next free id `PK-DEP-NNNN` from the register on the versioning page
- a warning at run time when code uses the old form. It names the id and the replacement
- for the services, a `check-config` line that names the id
- where possible, the old form keeps working. pivotkit turns it into the new one
- a test that uses the old form and checks the warning and the result
- the register entry, a changelog entry with the id, and a row on the upgrading page

The removal waits for the next major release.

## Record a decision

A lasting decision gets a record in `docs/decisions/`. Reversible choices with little impact do not.

1. Copy the layout of an existing record: front matter with `title`, `description`, `status` and
   `date`, then the sections of MADR's minimal template. `date` is the day the record was accepted,
   or the day it was proposed.
2. Take the next free number. Link the issue or pull request the decision comes from.
3. Write "reason not recorded" where no source gives the reason. Never guess one.
4. Run `node scripts/decisions.js`. It writes the index. `tests/decisions.test.js` checks both.

A record stays `proposed` while its behaviour is not on main. The pull request that merges the
behaviour sets it to `accepted` and sets the date.

An accepted record is not edited. To change a decision, write a new record. Set the old one to
`status: superseded` with `superseded_by: <new file>`, and link both ways.

## Adding to the engine

A new aggregator, filter type or view key is one table entry plus its tests.
See [Adding a view feature](packages/pivotkit-core/AGENTS.md#adding-a-view-feature).

## Releasing

Maintainers release. See [RELEASING.md](RELEASING.md).
