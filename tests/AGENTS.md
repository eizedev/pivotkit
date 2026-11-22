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
- Each name holds a mark of its host and its process id. SIGKILL or a crash leaves the directories.
- The mark hashes the host name and, on Linux, the PID namespace.
  On macOS the host name can change with the network. Directories with an old mark stay; remove them by hand.
- The next `tempDir()` on the same host removes those of processes that are gone.
  It says so on stderr and notes them in `pivotkit-swept.log` in the temporary directory.
  When it cannot, it writes `pivotkit-swept-unnoted-<pid>` instead, which CI's check counts.
- `$PIVOTKIT_TEMP_ROOT` names another directory for them. The test of the sweep uses it.
- `scripts/test-run.js` fails a run that leaves one of its directories behind, or whose directories a sweep removed.
- CI's Linux test job also fails when any `pivotkit-*` directory is new after the tests.
  So it does when a sweep removed one meanwhile (`scripts/temp-dirs.js`).
- `tests/temp-dirs.test.js` fails on `mkdtemp`, `tmpdir()`, `TMPDIR` or `"/tmp/"` elsewhere.
- `tests/source-files.js` lists the files such checks scan.

## Time bounds

- Work the process computes is bounded by CPU time: `cpuClock()` from `tests/cpu-time.js`.
- Wall time fails when other test suites share the machine. CPU time does not grow then.
- Event latency (a timer, the network, a child process) stays on wall time. CPU time misses waits.
  Prefer an assert on the event. Else give a wide margin and a comment why.
- So do a timestamp the code wrote, a polling deadline and a ratio of two measurements.
- Such a line ends in the comment `// wall time: <why>`, for example `// wall time: event latency`.
- `tests/time-bounds.test.js` fails on a wall-clock reading in a comparison without that comment.

## Scripts

- A script that can also be imported checks `isMain(import.meta.url)` from `scripts/is-main.js`.
- `tests/is-main.test.js` enforces it.

## Browser tests

- They run in Chromium, Firefox and WebKit, on React 18 and 19. CI has one job per engine and React.
- A test fails on any console error or warning (`tests/browser/fixtures.js`).
- The chart specs are in `chart/`, named like the unit tests of pivotkit-core and pivotkit-react. `chart/report.js` mounts the chart report these specs point at.
- A test that measures layout waits until the layout has settled.
- A test waits for a file chooser with `nextFileChooser(page)` from `import-helpers.js`, not `page.waitForEvent`.
  It keeps Firefox from opening the native picker on the second pick.
- A mouse drag waits until its target shows it takes the drop, then releases. `drag()` in `fixtures.js` does this.
  A busy WebKit can take the release before it has drawn the last moves, and the drop is lost.
- A test looks for a toolbar button, its own or in More, after `twoFrames(page)` from `fixtures.js`.
  The toolbar moves buttons into More again while the report lays out.
- A test that rests the pointer for a time counts it on the page's clock, not with a wait in the test.
  `restAt()` in `popover-clip.spec.js` does this for the info tips.

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
- `tests/decisions.test.js` checks the decision records, and the index `node scripts/decisions.js` writes.
- `tests/deprecations.test.js` checks that every `PK-DEP-NNNN` in `packages/*/src` is in the register.
- `tests/llms-sections.test.js` checks that every docs page is in one `llmstxt` section.
- `tests/growth.test.js` checks how `scripts/growth.js` reads ESLint, knip and the docs, and its baseline's format.
- `tests/docs-lists.test.js` checks that every list in the docs starts after a blank line.
- `tests/compatibility.test.js` checks the lowest versions in `docs/compatibility.md` against `package.json`,
  `docs/browser-support.md` and the CI matrix.
