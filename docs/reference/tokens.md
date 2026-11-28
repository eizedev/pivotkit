---
title: Tokens and keys
description: The secrets pivotkit-server makes and reads - token new and key new, tokens that expire, signed tokens the server issues, short-lived tokens from another system such as PowerShell Universal, listing, revoking and removing tokens, and the token and keys the server makes at its first start.
---

# Tokens and keys

This page is for the people who run pivotkit-server. It covers the tokens and keys the server makes
and checks itself. Sign-in with an identity provider is in
[Sign-in and identity providers](sign-in.md).

## Make a token or a key { #credentials }

`pivotkit-server` makes the secrets the server needs, so you need no other tool. A token is 32
random bytes and a key 48, both in base64url (letters, digits, `-` and `_`).

=== "bash"

    ```bash
    # a token in a file only you can read, added to auth.tokens of pivotkit.json (a backup pivotkit.json.bak first)
    npx -y pivotkit-server token new --file secrets/reports.token --config pivotkit.json --add --name reports
    # the key of the download links
    npx -y pivotkit-server key new --for downloads --file secrets/download.key
    # a token on stdout, for a variable
    export SCRIPTS_TOKEN="$(npx -y pivotkit-server token new)"
    ```

=== "PowerShell"

    ```powershell
    npx -y pivotkit-server token new --file secrets/reports.token --config pivotkit.json --add --name reports
    npx -y pivotkit-server key new --for downloads --file secrets/download.key
    $env:SCRIPTS_TOKEN = npx -y pivotkit-server token new
    ```

    Let the command write the file (`--file`): PowerShell 5.1's `>` writes UTF-16, which the server
    cannot read as a token.

