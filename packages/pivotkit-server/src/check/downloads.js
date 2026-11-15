/*
 * check-config's section for download links: whether the server gives its own links, where they
 * point, which sources' reports get which link (delivery.js linkFor), what to register at the
 * sign-in provider, and the warnings (a random key, one-time links, output.baseUrl with closed
 * sources, no public address off loopback); and how long reports stay on disk (retention).
 *
 * check/index.js says what a section returns. Over stdio (no --http) and without output.baseUrl it
 * says nothing about links (there are none); the retention warning holds there too.
 */

import { CALLBACK_PATH, DOWNLOADS_PATH, KEY_MIN_BYTES } from "../downloads.js";
import { settingsOf } from "../options/downloads.js";
import { isLoopback } from "../listen.js";
import { readSecret, secretFileWarning } from "../secrets.js";
import { resolvePolicy } from "../policy.js";
import { realpath } from "node:fs/promises";
import { OUTPUT_DEFAULTS, pathOf } from "../config.js";
import { ownFileDirs } from "../context.js";
import { personBound } from "../sources/auth.js";
import { mcpCapOf, restDataOffered } from "../sources/inline.js";

/** Up to six ids, then how many more. */
const idsText = (ids) => (ids.length > 6 ? `${ids.slice(0, 6).join(", ")} and ${ids.length - 6} more` : ids.join(", "));

/** What makes a policy closed, in words, or null where every field is shown; a field by its written name. */
function closedBy(policy, written = []) {
    if (policy.default !== "show") {
        return `fields ${policy.default} by default`;
    }
    const field = [...policy.fields.entries()].find(([, level]) => level !== "show");
    if (field) {
        const name = written.find((w) => w.toLowerCase() === field[0].toLowerCase()) ?? field[0];
        return `${name.slice(0, 60)} ${field[1]}`;
    }
    return policy.auto ? "the automatic values rule" : null;
}

/**
 * Why a source counts as closed: the first field that is not shown under its policy (with the
 * server's), else under a profile. Open needs `default: "show"` and no field below it, everywhere.
 * @param {import("../config.js").ServerOptions} options
 * @param {string} id
 */
export function whyClosed(options, id) {
    const source = options.sources?.[id]?.policy;
    const written = [options.policy, source, ...Object.values(options.policy?.profiles ?? {})].flatMap((p) => Object.keys(p?.fields ?? {}));
    const own = closedBy(resolvePolicy(options.policy, source), written);
    if (own) {
        return own;
    }
    for (const [name, profile] of Object.entries(options.policy?.profiles ?? {})) {
        const by = closedBy(resolvePolicy(options.policy, source, profile), written);
        if (by) {
            return `profile ${name.slice(0, 40)}: ${by}`;
        }
    }
    return NO_FIELD_REASON;
}

/** whyClosed's answer where no field says why. */
const NO_FIELD_REASON = "a field is not shown";

/**
 * The sources whose data belongs to one person, by id with why (registry.js counts them as closed
 * for links).
 * @param {import("../config.js").ServerOptions} options
 * @returns {Map<string, string>}
 */
function perPersonOf(options) {
    const out = new Map();
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (personBound(options, source)) {
            out.set(id, Object.values(source.params ?? {}).some((p) => p?.claim !== undefined) ? "a parameter bound to a claim" : "a token exchange");
        } else if (/** @type {any} */ (source).perPerson === true) {
            out.set(id, "perPerson");
        }
    }
    return out;
}

/** @type {import("./index.js").Section} */
export async function section(options, registry, runtime) {
    const said = await links(options, registry, runtime);
    const kept = await retention(options, registry, runtime);
    return { lines: [...said.lines, ...kept.lines], problems: said.problems + kept.problems, upgrade: [...said.upgrade, ...kept.upgrade] };
}

/**
 * How long reports stay on disk: a warning when the operator switched the age limit off
 * (output.maxAgeDays: 0; the default is 30 days) while some report can hold data about people, one over a closed source (registry.js, closed
 * for delivery) or over data sent in a request. Such reports stay in output.dir until
 * output.maxFiles or output.maxMb push them out, also after their link expired (an expired link does
 * not remove its file). Said whatever the links are (stdio, output.baseUrl, the server's own).
 * @type {import("./index.js").Section}
 */
