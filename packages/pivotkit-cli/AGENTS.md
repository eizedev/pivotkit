# pivotkit-cli

The command line `pivotkit`. Node only. The root [AGENTS.md](../../AGENTS.md) applies too.

## Commands

```bash
npm test -w pivotkit-cli      # spawns the CLI as a user runs it; CI runs it on Windows too
npm run build -w pivotkit-cli # the gzipped example data
npx pivotkit-cli render view.json --data data.csv -o out.html
```

## Contract

- Exit codes: 0 done, 1 findings, 2 usage, file, limit or template error.
- `--json` writes one object on stdout.
- The contract is documented in `docs/reference/cli.md`. Keep both in step.
- `src/commands.js` is the one table of commands and options.
- The parser, the help and the shell completions are all made from it.
- Each option's `where` says if it acts locally, remotely or both.
- `validate`, `describe` and `render` run pivotkit-report's operations.
- A layout becomes a view only through pivotkit-report's `viewOfLayout`.
- A view file's `source.fields` decide a column's type only when every value fits.

## Files

Use `src/safe-files.js` for every file the CLI reads or writes.

- Read a regular file once, with its size checked first.
- `hardLinks: false` refuses a file with a second name.
- Write through a temporary file. `exclusive` and `writeNew` never replace a file.
- `--allow-dir` compares real paths.
- `pivotkit-cli/files` exports these and `readTable` for pivotkit-mcp.
- `pivotkit example` never writes over an existing file.

## Errors

- Errors are `CliError` with a kind, or `RemoteError`.
- A message holds no file content beyond field names and one cell value cut at 20 characters.
- Clean names with `printable` before printing them.

## Remote mode

`src/remote.js` is the client of pivotkit-server's REST service.

- https, or plain http only to loopback.
- Read the token from `--token-file` or `PIVOTKIT_TOKEN` for every request.
- No redirects. A time limit and size caps on every answer. Check the answer's type.
- Loopback goes through `node:http` with its own agent, so no proxy applies.
- Never show a fetch error's message. Wrap it as `RemoteError`.
- `src/rest-contract.js` (`pivotkit-cli/rest`) is the one copy of the REST contract.
- pivotkit-server re-exports it. Change it here.

## Examples

- `examples/` holds the files `pivotkit example` writes.
- The view files and `examples.json` are committed. The data is gzipped build output.
- `node scripts/examples.js` writes them. `tests/examples.test.js` fails until you run it.
- `test/examples.test.js` runs every shipped example through validate and render.

## Tests

- `test/` spawns the CLI as a user runs it.
- `test/remote.test.js` runs remote mode against a fake server and a fake proxy on loopback.
