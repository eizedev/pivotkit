/*
 * How a written report reaches the person who asked for it. deliver() decides the link before the
 * file is written (a report that gets one of the server's own links is stored under the link's
 * random prefix), writes it, and says in `output` what the result tells: its stored name, the name the
 * person sees (filename), its path on a local server, its address, how long that works and how it is
 * bound, and `note`, one sentence on how to open it, which the result's message repeats.
 *
 * Which report gets which link (linkFor):
 *
 * | source | caller                                            | link                   |
 * | open   | any                                               | plain ("none")         |
 * | closed | signed in with a subject, bind "signIn"           | sign-in bound          |
 * | closed | bind "once" (the operator's explicit choice)      | one time               |
 * | closed | anything else; REST without results: true         | none: the file is kept |
 *
 * A closed source is one with a field or default at "values" or "summary" for someone, or a field
 * hidden for some callers and shown to others (registry.js closedReason), or one whose data belongs
 * to one person (data sent in the request, a source bound to a person, a code source with
 * perPerson; registry.js isClosedForDelivery); an unknown state counts as closed. output.baseUrl
 * gives an address only to reports over open sources.
 *
 * With an upload target (output.upload, upload.js) a report goes to the operator's store and the
 * result shows the store's link instead (storeFor):
 *
 * | source | store's links (upload.bind) | caller                         | delivery                         |
 * | open   | any                         | any                            | uploaded, the store's link        |
 * | closed | "once"                      | MCP; REST with results: true   | uploaded, the store's link        |
 * | closed | "signIn"                    | with a subject; REST as above  | uploaded, the store's link        |
 * | closed | "none"                      | any                            | not uploaded: the table above     |
 *
 * A report over a closed source never goes to a store whose links anyone can open, and a schedule
 * draft stays in the output directory (the host approves it there). An upload that fails answers
 * UPLOAD_FAILED; the file stays in the output directory.
 */

