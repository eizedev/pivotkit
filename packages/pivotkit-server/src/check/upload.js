/*
 * check-config's section for the upload target (output.upload): where reports go, how, which
 * sources' reports get the store's link and which keep the server's own delivery (delivery.js
 * storeFor), and the secrets of its headers (readable, not readable by other users).
 *
 *   Upload:
 *     target: presigned via https://store.example.com/presign, PUT, up to 50 MiB, 30 s
 *     reports over open sources (weather): store links (bind none), from https://files.example.com
 *     reports over closed sources (sales, vms): not uploaded (the store's links work for anyone); the server's own sign-in links
 *
 * check/index.js says what a section returns. Without output.upload it says nothing.
 */

import { settingsOf as downloadSettingsOf } from "../options/downloads.js";
import { uploadSettingsOf } from "../options/upload.js";
import { readSecret, secretFileWarning } from "../secrets.js";

/** Up to six ids, then how many more. */
const idsText = (ids) => (ids.length > 6 ? `${ids.slice(0, 6).join(", ")} and ${ids.length - 6} more` : ids.join(", "));

/** A size in MiB (or KiB, or bytes) for a line. */
const sizeText = (bytes) => (bytes >= 1_048_576 ? `${+(bytes / 1_048_576).toFixed(1)} MiB` : bytes >= 1024 ? `${+(bytes / 1024).toFixed(1)} KiB` : `${bytes} bytes`);

/** What the server itself gives a report over a closed source that is not uploaded (check/downloads.js says the details). */
function ownDelivery(options, runtime) {
    const downloads = downloadSettingsOf(options);
    if (!runtime.http || !downloads.enabled) {
        return "no link (the file is kept; the person asks you for it)";
    }
    if (downloads.bind === "signIn") {
        return "the server's own sign-in links";
    }
    return downloads.bind === "once" ? "the server's own one-time links" : "no link (the file is kept; the person asks you for it)";
}

/** @type {import("./index.js").Section} */
export async function section(options, registry, runtime) {
    const settings = uploadSettingsOf(options);
    if (!settings) {
        return { lines: [], problems: 0, upgrade: [] };
    }
    const sources = await registry.check();
    const closed = sources.filter((s) => s.closed).map((s) => s.id);
    const open = sources.filter((s) => !s.closed).map((s) => s.id);
    const lines = ["Upload:"];
    let problems = 0;
    const how = `${settings.method}, up to ${sizeText(settings.maxBytes)}, ${+(settings.timeMs / 1000).toFixed(1)} s${settings.intranet ? ", may reach loopback and private addresses (intranet)" : ""}`;
    lines.push(settings.presign ? `  target: presigned via ${settings.presign.url} (uploads to ${settings.presign.allowOrigins.join(", ")}), ${how}` : `  target: ${settings.template}, ${how}`);
    const from = `from ${settings.linkOrigins.join(", ")}`;
    if (open.length) {
        lines.push(`  reports over open sources (${idsText(open)}): store links (bind ${settings.bind}), ${from}`);
    }
    if (closed.length) {
        if (settings.bind === "none") {
            lines.push(`  reports over closed sources (${idsText(closed)}): not uploaded (the store's links work for anyone who has them); ${ownDelivery(options, runtime)}`);
        } else {
            lines.push(`  reports over closed sources (${idsText(closed)}): store links (bind ${settings.bind}: ${settings.bind === "signIn" ? "the store lets only the person open them" : "each link works once"}), ${from}${runtime.rest ? "; REST programs get them only with results: true" : ""}`);
            if (settings.bind === "once") {
                lines.push("  warning: one-time store links: anyone who sees the link can use it once, including an assistant with a browser or code tool");
            }
        }
    }
    lines.push(settings.keepLocal ? "  the report stays in output.dir too" : "  the report is removed from output.dir once the store has it (a failed upload keeps it until it is cleaned up)");
    lines.push("  schedule drafts are not uploaded (the host approves them in output.dir)");
    for (const [name, value] of Object.entries(settings.headers)) {
        if (typeof value === "string") {
            continue;
        }
        const where = `output.upload${settings.presign ? ".presign" : ""}.headers.${name}`;
        try {
            await readSecret(value.value, options, runtime.env);
        } catch (e) {
            lines.push(`  PROBLEM: ${where}: ${String(/** @type {any} */ (e)?.message ?? e)}`);
            problems++;
        }
        const readable = await secretFileWarning(value.value, options, `the file ${value.value.file} of ${where}`);
        if (readable) {
            lines.push(`  ${readable}`);
        }
    }
    return { lines, problems, upgrade: [] };
}