| Option | What it does |
| --- | --- |
| `--file <path>` | Write the value to this file: one line ending in LF, mode 0600, never through a symbolic link, never into a directory that is not there. The value is not printed (`--print` prints it too) |
| `--if-missing` | Keep a file that is there and exit 0, if the server can use its value. Otherwise exit 1. [Below](#credentials-if-missing) |
| `--force` | Replace a file that is there, atomically. [Below](#credentials-force) |
| `--config <file>` | `token new`: check `--profile` against `policy.profiles`, refuse a file inside `output.dir`, and use `http.publicUrl` in the hints. `token new` and `key new` read no configuration without it, not even `$PIVOTKIT_CONFIG`. `token show` reads `$PIVOTKIT_CONFIG` by default |
| `--state-dir <dir>` | `token show`: the server's [state directory](#first-start) (default `$PIVOTKIT_STATE_DIR`). With it, `token show admin` prints the token the server made at its first start, without a configuration. Before that start, it exits 1 (`NOT_CREATED`) and makes nothing. `token show token` prints `$PIVOTKIT_TOKEN` where the server uses it, or `$PIVOTKIT_MCP_TOKEN` where only that one is set (pivotkit-mcp, `pivotkit-server mcp`) |
| `--add` | `token new`: add the token to `auth.tokens` of `--config`. `key new`: name the key as `output.downloads.key`, `audit.key` or `rest.browser.key`. Both need `--file`. [Below](#credentials-add) |
| `--name`, `--profile`, `--scope` | The token's name (default: the file's name without extension), its [profile](rest.md#profiles) and its scopes (`--scope` once per scope) |
| `--expires <when>` | `token new`: when the token stops working, written as `auth.tokens[].expires`. A date (`2027-01-31` means 00:00 UTC that day), a date-time with a zone (`2027-01-31T08:00:00Z`), or a time from now (`90d`, `12h`, `30m`). [Expiry](#token-expires) |
| `--for downloads\|audit\|browser` | `key new`: the key of the [download links](delivery.md) (`output.downloads.key`, at least 32 bytes), of the [audit](mcp.md#logging) hash (`audit.key`) or of the [browser tokens](records.md#records-browser) (`rest.browser.key`, at least 32 bytes) |
| `--json` | One object on stdout, as [pivotkit's](cli.md): `{ "ok", "exitCode", "command", "name", "file", "created", "replaced", "config", "configured", "backup", "token" or "key", "warnings", "error": { "kind", "code", "message" } }`. It holds the value only where it would be printed |

### What `--if-missing` does { #credentials-if-missing }

- It reads the file and checks the value by the server's rules. A value it cannot use is exit 1.
- A file of yours that everyone may read loses those bits. It says so.
- A file a group may read keeps that bit, since a group may share it on purpose. It warns you.
- A file of another user than you or root is kept too, with a warning.
- A symbolic link, such as a mounted Kubernetes Secret, is only read through. Nothing behind it is
  changed, and `--print` is refused there. `token show` prints a configured token.
- Several runs at once end with one value.

### What `--force` does { #credentials-force }

- It writes the new value to a temporary file and renames it over the old one. A reader never sees
  half a value.
- It keeps the old file's owner and group where it may. As root it keeps both. As another user it
  keeps the group when you are in it, and the owner is yours.
- With the old group kept, the group's read bit stays. A write bit never does, nor any bit for
  everyone else.
- It warns you of an owner, group or read bit it could not keep. Then check that the server's user
  can still read the file.
- Clients that still send the old token get 401 from then on. The server reads a token's file on
  every request and the download key within a second, so neither needs a restart.
- A file mounted on its own (a bind mount of one file, a Kubernetes `subPath`) cannot be replaced
  (`MOUNTED`). Change it where it comes from.

### What `--add` does { #credentials-add }

- It writes `{ "name", "file", "scopes", "profile" }` into `auth.tokens`, or `{ "file" }` as the key.
  The file's path is relative to the configuration when the file lies below it.
- It checks the new configuration first. A name that is there, a key that is set, an unknown
  profile, `auth.mode` `none` or `oauth` stop it before anything is written.
- It sets `auth.mode` to `token` when the file has none, and says so.
- Once `auth.tokens` lists a token, `$PIVOTKIT_TOKEN` is no longer read. The first `--add` warns
  you.
- With `--if-missing`, an entry with the same name, file, scopes and profile counts as done: the
  run exits 0 and writes nothing.
- It keeps the old configuration byte for byte as `<file>.bak-<UTC time>`, one per run, readable by
  you only. Remove old backups when you
  no longer need them.
- It writes the configuration again as pretty-printed JSON. The indentation and the file's mode
  stay. A compact one-line object is spread over lines.
- It reads the configuration, writes the secret's file, then replaces the configuration. Right
  before the replace it reads the configuration again. If someone changed it in between, it does
  not replace it and says so. Run it again with `--if-missing`. This is a best effort, not a lock:
  an edit saved in the moment between that last read and the rename is lost. Do not run `--add`
  while someone edits the file.
- The new configuration keeps the old one's owner and group where it may, as `--force` does. Where
  it cannot (you are not root and not in its group), it is yours and readable by you only, and a
  warning says so: check that the server's user can still read it.
- It refuses a configuration that is a symbolic link (a mounted ConfigMap) or in a folder it
  cannot write.
- Restart the server afterwards: it reads the list of tokens and the audit key at start.

Without `--file`, the value is the only line on stdout. On a terminal, the commands write on stderr
what to add to the configuration and how to try the token with curl, PowerShell and
`claude mcp add --header`.

The exit codes:

- 0 when done.
- 1 for a file that is there, missing or not usable (`EXISTS`, `NOT_REGULAR_FILE`, `NO_DIRECTORY`,
  `READ_ONLY`, `MOUNTED`, `UNUSABLE`).
- 2 for a usage or configuration error.

No message holds a value. These commands, `check-config` and the start say so when a file is in
UTF-16, which is what PowerShell 5.1's `>` writes. They refuse a key file that starts with a UTF-8
byte order mark: the mark would become part of the key. A token file's mark is trimmed with the
spaces around the token. They also say so when a token or key file is not a regular file or is
longer than 4096 bytes. They never wait for such a file. When you stop the
command (Ctrl+C) during a write, it removes its temporary file.

On Windows, the mode does not apply: the file takes the permissions of its folder. To keep the file
to your account, run in PowerShell:
`icacls secrets\reports.token /inheritance:r /grant:r "${env:USERNAME}:F"`. This gives full control
to you alone, so `--force` can still replace the file. `/inheritance:r` also takes away SYSTEM and
Administrators. A server that runs as a service then needs its own grant (`/grant "<account>:R"`).

### When a static token expires { #token-expires }

`auth.tokens[].expires` ends a static token at a date. Add it by hand, or with `token new --expires`.

```json
{ "name": "contractor", "file": "secrets/contractor.token", "expires": "2027-01-31" }
```

- A date alone means 00:00 UTC of that day. A date-time needs a zone (`Z` or `+01:00`).
- From then on, a request with the token gets 401 "this token expired".
- The start logs a warning for a token that has expired.
- `check-config` warns a week ahead, and again once the token has expired.
- The server reads the list of tokens at start. A new `expires` needs a restart.

## Signed tokens { #signed-tokens }

The server can issue tokens that expire on their own. You need no sign-in provider for them.

```bash
pivotkit-server token issue --expires 8h --name laptop --profile staff
docker exec pivotkit pivotkit-server token issue --expires 7d --scope pivotkit:sales
```

The token is printed once, on stdout. It works on REST and MCP at once, without a restart. Only
after you set or change `auth.signedTokens` does the server need a restart, since it reads `auth` at
start.

- It is a JWT signed with Ed25519 (`EdDSA`), of the type `pivotkit+jwt`. Clients send it like any
  bearer token.
- The default lifetime is one hour. `--expires` takes `15m`, `8h`, `7d` or a date.
- `auth.signedTokens.maxDays` caps the lifetime (default 30, at most 365). The server refuses a token
  that lives longer, even with a valid signature.
- `--profile` and `--scope` work as for static tokens. Without `--scope`, it holds every scope.
- A token whose profile is no longer in `policy.profiles` gets 401.
- The log names the token by its ID, never by its value or its name. Rate limits count per token.
- Clocks may differ by `auth.clockTolerance` seconds (default 30), at both ends of the lifetime.
- Signed tokens work with `auth.mode` `"token"` only. A static token is still needed, as for
  `token new`. With a state directory and no `auth.mode` written, the server makes `admin`
  ([first start](#first-start)).
- `--scope` takes one word per scope, without spaces. A token over 2048 characters is refused at
  issue, since the server would not take it: give fewer or shorter scopes.

The files live in `auth.signedTokens.dir`. With a [state directory](#first-start), the default is
`<state>/secrets/signed`. Without either, `token issue` says what to set. The first `token issue`
makes the directory:

| What | Where |
| --- | --- |
| The signing keys, one line each, mode 0600 | `keys/<key id>.key` |
| One record per token: ID, name, key, profile, scopes, issued and expiry. No value | `issued/<id>.json` |
| The deny list, one entry per revoked token | `revoked/<id>.json` |

Keep this directory on a volume, like the other secrets. Never copy it to another server. Every
server signs with the same issuer and no audience, so servers with the same keys take each other's
tokens. Run `pivotkit-server key new --for signing` on each server instead.

The server uses a key file only when it is a file of its own, has mode 0600 and belongs to the user
the server runs as. A planted key therefore never signs. On Windows, mode and owner are not checked.

!!! warning "A key file with a wider mode is skipped"

    A restore with another umask, or some bind mounts, can leave a key file with mode 0640 or 0644.
    The server then skips the key, and every token it signed gets 401. The log and `check-config`
    name the file and the fix: `chmod 600 <file>`. `token list` shows its tokens as `key unusable`.
    A key that should not be there goes with `pivotkit-server key remove <key id> --for signing`.

 `token issue` removes records and entries of
tokens that expired, at most once an hour. `check-config` prints the keys and counts the active and revoked tokens under
`Signed tokens`, once the directory is there.

| Key | Default | What it is |
| --- | --- | --- |
| `auth.signedTokens.dir` | `<state>/secrets/signed` | Where the keys, records and the deny list live. Not inside `output.dir` |
| `auth.signedTokens.maxDays` | 30 | The longest lifetime of a signed token, in days (1 to 365) |

### Rotating the signing key { #signed-keys }

Every key in `keys/` verifies tokens. The newest key signs new ones. So a new key breaks no client:

1. Run `pivotkit-server key new --for signing`. It prints the new key's ID, never the key.
2. New tokens are signed with it. Tokens of the older key keep working.
3. Once those have expired, run `pivotkit-server key remove <old key id> --for signing`.

`token list` shows a token of a removed key as `key removed`, and one of a skipped key file as
`key unusable`. Both get 401.

`key remove` exits 1 while tokens of that key still work, and names when the last one expires.
`--force` removes it anyway, and those tokens get 401 from the next request on. A key file is never
printed, and `key new --for signing` refuses `--file`, `--print` and `--add`.

## Tokens from another system { #external-issuers }

Another system can issue short-lived tokens for the person signed in there. PowerShell Universal is
one example. The server checks them with that system's public key. It never holds a key that could
make such a token.

The other system is a sign-in provider, not an operator. Its tokens never get more than you allow
it: the scopes and profiles of its entry.

```json
{
  "policy": { "profiles": { "staff": { "default": "show" } } },
  "auth": {
    "mode": "token",
    "tokens": [{ "name": "ops", "file": "/run/secrets/ops" }],
    "externalIssuers": [{
      "issuer": "psu",
      "typ": "psu+jwt",
      "maxMinutes": 15,
      "scopes": ["pivotkit:read"],
      "profiles": ["staff"],
      "profile": "staff",
      "keys": [{ "kid": "psu-2026-11", "publicKey": { "file": "keys/psu.pub" } }]
    }]
  }
}
```

The issuer's tokens work with `auth.mode` `"token"` only. That mode needs a token of the server's own
too: one in `auth.tokens`, as `ops` here, or `$PIVOTKIT_TOKEN`. Each profile the entry names must be
in `policy.profiles`. Without `auth.mode` written, the server runs without auth on loopback and
never checks the issuer's tokens. The start and `check-config` then warn. Off loopback, a state
directory makes the mode `"token"`.

What a token gets:

- **Scopes**: the token's `scope`, cut to the entry's `scopes`. A token without `scope` gets exactly
  `scopes`, never every scope. `scopes` is required. An empty list gives no scope.
- **Profile**: a token may name a profile of the entry's `profiles`. Any other gets 401. Without
  `profiles`, a token may name none.
- A token without `profile` gets the entry's `profile`, else `auth.defaultProfile`. One of the two
  must be set, or the server does not start. The sources' own policy never applies to these tokens.
- `check-config` warns when that default is not in the entry's `profiles`. A token without
  `profile` then gets it, but a token that names it gets 401.

The keys:

- The key is an Ed25519 public key in PEM (`-----BEGIN PUBLIC KEY-----`), from a file or a variable.
  A private key, an encrypted one, another kind of key or a file the server cannot read stops the
  start.
- The server reads the keys at start. A new key takes a restart.
- One or two keys per issuer. Add the new key next to the old one, restart, and remove the old one
  once its tokens have expired.

The rest:

- `issuer` and `typ` belong to that system alone. The server refuses its own `pivotkit-server` and
  `pivotkit+jwt`. It also refuses an `issuer` that names a token in `auth.tokens`, since the log
  names both the same way.
- `maxMinutes` caps a token's lifetime (default 60, at most 1440). A token that lives longer gets
  401, even with a valid signature.
- There is no deny list. A token works until it expires.
- The tokens work on REST and MCP alike.
- At most 8 issuers.

!!! warning "What a leak costs"

    - A leaked token works until its `exp`, at most `maxMinutes`. Nothing revokes it earlier.
    - It carries no audience. Every pivotkit-server that trusts the same key accepts it.
    - A stolen private key of the issuer makes tokens for any person, within the entry's `scopes`
      and `profiles`.

    Keep `maxMinutes` low, for example 15. Give the entry only the scopes and profiles that system
    needs. [Decision record 0014](../decisions/0014-external-token-issuers.md) has the reasons.

A token the server takes is at most 2048 characters long:

| Part | Holds |
| --- | --- |
| header `alg` | `EdDSA` |
| header `kid` | the ID of one of the issuer's keys |
| header `typ` | the issuer's `typ` |
| `iss` | the issuer's `issuer` |
| `sub` | the person: 1 to 256 characters, no spaces, no control, format, surrogate, private-use or unassigned characters. Without it, 401. Compared in Unicode NFC |
| `jti` | the token's ID: letters, digits, `.`, `_` and `-`, at most 128 |
| `iat`, `exp` | when the issuer made it and when it expires, in seconds since 1970 |
| `nbf` | optional: not before this time |
| `profile` | optional: one of the entry's `profiles` |
| `scope` | optional: scopes separated by spaces, cut to the entry's `scopes` |

- The log names the issuer as the client. It names the person only as `audit.subject` says, as for
  OAuth ([logging](rest.md#logging)).
- A refused token gets an `info` line with the issuer and the reason, at most once a minute per
  reason. The line never holds the token.
- Each person is an identity of their own for caches and limits: the issuer and `sub` together.
- A link or upload bound to a sign-in (`signIn`) never goes to such a person. They signed in
  elsewhere, so the server's own sign-in cannot check them.
- `check-config` lists each issuer under `External token issuers`: its type, keys, lifetime,
  scopes, profiles and the profile without one. A key it cannot use is a PROBLEM.

| Key | Default | What it is |
| --- | --- | --- |
| `auth.externalIssuers[].issuer` | - | The other system's name, as its tokens carry it in `iss` |
| `auth.externalIssuers[].typ` | - | The type its tokens carry in their header, such as `psu+jwt` |
| `auth.externalIssuers[].keys` | - | One or two keys: `kid` and `publicKey` (`{ "file" }` or `{ "env" }`) |
| `auth.externalIssuers[].scopes` | - | Required. The scopes its tokens may get |
| `auth.externalIssuers[].profiles` | none | The profiles its tokens may name |
| `auth.externalIssuers[].profile` | `auth.defaultProfile` | The profile of a token that names none. This or `auth.defaultProfile` is required |
| `auth.externalIssuers[].maxMinutes` | 60 | The longest lifetime of its tokens, in minutes (1 to 1440) |

## List, revoke and remove tokens { #token-list }

```bash
pivotkit-server token list
pivotkit-server token revoke laptop
pivotkit-server token remove contractor
```

!!! warning "After a leak: `token remove` alone does not stop a static token"

    The running server reads `auth.tokens` at start. After `token remove`, it still accepts the
    static token until it restarts. The command says so in its first line. Restart the server now,
    or delete the token's file. A signed token is refused from the next request on.

`token list` shows every token. It never shows a value.

```text
ID                NAME     KIND    PROFILE  EXPIRES               STATUS
admin             admin    static  -        never                 active
3f2a1b0c9d8e7f60  laptop   signed  staff    2026-11-17 06:00 UTC  active
```

- A static token's ID is its name. A signed token's ID is the one the log shows.
- The commands take an ID or a name. A name that two tokens share is refused with both IDs.
- `token revoke` puts a signed token on the deny list. The server refuses it from the next request
  on. It also takes an ID that is not in the list, for example one from the log.
- `token remove` takes a static token out of `auth.tokens` of the configuration file. It keeps the
  old file as a backup first, as `--add` does.
    - The token's file is deleted where the server made it (`"create": true`, or in the state
      directory). The token is then refused from the next request on.
    - Otherwise the file stays, and the token works until the next restart (see the warning above).
    - It refuses the last token of `auth.tokens`, and `admin`. Give `admin` a new value with
      `token new --file <its file> --force`.
- `token remove` on a signed token revokes it and takes it off the list.
- `token revoke` on a static token is refused. Use `token remove`.

They read the configuration as `token show` does: `--config` or `$PIVOTKIT_CONFIG`, and
`--state-dir` or `$PIVOTKIT_STATE_DIR`. In the container image, they need no flag.

## Made at the first start { #first-start }

You set the state directory with `--state-dir <dir>` or `$PIVOTKIT_STATE_DIR`. The
[container image](container.md) sets `/var/lib/pivotkit`. With a state directory, the server makes
what is missing there when it starts over HTTP, so a start without any setup has a token and links
that survive a restart:

| What | Where | When |
| --- | --- | --- |
| `auth.mode` `"token"` | | `auth.mode` is not set, the address is not loopback and `auth.allowUnauthenticated` is not set (such a start is refused without a state directory) |
| The token `admin` (every scope, no profile) | `<dir>/secrets/admin.token` | `auth.mode` is not written, so the row above sets `"token"`, `auth.tokens` is empty and `$PIVOTKIT_TOKEN` (pivotkit-mcp: `$PIVOTKIT_MCP_TOKEN`) is not set. A written `auth.mode` `"token"` without a token is refused (below) |
| The key of the [download links](delivery.md) | `<dir>/secrets/downloads.key` | Links are on and `output.downloads.key` is not set |
| The [audit](mcp.md#logging) key | `<dir>/secrets/audit.key` | `audit.subject` is `"hash"` and `audit.key` is not set |
| The key of the [browser tokens](records.md#records-browser) | `<dir>/secrets/browser.key` | A profile reads rows (`records`) and `rest.browser.key` is not set |
| The [signed tokens'](#signed-tokens) directory | `<dir>/secrets/signed/` | The first `token issue`, not the start |

- The server never makes the state directory itself. It makes only these in it:
    - `secrets/` (mode 0700), for the files above
    - `out/` (mode 0700), when `output.dir` is `<dir>/out`, as in the image's built-in example
- Each file is one line with mode 0600. A file that is there is read and never written.
- The start logs `created the token "admin" in <path>` once. It never logs a value.
- Every start with the token `admin` logs the command that prints it. In Docker or Podman that is
  `docker exec <container> pivotkit-server token show admin`. In Kubernetes it names the namespace
  and the pod: `kubectl -n <namespace> exec <pod> -- pivotkit-server token show admin` (add
  `-c <container>` in a pod with more than one). Elsewhere it is
  `pivotkit-server token show admin --state-dir <dir>`.
- `admin` is made only where the configuration leaves auth to the server. A written `auth.mode`
  `"token"` (or `--auth token`) with neither `auth.tokens` nor the variable is refused. Set the
  variable, list tokens, or remove `auth.mode` to use `admin`. A misspelt variable never becomes a
  token with every scope.
- When the token cannot be made, the start is refused. It never serves without auth instead. The
  message says what helps: a writable volume in a container, else the directory itself.
- A key that cannot be made is a warning. The key is then a random one per process.
- Over stdio nothing is made.
- `check-config` says under `Credentials` whether each file is there, will be made, or cannot be. It
  makes nothing.

Several processes that start at once on one directory end with one value each (the first one's).
Run one replica, or several on one shared volume. Replicas with a volume each would each make their
own token. `output.dir` may not be the state directory or hold its `secrets/`.

`"create": true` on a file reference asks for the same where you name the file:

- `auth.tokens[]`: `{ "name": "bot", "file": "bot.token", "create": true }`
- `output.downloads.key`, `audit.key` and `rest.browser.key`: `{ "file": "download.key", "create": true }`

The file is made where it is missing, also without a state directory. Its directory must be there.
pivotkit refuses `create` with `env`, since it cannot set a variable. It also refuses `create` on a
secret another system issues: a sign-in's `clientSecret`, a backend's header or client secret.
