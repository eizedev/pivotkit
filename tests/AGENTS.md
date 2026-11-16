# tests

Repository-wide checks (`tests/*.test.js`) and the Playwright browser tests (`tests/browser/`).
The root [AGENTS.md](../AGENTS.md) applies too.

## Commands

```bash
node scripts/test-run.js node --test "tests/*.test.js"   # the repository checks alone
npm run test:browser                                      # build, then Playwright in three engines
PLAYGROUND_PORT=4195 npm run test:browser                 # when port 4173 is taken
npx playwright test tests/browser/report-                 # only the HTML report specs
PIVOTKIT_REACT=19 npm run test:browser                    # on React 19
npm ci --prefix tests/react19                             # once, before the line above
npm run types --prefix tests/react19                      # React 19's types, after npm run types
npm run bench:browser                                     # benchmark, 100k to 1M rows; not a test
```

## Temporary directories

- Make every temporary directory with `tempDir(label)` from `tests/temp-dir.js`.
- That holds for tests, probes, benchmarks and browser specs.
- The `tempDir` of a package's `test/helpers.js` is this one with the package's label.
- A Playwright spec calls `removeTempDirs()` in `test.afterAll`.
- The directories are removed at process end, also after a failure, `exit()` or a signal.
- `scripts/test-run.js` fails a run that leaves one of its directories behind.
- `tests/temp-dirs.test.js` fails on `mkdtemp`, `tmpdir()`, `TMPDIR` or `"/tmp/"` elsewhere.
- `tests/source-files.js` lists the files such checks scan.

## Scripts

- A script that can also be imported checks `isMain(import.meta.url)` from `scripts/is-main.js`.
- `tests/is-main.test.js` enforces it.

## Browser tests

- They run in Chromium, Firefox and WebKit, on React 18 and 19. CI has one job per engine and React.
- A test fails on any console error or warning (`tests/browser/fixtures.js`).
- A test that measures layout waits until the layout has settled.

## Browser test pages

- Targets: the playground and the pages in `tests/browser/pages/`.
- Those pages cover a host page with an import map, a shadow root and a fixed app bar.
- `pages/element/` holds the web component's pages, including a strict CSP.

## HTML report specs

- `report-*.spec.js` measure the HTML report's colours and contrast in both themes and in print.
- `report-pdf.spec.js` prints a real PDF in Chromium. `pdf-read.js` reads it.
- Not covered: real Safari and a browser's print dialog.
- Run the report specs after any change to the report's stylesheet or tokens.

## Browser benchmark

- `bench/browser/` drives the report by real clicks in three engines. It has no pass or fail.
- Its numbers go into `docs/concepts/limits.md` with the machine they were taken on.

## Repository checks

- `tests/ci.test.js` checks pins, caret ranges, workflows and version statements in the docs.
- It also checks that the Playwright image matches the locked `@playwright/test`.
- `tests/examples.test.js` fails until `node scripts/examples.js` has run.
- `tests/schemas.test.js` fails until `node scripts/schemas.js` has run.
- `tests/llms-sections.test.js` checks that every docs page is in one `llmstxt` section.
