/*
 * The commands that manage tokens, loaded by credentials.js only for them:
 *
 *   pivotkit-server token issue [--name <n>] [--profile <p>] [--scope <s>]... [--expires 1h] [--json]
 *   pivotkit-server token list [--json]
 *   pivotkit-server token revoke <id or name> [--json]
 *   pivotkit-server token remove <id or name> [--json]
 *   pivotkit-server key new --for signing [--json]
 *   pivotkit-server key remove <key id> --for signing [--force] [--json]
 *
 * Each reads the configuration as the server does (credentials.js plannedOf: --config or
 * $PIVOTKIT_CONFIG, --state-dir or $PIVOTKIT_STATE_DIR), so `docker exec <container> pivotkit-server
 * token issue` needs no flag. Signed tokens live in auth.signedTokens.dir (signed-tokens.js).
 *
 * A token is named by its ID or its name. A static token's ID is its name. `token issue` prints the
 * token once; nothing else prints a value. `revoke` is for signed tokens; `remove` takes a static
 * token out of auth.tokens (a backup first) and revokes and unlists a signed one.
 */

import { unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { closest } from "pivotkit-core";
import { pathOf } from "./config.js";
import { CommandError, TOKEN_NAME, changedConfig, parse, plannedOf, rewrittenLine, usage, writeConfig } from "./credentials.js";
import { maxLifetimeOf } from "./options/signed.js";
import { SIGNED_TOKEN, TOKEN_ID, OWN_KEY_ID, expiryOf, signedStore } from "./signed-tokens.js";
import { DEFAULT_TOKEN_NAME } from "./state.js";

/** The clock tolerance the server verifies with: a revoked token stays on the list that much past its expiry. */
const toleranceOf = (options) => options.auth?.clockTolerance ?? 30;

/**
 * The configuration and the signed tokens' store; a usage error where there are no signed tokens.
 * @param {Record<string, any>} values
 * @param {any} io
 * @param {string} command
 */
async function signedOf(values, io, command) {
    const planned = await plannedOf(values, io, command);
    const mode = planned.options.auth?.mode ?? "none";
    if (mode !== "token") {
        throw usage("AUTH_MODE", `signed tokens work with auth.mode "token"; ${planned.config} has "${mode}"`);
    }
    const dir = planned.options.auth?.signedTokens?.dir;
    if (!dir) {
        throw usage("NO_SIGNED_DIR", `signed tokens need a directory for their keys: set auth.signedTokens.dir in ${planned.config}, or give the server a state directory (--state-dir or $PIVOTKIT_STATE_DIR)`);
    }
    const path = pathOf(planned.options, dir);
    const store = signedStore(path);
    // the state's default lies in secrets/, which the first start makes: made here when missing
    const parents = planned.plan.secretsDir && dirname(path) === planned.plan.secretsDir ? [planned.plan.secretsDir] : [];
    const ready = () =>
        store.ensureDirs(parents).catch((e) => {
            throw new CommandError(1, "NO_DIRECTORY", `${path} cannot be made (${e?.code === "ENOENT" ? `${dirname(parents[0] ?? path)} does not exist` : String(e?.code ?? e?.message ?? e)}); it must be in a directory that is there and writable`);
        });
    return { ...planned, store, path, ready };
}

/**
 * The static tokens as the server takes them: auth.tokens, else the variable's one token ("token").
 * @param {any} options  planned
 * @param {string} tokenEnv
 */
const staticOf = (options, tokenEnv) => (options.auth?.mode !== "token" ? [] : options.auth?.tokens?.length ? options.auth.tokens : [{ name: "token", env: tokenEnv }]);

/** A time as the list prints it: 2026-11-16 23:00 UTC. */
const shortTime = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * Every token: the static ones, then the signed ones of the register (issued order), with their
 * status. Never a value.
 * @param {any} planned  plannedOf's, with store where there are signed tokens
 * @param {number} nowMs
 */
async function rowsOf(planned, nowMs) {
    const rows = staticOf(planned.options, planned.tokenEnv).map((t) => {
        const expiresAt = t.expires ? expiryOf(t.expires, { durations: false }) : null;
        return { id: t.name, name: t.name, kind: "static", source: t.file ? `file ${pathOf(planned.options, t.file)}` : `$${t.env}`, profile: t.profile ?? null, scopes: t.scopes ?? null, expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(), status: expiresAt !== null && nowMs >= expiresAt ? "expired" : "active", entry: t };
    });
    if (planned.store) {
        const revoked = await planned.store.revokedIds();
        for (const r of await planned.store.issued()) {
            rows.push({ id: r.id, name: r.name, kind: "signed", key: r.kid, profile: r.profile, scopes: r.scopes, issuedAt: r.issuedAt, expiresAt: r.expiresAt, status: revoked.has(r.id) ? "revoked" : Date.parse(r.expiresAt) <= nowMs ? "expired" : "active" });
        }
    }
    return rows;
}

/**
 * The one token an ID or name names: a static token by its name, a signed one by its ID or name
 * (among names, a working token before an expired or revoked one). null for none; a usage error for
 * two.
 * @param {any[]} rows
 * @param {string} given
 */
function findToken(rows, given) {
    let found = rows.filter((r) => r.id === given || r.name === given);
    if (found.length > 1) {
        const byId = found.filter((r) => r.id === given);
        const active = found.filter((r) => r.status === "active");
        found = byId.length === 1 ? byId : active.length ? active : found;
    }
    if (found.length > 1) {
        throw usage("AMBIGUOUS", `"${given.slice(0, 64)}" names ${found.length} tokens (${found.map((r) => `${r.kind} ${r.id}`).join(", ")}); name one by its ID`);
    }
    return found[0] ?? null;
}

/** A usage error for an ID or name no token has, with the closest one. */
function unknownToken(rows, given, where) {
    const near = closest(given, rows.flatMap((r) => [r.id, r.name].filter(Boolean)));
    return usage("UNKNOWN_TOKEN", `no token "${given.slice(0, 64)}" in ${where}${near ? `; did you mean "${near}"?` : ""}; pivotkit-server token list shows them`);
}

/** The one positional of a command (an ID or name), or a usage error. */
function oneArgument(command, positionals, what) {
    if (positionals.length !== 1) {
        throw usage("NAME", `${command} takes ${what}: pivotkit-server ${command} <${what}>`);
    }
    return positionals[0];
}

/**
 * `token issue`.
 * @returns {Promise<import("./credentials.js").Outcome>}
 */
async function tokenIssue(argv, io) {
    const { values } = parse("token issue", argv);
    const planned = await signedOf(values, io, "token issue");
    const nowMs = Date.now();
    const name = values.name ?? null;
    if (name !== null && (!TOKEN_NAME.test(name) || TOKEN_ID.test(name))) {
        throw usage("NAME", `--name ${JSON.stringify(name.slice(0, 40))}: a token's name is letters, digits, "_", "-" and "." (at most 64), starting with a letter or digit, and not 16 hex characters (a token's ID)`);
    }
    const profiles = Object.keys(planned.options.policy?.profiles ?? {});
    if (values.profile !== undefined && !profiles.includes(values.profile)) {
        const near = closest(values.profile, profiles);
        throw usage("PROFILE", `--profile: no profile "${values.profile.slice(0, 60)}" in policy.profiles of ${planned.config}${near ? `; did you mean "${near}"?` : ""}`);
    }
    const maxSec = maxLifetimeOf(planned.options);
    const expiresMs = values.expires === undefined ? nowMs + SIGNED_TOKEN.defaultSeconds * 1000 : expiryOf(values.expires, { nowMs });
    if (expiresMs === null) {
        throw usage("EXPIRES", `--expires ${JSON.stringify(values.expires.slice(0, 40))}: a time from now (15m, 8h, 7d) or a date (2027-01-31, from 00:00 UTC, or a date-time with a zone)`);
    }
    if (expiresMs <= nowMs) {
        throw usage("EXPIRES", `--expires ${JSON.stringify(values.expires.slice(0, 40))}: that time has passed`);
    }
    if (expiresMs - nowMs > maxSec * 1000) {
        throw usage("EXPIRES", `--expires: at most ${maxSec / 86_400} days (auth.signedTokens.maxDays); a token for longer is a static token: pivotkit-server token new`);
    }
    if (name !== null) {
        const taken = (await rowsOf(planned, nowMs)).find((r) => r.name === name && (r.kind === "static" || r.status === "active"));
        if (taken) {
            throw usage("DUPLICATE", `the name "${name}" is taken by the ${taken.kind} token ${taken.id}; give another --name`);
        }
    }
    await planned.ready();
    await planned.store.prune(toleranceOf(planned.options));
    const keysBefore = (await planned.store.loadKeys()).keys.size;
    const { token, record } = await planned.store.issue({ name, profile: values.profile ?? null, scopes: values.scope?.length ? values.scope : null, expiresAt: Math.floor(expiresMs / 1000) });
    const hints = [`The token ${record.id} works until ${shortTime(Date.parse(record.expiresAt))} on REST and MCP. The log names it by its ID.`, `Revoke it before then with: pivotkit-server token revoke ${record.name ?? record.id}`];
    if (!keysBefore) {
        hints.unshift(`Made the first signing key in ${planned.path} (keep this directory on a volume).`);
    }
    return { json: { id: record.id, name: record.name, profile: record.profile, scopes: record.scopes, expiresAt: record.expiresAt }, value: token, printValue: true, field: "token", hints, warnings: [] };
}

/**
 * `token list`.
 * @returns {Promise<import("./credentials.js").Outcome>}
 */
async function tokenList(argv, io) {
    const { values } = parse("token list", argv);
    const planned = await plannedOf(values, io, "token list");
    const dir = planned.options.auth?.mode === "token" ? planned.options.auth?.signedTokens?.dir : undefined;
    const store = dir ? signedStore(pathOf(planned.options, dir)) : null;
    const rows = await rowsOf({ ...planned, store }, Date.now());
    const tokens = rows.map(({ entry: _entry, ...row }) => row);
    const cells = [["ID", "NAME", "KIND", "PROFILE", "EXPIRES", "STATUS"], ...rows.map((r) => [r.id, r.name ?? "-", r.kind, r.profile ?? "-", r.expiresAt ? shortTime(Date.parse(r.expiresAt)) : "never", r.status])];
    const widths = cells[0].map((_, i) => Math.max(...cells.map((c) => c[i].length)));
    const text = rows.length ? `${cells.map((c) => c.map((v, i) => (i === c.length - 1 ? v : v.padEnd(widths[i]))).join("  ")).join("\n")}\n` : "";
    const hints = rows.length ? [] : [`no tokens: auth.mode is "${planned.options.auth?.mode ?? "none"}" in ${planned.config}`];
    return { json: { tokens }, value: "", printValue: false, field: "token", hints, warnings: [], text };
}

/**
 * `token revoke`: a signed token on the deny list, by its ID or name; an ID the register does not
 * know (from the log) too, for the longest lifetime a token may have.
 * @returns {Promise<import("./credentials.js").Outcome>}
 */
async function tokenRevoke(argv, io) {
    const { values, positionals } = parse("token revoke", argv, true);
    const given = oneArgument("token revoke", positionals, "id or name");
    const planned = await signedOf(values, io, "token revoke");
    const nowMs = Date.now();
    const rows = await rowsOf(planned, nowMs);
    const row = findToken(rows, given);
    if (row?.kind === "static") {
        throw usage("STATIC", `"${given}" is a static token of auth.tokens, which is not revoked: take it out with pivotkit-server token remove ${row.id}`);
    }
    if (!row && !TOKEN_ID.test(given)) {
        throw unknownToken(rows, given, `${planned.config}'s tokens`);
    }
    const tolerance = toleranceOf(planned.options) * 1000;
    const id = row?.id ?? given;
    const until = row ? Date.parse(row.expiresAt) + tolerance : nowMs + maxLifetimeOf(planned.options) * 1000 + tolerance;
    await planned.ready();
    const already = await planned.store.revoke(id, until);
    return { json: { id, revoked: true, already }, value: "", printValue: false, field: "token", hints: [already ? `${id} was revoked already.` : `Revoked ${id}: the server refuses it from the next request on.`], warnings: [] };
}

/**
 * `token remove`: a static token out of auth.tokens of the configuration file (a backup first), and
 * its file deleted where the server made it (create: true, or in the state directory's secrets/); a
 * signed token revoked and taken off the list.
 * @returns {Promise<import("./credentials.js").Outcome>}
 */
async function tokenRemove(argv, io) {
    const { values, positionals } = parse("token remove", argv, true);
    const given = oneArgument("token remove", positionals, "id or name");
    const planned = await plannedOf(values, io, "token remove");
    const dir = planned.options.auth?.mode === "token" ? planned.options.auth?.signedTokens?.dir : undefined;
    const store = dir ? signedStore(pathOf(planned.options, dir)) : null;
    const nowMs = Date.now();
    const rows = await rowsOf({ ...planned, store }, nowMs);
    const row = findToken(rows, given);
    if (!row) {
        throw unknownToken(rows, given, planned.config);
    }
    if (row.kind === "signed") {
        const signed = await signedOf(values, io, "token remove");
        await signed.ready();
        await signed.store.revoke(row.id, Date.parse(row.expiresAt) + toleranceOf(planned.options) * 1000);
        await signed.store.forget(row.id);
        return { json: { id: row.id, kind: "signed", removed: true }, value: "", printValue: false, field: "token", hints: [`Revoked ${row.id} and took it off the list: the server refuses it from the next request on.`], warnings: [] };
    }
    return removeStatic(planned, row, values);
}

/**
 * `token remove` of a static token.
 * @returns {Promise<import("./credentials.js").Outcome>}
 */
async function removeStatic(planned, row, values) {
    const written = planned.given.auth?.tokens ?? [];
    const index = written.findIndex((t) => t.name === row.id);
    if (index < 0 || !planned.configFile) {
        if (row.id === DEFAULT_TOKEN_NAME && planned.plan.defaultToken) {
            throw usage("SERVER_TOKEN", `the token "${DEFAULT_TOKEN_NAME}" is the server's own (${planned.plan.defaultToken.path}); give it a new value with: pivotkit-server token new --file ${planned.plan.defaultToken.path} --force`);
        }
        throw usage("NOT_IN_CONFIG", `the token "${row.id}" comes from ${row.source}, not from auth.tokens of a configuration file; unset the variable and restart the server`);
    }
    if (written.length === 1) {
        throw usage("LAST_TOKEN", `"${row.id}" is the last token in auth.tokens of ${planned.config}; auth.mode "token" needs one: add another first (pivotkit-server token new --add)`);
    }
    const entry = written[index];
    const changed = await changedConfig(planned.configFile, planned.config, planned.given, (raw) => {
        const tokens = raw.auth?.tokens ?? [];
        if (!tokens.some((t) => t?.name === row.id)) {
            throw new CommandError(1, "CONFIG_CHANGED", `${planned.config} changed since it was read: auth.tokens has no "${row.id}" now; nothing was removed`);
        }
        return { next: { ...raw, auth: { ...raw.auth, tokens: tokens.filter((t) => t?.name !== row.id) } }, notes: [] };
    });
    if ("done" in changed) {
        throw new CommandError(1, "CONFIG_CHANGED", `${planned.config}: nothing to remove`);
    }
    const again = "nothing was removed: run the command again";
    const { backup, warnings } = await writeConfig(changed, { ...values, config: planned.config }, { changedText: again, notWrittenText: again });
    const file = entry.file ? pathOf(planned.given, entry.file) : null;
    const madeByServer = Boolean(file) && (entry.create === true || (planned.plan.secretsDir !== null && dirname(/** @type {string} */ (file)) === planned.plan.secretsDir));
    let deleted = false;
    if (file && madeByServer) {
        deleted = await unlink(file).then(
            () => true,
            (e) => (e?.code === "ENOENT" ? false : Promise.reject(new CommandError(1, "NOT_DELETED", `${planned.config} no longer lists "${row.id}", but its file ${file} could not be deleted (${e?.code ?? e}); delete it by hand`)))
        );
    }
    const out = [...warnings];
    if (!deleted) {
        out.push(file ? `${file} is kept (the server did not make it): the server refuses the token after a restart; delete the file to refuse it now` : `the token came from $${entry.env}: restart the server to refuse it`);
    }
    const hints = [`Took "${row.id}" out of auth.tokens. ${rewrittenLine({ config: planned.config }, backup)}`, ...(deleted ? [`Deleted ${file}: the server refuses the token from the next request on.`] : [])];
    return { json: { id: row.id, kind: "static", removed: true, config: planned.configFile, backup, deleted }, value: "", printValue: false, field: /** @type {const} */ ("token"), hints, warnings: out };
}

/**
 * `key new --for signing`: a new signing key, which signs every token issued from now on; the
 * older keys stay valid. Never written elsewhere, never printed.
 * @param {Record<string, any>} values  parsed by credentials.js keyNew
 * @param {any} io
 * @returns {Promise<import("./credentials.js").Outcome>}
 */
export async function signingKeyNew(values, io) {
    for (const flag of ["file", "print", "add", "force", "if-missing"]) {
        if (values[flag] !== undefined) {
            throw usage("SIGNING_FLAG", `--${flag}: a signing key goes into the signed tokens' directory and is never printed or named in the configuration; run: pivotkit-server key new --for signing`);
        }
    }
    const signed = await signedOf(values, io, "key new");
    await signed.ready();
    const kid = await signed.store.newKey();
    return { json: { for: "signing", kid, dir: signed.path }, value: "", printValue: false, field: "key", hints: [`Made the signing key ${kid}: new tokens are signed with it, tokens of the older keys stay valid. Remove an older key once its tokens expired: pivotkit-server key remove <key id> --for signing`], warnings: [], text: `${kid}\n` };
}

/**
 * `key remove <kid> --for signing`: a signing key taken away; refused while tokens it signed still
 * work, unless --force (they get 401 then).
 * @returns {Promise<import("./credentials.js").Outcome>}
 */
async function keyRemove(argv, io) {
    const { values, positionals } = parse("key remove", argv, true);
    if (values.for !== "signing") {
        throw usage("FOR", "key remove takes --for signing: a key of output.downloads.key or audit.key is a file you replace with pivotkit-server key new --force");
    }
    const kid = oneArgument("key remove", positionals, "key id");
    const signed = await signedOf(values, io, "key remove");
    const { keys } = await signed.store.loadKeys();
    if (!OWN_KEY_ID.test(kid) || !keys.has(kid)) {
        const near = closest(kid, [...keys.keys()]);
        throw usage("UNKNOWN_KEY", `no signing key "${kid.slice(0, 40)}" in ${signed.path}${near ? `; did you mean "${near}"?` : keys.size ? `; there are ${[...keys.keys()].join(", ")}` : ""}`);
    }
    const live = (await rowsOf(signed, Date.now())).filter((r) => r.kind === "signed" && r.key === kid && r.status === "active");
    if (live.length && !values.force) {
        const last = live.map((r) => r.expiresAt).sort().at(-1);
        throw new CommandError(1, "IN_USE", `${live.length} token${live.length === 1 ? "" : "s"} signed with ${kid} still work${live.length === 1 ? "s" : ""}, until ${shortTime(Date.parse(/** @type {string} */ (last)))} at the latest; remove the key then, or now with --force (they get 401)`);
    }
    await signed.store.removeKey(kid);
    const warnings = live.length ? [`${live.length} token${live.length === 1 ? "" : "s"} signed with ${kid} get 401 from now on`] : [];
    return { json: { for: "signing", kid, removed: true }, value: "", printValue: false, field: "key", hints: [`Removed the signing key ${kid}.`], warnings };
}

/** The commands of this module, by name. */
export const ADMIN_COMMANDS = Object.freeze({
    "token issue": tokenIssue,
    "token list": tokenList,
    "token revoke": tokenRevoke,
    "token remove": tokenRemove,
    "key remove": keyRemove
});
