# pivotkit-report

A view over rows as a file, without a browser, in Node and the browser.
It also holds the operations table the CLI, REST service and MCP server share.
The root [AGENTS.md](../../AGENTS.md) applies too.

## Commands

```bash
npm test -w pivotkit-report
PIVOTKIT_UPDATE_GOLDEN=1 npm test -w pivotkit-report   # rebuild golden files; review the diff
npx playwright test tests/browser/report-               # after a stylesheet or token change
```

## Rendering

- `render()` normalizes the view with `outsideLimits` unless the caller passes `trusted`.
- The HTML table never writes a `style` attribute. Colours are class rules.
- The table is cut at `tableCells`.

## Print templates

- A print template placeholder is allowed only in text and allowed attributes.
- Anything else is `INVALID_TEMPLATE`.
- The SVG comes from ECharts' server-side renderer. The ECharts module is passed in.
- `cleanSvg` checks and cleans it. ECharts is an optional peer dependency.
- The peer range takes any ECharts 6, but the tests run only the exact devDependency.
  `test/svg.test.js` matches its exact SVG output.
- `template-style.js` loads only for a host's own template. It imports nothing.
- The default template carries a strict CSP (`REPORT_CSP` in `default-template.js`). Keep it strict.

## Tokens and contrast

- `src/tokens.js` is a kept copy of pivotkit-react's `styles.css` values.
- `test/tokens.test.js` compares them, and `DEFAULT_THEME` with them.
- `test/contrast.test.js` holds both themes to WCAG AA.
- A host's dark colours go over the dark ones as `darkTokens`, on a dark screen only.
- The dark screen rules follow the system unless the root pins `data-pk-theme`.
- Paper is always light.

## Golden files

- `test/golden/` holds CSV, JSON and HTML. They are `-text` in `.gitattributes`.
- The SVG is checked by its structure. The XLSX is checked by reading it back.

## Operations

`src/operations.js` (`pivotkit-report/operations`) is the one table of operations: `OPERATIONS`.
Its pieces are in `src/operations/`: errors, findings, schemas, layouts, the view guide and
`checkInput`. `operations.js` re-exports their public names.

- Operations have no file system and no network. A front end passes them in `env`.
- A front end puts a returned `file` where it belongs.
- `viewOfLayout` is the one way the operations and the CLI turn a layout into a view.

A new operation needs:

1. An entry in `OPERATIONS`, with words, input and output JSON Schema, `http` route and `run`.
2. Tests in `test/operations.test.js`.
3. Its words and example in pivotkit-server's `src/rest/routes.js`.
4. `node scripts/openapi.js` to write `docs/openapi.json` again.
5. A CLI command in pivotkit-cli's `commands.js`, if the CLI offers it.

The MCP tool comes from the table by itself. See [pivotkit-mcp](../pivotkit-mcp/AGENTS.md).
