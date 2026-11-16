/*
 * check-config's section for download links: whether the server gives its own links, where they
 * point, which sources' reports get which link (delivery.js linkFor), what to register at the
 * sign-in provider, and the warnings (a random key, one-time links, output.baseUrl with closed
 * sources, no public address off loopback); and how long reports stay on disk (retention). Its
 * "New in this version" note names the open sources hidden by default, which were closed before.
 *
 * check/index.js says what a section returns. Over stdio (no --http) and without output.baseUrl it
 * says nothing about links (there are none); the retention warning holds there too.
 */

import { CALLBACK_PATH, DOWNLOADS_PATH, KEY_MIN_BYTES } from "../downloads.js";
import { makeKey } from "../auth.js";
import { EXPIRES_MINUTES, insecurePublicHost, insecureUrlText, settingsOf } from "../options/downloads.js";
import { uploadSettingsOf } from "../options/upload.js";
import { isLoopback } from "../listen.js";
import { madeAtStart, readSecret, secretFileWarning } from "../secrets.js";
import { closedReason } from "../registry.js";
import { bytesText } from "../text.js";
import { resolvePolicy } from "../policy.js";
import { realpath } from "node:fs/promises";
import { OUTPUT_DEFAULTS, pathOf } from "../config.js";
import { ownFileDirs } from "../context.js";
import { personBound } from "../sources/auth.js";
import { mcpCapOf, restDataOffered } from "../sources/inline.js";
import { heading, idsText, plain, problem, secretText, warning } from "./format.js";

/**
 * Why a source counts as closed (registry.js closedReason), in words: the level that closes it, of a
 * field by its written name or of the default, and the profile where that is not the policy of a
 * caller without one. Open needs, for every caller alike, the default "hide" with every named field
 * "show" or "hide", or every field "show".
 * @param {import("../config.js").ServerOptions} options
 * @param {string} id
 */
export function whyClosed(options, id) {
    const source = options.sources?.[id]?.policy;
    const reason = closedReason(options, source);
    if (!reason) {
        return NO_FIELD_REASON;
    }
    const written = [options.policy, source, ...Object.values(options.policy?.profiles ?? {})].flatMap((p) => Object.keys(p?.fields ?? {}));
    const { field } = reason;
    const name = field ? (written.find((w) => w.toLowerCase() === field.toLowerCase()) ?? field).slice(0, 60) : null;
    const what = reason.auto ? "the automatic values rule" : name ? `${name} ${reason.level}` : `fields ${reason.level} by default`;
    const why = reason.others ? ", shown to other callers" : reason.denyList ? " under default show: a column the data gains later would be shown" : "";
    return `${reason.profile !== null ? `profile ${reason.profile.slice(0, 40)}: ` : ""}${what}${why}`;
}

/**
 * Whether a source's policy hides fields by default, for a caller without a profile or under any
 * profile: such an open source was closed before 0.8 (#510).
 * @param {import("../config.js").ServerOptions} options
 * @param {string} id
 */
function hiddenByDefault(options, id) {
    const source = options.sources?.[id]?.policy;
    return [undefined, ...Object.values(options.policy?.profiles ?? {})].some((profile) => resolvePolicy(options.policy, source, profile).default === "hide");
}

/** Whether callers may send data of their own (inline:), whose reports count as closed: over MCP unless off, over REST where a profile allows it. */
export const inlineOffered = (options, runtime) => Boolean((runtime.mcp !== false && mcpCapOf(options)) || (runtime.rest && restDataOffered(options)));

/**
 * check-config's line of what counts as closed for being one person's data (the Delivery and the
 * Upload section say it alike).
 * @param {Map<string, string>} personal  perPersonOf
 * @param {boolean} inline  inlineOffered
 */
export const perPersonItem = (personal, inline) => plain(`per person (counted as closed): ${[...[...personal].map(([id, why]) => `${id} (${why})`), ...(inline ? ["data sent in requests (inline:)"] : [])].join(", ")}`);

/** whyClosed's answer where no field closes the source (it is closed for its data per person). */
const NO_FIELD_REASON = "a field is not shown";

/**
 * The sources whose data belongs to one person, by id with why (registry.js counts them as closed
 * for links).
 * @param {import("../config.js").ServerOptions} options
 * @returns {Map<string, string>}
 */
export function perPersonOf(options) {
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
    return { items: [...said.items, ...kept.items], upgrade: [...said.upgrade, ...kept.upgrade] };
}

