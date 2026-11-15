/*
 * check-config's section for download links: whether the server gives its own links, where they
 * point, which sources' reports get which link (delivery.js linkFor), what to register at the
 * sign-in provider, and the warnings (a random key, one-time links, output.baseUrl with closed
 * sources, no public address off loopback).
 *
 * check/index.js says what a section returns. Over stdio (no --http) and without output.baseUrl it
 * says nothing: no links there.
 */

import { CALLBACK_PATH, DOWNLOADS_PATH, KEY_MIN_BYTES } from "../downloads.js";
import { settingsOf } from "../options/downloads.js";
import { uploadSettingsOf } from "../options/upload.js";
import { isLoopback } from "../listen.js";
import { readSecret, secretFileWarning } from "../secrets.js";
import { resolvePolicy } from "../policy.js";

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
    return "a field is not shown";
}

/** @type {import("./index.js").Section} */
export async function section(options, registry, runtime) {
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
    // with an upload target, reports the store takes are check/upload.js's to describe
    const upload = uploadSettingsOf(options);
    const ownClosed = upload && upload.bind !== "none" ? [] : closed;
    if (ownClosed.length) {
        // why: open needs default "show" and no field below it, for the server, the source and every profile
        lines.push(`  closed (a field not shown for someone): ${idsText(ownClosed.map((id) => `${id} (${whyClosed(options, id)})`))}`);
        const rest = runtime.rest ? "; REST programs get them only with results: true" : "";
        if (settings.bind === "signIn" && settings.signIn) {
            const claim = options.auth?.subjectClaim ?? "sub";
            lines.push(`  reports over closed sources (${idsText(ownClosed)}): sign-in links; register ${base}${CALLBACK_PATH} at the provider for client ${settings.signIn.clientId}; it must resolve the same subject (${claim}) as the MCP client${rest}`);
        } else if (settings.bind === "once") {
            lines.push(`  reports over closed sources (${idsText(ownClosed)}): one-time links${rest}`, '  warning: one-time links: anyone who sees the link can use it once, including an assistant with a browser or code tool; use bind "signIn" where that matters');
        } else {
            lines.push(`  reports over closed sources (${idsText(ownClosed)}): no links (the file is kept; the person asks you for it); set output.downloads.signIn for links only the person can open`);
        }
    }
    const ownOpen = upload ? [] : open;
    if (ownOpen.length) {
        lines.push(`  reports over open sources (${idsText(ownOpen)}): plain links`);
    }
    // whether any report gets a link: the key and the stored names matter only then
    const linking = ownOpen.length > 0 || (ownClosed.length > 0 && settings.bind !== "none");
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
