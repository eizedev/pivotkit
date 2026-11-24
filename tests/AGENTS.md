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
- `tests/temp-dir-check.test.js` fails on `mkdtemp`, `tmpdir()`, `TMPDIR` or `"/tmp/"` elsewhere.
- `tests/temp-dir.test.js` covers the removal at a process's end, `tests/temp-dir-sweep.test.js` the sweep,
  `tests/test-run.test.js` the run's check. Their child processes are in `tests/temp-dir-children.js`.
- `tests/source-files.js` lists the files such checks scan.

## Time bounds

- Work the process computes is bounded by CPU time: `cpuClock()` from `tests/cpu-time.js`.
- Wall time fails when other test suites share the machine. CPU time does not grow then.
- Event latency (a timer, the network, a child process) stays on wall time. CPU time misses waits.
  Prefer an assert on the event. Else give a wide margin and a comment why.
- So do a timestamp the code wrote, a polling deadline and a ratio of two measurements.
- Such a line ends in the comment `// wall time: <why>`, for example `// wall time: event latency`.
- `tests/time-bounds.test.js` fails on a wall-clock reading in a comparison without that comment.
- A unit test waits for a condition with `until()` from `tests/until.js`. Its header gives the options and defaults.
- A test that goes on when the condition never comes keeps a deadline loop of its own, marked `// wall time: a polling deadline`.
- A fixed sleep checks that nothing happens for a while. A new one says so in a comment.

## Scripts

- A script that can also be imported checks `isMain(import.meta.url)` from `scripts/is-main.js`.
- `tests/is-main.test.js` enforces it.

## Browser tests

- They run in Chromium, Firefox and WebKit, on React 18 and 19. CI has one job per engine, shard, and React version, in `.github/workflows/browser.yml`.
- A pull request that changes only `docs/`, Markdown, or the Angular example skips them. Every push to main runs them.
  So a browser test, the playground, and the test pages read no docs page and no Markdown file. `tests/workflows.test.js` looks for such paths in their code.
- A test fails on any console error or warning (`tests/browser/fixtures.js`).
  A page the fixture does not give, or a test that expects one warning, uses `watchConsole(page, { ignore })` from there.
  A touch screen is `test.use({ hasTouch: true })`, so the fixture's page is the touch page.
- A new test takes the report's English texts by key: `TEXTS` and `textOf` in `fixtures.js`.
  A change of wording then breaks no test. Nearly all specs still spell the words out (only a few take them by key) and fail on a wording change.
- The chart specs are in `chart/`. A topic the unit tests of pivotkit-core or pivotkit-react also test has the same filename.
- `chart/report.js` mounts a report on the host page (`mountReport`), waits for its chart (`chartOf`) and finds where ECharts drew its marks.
  `labels.spec.js` mounts a report of its own: its view is controlled (`view`, not `defaultView`).
- A test that measures layout waits until the layout has settled.
  `animationsSettled(page)` in `fixtures.js` waits until no animation runs.
- A test waits for a file chooser with `nextFileChooser(page)` from `import-helpers.js`, not `page.waitForEvent`.
  It keeps Firefox from opening the native picker on the second pick.
- A mouse drag waits until its target shows it takes the drop, then releases. `drag()` in `fixtures.js` does this.
  A busy WebKit can take the release before it has drawn the last moves, and the drop is lost.
- A test opens a toolbar action, its own button or its entry in More, with `toolbar(scope, testId)` from `fixtures.js`.
  `scope` is the page or one report of several. It waits for `twoFrames(page)` first:
  the toolbar moves buttons into More again while the report lays out.
- A test waits for a condition: `expect`, `expect.poll`, `animationsSettled`, `twoFrames`.
  A fixed sleep (`waitForTimeout`) checks that nothing happens for a while, or gives an input a person's pace.
  A comment on its line or the line above says which. `tests/browser-sleeps.test.js` fails on a sleep without one.
  A time the report counts, such as a note's `SHOWN_MS`, runs on `page.clock`.
- A layout measured in pixels depends on the font. CI's Playwright image has the same fonts on every run.
  A spec whose widths must hold on any machine calls `pinFont(page)` from `fixtures.js` (Arial, or Liberation Sans with its widths),
  or measures what fits on the page itself (`toolbar-overflow.spec.js`, `boxThatFits` in `zones-fold.spec.js`).
- `contrast.js` holds the WCAG contrast maths the specs run in the page: `installContrast(page)`, then `window.__pkContrast`.
- A new test that rests the pointer for a time counts it on the page's clock where the report counts that time. Older specs still wait, with a comment that says why.
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

- `tests/browser-sleeps.test.js` checks that every fixed sleep of the browser tests has a comment.
- `tests/ci.test.js` checks pins, caret ranges, lock files, check-release and version statements in the docs.
- `tests/markdown-files.js` defines the docs pages and the current-state Markdown that these checks read.
- `tests/workflows.test.js` checks the workflows as parsed YAML: jobs, steps and their order, events, permissions.
  It also checks that the Playwright image matches the locked `@playwright/test`.
- A check of a docs page names the facts, not the words: `assertStates` in `tests/docs-facts.js`.
  The page passes when one sentence or table row holds every part.
- `tests/examples.test.js` fails until `node scripts/examples.js` has run.
- `tests/schemas.test.js` fails until `node scripts/schemas.js` has run.
- `tests/decisions.test.js` checks the decision records, and the index `node scripts/decisions.js` writes.
- `tests/deprecations.test.js` checks that every `PK-DEP-NNNN` in `packages/*/src` is in the register.
- `tests/llms-sections.test.js` checks that every docs page is in one `llmstxt` section.
- `tests/growth.test.js` checks how `scripts/growth.js` reads ESLint, knip and the docs, and its baseline's format.
- `tests/docs-lists.test.js` checks that every list in the docs starts after a blank line.
- `tests/compatibility.test.js` checks the lowest versions in `docs/compatibility.md` against `package.json`,
  `docs/browser-support.md` and the CI matrix.
- `tests/learn.test.js` checks every number `docs/learn.md` states against the playground's data.
- `tests/docs-facts.test.js` checks where `assertStates` finds a fact in Markdown, and what does not count.
- `tests/view-file-schema.test.js` checks the view-file JSON Schemas against pivotkit-core's writer.
- `tests/npm-pack.test.js` checks how `scripts/npm-pack.js` reads the output of `npm pack`.
- `tests/reader-plugin.test.js` checks the docs' example reader plugin against pivotkit-core's contract.
- `tests/serve.test.js` checks the playground's static server. `tests/playground-server.js` starts it for tests and the docs scripts.
- `tests/playground-help.test.js` checks that each topic of the playground's help links to a docs page and heading that exist.
- `tests/screenshots.test.js` and `tests/docs-clips.test.js` check how the docs show screenshots and clips.
- `tests/encode-callers.test.js` checks that every call of pivotkit-core's `encode()` in a package names what bounds its data.
- `tests/audit-signatures.test.js` checks when `scripts/audit-signatures.js` tries the registry signature check again.
- `tests/until.test.js` checks `until()` from `tests/until.js`.
- `tests/check-pack.test.js`, `tests/docs-demo.test.js` and `tests/check-readme-links.test.js` check the parts of those scripts that decide what they check or copy.
