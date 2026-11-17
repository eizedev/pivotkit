# pivotkit-server

The REST service and the core it shares with pivotkit-mcp. Node only, no MCP SDK.
The root [AGENTS.md](../../AGENTS.md) applies too. Read `docs/privacy.md` before touching policy.

## Commands

```bash
npm test -w pivotkit-server    # the service over HTTP: hostile inputs, tokens, OAuth, profiles
npx pivotkit-server serve --source sales=data.csv --output out   # http://127.0.0.1:3333
node scripts/openapi.js        # write docs/openapi.json after a route or operation change
```

## Options

- `OPTION_KEYS` in `src/config.js` is the one table of options for REST and MCP.
- It is composed from the fragments in `src/options/`, one file per feature.
- A new option is a key in its feature's fragment. Never in two places.
- `composeSlots` refuses a key declared twice.
- Secrets are `{ env }` or `{ file }` references. `readSecret` reads them on every use.
- `secretFileWarning` in `src/secrets.js` is check-config's warning for a secret's file.
- Never log a secret.

## Secrets and credential commands

- `readSecretFile` in `src/secrets.js` is the one read of a secret's file, static tokens too.
- `readSecretHandle` is its read of an open file. A kept secret (`secret-file.js`) reads through it.
- `secretValue` is the one normaliser: a token trimmed, a key without one line ending.
- It reads a regular file only, at most `MAX_SECRET_BYTES`. It names UTF-16 text with `UTF16_TEXT`.
- `src/credentials.js` holds `token new`, `token show` and `key new`. The runner loads it only for them.
- `src/token-admin.js` holds `token issue|list|revoke|remove` and `key new|remove --for signing`.
- `plannedOf` in `credentials.js` resolves the configuration and state for every token command.
- `--add` puts the token into `auth.tokens`, checked by `validateOptions`, with a backup.
- `--add` reads the configuration again right before it replaces it. It holds no lock.
- `--add` with `--if-missing` is done when the same entry is there. It writes nothing then.
- `--json` follows pivotkit-cli's contract. `configuredToken` is the one lookup of `token show`.
- The messages name the commands through `MAKE_TOKEN` and `makeKey` in `auth.js`.
- `src/secret-rules.js` has `tokenProblem` and `keyProblem`: whether the server can use a value.
- `tokenGuessable` in `auth.js` refuses a token with few different characters or one piece repeated.
- `newSecret` draws again until its `usable` check passes.
- Code that creates a missing secret uses `placeSecret` in `src/secret-file.js`.
- It writes with mode 0600 through a temporary file and `link()`. It never replaces a file without `replace`.
- `keep` reads the file that is there. It reads an empty one again for about a second:
  without hard links, another process creates the file in place. `untilFilled` is that wait.
- A kept file loses only its world bits. A kept symbolic link is only read through, never written.
- Otherwise it refuses a symbolic link, a directory or a missing directory.
- A replaced file keeps its owner, group and group read bit where it may, else a warning.
- EBUSY of a mounted file is `MOUNTED`. On SIGINT and SIGTERM it removes the temporary file.
- `replaceFile` and `writeBackup` write a configuration file.
- `secretFileMeans` lets tests replace `link()`, `rename()` and the user.

## State directory and first start

- `src/state.js` owns the state directory, `--state-dir` or `$PIVOTKIT_STATE_DIR`.
- Its defaults: auth.mode token off loopback, the token `admin` and the download and audit keys.
  They are file references with `create: true` in `<state>/secrets/`.
- `planState` is the one rule for these defaults. The start, check-config and `token show` share it.
- The `credentials` section of check-config (`check/credentials.js`) reports them.
- `prepareHttpServe` makes what is missing with `placeSecret` and returns the log's lines.
  `serve()` and pivotkit-mcp's `listen()` call it before they refuse an open address.
- A token it cannot make stops the start. It never falls back to no auth.
- `configFrom` finds the configuration file for `optionsFrom` and `token show`.
  Where `/config` is empty, it uses the image's `builtInConfig`.
- `stateMeans` lets tests replace the container and mount facts.

## Check-config

- `src/check/` has one section per concern. `check/index.js` lists them in `SECTIONS`.
- A PROBLEM that stops the start must also be refused by `createContext` or `serve`.
- `test/check-config.test.js` runs both.
- Output wraps at 78 columns. Tests read wrapped text through `factsOf` in `test/helpers.js`.

## Requests to other servers

- `guardedFetch` in `src/sources/fetch.js` is the one way the server requests another server.
- It allows https only and no redirects. It checks the address on the connection's own lookup.
- It counts bodies after decompression and has one time limit.
- HTTP sources, uploads and the OAuth issuer all go through it.
- Private addresses need the operator's `intranet` setting.
- A source's URL template keeps its origin and shape (`sources/template.js`).
- HTTP sources page only on the same host and path. JSON nesting is capped at `MAX_DEPTH`.
- Upload links are checked against the operator's `linkOrigins`.

