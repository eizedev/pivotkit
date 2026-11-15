/*
 * `pivotkit-server check-source <id> [--param name=value ...] [--config file]`: one load of an HTTP
 * source as the server would make it, without an AI client, for the operator who sets one up. It
 * prints the request's template (each value as {name}, each literal query value as "..."), each
 * page's status, content type and size, the rows and the fields with their types, when the data is
 * from, the time it took, and what a caller would get when it fails. No secret and no cell value is
 * printed; field names and, when the rows' pointer does not find a list, the keys there are printed,
 * and those can be data of the backend's.
 *
 * The backend's sign-in (http.auth) is made as the server makes it, and its outcome printed: the token
 * endpoint's status, its error code, the scope it granted and expires_in, never a token or a secret.
 * A token exchange needs a person's token, which a command line has not: check-source asks the token
 * endpoint with the client's credentials only, to see that it answers and takes the client, and does
 * not load the source. A --param for a parameter bound to a claim stands in for the sign-in's claim.
 */

import { LIMITS } from "pivotkit-core";
import { OperationError } from "pivotkit-report/operations";
import { callerOf } from "./auth.js";
import { serverLimitsOf, validateOptions } from "./config.js";
import { httpSettingsOf } from "./options/http.js";
import { serverTextOf } from "./rest/problem.js";
import { probeExchange } from "./sources/auth.js";
import { certificateHint, loadHttp } from "./sources/http.js";
import { normalizeParams } from "./sources/params.js";
import { SourceError, sourceFailure } from "./sources/run.js";
import { loggedPath } from "./sources/template.js";

/**
 * The --param flags of a command line taken out: `--param name=value` or `--param=name=value`.
 * @param {string[]} argv
 * @returns {{ params: Record<string, string>, rest: string[] }}
 */
export function paramFlags(argv) {
    /** @type {Record<string, string>} */
    const params = Object.create(null);
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const given = arg === "--param" ? argv[++i] : arg.startsWith("--param=") ? arg.slice("--param=".length) : null;
        if (given === null) {
            rest.push(arg);
            continue;
        }
        const at = typeof given === "string" ? given.indexOf("=") : -1;
        if (at < 1) {
            throw new Error(`--param takes name=value, not ${JSON.stringify(String(given ?? "").slice(0, 80))}`);
        }
        const name = given.slice(0, at);
        if (Object.hasOwn(params, name)) {
            throw new Error(`--param ${name.slice(0, 64)} is given twice; a parameter takes one value`);
        }
        params[name] = given.slice(at + 1);
    }
    return { params: { ...params }, rest };
}

/**
 * The source's id and the runner's flags of a check-source command line, in any order: the one
 * argument that is neither a flag nor a flag's value is the id (a flag of type string takes the next
 * argument unless it is written --name=value).
 * @param {string[]} argv  without --param (paramFlags')
 * @param {Readonly<Record<string, { type: string, short?: string }>>} flags  the runner's
 * @returns {{ id: string | undefined, flags: string[] }}
 */
export function sourceArgs(argv, flags) {
    const shorts = new Map(Object.entries(flags).flatMap(([name, f]) => (f.short ? [[f.short, name]] : [])));
    /** @type {string[]} */
    const ids = [];
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("-") || arg === "-") {
            ids.push(arg);
            continue;
        }
        rest.push(arg);
        const name = arg.startsWith("--") ? arg.slice(2) : shorts.get(arg.slice(1));
        if (name !== undefined && !name.includes("=") && flags[name]?.type === "string" && i + 1 < argv.length) {
            rest.push(argv[++i]);
        }
    }
    if (ids.length > 1) {
        throw new Error(`check-source takes one source's id, not ${ids.length} (${ids.map((a) => a.slice(0, 40)).join(", ")})`);
    }
    return { id: ids[0], flags: rest };
}

/** A secret reference as check-source names it: the variable or the file, never the value. */
const secretRefText = (ref) => (ref?.env ? `$${ref.env}` : ref?.file ? `the file ${ref.file}` : "a secret");

