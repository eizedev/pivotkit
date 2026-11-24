/*
 * The options of branding (branding.js) and of the page at / they shape:
 *
 *   "branding": { "name": "Team reports", "docsUrl": null, "icon": "team-icon.png" }
 *   "http": { "page": { "url": "https://intranet.example/reports" } }
 *
 * - `branding.name`: 1 to 60 characters, no control or direction characters.
 * - `branding.docsUrl`: an http:// or https:// address without query or fragment, the base the
 *   documentation's paths are added to; `null` for no documentation links.
 * - `branding.icon`: a PNG file of at most 64 KiB, relative to the configuration file. It is read at
 *   start (branding.js iconOf), so a missing file stops the start.
 * - `http.page`: the quick-start page. `false` turns it off, `{ "sources": true }` lists the source
 *   ids, `{ "url": "..." }` sends / to the operator's page instead (an absolute http:// or https://
 *   address). `sources` and `url` exclude each other: the redirect shows no page.
 *
 * Every key is optional; without them every surface says pivotkit and links pivotkit's site. A key is
 * declared here once, never also in config.js or another fragment (options/index.js refuses a second
 * declaration). `http.page` is the exception: config.js declares it with this file's schema (PAGE).
 */

import { createRequire } from "node:module";
import { ConfigError } from "./shared.js";

export const NAME = "branding";

/** The documentation site: the origin of this package's homepage ("https://pivotkit.eize.dev/"). */
export const DOCS_SITE = new URL("/", createRequire(import.meta.url)("../../package.json").homepage).href;

/** The longest name. */
export const NAME_MAX = 60;

/** Control, format (direction marks among them) and line separator characters: never in a name. */
const NOT_IN_NAME = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** What is wrong with a name. */
function nameProblems(value) {
    if (typeof value !== "string") {
        return ["must be a text"];
    }
    if (!value.trim() || value.length > NAME_MAX) {
        return [`1 to ${NAME_MAX} characters`];
    }
    return NOT_IN_NAME.test(value) ? ["no control or direction characters"] : [];
}

/**
 * What is wrong with an address a browser or a client is sent to: absolute, http:// or https://,
 * no user name or password; `base` also without query and fragment (paths are added to it).
 * @param {unknown} value
 * @param {{ base?: boolean }} [how]
 */
function addressProblems(value, { base = false } = {}) {
    const words = base ? "an http:// or https:// address without query or fragment, or null for no documentation links" : "an absolute http:// or https:// address";
    // spaces, quotes, angle brackets and control characters: never in an address the server writes
    // into a header or a link as it is
    if (typeof value !== "string" || /[\s"'<>\\\p{Cc}]/u.test(value)) {
        return [`must be ${words}`];
    }
    let url;
    try {
        url = new URL(value);
    } catch {
        return [`must be ${words}`];
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || (base && (url.search || url.hash || value.includes("?") || value.includes("#")))) {
        return [`must be ${words}`];
    }
    return [];
}

/**
 * What is wrong with a value of branding.docsUrl (none for null).
 * @param {unknown} value
 */
export const docsUrlProblems = (value) => (value === null ? [] : addressProblems(value, { base: true }));

export const KEYS = Object.freeze({
    top: {
        branding: {
            object: {
                name: { custom: nameProblems },
                docsUrl: { custom: docsUrlProblems },
                icon: "string"
            }
        }
    }
});

/**
 * The schema of `http.page`. config.js declares the key among http's own, where it was first (its
 * place in the table and in messages stays); its rules are this file's.
 */
export const PAGE = Object.freeze({ or: [{ const: false }, { const: true }, { object: { sources: "boolean", url: { custom: (/** @type {unknown} */ v) => addressProblems(v) } } }] });

/**
 * The base of the documentation links: the operator's `branding.docsUrl` with a trailing slash,
 * null for none, or pivotkit's site when it is not set. It reads a value the checks have not seen
 * yet as pivotkit's site, so a message written before them can use it.
 * @param {{ branding?: { docsUrl?: string | null } } | undefined} options
 * @returns {string | null}
 */
export function docsOf(options) {
    const given = options?.branding?.docsUrl;
    if (given === null) {
        return null;
    }
    if (typeof given !== "string" || addressProblems(given, { base: true }).length) {
        return DOCS_SITE;
    }
    // the parser's form: what a header or a link carries is the address as the URL standard writes it
    const href = new URL(given).href;
    return href.endsWith("/") ? href : `${href}/`;
}

/**
 * A documentation link: the base and a path of pivotkit's site ("reference/rest/#errors"), or null
 * when the operator set no documentation.
 * @param {string | null} docs  docsOf's
 * @param {string} path  relative, without a leading slash
 */
export const docsLink = (docs, path) => (docs === null ? null : `${docs}${path}`);

/**
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    const page = options.http?.page;
    if (page && typeof page === "object" && page.url !== undefined && page.sources === true) {
        throw new ConfigError("http.page: give url (/ goes to your page) or sources (the built-in page lists them), not both");
    }
}
