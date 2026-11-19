/*
 * check-config's sections, one per concern (check/<name>.js; a feature's section has the name of its
 * options fragment in options/index.js). check.js runs them in SECTIONS' order and check/format.js
 * puts what they say on the page:
 *
 * - `items`: what the section found (format.js heading, plain, warning, problem). A section starts
 *   with its own heading (`Sources (2):`, `Auth: oauth`) and gives its facts one per item. A PROBLEM
 *   says whether it stops the start (the same check as createContext) or what does not work while
 *   the server runs; format.js prints every PROBLEM first, under the verdict.
 * - `upgrade`: a short name per change of this version that applies to the loaded configuration,
 *   with the anchor of its section on the upgrading page (format.js Upgrade); check-config closes
 *   with them, one per line, each with its address.
 *
 * `runtime` is check-config's own (`http`, `env`, `name`, `tokenEnv`, `rest`, `mcp`, `discover`) plus
 * `columns` and `everyColumn`, which check/sources.js fills with the column names and statistics of
 * each file source it read (by id), so no later section reads a file again.
 */

import * as sources from "./sources.js";
import * as http from "./http.js";
import * as code from "./code.js";
import * as inline from "./inline.js";
import * as output from "./output.js";
import * as downloads from "./downloads.js";
import * as upload from "./upload.js";
import * as access from "./access.js";
import * as credentials from "./credentials.js";
import * as signed from "./signed.js";
import * as external from "./external.js";
import * as issuer from "./issuer.js";
import * as operator from "./operator.js";
import * as profiles from "./profiles.js";
import * as records from "./records.js";
import * as rest from "./rest.js";
import * as log from "./log.js";
import * as branding from "./branding.js";
import { docsLink } from "../options/branding.js";

/**
 * @typedef {object} SectionRuntime
 * @property {boolean} http
 * @property {Record<string, string | undefined>} env
 * @property {string} name
 * @property {string} tokenEnv
 * @property {boolean} rest
 * @property {boolean} [mcp]  the MCP server is served (false: a REST-only server)
 * @property {(issuer: string, rules: import("../issuer.js").IssuerRules, how: { signal: AbortSignal }) => Promise<unknown>} [discover]  loads an issuer's metadata (auth.js discover); without it no issuer is asked
 * @property {import("../state.js").StatePlan | null} [state]  over HTTP: the state directory's defaults and the secrets made at start (state.js planState)
 * @property {string | null} [unusedToken]  over HTTP: the warning for a token's variable set while auth stays none (state.js unusedTokenText)
 * @property {Map<string, { names: string[], stats: any, unnamed?: string[] }>} columns  filled by check/sources.js
 * @property {Map<string, string> | null} [everyColumn]  every column of every source by its policy key (null: not all known); set by check/sources.js
 */

/**
 * @typedef {(options: import("../config.js").ServerOptions, registry: any, runtime: SectionRuntime) => Promise<{ items: import("./format.js").Item[], upgrade: import("./format.js").Upgrade[] }>} Section
 */

/**
 * The page that explains the changes of a version under the documentation's base (branding.docsUrl), or null without documentation.
 * @param {string | null} docs  branding.js docsOf's
 */
export const upgradingUrlOf = (docs) => docsLink(docs, "getting-started/upgrading/");

/**
 * In the order check-config prints them: the data (sources, HTTP and code sources, data in the
 * request), where reports go and who gets them (output, delivery, upload), who may call (address and
 * auth, the requests to the issuer, audit, profiles, the rows route, REST), the log, and the name and
 * links the server shows (branding).
 * @type {ReadonlyArray<{ name: string, section: Section }>}
 */
export const SECTIONS = Object.freeze(
    Object.entries({ sources, http, code, inline, output, downloads, upload, access, credentials, signed, external, issuer, operator, profiles, records, rest, log, branding }).map(([name, module]) => Object.freeze({ name, section: module.section }))
);

/**
 * Runs the sections in order: each one's items, and every upgrade name.
 * @param {ReadonlyArray<{ name: string, section: Section }>} sections
 * @param {import("../config.js").ServerOptions} options
 * @param {any} registry
 * @param {any} runtime
 * @returns {Promise<{ sections: import("./format.js").Item[][], upgrade: import("./format.js").Upgrade[] }>}
 */
export async function runSections(sections, options, registry, runtime) {
    const out = { sections: /** @type {import("./format.js").Item[][]} */ ([]), upgrade: /** @type {import("./format.js").Upgrade[]} */ ([]) };
    for (const { section } of sections) {
        const said = await section(options, registry, runtime);
        out.sections.push(said.items);
        out.upgrade.push(...said.upgrade);
    }
    return out;
}