/**
 * The line for a backend that answered 401 or 403: the secret behind http.auth, or where to set one.
 * @param {import("./options/http.js").HttpSettings} settings
 * @param {string} id
 * @param {number} status
 * @param {boolean} params  whether the source takes params (then the value may be what was refused)
 */
function refusedLine(settings, id, status, params) {
    const value = params ? "if the values are right, " : "";
    const auth = settings.auth;
    if (!auth) {
        const where = settings.backend ? `httpSources.backends.${settings.backend}.auth` : `sources.${id}.http.auth`;
        return `  the backend answered ${status} and the source sends no credentials: ${value}set ${where} (a header from a secret, client credentials or token exchange)`;
    }
    const secret = auth.kind === "header" ? auth.value : auth.kind === "clientCredentials" ? (auth.assertion ?? auth.clientSecret) : auth.clientSecret;
    return `  the backend answered ${status}: ${value}check the secret behind ${auth.at} (${secretRefText(secret)}) and that the backend accepts it`;
}

/**
 * The --param flags a failed check of the values asks for: each required parameter not given (a
 * claim's too: its --param stands in for the sign-in's claim), with its example.
 * @param {Record<string, any> | undefined} declared
 * @param {Record<string, string>} params
 */
function missingParams(declared, params) {
    return Object.entries(declared ?? {})
        .filter(([name, p]) => p?.required && p.default === undefined && !Object.hasOwn(params, name))
        .map(([name, p]) => `--param ${name}=${p.example ?? (Array.isArray(p.enum) ? p.enum[0] : `<${p.type ?? "value"}>`)}`);
}

/** A column's type as check-source names it, from its values (none printed). */
function typeOf(rows, i) {
    const kinds = new Set(rows.map((r) => r[i]).filter((v) => v !== null && v !== undefined && v !== "").map((v) => typeof v));
    return kinds.size === 0 ? "empty" : kinds.size > 1 ? "mixed" : kinds.has("number") ? "number" : kinds.has("boolean") ? "boolean" : "text";
}

/** How each sign-in is named. */
const AUTH_KINDS = Object.freeze({ header: "a header from a secret", clientCredentials: "client credentials", tokenExchange: "token exchange" });

/**
 * The line of the sign-in's outcome: the token endpoint (its origin and path), its status, error
 * code, the scope it granted and expires_in.
 * @param {import("./sources/auth.js").AuthTrace} trace
 */
function authLine(trace) {
    const url = trace.tokenUrl ? new URL(trace.tokenUrl) : null;
    const where = url ? ` at ${url.origin}${url.pathname}` : "";
    const outcome = trace.status === undefined ? (trace.kind === "header" ? "" : ": not asked") : `: the token endpoint answered ${trace.status}${trace.error ? ` (${trace.error})` : ""}${trace.expiresIn !== undefined ? `, expires_in ${trace.expiresIn} s` : ""}${trace.scope ? `, scope ${trace.scope}` : ""}${trace.audienceDiffers ? "; warning: the token's aud does not name the requested audience" : ""}`;
    const notes = (trace.notes ?? []).filter((n) => !n.startsWith("the token endpoint answered") && !n.startsWith("the token's aud")).map((n) => `\n    ${n}`);
    return `  backend auth: ${AUTH_KINDS[/** @type {keyof typeof AUTH_KINDS} */ (trace.kind)] ?? trace.kind}${where}${outcome}${notes.join("")}`;
}

/**
 * Loads an HTTP source once and says what came back.
 * @param {import("./config.js").ServerOptions} options
 * @param {string} id
 * @param {Record<string, string>} params  as typed on the command line
 * @param {{ fetch?: any, env?: Record<string, string | undefined> }} [means]  tests: another guardedFetch; the environment (process.env)
 * @returns {Promise<{ text: string, ok: boolean, usage?: boolean }>}  usage: the id names no HTTP source (exit 2)
 */