import { createHash, randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { OperationError } from "pivotkit-report/operations";
import { isExternalCaller } from "./auth.js";
import { firstIssuerOf, issuersOf } from "./issuer.js";
import { outputDir, writeOutput } from "./output.js";
import { linksOf, subjectBindingOf } from "./downloads.js";
import { filenameOf } from "./downloads/files.js";
import { uploadSettingsOf } from "./options/upload.js";
import { requestId, errorDetails } from "./request-id.js";
import { UploadFailure, upload } from "./upload.js";

/**
 * @typedef {object} Delivered  what `output` of a result holds
 * @property {string} name  the stored name
 * @property {string} filename  the name the person sees
 * @property {string} [path]  a local server's full path
 * @property {string} [url]
 * @property {string} [expiresAt]  until when the link works (the store's link: when the store said so)
 * @property {"none" | "once" | "signIn"} [bound]  how the link is bound: the server's own link's binding, or the store's as the operator declared it
 * @property {string} [note]  how to open it, one sentence
 * @property {string} mediaType
 */

/** What the result says of a report over a closed source that gets no link. */
export const NO_LINK_NOTE = "The report is saved on the server; ask the operator how to open it.";

/**
 * Which of the server's own links a report gets, or null.
 * @param {{ bind: "signIn" | "once" | "none" } | null} links  linksOf(context)
 * @param {{ closed: boolean, surface: "mcp" | "rest", results: boolean, subject: string | null | undefined }} how
 * @returns {"none" | "once" | "signIn" | null}
 */
export function linkFor(links, { closed, surface, results, subject }) {
    if (!links) {
        return null;
    }
    if (!closed) {
        return "none";
    }
    // a program that could use the link itself gets one only where it may take the file itself
    if (surface === "rest" && !results) {
        return null;
    }
    if (links.bind === "signIn") {
        return subject ? "signIn" : null;
    }
    return links.bind === "once" ? "once" : null;
}

/**
 * Whether a report goes to the upload target (and the result shows the store's link): never a
 * draft; a report over an open source always; over a closed source only where the store's links are
 * bound (once, or signIn for a caller with an issuer and subject the store can check, as linkFor),
 * and on REST only for a caller that may take results itself.
 * @param {{ bind: "none" | "once" | "signIn" } | null} store  uploadSettingsOf(options)
 * @param {{ closed: boolean, surface: "mcp" | "rest", results: boolean, draft: boolean, signedIn?: boolean }} how  signedIn: the caller has an issuer and subject
 */
export function storeFor(store, { closed, surface, results, draft, signedIn = false }) {
    if (!store || draft) {
        return false;
    }
    if (!closed) {
        return true;
    }
    if (store.bind === "none" || (store.bind === "signIn" && !signedIn)) {
        return false;
    }
    return surface !== "rest" || results;
}

/**
 * Whether a caller can open a report bound to its sign-in (a signIn link or store): an issuer and a
 * subject the server's own sign-in can check, which signs in at the server's first issuer
 * (options/downloads.js). A person of an external issuer, or of another of auth.issuers, has both
 * but signs in elsewhere, so a bound report would reach nobody or the wrong check: such a caller is
 * not signed in here. With one issuer every verified caller is that issuer's.
 * @param {import("./registry.js").Caller | undefined} caller
 * @param {{ auth?: import("./config.js").AuthOptions } | undefined} options
 */
export const signedInForDelivery = (caller, options) => Boolean(caller?.subject && caller?.issuer) && (issuersOf(options ?? {}).length < 2 || caller?.issuer === firstIssuerOf(options ?? {})) && !isExternalCaller(/** @type {any} */ (caller));

/** "it works for 60 minutes", in the note's words. */
const forMinutes = (minutes) => `${minutes} minute${minutes === 1 ? "" : "s"}`;

/** The note of a link by its binding. */
function noteOf(bound, minutes) {
    if (bound === "signIn") {
        return `Open the link in your browser and sign in; it works for ${forMinutes(minutes)}.`;
    }
    if (bound === "once") {
        return `Open the link in your browser and download the report; the link works once, for ${forMinutes(minutes)}.`;
    }
    return `Open the link in your browser; it works for ${forMinutes(minutes)}.`;
}

/**
 * Writes a report (or a schedule draft) into the output directory and delivers it to a caller.
 * @param {any} context
 * @param {{ bytes: Uint8Array, mediaType: string, extension: string, name: string }} file
 * @param {{ caller: import("./registry.js").Caller, sourceClosed: boolean | undefined, surface: "mcp" | "rest", policy: import("./policy.js").Policy, draft?: boolean }} how
 *   sourceClosed: registry.js isClosedForDelivery of the source (a field at "values" or "summary", or hidden for some callers only, under the server's, the source's or any profile's policy; or its data is per person); undefined counts as closed
 * @returns {Promise<Delivered | null>}  null: no output directory
 */
export async function deliver(context, file, how) {
    const closed = how.sourceClosed !== false;
    const store = uploadSettingsOf(context.options ?? {});
    const signedIn = signedInForDelivery(how.caller, context.options);
    if (storeFor(store, { closed, surface: how.surface, results: how.policy?.results === true, draft: how.draft === true, signedIn })) {
        // a signIn store gets the person's binding (the HMAC a sign-in link holds, never the subject), so it can scope the report
        const subject = store?.bind === "signIn" && signedIn ? await subjectBindingOf(context, /** @type {string} */ (how.caller.issuer), /** @type {string} */ (how.caller.subject)) : null;
        return toStore(context, file, /** @type {import("./options/upload.js").UploadSettings} */ (store), subject);
    }
    const links = linksOf(context);
    const caller = how.caller;
    const wanted = linkFor(links, { closed, surface: how.surface, results: how.policy?.results === true, subject: signedIn ? caller.subject : null });
    // the key is read before the file is written: a report whose link cannot be made keeps its plain name
    const sign = wanted && links ? await links.signer() : null;
    const bound = sign ? wanted : null;
    const n = bound ? randomBytes(16).toString("base64url") : null;
    const written = await writeOutput(context, file, how.draft === true, n ? { prefix: `${n}-` } : {});
    if (!written) {
        return null;
    }
    const { url: baseUrlAddress, ...kept } = written;
    /** @type {Delivered} */
    const out = { ...kept, filename: filenameOf(written.name) };
    const link = sign && bound && n ? sign({ n, bound, subject: caller?.subject, issuer: caller?.issuer }) : null;
    if (link && links) {
        return { ...out, url: link.url, expiresAt: link.expiresAt, bound: /** @type {"none" | "once" | "signIn"} */ (bound), note: noteOf(/** @type {string} */ (bound), links.expiresMinutes) };
    }
    if (baseUrlAddress && !closed) {
        return { ...out, url: baseUrlAddress };
    }
    // no link: over a closed source, or one that could not be made (its key unreadable), the person
    // asks the operator (a local server shows the path)
    return (closed || wanted) && !out.path ? { ...out, note: NO_LINK_NOTE } : out;
}

/** The note of a store's link by its binding, and when it expires where the store said so. */
function storeNoteOf(bound, expiresAt) {
    const until = expiresAt ? `; it works until ${expiresAt.replace("T", " ").replace("Z", " UTC")}` : "";
    if (bound === "signIn") {
        return `Open the link in your browser and sign in at the store${until}.`;
    }
    if (bound === "once") {
        return `Open the link in your browser and download the report; the link works once${until}.`;
    }
    return `Open the link in your browser${until}.`;
}

/** The guardedFetch codes of an upload's request and the cause each is in the log (as upstreamCauseOf's words). */
const UPLOAD_FETCH_CAUSES = Object.freeze({ TIMEOUT: "timeout", NETWORK: "connection", REFUSED_ADDRESS: "blocked_address", IP_LITERAL: "blocked_address", NOT_HTTPS: "blocked_address", REDIRECT: "http_status", TOO_LARGE: "bad_body", BAD_ENCODING: "bad_body" });

/**
 * The `cause` of a failed upload, from its code (upload.js UploadFailure): the words of a backend's
 * failures where they fit, upload_failed otherwise.
 * @param {string} code
 */
export function uploadCauseOf(code) {
    if (code === "TIMEOUT") {
        return "timeout";
    }
    if (code === "SECRET") {
        return "setup";
    }
    if (/^(?:PRESIGN|STORE)_\d{3}$/.test(code)) {
        return "http_status";
    }
    if (/^(?:PRESIGN_ANSWER|STORE_ANSWER|UPLOAD_URL_|UPLOAD_HEADERS|LINK_)/.test(code)) {
        return "bad_body";
    }
    const fetched = /^(?:PRESIGN|STORE)_([A-Z_]+)$/.exec(code)?.[1];
    return (fetched && UPLOAD_FETCH_CAUSES[/** @type {keyof typeof UPLOAD_FETCH_CAUSES} */ (fetched)]) || "upload_failed";
}

/** The store's or presign service's status in a failure's code (PRESIGN_503, STORE_403), as upstreamStatus. */
const uploadStatusOf = (code) => {
    const status = /^(?:PRESIGN|STORE)_(\d{3})$/.exec(code)?.[1];
    return status ? { upstreamStatus: Number(status) } : {};
};

/**
 * Writes a report into the output directory, uploads it to the operator's store and gives the
 * store's link. Throws UPLOAD_FAILED (the file stays in the output directory) with the request id.
 * @param {any} context
 * @param {{ bytes: Uint8Array, mediaType: string, extension: string, name: string }} file
 * @param {import("./options/upload.js").UploadSettings} store
 * @param {string | null} subject  the person's binding for the presign service
 * @returns {Promise<Delivered | null>}
 */
async function toStore(context, file, store, subject) {
    const written = await writeOutput(context, file, false);
    if (!written) {
        return null;
    }
    const filename = filenameOf(written.name);
    const path = join(/** @type {string} */ (outputDir(context)), written.name);
    const started = Date.now();
    const said = { requestId: requestId() ?? undefined, bytes: file.bytes.length, bind: store.bind };
    let link;
    try {
        link = await upload(context, { path, bytes: file.bytes.length }, { filename, name: file.name, extension: file.extension, mediaType: file.mediaType, sha256: createHash("sha256").update(file.bytes).digest("hex"), ...(subject ? { subject } : {}) });
    } catch (e) {
        const failure = e instanceof UploadFailure ? e : new UploadFailure("INTERNAL", false);
        // the code only: never an address, a header or what the store answered
        context.log.warn(`upload failed: ${failure.code}; the report stays in the output directory${store.keepLocal ? "" : " until it is cleaned up"}`, { ...said, upload: failure.code, retryable: failure.retryable, ms: Date.now() - started, cause: uploadCauseOf(failure.code), ...uploadStatusOf(failure.code), upstreamMs: Date.now() - started });
        // the caller gets a fixed text and the request id: the code would tell it about the store's setup
        throw new OperationError("UPLOAD_FAILED", "the report could not be stored", errorDetails({ retryable: failure.retryable }));
    }
    context.log.info("report uploaded", { ...said, ms: Date.now() - started });
    /** @type {Delivered} */
    const out = { ...written, filename, url: link.url, ...(link.expiresAt ? { expiresAt: link.expiresAt } : {}), bound: store.bind, note: storeNoteOf(store.bind, link.expiresAt) };
    if (!store.keepLocal) {
        // the store holds it now; a copy that cannot be removed is cleaned up with the old reports
        await unlink(path).catch(() => context.log.warn("upload: the local copy could not be removed; it is cleaned up with the old reports", { requestId: said.requestId }));
        delete out.path;
    }
    return out;
}

/**
 * The MCP resource_link of a delivered report, or null without an address. Its size only for an
 * open source: the size of a report the assistant was not shown is withheld (render_view's withheld "bytes").
 * Its title is the report's own ("Sales by product"), its name the file's ("sales-by-product.xlsx").
 * @param {Delivered | null} output
 * @param {{ bytes: number, closed: boolean, title?: string }} how  title: the report's (the file's name before fileSlug); default the file's name without its extension
 */
export function resourceLinkOf(output, { bytes, closed, title: given }) {
    if (!output?.url) {
        return null;
    }
    // only the output's own extension comes off ("Q3.2026.xlsx" keeps "Q3.2026")
    const title = given?.trim() || output.filename.replace(/\.(report\.json|xlsx|html|csv|json|svg)$/i, "");
    return { type: "resource_link", uri: output.url, name: output.filename, title, mimeType: output.mediaType, ...(closed ? {} : { size: bytes }), annotations: { audience: ["user"] } };
}
