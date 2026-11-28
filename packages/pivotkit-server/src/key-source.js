/*
 * A key the server reads from a secret reference ({ env } or { file }) and derives its subkeys of:
 * read again at most every KEY_READ_MS, so a rotated secret works without a restart, within a second,
 * and derived once per value. Without a reference, a random key per process. A read, and a failed
 * one, is shared by the requests in that time, so a flood of forged tokens does not read the file
 * for each.
 *
 * The download links' key (output.downloads.key, downloads/tokens.js) and the browser tokens' key
 * (rest.browser.key, browser-tokens.js) are read through it.
 */

import { randomBytes } from "node:crypto";
import { ConfigError } from "./options/shared.js";
import { makeKey } from "./auth.js";
import { readSecret } from "./secrets.js";
import { keyProblem } from "./secret-rules.js";

/** How long a read of a key is used before it is read again, in milliseconds. */
export const KEY_READ_MS = 1000;

/**
 * The subkeys of a key setting, as a function to call per use.
 * @template K
 * @param {{ ref: { env?: string, file?: string } | null | undefined, setting: string, use: "downloads" | "browser", derive: (key: Buffer) => K }} what  setting: the option's path, for the message of a key that cannot be used
 * @param {{ baseDir?: string }} options
 * @param {Record<string, string | undefined>} env
 * @returns {() => Promise<K>}
 */
export function keySource({ ref, setting, use, derive }, options, env) {
    if (!ref) {
        const keys = derive(randomBytes(32));
        return async () => keys;
    }
    let last = { value: "", keys: /** @type {any} */ (null) };
    const read = async () => {
        const value = await readSecret(ref, options, env);
        const why = keyProblem(use)(value);
        if (why) {
            throw new ConfigError(`${setting} (${ref.env ? `$${ref.env}` : `the file ${ref.file}`}) is ${why}; make one with: ${makeKey(use)}`);
        }
        if (value !== last.value) {
            last = { value, keys: derive(Buffer.from(value, "utf8")) };
        }
        return last.keys;
    };
    /** @type {{ at: number, keys: Promise<K> } | null} */
    let held = null;
    return () => {
        const now = Date.now();
        if (!held || now - held.at >= KEY_READ_MS) {
            held = { at: now, keys: read() };
        }
        return held.keys;
    };
}