export async function checkSource(options, id, params, means = {}) {
    validateOptions(options);
    const env = means.env ?? process.env;
    const lines = [];
    const source = Object.hasOwn(options.sources ?? {}, id) ? options.sources?.[id] : undefined;
    if (!source) {
        const known = Object.keys(options.sources ?? {}).filter((k) => options.sources?.[k]?.http);
        return { text: `no source "${id.slice(0, 80)}"${known.length ? `; the HTTP sources are ${known.join(", ")}` : "; the configuration has no HTTP source"}\n`, ok: false, usage: true };
    }
    if (!source.http) {
        return { text: `the source ${id} is a ${source.load ? "code" : "file"} source; check-source loads HTTP sources (check-config reads file sources)\n`, ok: false, usage: true };
    }
    const settings = httpSettingsOf(source);
    lines.push(`source ${id}: GET ${settings.template.origin}${loggedPath(settings.template)}${options.httpSources?.enabled === false ? " (HTTP sources are off: httpSources.enabled is false; checked anyway)" : ""}`);
    let values;
    try {
        // a --param for a claim-bound parameter stands in for the sign-in's claim
        const declared = source.params ?? {};
        const claimed = Object.keys(params).filter((k) => Object.hasOwn(declared, k) && declared[k]?.claim !== undefined);
        const claims = Object.fromEntries(claimed.map((k) => [declared[k].claim, params[k]]));
        const given = Object.fromEntries(Object.entries(params).filter(([k]) => !claimed.includes(k)));
        values = normalizeParams(source.params, given, { claims }, id);
    } catch (e) {
        const missing = missingParams(source.params, params);
        // the message's "; re-run with params.x=..." said once, for every missing one, as flags
        const message = /** @type {Error} */ (e).message.replace(/; re-run with params\..*$/, "");
        lines.push(`  params: ${message}`, ...(missing.length ? [`  re-run with ${missing.join(" ")}`] : []), "FAILED");
        return { text: `${lines.join("\n")}\n`, ok: false };
    }
    /** @type {string[]} */
    const details = [];
    const log = { debug: (m) => details.push(m), info: () => undefined, warn: () => undefined, error: (e) => details.push(String(e?.message ?? e).slice(0, 300)) };
    const trace = /** @type {import("./sources/http.js").LoadTrace} */ ({ pages: [] });
    // as the server reads it: the registry's limits over pivotkit-core's (sources/http.js loadFor)
    const limits = { ...LIMITS, ...serverLimitsOf(options) };
    const started = Date.now();
    const signal = AbortSignal.timeout(settings.timeMs);
    if (settings.auth?.kind === "tokenExchange") {
        return exchangeOnly(settings.auth, { id, lines, details, log, fetch: means.fetch });
    }
    try {
        const loaded = await loadHttp(settings, values, { signal, limits, log, declared: source.params, caller: callerOf("none", undefined), trace, ...(means.fetch ? { fetch: means.fetch } : {}) });
        if (trace.auth) {
            lines.push(authLine(trace.auth));
        }
        trace.pages.forEach((p, i) => lines.push(`  page ${i + 1}: ${p.status} ${p.type || "(no content type)"}, ${p.bytes} bytes`));
        if (loaded.table) {
            lines.push(`  ${loaded.pages} page${loaded.pages === 1 ? "" : "s"}, ${loaded.bytes} bytes, ${loaded.table.rows.length} rows, ${Date.now() - started} ms`);
            lines.push(`  fields: ${loaded.table.columns.map((c, i) => `${c} (${typeOf(loaded.table?.rows ?? [], i)})`).join(", ") || "none"}`);
            if (!loaded.table.rows.length) {
                lines.push(`  warning: the answer has no rows at ${settings.rowsText || '"" (the whole body)'}: check the values, or that http.rows points to the rows`);
            }
        } else {
            lines.push(`  a CSV body of ${loaded.bytes} bytes, ${Date.now() - started} ms (its fields are read as a file's: check-config and describe_source name them)`);
        }
        lines.push(`  data as of ${loaded.asOf}${settings.asOf ? (trace.asOfRaw ? " (from the body)" : " (the body has nothing at the asOf pointer: the time it arrived)") : " (the time it arrived)"}`);
        const given = Object.entries(params).map(([k, v]) => `${k}=${v}`);
        lines.push(given.length ? `OK with ${given.join(", ")}` : "OK");
        return { text: `${lines.join("\n")}\n`, ok: true };
    } catch (e) {
        if (trace.auth) {
            lines.push(authLine(trace.auth));
        }
        trace.pages.forEach((p, i) => lines.push(`  page ${i + 1}: ${p.status} ${p.type || "(no content type)"}, ${p.bytes} bytes`));
        if (trace.keys) {
            lines.push(trace.found === "nothing" ? `  pointer ${settings.rowsText || '""'} matched nothing; the body has the keys: ${trace.keys.join(", ") || "none"}` : `  pointer ${settings.rowsText || '""'} points to ${trace.found}, not a list of rows; its keys: ${trace.keys.join(", ") || "none"}`);
        }
        // why it failed, as the debug log says it (the pages and the pointer are printed above)
        for (const d of details.filter((d) => !/ answered \d{3}$/.test(d) && !(trace.keys && /rows' pointer/.test(d)))) {
            lines.push(`  ${d.replace(`the source ${id}: `, "").replace(certificateHint(process.env, d), certificateHint(env, d))}`);
        }
        const backendStatus = e instanceof SourceError ? e.status : undefined;
        if ((backendStatus === 401 || backendStatus === 403) && !trace.auth?.error) {
            lines.push(refusedLine(settings, id, backendStatus, Boolean(source.params && Object.keys(source.params).length)));
        }
        if (signal.aborted) {
            lines.push(`  the load took longer than ${settings.timeMs} ms (timeMs)`);
        }
        const refusedClient = trace.auth && (trace.auth.error === "invalid_client" || trace.auth.error === "unauthorized_client" || (trace.auth.kind === "clientCredentials" && trace.auth.status === 401));
        if (refusedClient && settings.auth && settings.auth.kind !== "header") {
            lines.push(`  check ${settings.auth.at}.clientId and ${settings.auth.kind === "clientCredentials" && settings.auth.assertion ? "assertion" : "clientSecret"}`);
        }
        const answer = e instanceof OperationError ? e : sourceFailure(e);
        const text = answer.status >= 500 ? serverTextOf(answer.code, /** @type {any} */ (answer).reason) : answer.message;
        lines.push(`  a caller gets: ${answer.code}: ${text}${e instanceof SourceError && e.status !== undefined ? ` (the backend answered ${e.status})` : ""}`, "FAILED");
        return { text: `${lines.join("\n")}\n`, ok: false };
    }
}

/**
 * check-source of a source whose sign-in is a token exchange: the token endpoint asked with the
 * client's credentials and no person's token; the source itself is not loaded.
 * @param {Extract<import("./options/http.js").BackendAuth, { kind: "tokenExchange" }>} auth
 * @param {{ id: string, lines: string[], details: string[], log: any, fetch?: any }} how
 * @returns {Promise<{ text: string, ok: boolean }>}
 */
async function exchangeOnly(auth, how) {
    const trace = /** @type {import("./sources/auth.js").AuthTrace} */ ({ kind: auth.kind });
    const { lines } = how;
    let ok = false;
    try {
        const probe = await probeExchange(auth, { id: how.id, log: how.log, trace, ...(how.fetch ? { fetch: how.fetch } : {}) });
        lines.push(authLine(trace));
        if (probe.clientRefused) {
            lines.push(`  the token endpoint refused the client ${auth.clientId}: check ${auth.at}.clientId and clientSecret`);
        } else if (!probe.reached) {
            lines.push(`  the token endpoint did not answer as one does (a 400 with an OAuth error for a request without a person's token): check ${auth.at}.tokenUrl`);
        } else {
            lines.push("  the token endpoint answers and took the client; a token exchange needs a signed-in person's token, so the source itself loads only for a caller (MCP or REST with OAuth)");
            ok = true;
        }
    } catch (e) {
        lines.push(authLine(trace));
        for (const d of how.details) {
            lines.push(`  ${d.replace(`the source ${how.id}: `, "")}`);
        }
        const answer = e instanceof OperationError ? e : sourceFailure(e);
        lines.push(`  a caller gets: ${answer.code}: ${answer.status >= 500 ? serverTextOf(answer.code, /** @type {any} */ (answer).reason) : answer.message}`);
    }
    lines.push(ok ? "OK (not loaded: token exchange)" : "FAILED");
    return { text: `${lines.join("\n")}\n`, ok };
}
