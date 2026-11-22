# pivotkit-node

What pivotkit-cli and pivotkit-server share in Node: reading and writing files for a caller, the
REST contract, and how a network answer is read. Node only. The root [AGENTS.md](../../AGENTS.md) applies too.

## Commands

```bash
npm test -w pivotkit-node    # the file handling in one process; CI runs it on Windows and macOS too
```

## Layering

- pivotkit-cli and pivotkit-server depend on this package. It depends on neither.
- `pivotkit-cli/files` and `pivotkit-cli/rest` re-export its names. They stay for compatibility.
- Its exports are internal. Add a name only when a second package needs it.

## Files

Use `src/safe-files.js` for every file a front end reads or writes.

- Read a regular file once, with its size checked first.
- `hardLinks: false` refuses a file with a second name.
- Write through a temporary file. `exclusive` and `writeNew` never replace a file.
- `--allow-dir` compares real paths.
- `pivotkit-node/files` exports these and `readTable`.

## Errors

- Errors are `CliError` with a kind. `src/errors.js` defines it.
- A message holds no file content beyond field names and one cell value cut at 20 characters.
- Clean names with `printable` before printing them.

## Network

- `src/net.js` (`pivotkit-node/net`) is the one copy of `ipBytes`, `isLoopback`, `retryAfterSeconds`
  and `networkCodeOf`. The front ends keep their own error classes, words and caps.
- `isLoopback(host)` reads a host as written. `{ anyForm: true }` reads an address a lookup or a
  socket gave: every spelling, IPv4-mapped too. `test/net.test.js` pins both.
- A front end that needs another result passes an option. It never keeps a copy of its own.

## REST contract

- `src/rest.js` is the one copy of what the REST service and its client agree on.
- Its entry is `pivotkit-node/rest`.
- pivotkit-server and pivotkit-cli/rest re-export it.
- ESLint refuses an import of pivotkit-cli or pivotkit-server here, and of pivotkit-cli in pivotkit-server.
