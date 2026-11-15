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
 */

import { randomBytes } from "node:crypto";
import { writeOutput } from "./output.js";
import { filenameOf, linksOf } from "./downloads.js";

/**
 * @typedef {object} Delivered  what `output` of a result holds
 * @property {string} name  the stored name
 * @property {string} filename  the name the person sees
 * @property {string} [path]  a local server's full path
 * @property {string} [url]
 * @property {string} [expiresAt]  the server's own link: until when it works
 * @property {"none" | "once" | "signIn"} [bound]  the server's own link: how it is bound
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
