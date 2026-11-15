/*
 * `pivotkit-server check-source <id> [--param name=value ...] [--config file]`: one load of an HTTP
 * source as the server would make it, without an AI client, for the operator who sets one up. It
 * prints the request's template (each value as {name}, each literal query value as "..."), each
 * page's status, content type and size, the rows and the fields with their types, when the data is
 * from, the time it took, and what a caller would get when it fails. No secret and no cell value is
 * printed; field names and, when the rows' pointer does not find a list, the keys there are printed,
 * and those can be data of the backend's.
 */

import { LIMITS } from "pivotkit-core";
import { OperationError } from "pivotkit-report/operations";
import { serverLimitsOf, validateOptions } from "./config.js";
import { httpSettingsOf } from "./options/http.js";
import { serverTextOf } from "./rest/problem.js";
import { loadHttp } from "./sources/http.js";
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

/** A column's type as check-source names it, from its values (none printed). */
function typeOf(rows, i) {
    const kinds = new Set(rows.map((r) => r[i]).filter((v) => v !== null && v !== undefined && v !== "").map((v) => typeof v));
    return kinds.size === 0 ? "empty" : kinds.size > 1 ? "mixed" : kinds.has("number") ? "number" : kinds.has("boolean") ? "boolean" : "text";
}

/**
 * Loads an HTTP source once and says what came back.
 * @param {import("./config.js").ServerOptions} options
 * @param {string} id
 * @param {Record<string, string>} params  as typed on the command line
 * @param {{ fetch?: any }} [means]  tests: another guardedFetch
 * @returns {Promise<{ text: string, ok: boolean }>}
 */
export async function checkSource(options, id, params, means = {}) {
    validateOptions(options);
    const lines = [];
    const source = Object.hasOwn(options.sources ?? {}, id) ? options.sources?.[id] : undefined;
    if (!source) {
        const known = Object.keys(options.sources ?? {}).filter((k) => options.sources?.[k]?.http);
        return { text: `no source "${id.slice(0, 80)}"${known.length ? `; the HTTP sources are ${known.join(", ")}` : "; the configuration has no HTTP source"}\n`, ok: false };
    }
    if (!source.http) {
        return { text: `the source ${id} is a ${source.load ? "code" : "file"} source; check-source loads HTTP sources (check-config reads file sources)\n`, ok: false };
    }
    const settings = httpSettingsOf(source);
    lines.push(`source ${id}: GET ${settings.template.origin}${loggedPath(settings.template)}${options.httpSources?.enabled === false ? " (HTTP sources are off: httpSources.enabled is false; checked anyway)" : ""}`);
    let values;
    try {
        values = normalizeParams(source.params, params, null, id);
    } catch (e) {
        lines.push(`  params: ${/** @type {Error} */ (e).message}`, "FAILED");
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
    try {
        const loaded = await loadHttp(settings, values, { signal, limits, log, declared: source.params, trace, ...(means.fetch ? { fetch: means.fetch } : {}) });
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
        lines.push("OK");
        return { text: `${lines.join("\n")}\n`, ok: true };
    } catch (e) {
        trace.pages.forEach((p, i) => lines.push(`  page ${i + 1}: ${p.status} ${p.type || "(no content type)"}, ${p.bytes} bytes`));
        if (trace.keys) {
            lines.push(trace.found === "nothing" ? `  pointer ${settings.rowsText || '""'} matched nothing; the body has the keys: ${trace.keys.join(", ") || "none"}` : `  pointer ${settings.rowsText || '""'} points to ${trace.found}, not a list of rows; its keys: ${trace.keys.join(", ") || "none"}`);
        }
        // why it failed, as the debug log says it (the pages and the pointer are printed above)
        for (const d of details.filter((d) => !/ answered \d{3}$/.test(d) && !(trace.keys && /rows' pointer/.test(d)))) {
            lines.push(`  ${d.replace(`the source ${id}: `, "")}`);
        }
        if (signal.aborted) {
            lines.push(`  the load took longer than ${settings.timeMs} ms (timeMs)`);
        }
        const answer = e instanceof OperationError ? e : sourceFailure(e);
        const text = answer.status >= 500 ? serverTextOf(answer.code, /** @type {any} */ (answer).reason) : answer.message;
        lines.push(`  a caller gets: ${answer.code}: ${text}${e instanceof SourceError && e.status !== undefined ? ` (the backend answered ${e.status})` : ""}`, "FAILED");
        return { text: `${lines.join("\n")}\n`, ok: false };
    }
}
