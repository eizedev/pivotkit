/*
 * Branding for deployments under the operator's own name (options/branding.js has the keys):
 *
 * - `branding.name`: the name end users and clients see. The download pages ("<name> report"), the
 *   MCP server's title and its page, the OpenAPI title and the resource names ("<name> REST") carry
 *   it. Identifiers stay pivotkit's: tool names, the view format, cookies, variables, log fields.
 * - `branding.docsUrl`: the base of every documentation link the server hands out (problem `type`,
 *   the metadata documents, the OpenAPI document, the page, check-config). `null`: no link at all;
 *   a problem's `type` is then "about:blank" (RFC 9457 4.2.1), its `code` stays.
 * - `branding.icon`: a PNG, read once at start: the MCP server's `serverInfo.icons`, the page's
 *   favicon, and `/icon.png` without sign-in.
 * - `http.page.url`: `/` (and a browser that opens /mcp) is sent there instead of the built-in page,
 *   on a REST-only server too.
 *
 * Every value is a string or a link the server writes; nothing here requests another server.
 */

import { readFile, stat } from "node:fs/promises";
import { pathOf } from "./config.js";
import { ConfigError } from "./options/shared.js";
import { DOCS_SITE, docsOf } from "./options/branding.js";

export { DOCS_SITE, docsLink, docsOf } from "./options/branding.js";

/** The name when the operator sets none. */
export const DEFAULT_NAME = "pivotkit";

/** The largest icon, in bytes: it goes into every MCP initialize answer as a data: address. */
export const ICON_MAX_BYTES = 64 * 1024;

/** The route of the icon. */
export const ICON_PATH = "/icon.png";

/** The first eight bytes of every PNG file. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A link to pivotkit's site in a text, with the words that lead to it ("See", "Docs:"). */
const SITE_LINK = new RegExp(`(\\s*(?:See|Docs:)\\s+)?${DOCS_SITE.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(\\S*)`, "g");

/**
 * A text that links pivotkit's site (a schema's description) with its links under the operator's
 * documentation: the base swapped, or each link with its leading words taken out (docs null).
 * @param {string} text
 * @param {string | null} docs  docsOf's
 */
export const withDocs = (text, docs) => (docs === DOCS_SITE ? text : text.replace(SITE_LINK, (_m, lead = "", path) => (docs === null ? "" : `${lead}${docs}${path}`)));

/**
 * The name as a short identifier: lower-case letters, digits and dashes (a client's server key on the
 * page, the realm of a challenge). A name with none of these is pivotkit's.
 * @param {string} name
 */
export function slugOf(name) {
    const slug = name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/, "");
    return slug || DEFAULT_NAME;
}

/**
 * @typedef {object} Branding
 * @property {string} name  what end users see (branding.name, else "pivotkit")
 * @property {string} slug  the name as an identifier (slugOf)
 * @property {string | null} docs  the documentation's base (docsOf)
 * @property {{ bytes: Buffer, src: string, width: number, height: number, path: string } | null} icon  src: a data: address
 * @property {string | null} pageUrl  where / goes (http.page.url)
 */

/**
 * Whether bytes are a PNG within the cap: its size from the IHDR chunk, or the problem.
 * @param {Buffer} bytes
 * @returns {{ problem: string } | { width: number, height: number }}
 */
export function pngOf(bytes) {
    if (bytes.length > ICON_MAX_BYTES) {
        return { problem: `${bytes.length} bytes, more than the ${ICON_MAX_BYTES / 1024} KiB an icon may have` };
    }
    // the signature, then the IHDR chunk: its length (13), its type, width and height
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString("latin1", 12, 16) !== "IHDR") {
        return { problem: "not a PNG file (the icon must be a PNG)" };
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * The icon's file: its bytes and size, or a ConfigError that says what is wrong with it.
 * @param {import("./config.js").ServerOptions} options
 * @returns {Promise<Branding["icon"]>}
 */
export async function iconOf(options) {
    const given = options.branding?.icon;
    if (given === undefined) {
        return null;
    }
    const path = pathOf(options, given);
    const info = await stat(path).catch((e) => e);
    if (info instanceof Error) {
        throw new ConfigError(`branding.icon: ${/** @type {any} */ (info).code === "ENOENT" ? "not found" : "cannot be read"} (${given})`);
    }
    if (!info.isFile()) {
        throw new ConfigError(`branding.icon: not a file (${given})`);
    }
    if (info.size > ICON_MAX_BYTES) {
        throw new ConfigError(`branding.icon: ${info.size} bytes, more than the ${ICON_MAX_BYTES / 1024} KiB an icon may have (${given})`);
    }
    const bytes = await readFile(path).catch(() => {
        throw new ConfigError(`branding.icon: cannot be read (${given})`);
    });
    const png = pngOf(bytes);
    if ("problem" in png) {
        throw new ConfigError(`branding.icon: ${png.problem} (${given})`);
    }
    return { bytes, src: `data:image/png;base64,${bytes.toString("base64")}`, width: png.width, height: png.height, path };
}

/**
 * The branding of a configuration, its icon read (createContext calls it once at start).
 * @param {import("./config.js").ServerOptions} options
 * @returns {Promise<Branding>}
 */
export async function brandingOf(options) {
    const name = options.branding?.name ?? DEFAULT_NAME;
    const page = options.http?.page;
    return { name, slug: slugOf(name), docs: docsOf(options), icon: await iconOf(options), pageUrl: typeof page === "object" && page?.url ? new URL(page.url).href : null };
}

/** The branding of a context, or the defaults for a context made without one (a host's own). */
export const brandingOfContext = (context) => /** @type {Branding} */ (context?.branding ?? { name: DEFAULT_NAME, slug: DEFAULT_NAME, docs: DOCS_SITE, icon: null, pageUrl: null });

/**
 * The answers of the branding's own routes, for a request that passed the Host check: the icon at
 * /icon.png, and / sent to the operator's page (http.page.url). Null for any other request.
 * @param {Branding} branding
 * @param {Request} request
 * @returns {Response | null}
 */
export function brandingAnswer(branding, request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
        return null;
    }
    const path = new URL(request.url).pathname;
    if (path === ICON_PATH && branding.icon) {
        return new Response(request.method === "HEAD" ? null : new Uint8Array(branding.icon.bytes), { headers: { "content-type": "image/png", "cache-control": "max-age=3600", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "cross-origin" } });
    }
    if (path === "/" && branding.pageUrl) {
        return pageRedirect(branding);
    }
    return null;
}

/** The answer that sends a browser to the operator's page. */
export const pageRedirect = (branding) => new Response(null, { status: 302, headers: { location: /** @type {string} */ (branding.pageUrl), "cache-control": "no-store" } });
