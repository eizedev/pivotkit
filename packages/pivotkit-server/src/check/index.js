/*
 * check-config's sections, one per feature (check/<feature>.js, the same names as the options'
 * fragments in options/index.js). check.js prints its own lines first, then every section's:
 *
 * - `lines`: printed as they are; a section writes its own heading (`Downloads: ...`, as `Output:` and
 *   `Auth:`) and indents what belongs to it by two spaces. A line that keeps the server from starting
 *   or a source from working starts with `PROBLEM:` and is counted in `problems`; a warning starts
 *   with `warning:` and is not counted.
 * - `upgrade`: one sentence per change of this version that applies to the loaded configuration;
 *   check-config closes with them under "New in this version", and prints no such block without one.
 *
 * `runtime` is check-config's own (`http`, `env`, `name`, `tokenEnv`, `rest`) plus `columns`, the
 * column names and statistics of each file source it read (by id), so no section reads a file again.
 */

import * as inline from "./inline.js";
import * as downloads from "./downloads.js";
import * as http from "./http.js";
import * as code from "./code.js";
import * as operator from "./operator.js";
import * as upload from "./upload.js";
import * as issuer from "./issuer.js";

/**
 * @typedef {object} SectionRuntime
 * @property {boolean} http
 * @property {Record<string, string | undefined>} env
 * @property {string} name
 * @property {string} tokenEnv
 * @property {boolean} rest
 * @property {boolean} [mcp]  the MCP server is served (false: a REST-only server)
 * @property {ReadonlyMap<string, { names: string[], stats: any }>} columns
 */

/**
 * @typedef {(options: import("../config.js").ServerOptions, registry: any, runtime: SectionRuntime) => Promise<{ lines: string[], problems: number, upgrade: string[] }>} Section
 */

/** The page that explains the changes of a version. */
export const UPGRADING_URL = "https://pivotkit.eize.dev/getting-started/upgrading/";

/** @type {ReadonlyArray<{ name: string, section: Section }>} in the order check-config prints them */
export const SECTIONS = Object.freeze(
    Object.entries({ inline, downloads, http, code, operator, upload, issuer }).map(([name, module]) => Object.freeze({ name, section: module.section }))
);

/**
 * Runs the sections in order and joins what they say.
 * @param {ReadonlyArray<{ name: string, section: Section }>} sections
 * @param {import("../config.js").ServerOptions} options
 * @param {any} registry
 * @param {any} runtime
 * @returns {Promise<{ lines: string[], problems: number, upgrade: string[] }>}
 */
export async function runSections(sections, options, registry, runtime) {
    const out = { lines: /** @type {string[]} */ ([]), problems: 0, upgrade: /** @type {string[]} */ ([]) };
    for (const { section } of sections) {
        const said = await section(options, registry, runtime);
        out.lines.push(...said.lines);
        out.problems += said.problems;
        out.upgrade.push(...said.upgrade);
    }
    return out;
}
