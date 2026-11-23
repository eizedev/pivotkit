# pivotkit-cli

The command line `pivotkit`. Node only. The root [AGENTS.md](../../AGENTS.md) applies too.

## Commands

```bash
npm test -w pivotkit-cli      # spawns the CLI as a user runs it; CI runs it on Windows and macOS too
npm run build -w pivotkit-cli # the gzipped example data
npx pivotkit-cli render view.json --data data.csv -o out.html
```

## Contract

- Exit codes: 0 done, 1 findings, 2 usage, file, limit or template error, 3 the sign-in has ended (`token`, `logout`).
- `--json` writes one object on stdout.
- The contract is documented in `docs/reference/cli.md`. Keep both in step.

## Commands table

- `src/commands.js` is the one table of commands and options.
- The parser, the help and the shell completions are all made from it.
- Each option's `where` says if it acts locally, remotely or both.

## Layouts and views

- `validate`, `describe` and `render` run pivotkit-report's operations.
- A layout becomes a view only through pivotkit-report's `viewOfLayout`.
- In the layout flags (`--rows`, `--cols`, `--values` and so on) one value names one thing.
- So field names may hold commas and colons (`src/layout-flags.js`).
- `--filter` is `Field=Item` or JSON. Short forms of one field merge into one filter (`filtersOf`).
- A view file's `source.fields` decide a column's type only when every value fits.

## Files

- Read and write every file through `pivotkit-node/files`. Its rules: [pivotkit-node](../pivotkit-node/AGENTS.md).
- `pivotkit-cli/files` and `pivotkit-cli/rest` re-export pivotkit-node's names. Add none of their own.
- Nothing in this repository imports them, or `src/files.js` and `src/rest-contract.js`. ESLint refuses it (`eslint.config.js`).
- `pivotkit example` never writes over an existing file.

## Errors

- Errors are `CliError` of pivotkit-node, or `RemoteError` (`src/errors.js`).

## Remote mode

`src/remote.js` is the client of pivotkit-server's REST service.

- https, or plain http only to loopback.
- Read the token from `--token-file` or `PIVOTKIT_TOKEN` for every request.
- No redirects. A time limit and size caps on every answer. Check the answer's type.
- Loopback goes through `node:http` with its own agent, so no proxy applies.
- Never show a fetch error's message. Wrap it as `RemoteError`.
- The REST contract is `pivotkit-node/rest`, shared with pivotkit-server. Change it there.

## Sign-in

- `src/sign-in.js` holds `login`, `token` and `logout`: the OAuth device code flow at the server's issuer.
- It follows remote mode's request rules. An issuer's error is named by its OAuth code only.
- `src/credential-store.js` keeps the refresh token: the system's keychain tool, else a 0600 file.
- A secret reaches a keychain tool on stdin only, never as an argument.
- Tests replace the tools through `storeMeans` and the waits through `signInMeans`.
- Tests never touch the real keychain: spawned runs use `--store file`.
- `token` refreshes under a lock file (`locked`). It reads the refresh token again inside the lock.
- The lock holds a random id and a heartbeat. A stale lock is renamed aside before it is taken over.
- An error that needs `pivotkit login` again carries `exitCode: 3` (`SIGN_IN_AGAIN`).

## Examples

- `examples/` holds the files `pivotkit example` writes.
- The view files and `examples.json` are committed. The data is gzipped build output.
- `node scripts/examples.js` writes them. `tests/examples.test.js` fails until you run it.
- `test/examples.test.js` runs every shipped example through validate and render.

## Tests

- `test/` spawns the CLI as a user runs it.
- `test/remote.test.js` runs remote mode against a fake server and a fake proxy on loopback.
- `test/sign-in/` runs login, token and logout against the fake server and issuer of `test/sign-in/fake-issuer.js`.