async function retention(options, registry, runtime) {
    const none = { lines: [], problems: 0, upgrade: [] };
    if (!options.output?.dir) {
        return none;
    }
    if (options.output.maxAgeDays === undefined) {
        // the default age limit, new in this version: only in a directory of the reports' own
        const dir = pathOf(options, options.output.dir);
        const real = await realpath(dir).catch(() => dir);
        const shared = (await ownFileDirs(options)).includes(real);
        return shared ? none : { ...none, upgrade: [`Reports and schedule drafts older than ${OUTPUT_DEFAULTS.maxAgeDays} days are deleted from output.dir at start and every hour (output.maxAgeDays; 0 keeps them with no age limit)`] };
    }
    if (options.output.maxAgeDays !== 0) {
        return none;
    }
    const closed = (await registry.check()).filter((s) => s.closed).map((s) => s.id);
    const inline = Boolean((runtime.mcp !== false && mcpCapOf(options)) || (runtime.rest && restDataOffered(options)));
    if (!closed.length && !inline) {
        return none;
    }
    const what = [closed.length ? `reports over closed sources (${idsText(closed)})` : "", inline ? "data sent in requests" : ""].filter(Boolean).join(" and ");
    // a directory that holds the configuration or a source file refuses maxAgeDays (check.js): reports need their own first
    const dir = pathOf(options, options.output.dir);
    const real = await realpath(dir).catch(() => dir);
    const shared = (await ownFileDirs(options)).includes(real);
    const limit = `leave out output.maxAgeDays (the default deletes reports after ${OUTPUT_DEFAULTS.maxAgeDays} days) or set a number of days`;
    const fix = shared ? `give the reports a directory of their own and ${limit}` : limit;
    const maxFiles = options.output.maxFiles ?? OUTPUT_DEFAULTS.maxFiles;
    const maxMb = options.output.maxMb ?? OUTPUT_DEFAULTS.maxMb;
    return {
        lines: ["Retention:", `  warning: output.maxAgeDays is 0 (no age limit): reports stay in output.dir until output.maxFiles (${maxFiles}) or output.maxMb (${maxMb} MB) push them out, also after their link expired; ${what} can hold data about people; ${fix}`],
        problems: 0,
        upgrade: []
    };
}