/**
 * How long reports stay on disk: a warning when the operator switched the age limit off
 * (output.maxAgeDays: 0; the default is 30 days) while some report can hold data about people, one
 * over a closed source (registry.js, closed for delivery) or over data sent in a request. Such
 * reports stay in output.dir until output.maxFiles or output.maxMb push them out, also after their
 * link expired (an expired link does not remove its file). Said whatever the links are (stdio,
 * output.baseUrl, the server's own).
 * @type {import("./index.js").Section}
 */
async function retention(options, registry, runtime) {
    const none = { items: [], upgrade: [] };
    if (!options.output?.dir) {
        return none;
    }
    if (options.output.maxAgeDays !== 0) {
        return none;
    }
    const closed = (await registry.check()).filter((s) => s.closed).map((s) => s.id);
    const inline = inlineOffered(options, runtime);
    if (!closed.length && !inline) {
        return none;
    }
    const what = [closed.length ? `reports over closed sources (${idsText(closed)})` : "", inline ? "data sent in requests" : ""].filter(Boolean).join(" and ");
    // a directory that holds the configuration or a source file refuses maxAgeDays (check/output.js): reports need their own first
    const dir = pathOf(options, options.output.dir);
    const real = await realpath(dir).catch(() => dir);
    const shared = (await ownFileDirs(options)).includes(real);
    const limit = `leave out output.maxAgeDays (the default deletes reports after ${OUTPUT_DEFAULTS.maxAgeDays} days) or set a number of days`;
    const fix = shared ? `give the reports a directory of their own and ${limit}` : limit;
    const maxFiles = options.output.maxFiles ?? OUTPUT_DEFAULTS.maxFiles;
    const maxMb = options.output.maxMb ?? OUTPUT_DEFAULTS.maxMb;
    return {
        items: [
            heading("Retention:"),
            plain(`no age limit: reports stay in output.dir until output.maxFiles (${maxFiles}) or output.maxMb (${bytesText(maxMb * 1_048_576)}) push them out, also after their link expired`),
            warning(`output.maxAgeDays is 0 (no age limit) and ${what} can hold data about people; ${fix}`)
        ],
        upgrade: []
    };
}

