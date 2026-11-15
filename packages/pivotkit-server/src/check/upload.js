/*
 * check-config's section for the upload target (output.upload): where reports go, how, which
 * sources' reports get the store's link and which keep the server's own delivery (delivery.js
 * storeFor), and the secrets of its headers (readable, not readable by other users).
 *
 *   Upload:
 *     target: presigned via https://store.example.com/presign
 *       PUT, up to 50 MiB, 30 s
 *     reports over open sources (weather): store links from https://files.example.com
 *       bind none, as you declared it; pivotkit does not check the store
 *     reports over closed sources (sales, vms): not uploaded (the store's links work for anyone who
 *       has them)
 *
 * check/index.js says what a section returns. Without output.upload it says nothing.
 */

import { settingsOf as downloadSettingsOf } from "../options/downloads.js";
import { inlineOffered, perPersonItem, perPersonOf } from "./downloads.js";
import { fileText, heading, plain, problem, warning } from "./format.js";
import { OUTPUT_DEFAULTS } from "../config.js";
import { addressText, uploadMaxBytes, uploadSettingsOf } from "../options/upload.js";
import { readSecret, secretFileWarning } from "../secrets.js";
import { addressRefusal } from "../sources/fetch.js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** How long check-config waits for a name's addresses. */
const LOOKUP_MS = 3000;

/** What a PROBLEM of the upload target does: the server starts, uploads fail. */
const FAILS = { effect: "the server starts; every upload fails (UPLOAD_FAILED)" };

/**
 * What keeps the server from reaching a host the uploads go to, by the rule a request applies
 * (guardedFetch's addressRefusal over every address the name has now): a PROBLEM, a WARNING when
 * the name cannot be looked up now, or null.
 * @param {string} host
 * @param {boolean} intranet
 * @param {string} key  the option that names it
 * @returns {Promise<import("./format.js").Item | null>}
 */
async function hostItem(host, intranet, key) {
    const bare = host.replace(/^\[|\]$/g, "");
    if (isIP(bare)) {
        return problem(`${key}: ${bare} is an IP address, which uploads refuse; name the server`, FAILS);
    }
    /** @type {Array<{ address: string }> | null} */
    // the lookup itself cannot be cancelled and may outlive the 3 s wait: harmless in a command that ends
    const addresses = await Promise.race([lookup(bare, { all: true }), new Promise((resolve) => setTimeout(() => resolve(null), LOOKUP_MS).unref())]).catch(() => null);
    if (!addresses?.length) {
        return warning(`${key}: ${bare} cannot be looked up from here; the upload checks its addresses when it runs`);
    }
    for (const { address } of addresses) {
        const rule = addressRefusal(address, { allowPrivate: intranet });
        if (rule === "always") {
            return problem(`${key}: ${bare} resolves to ${address}, which is never connected to (link-local, metadata, multicast or unspecified)`, FAILS);
        }
        if (rule) {
            return problem(`${key}: ${bare} resolves to ${address}, a loopback or private address, which uploads refuse without output.upload.intranet: true`, FAILS);
        }
    }
    return null;
}

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
        return "the server's own download links (signed in)";
    }
    return downloads.bind === "once" ? "the server's own one-time links" : "no link (the file is kept; the person asks you for it)";
}

/** @type {import("./index.js").Section} */
export async function section(options, registry, runtime) {
    const settings = uploadSettingsOf(options);
    if (!settings) {
        return { items: [], upgrade: [] };
    }
    const sources = await registry.check();
    const closed = sources.filter((s) => s.closed).map((s) => s.id);
    const open = sources.filter((s) => !s.closed).map((s) => s.id);
    const items = [heading("Upload:")];
    items.push(plain(settings.presign ? `target: presigned via ${addressText(settings.presign.url)}` : `target: ${addressText(/** @type {string} */ (settings.template))}`));
    if (settings.presign) items.push(plain(`uploads to ${settings.presign.allowOrigins.join(", ")}`, 2));
    items.push(plain(`${settings.method}, up to ${sizeText(uploadMaxBytes(settings, options.output?.maxMb ?? OUTPUT_DEFAULTS.maxMb))}, ${+(settings.timeMs / 1000).toFixed(1)} s`, 2));
    if (settings.intranet) items.push(plain("may reach loopback and private addresses (intranet)", 2));
    // the hosts requests go to, checked as a request checks them
    const hosts = settings.presign ? [[new URL(settings.presign.url).hostname, "output.upload.presign.url"], ...settings.presign.allowOrigins.map((o) => [new URL(o).hostname, "output.upload.presign.allowOrigins"])] : [[new URL(/** @type {string} */ (settings.template).replace(/\{(id|name|format)\}/g, "x")).hostname, "output.upload.url"]];
    for (const [host, key] of hosts) {
        const said = await hostItem(host, settings.intranet, key);
        if (said) {
            items.push(said);
        }
    }
    const from = `from ${settings.linkOrigins.join(", ")}`;
    if (open.length) {
        items.push(plain(`reports over open sources (${idsText(open)}): store links ${from}`), plain(`bind ${settings.bind}, as you declared it; pivotkit does not check the store`, 2));
    }
    // closed also for being one person's data, as the Delivery section says: per-person sources and data sent in requests
    const personal = perPersonOf(options);
    const inline = inlineOffered(options, runtime);
    if (personal.size || inline) {
        items.push(perPersonItem(personal, inline));
    }
    if (closed.length || inline) {
        const which = [closed.length ? `reports over closed sources (${idsText(closed)})` : "", inline ? "over data sent in requests (inline:)" : ""].filter(Boolean).join(" and ");
        if (settings.bind === "none") {
            items.push(plain(`${which}: not uploaded (the store's links work for anyone who has them)`), plain(`they get ${ownDelivery(options, runtime)}`, 2));
        } else {
            items.push(
                plain(`${which}: store links ${from}`),
                plain(`bind ${settings.bind}: ${settings.bind === "signIn" ? "you declared that the store lets only the person open them" : "you declared that each link works once"}`, 2),
                ...(settings.bind === "signIn" ? [plain("callers without a subject get the server's own delivery", 2)] : []),
                ...(runtime.rest ? [plain("REST programs get them only with results: true", 2)] : [])
            );
            if (settings.bind === "once") {
                items.push(warning("one-time store links: anyone who sees the link can use it once, including an assistant with a browser or code tool"));
            }
        }
    }
    if (settings.bind === "signIn" && !options.output?.downloads?.key) {
        items.push(warning("output.downloads.key is not set: the subject binding the presign service receives changes on every restart and differs between replicas; set output.downloads.key"));
    }
    items.push(plain(settings.keepLocal ? "the report stays in output.dir too" : "the report is removed from output.dir once the store has it (a failed upload keeps it until it is cleaned up)"));
    items.push(plain("schedule drafts are not uploaded (the host approves them in output.dir)"));
    for (const [name, value] of Object.entries(settings.headers)) {
        if (typeof value === "string") {
            continue;
        }
        const where = `output.upload${settings.presign ? ".presign" : ""}.headers.${name}`;
        items.push(plain(`header ${name} from ${value.value.env ? `$${value.value.env}` : `the file ${fileText(options, value.value.file)}`}`));
        try {
            await readSecret(value.value, options, runtime.env);
        } catch (e) {
            items.push(problem(`${where}: ${String(/** @type {any} */ (e)?.message ?? e)}`, FAILS));
        }
        const readable = await secretFileWarning(value.value, options, `the file ${value.value.file} of ${where}`);
        if (readable) {
            items.push(warning(readable.replace(/^warning: /, "")));
        }
    }
    return { items, upgrade: [] };
}