/** @type {import("./index.js").Section} */
async function links(options, registry, runtime) {
    const settings = settingsOf(options);
    const sources = await registry.check();
    const closed = sources.filter((s) => s.closed).map((s) => s.id);
    const open = sources.filter((s) => !s.closed).map((s) => s.id);
    const lines = [];
    const upgrade = [];
    let problems = 0;

    if (options.output?.baseUrl) {
        if (closed.length) {
            lines.push("Delivery:", `  reports over closed sources (${idsText(closed)}): no address under output.baseUrl (anyone with it could open a report whose fields are withheld); the file is kept, and the person asks you for it`);
            upgrade.push(`Reports over closed sources (${idsText(closed)}) no longer carry a url under output.baseUrl; switch to the server's own links (leave out output.baseUrl) for sign-in links, or give REST programs results: true and the file route`);
        }
        return { lines, problems, upgrade };
    }
    if (!runtime.http) {
        return { lines, problems, upgrade };
    }
    lines.push("Delivery:");
    if (!settings.enabled) {
        lines.push(`  downloads: off (${options.output?.downloads?.enabled === false ? "output.downloads.enabled is false" : "no output.dir"})`);
        return { lines, problems, upgrade };
    }
    const host = options.http?.host ?? "127.0.0.1";
    const publicUrl = options.http?.publicUrl ? options.http.publicUrl.replace(/\/$/, "") : null;
    if (!publicUrl && !isLoopback(host)) {
        lines.push(`  downloads: on, but no links: the server listens on ${host} and http.publicUrl is not set (links would show an internal address)`, "  warning: set http.publicUrl to the address people open, and route /downloads to this service");
        return { lines, problems, upgrade };
    }
    const base = publicUrl ?? `http://${host.includes(":") ? `[${host}]` : host}:${options.http?.port ?? 3333}`;
    lines.push(`  downloads: on, links ${base}${DOWNLOADS_PATH}/<token>${publicUrl ? ` (route ${DOWNLOADS_PATH} to this service)` : ""}, expire after ${settings.expiresMinutes} minute${settings.expiresMinutes === 1 ? "" : "s"}`);
    // closed by a field, and closed for being data of one person (some sources both)
    const personal = perPersonOf(options);
    const byField = closed.filter((id) => !personal.has(id) || whyClosed(options, id) !== NO_FIELD_REASON);
    const inline = (runtime.mcp !== false && mcpCapOf(options)) || (runtime.rest && restDataOffered(options));
    if (byField.length) {
        // why: open needs default "show" and no field below it, for the server, the source and every profile
        lines.push(`  closed (a field not shown for someone): ${idsText(byField.map((id) => `${id} (${whyClosed(options, id)})`))}`);
    }
    if (personal.size || inline) {
        lines.push(`  per person (counted as closed): ${[...[...personal].map(([id, why]) => `${id} (${why})`), ...(inline ? ["data sent in requests (inline:)"] : [])].join(", ")}`);
    }
    if (closed.length) {
        const rest = runtime.rest ? "; REST programs get them only with results: true" : "";
        if (settings.bind === "signIn" && settings.signIn) {
            const claim = options.auth?.subjectClaim ?? "sub";
            lines.push(`  reports over closed sources (${idsText(closed)}): sign-in links; register ${base}${CALLBACK_PATH} at the provider for client ${settings.signIn.clientId}; it must resolve the same subject (${claim}) as the MCP client${rest}`);
        } else if (settings.bind === "once") {
            lines.push(`  reports over closed sources (${idsText(closed)}): one-time links${rest}`, '  warning: one-time links: anyone who sees the link can use it once, including an assistant with a browser or code tool; use bind "signIn" where that matters');
        } else {
            lines.push(`  reports over closed sources (${idsText(closed)}): no links (the file is kept; the person asks you for it); set output.downloads.signIn for links only the person can open`);
        }
    }
    if (open.length) {
        lines.push(`  reports over open sources (${idsText(open)}): plain links`);
    }
    // whether any report gets a link: the key and the stored names matter only then
    const linking = open.length > 0 || (closed.length > 0 && settings.bind !== "none");
    if (settings.key) {
        try {
            const value = await readSecret(settings.key, options, runtime.env);
            if (Buffer.byteLength(value) < KEY_MIN_BYTES) {
                lines.push(`  PROBLEM: output.downloads.key is shorter than ${KEY_MIN_BYTES} bytes; make one with: openssl rand -base64 48`);
                problems++;
            }
        } catch (e) {
            lines.push(`  PROBLEM: output.downloads.key: ${String(/** @type {any} */ (e)?.message ?? e)}`);
            problems++;
        }
        const readable = await secretFileWarning(settings.key, options, `the file ${settings.key.file} of output.downloads.key`);
        if (readable) {
            lines.push(`  ${readable}`);
        }
    } else if (linking) {
        lines.push("  warning: output.downloads.key is not set: links stop working on a restart and on another replica");
    }
    if (settings.signIn?.clientSecret) {
        const readable = await secretFileWarning(settings.signIn.clientSecret, options, `the file ${settings.signIn.clientSecret.file} of output.downloads.signIn.clientSecret`);
        if (readable) {
            lines.push(`  ${readable}`);
        }
    }
    if (linking) {
        upgrade.push(`Reports get the server's own download links under ${DOWNLOADS_PATH}, and those reports are stored with a 22-character random prefix (output.name; output.filename is the plain name); route ${DOWNLOADS_PATH} to this service, or set output.downloads.enabled to false to keep the old behaviour`);
    }
    return { lines, problems, upgrade };
}
