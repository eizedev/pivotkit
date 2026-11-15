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
 * A closed source is one with a field that is not "show" for someone; an unknown state counts as
 * closed. output.baseUrl gives an address only to reports over open sources.
 *
 * With an upload target (output.upload, upload.js) a report goes to the operator's store and the
 * result shows the store's link instead (storeFor):
 *
 * | source | store's links (upload.bind) | caller                         | delivery                         |
 * | open   | any                         | any                            | uploaded, the store's link        |
 * | closed | "once" or "signIn"          | REST only with results: true   | uploaded, the store's link        |
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
import { outputDir, writeOutput } from "./output.js";
import { filenameOf, linksOf } from "./downloads.js";
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
 * bound (once or signIn), and on REST only for a caller that may take results itself.
 * @param {{ bind: "none" | "once" | "signIn" } | null} store  uploadSettingsOf(options)
 * @param {{ closed: boolean, surface: "mcp" | "rest", results: boolean, draft: boolean }} how
 */
export function storeFor(store, { closed, surface, results, draft }) {
    if (!store || draft) {
        return false;
    }
    if (!closed) {
        return true;
    }
    return store.bind !== "none" && (surface !== "rest" || results);
}

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
 *   sourceClosed: a field of the source is not "show" for someone (the server's, the source's or any profile's policy); undefined counts as closed
 * @returns {Promise<Delivered | null>}  null: no output directory
 */
export async function deliver(context, file, how) {
    const closed = how.sourceClosed !== false;
    const store = uploadSettingsOf(context.options ?? {});
    if (storeFor(store, { closed, surface: how.surface, results: how.policy?.results === true, draft: how.draft === true })) {
        return toStore(context, file, /** @type {import("./options/upload.js").UploadSettings} */ (store));
    }
    const links = linksOf(context);
    const caller = how.caller;
    const wanted = linkFor(links, { closed, surface: how.surface, results: how.policy?.results === true, subject: caller?.subject && caller?.issuer ? caller.subject : null });
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

/**
 * Writes a report into the output directory, uploads it to the operator's store and gives the
 * store's link. Throws UPLOAD_FAILED (the file stays in the output directory) with the request id.
 * @param {any} context
 * @param {{ bytes: Uint8Array, mediaType: string, extension: string, name: string }} file
 * @param {import("./options/upload.js").UploadSettings} store
 * @returns {Promise<Delivered | null>}
 */
async function toStore(context, file, store) {
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
        link = await upload(context, { path, bytes: file.bytes.length }, { filename, name: file.name, extension: file.extension, mediaType: file.mediaType, sha256: createHash("sha256").update(file.bytes).digest("hex") });
    } catch (e) {
        const failure = e instanceof UploadFailure ? e : new UploadFailure("INTERNAL", false);
        // the code only: never an address, a header or what the store answered
        context.log.warn(`upload failed: ${failure.code}; the report stays in the output directory${store.keepLocal ? "" : " until it is cleaned up"}`, { ...said, upload: failure.code, retryable: failure.retryable, ms: Date.now() - started });
        throw new OperationError("UPLOAD_FAILED", `the report could not be stored (${failure.code})`, errorDetails({ retryable: failure.retryable }));
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
 * @param {Delivered | null} output
 * @param {{ bytes: number, closed: boolean }} how
 */
export function resourceLinkOf(output, { bytes, closed }) {
    if (!output?.url) {
        return null;
    }
    // only the output's own extension comes off ("Q3.2026.xlsx" keeps "Q3.2026")
    const title = output.filename.replace(/\.(report\.json|xlsx|html|csv|json|svg)$/i, "");
    return { type: "resource_link", uri: output.url, name: output.filename, title, mimeType: output.mediaType, ...(closed ? {} : { size: bytes }), annotations: { audience: ["user"] } };
}