## Sign-in and identity

- `src/signed-tokens.js` issues and verifies signed tokens. `createSignedVerifier` takes its keys from a function.
- A bearer goes through the static tokens first. Only an unmatched JWT reaches the signed check.
- A signed token's identity is `["signed", id]`. Its ID is the client in the log.
- `profileOf` in `src/auth.js` is the one order of a caller's profile.
- `identityKey` is the only identity a cache or binding uses. It is null without a usable subject.
- A caller's access token leaves `auth.js` only through `exchangeTokenFor`.
- Only `src/sources/auth.js` may import it. An ESLint rule enforces this.
- Sources that only a signed-in person sees are never schedulable.
- A code source gets the caller only as the frozen `callerView`.
- Rate limits count per person (`limitKeyOf`), one set per front end.

## Scopes

- `offeredScopes` lists the scopes in the metadata. It never offers a `scopeProfiles` scope.
- The 401 challenge names the required scopes only.

## Policy and privacy

- Levels are `show`, `values`, `summary` and `hide` (`POLICY_LEVELS`), in order of strictness.
- `stats.js` counts per field. It never keeps a value.
- A source the caller may not use gets the same answer as a missing one: not found.
- Below `show`, a text file with a quoted value over several lines is refused (`checkedRead`).
- REST callers never get `file:` paths (`files: false` in the registry).
- Delivery decides a report's link before the file is written (`linkFor` in `delivery.js`).
- `isClosedForDelivery` is the one rule for which reports get only bound links. `closedReason` says why.

### Caches, inline data and memory

- Cache keys hold a caller's values, groups and claims only as a keyed digest (`sources/keys.js`).
- Inline data (`inline:`) is never kept, linked or scheduled.
- `test/memory.test.js` proves no kept data holds a hidden column.
- Its hooks exist only for a context made with `COMPUTE_HOOKS`. Never make that a setting.

## Logs

- One line per event, JSON or logfmt.
- `callerFields` is the allowlist of caller fields a log line may hold.
- The subject appears only where `audit.subject` asks, as a keyed hash or the claim's text.
- Every error answer gets a log line. `logUnanswered` writes a `refused` line if none was written.
- Every answer carries `X-Request-Id`.

## Sources and memory

- `src/sources/` holds one module per kind of source. `runResolved` is the one way to run one.
- Loads have time limits, coalescing and per-source and per-identity limits (`sources/run.js`).
- `test/code-sources.test.js` waits for the load runner's events (`LOAD_HOOKS`), never for a fixed time.
- Last good data is served only after a transient failure.
- The process cache and kept data sets are bounded in entries and bytes.
- A kept data set copies its texts first. A reader's slices would keep the whole file alive.
- Every read ends with `forgetLastSubject`. V8 keeps the last regular expression's subject.
- Workers have memory and time limits.
- `test/compute.test.js` covers the pool's failure paths with a worker of its own (`fixtures/probe-worker.js`).

## HTTP edge

- `serveFetch` in `listen.js` checks headers before the body is read.
- Connections are bounded in all and per address. Slots stay free for loopback (`connectionGate`).
- A stranger's body cap is `BODY_BYTES`. A signed-in caller's cap is at most `MAX_BODY_BYTES`.
- A refused Host is answered and logged with `HOST_HINT` (`hostProblem`, `hostRefusedLine`).

## Untrusted documents

- `source-from-openapi` reads an operator's OpenAPI document as hostile input.
- The server never imports `openapi-source.js`. Only the runner's command does.
- Its `TODO` values are refused at start (`todoPaths` in `options/base.js`).
- Read a print template only through `readTemplateFile` in `print-template.js`.

## REST

- `src/rest/` is `pivotkit-server/rest`.
- `REST_ROUTES` in `routes.js` has one route per operation of pivotkit-report's table.
- A new operation gets its words and an example in `routes.js`.
- Then run `node scripts/openapi.js`. `test/openapi.test.js` fails until you do.
- Errors are RFC 9457 problems (`rest/problem.js`).
- The REST contract shared with the CLI lives in `pivotkit-cli/rest`. Change it there.

## Serving and releases

- `serve` runs REST and, when pivotkit-mcp is installed, MCP on one port.
- pivotkit-mcp is imported by name, not as a dependency.
- A pivotkit-mcp that needs exports this version lacks is refused with both versions.
- So is one whose declared `pivotkit-server` range does not hold this version (`version-range.js`).
- `stopOnSignals` in `src/stop.js` ends both runners on SIGINT and SIGTERM.
- Release pivotkit-server before pivotkit-mcp, see [RELEASING.md](../../RELEASING.md).

## Tests

- `test/` drives the service over HTTP.
- `test/conformance.test.js` checks that MCP and REST answer alike.
- `test/cli-remote.test.js` runs the CLI against the service.
- Use the `tempDir` of `test/helpers.js` for files on disk.