/** @type {import("./index.js").Section} */
async function links(options, registry, runtime) {
    const settings = settingsOf(options);
    const sources = await registry.check();
    const closed = sources.filter((s) => s.closed).map((s) => s.id);
    const open = sources.filter((s) => !s.closed).map((s) => s.id);
    const items = [];
    const upgrade = [];
    // open sources hidden by default: closed before this version, where reports get links
    const hiddenOpen = open.filter((id) => hiddenByDefault(options, id));
    if (hiddenOpen.length && (options.output?.baseUrl || runtime.http || uploadSettingsOf(options))) {
        upgrade.push({ text: `a source hidden by default whose listed fields are shown counts as open for links (${idsText(hiddenOpen)})`, anchor: "hidden-open" });
    }

    if (options.output?.baseUrl) {
        if (closed.length) {
            items.push(heading("Delivery:"), plain(`reports over closed sources (${idsText(closed)}): no address under output.baseUrl`), plain("anyone with it could open a report whose fields are withheld; the file is kept, and the person asks you for it", 2));
        }
        return { items, upgrade };
    }
    if (!runtime.http) {
        return { items, upgrade };
    }
    items.push(heading("Delivery:"));
    if (!settings.enabled) {
        items.push(plain(`download links: off (${options.output?.downloads?.enabled === false ? "output.downloads.enabled is false" : "no output.dir"})`));
        return { items, upgrade };
    }
    const host = options.http?.host ?? "127.0.0.1";
    const publicUrl = options.http?.publicUrl ? options.http.publicUrl.replace(/\/$/, "") : null;
    if (!publicUrl && !isLoopback(host)) {
        items.push(plain(`download links: none, the server listens on ${host} and http.publicUrl is not set (links would show an internal address)`), warning("set http.publicUrl to the address people open, and route /downloads to this service"));
        return { items, upgrade };
    }
    const base = publicUrl ?? `http://${host.includes(":") ? `[${host}]` : host}:${options.http?.port ?? 3333}`;
    items.push(plain(`download links: ${base}${DOWNLOADS_PATH}/<token>`));
    if (publicUrl) items.push(plain(`route ${DOWNLOADS_PATH} to this service`, 2));
    const insecure = insecurePublicHost(options);
    if (insecure) items.push(warning(insecureUrlText(insecure)));
    items.push(plain(`expire after ${settings.expiresMinutes} minute${settings.expiresMinutes === 1 ? "" : "s"}`, 2));
    if (settings.expiresMinutes < EXPIRES_MINUTES.short) {
        items.push(warning(`output.downloads.expiresMinutes is ${settings.expiresMinutes}: a person must read the answer, open the link and sign in within this time; ${EXPIRES_MINUTES.short} minutes or more is safer`));
    }
    // with an upload target whose links are bound, the store takes reports over closed sources: check/upload.js describes them
    const upload = uploadSettingsOf(options);
    const storeTakesClosed = Boolean(upload && upload.bind !== "none");
    const ownClosed = storeTakesClosed ? [] : closed;
    // closed by a field, and closed for being data of one person (some sources both)
    const personal = storeTakesClosed ? new Map() : perPersonOf(options);
    const byField = ownClosed.filter((id) => !personal.has(id) || whyClosed(options, id) !== NO_FIELD_REASON);
    const inline = !storeTakesClosed && inlineOffered(options, runtime);
    if (byField.length) {
        // why each is closed (registry.js closedReason); a deny list gets the way to plain links
        items.push(plain(`closed for plain links: ${idsText(byField.map((id) => `${id} (${whyClosed(options, id)})`))}`));
        if (byField.some((id) => closedReason(options, options.sources?.[id]?.policy)?.denyList)) {
            items.push(plain("for plain links, set the source's default to hide and list the fields to show", 2));
        }
    }
    if (personal.size || inline) {
        items.push(perPersonItem(personal, inline));
    }
    const restOnly = runtime.rest ? [plain("REST programs get them only with results: true", 2)] : [];
    if (ownClosed.length) {
        if (settings.bind === "signIn" && settings.signIn) {
            const claim = options.auth?.subjectClaim ?? "sub";
            items.push(
                plain(`reports over closed sources (${idsText(ownClosed)}): download links (signed in)`),
                plain(`register ${base}${CALLBACK_PATH} at the provider for the client ${settings.signIn.clientId}`, 2),
                plain(`it must give the same subject (claim ${claim}) as the MCP client`, 2),
                ...(settings.signIn.clientSecret ? [plain(`client secret from ${secretText(options, settings.signIn.clientSecret)}`, 2)] : []),
                ...restOnly
            );
        } else if (settings.bind === "once") {
            items.push(plain(`reports over closed sources (${idsText(ownClosed)}): one-time links`), ...restOnly, warning('one-time links: anyone who sees the link can use it once, including an assistant with a browser or code tool; use bind "signIn" where that matters'));
        } else {
            items.push(plain(`reports over closed sources (${idsText(ownClosed)}): no links (the file is kept; the person asks you for it)`), plain("set output.downloads.signIn for links only the person can open", 2));
        }
    }
    const ownOpen = upload ? [] : open;
    if (ownOpen.length) {
        items.push(plain(`reports over open sources (${idsText(ownOpen)}): plain links`));
    }
    // whether any report gets a link: the key and the stored names matter only then
    const linking = ownOpen.length > 0 || (ownClosed.length > 0 && settings.bind !== "none");
    const noLinks = { effect: "the server starts; reports get no download links until it can be read" };
    if (settings.key) {
        items.push(plain(`key from ${secretText(options, settings.key)}`));
        // a key made at start is said under Credentials
        if (!(await madeAtStart(settings.key, options))) {
            try {
                const value = await readSecret(settings.key, options, runtime.env);
                if (Buffer.byteLength(value) < KEY_MIN_BYTES) {
                    items.push(problem(`output.downloads.key is shorter than ${KEY_MIN_BYTES} bytes; make one with: ${makeKey("downloads")}`, noLinks));
                }
            } catch (e) {
                items.push(problem(`output.downloads.key: ${String(/** @type {any} */ (e)?.message ?? e)}`, noLinks));
            }
        }
        const readable = await secretFileWarning(settings.key, options, `the file ${settings.key.file} of output.downloads.key`);
        if (readable) {
            items.push(warning(readable));
        }
    } else if (linking) {
        items.push(warning("output.downloads.key is not set: links stop working on a restart and on another replica"));
    }
    if (settings.signIn?.clientSecret) {
        try {
            await readSecret(settings.signIn.clientSecret, options, runtime.env);
        } catch (e) {
            items.push(problem(`output.downloads.signIn.clientSecret: ${String(/** @type {any} */ (e)?.message ?? e)}`, { effect: "the server starts; download links (signed in) fail after the person signs in" }));
        }
        const readable = await secretFileWarning(settings.signIn.clientSecret, options, `the file ${settings.signIn.clientSecret.file} of output.downloads.signIn.clientSecret`);
        if (readable) {
            items.push(warning(readable));
        }
    }
    return { items, upgrade };
}
