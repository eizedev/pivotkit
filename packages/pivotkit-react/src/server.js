/*
 * The `server` connection's first-load part (record 0021): its types and loadServer. Everything else
 * loads on first use (server-module.js): what to ask the server for (server-request.js), the rows'
 * state (use-server-rows.js, server-report.jsx), the network code, the texts and the states' parts. A
 * page without a server loads none of it. A copied link carries the parameters with share.js.
 */

import { lazy } from "./lazy.js";

/** The network code, the states' texts and parts, loaded once (lazy.js). */
const mod = lazy(() => import("./server-module.js"));

/** Loads the server's module; a failed import is tried again on the next call. */
export const loadServer = mod.load;

/** The server's module when it is here already, else null: a second report with a server starts with it. */
export const serverNow = mod.now;

/**
 * @typedef {object} ServerConnection  the `server` prop
 * @property {string} url  the server's address, as the page's own configuration has it (https://reports.example.com)
 * @property {string} source  the source id whose rows the report shows
 * @property {(request: TokenRequest) => unknown} getToken  gives a browser token for the request:
 *   its text, or the exchange route's answer (`{ token, expiresAt }`), or a promise of either. It is
 *   called at the start and again when the token expired. Nothing (null, "") means the person must
 *   sign in again. An error with a `problem` (the exchange route's answer) says why it was refused
 * @property {string[]} [allowParams]  the names of the source's parameters the page's query string may set
 * @property {string | number} [refreshKey]  a new value reads the rows again; the report keeps showing
 *   the rows it has until the new ones are there
 */

/**
 * @typedef {object} TokenRequest  what getToken() gets: what the exchange route takes
 * @property {string} source
 * @property {Record<string, string>} params
 * @property {string} [access]  the link's pk-access value, where the page's address has one
 */

/**
 * @typedef {object} ServerRequest  what the report asks the server for
 * @property {string} base  the server's address, without a slash at the end
 * @property {string} source
 * @property {Record<string, string>} params
 * @property {string | undefined} access
 * @property {string} key  the request as text: a new key reads the rows again
 */
