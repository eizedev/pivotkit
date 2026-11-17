/*
 * The options of the signed tokens the server issues itself (signed-tokens.js): where their keys,
 * register and deny list live, and how long a token may live at most.
 *
 *   "auth": { "signedTokens": { "dir": "secrets/signed", "maxDays": 7 } }
 *
 * With a state directory, dir defaults to <state>/secrets/signed (state.js planState). Without one
 * and without dir, there are no signed tokens. They work with auth.mode "token" only.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses
 * a second declaration).
 */

import { isAbsolute, resolve } from "node:path";
import { isInside } from "pivotkit-cli/files";
import { SIGNED_TOKEN } from "../signed-tokens.js";
import { ConfigError } from "./shared.js";

export const NAME = "signed";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    auth: {
        signedTokens: { object: { dir: "string", maxDays: "integer" } }
    }
});

/**
 * The longest lifetime of a signed token in seconds: auth.signedTokens.maxDays, else SIGNED_TOKEN.maxDays.
 * @param {import("../config.js").ServerOptions} options
 */
export const maxLifetimeOf = (options) => (options.auth?.signedTokens?.maxDays ?? SIGNED_TOKEN.maxDays) * 86_400;

/**
 * maxDays from 1 to SIGNED_TOKEN.maxDaysLimit; the setting only with auth.mode "token" (or none
 * written, which a state directory makes "token"); dir never inside output.dir, which the server
 * serves and prunes.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    const signed = options.auth?.signedTokens;
    if (!signed) {
        return;
    }
    if (signed.maxDays !== undefined && (signed.maxDays < 1 || signed.maxDays > SIGNED_TOKEN.maxDaysLimit)) {
        throw new ConfigError(`auth.signedTokens.maxDays: 1 to ${SIGNED_TOKEN.maxDaysLimit}`);
    }
    if (options.auth?.mode !== undefined && options.auth.mode !== "token") {
        throw new ConfigError(`auth.signedTokens: signed tokens work with auth.mode "token" only, not "${options.auth.mode}"`);
    }
    const base = options.baseDir ?? process.cwd();
    const at = (path) => (isAbsolute(path) ? path : resolve(base, path));
    if (signed.dir !== undefined && options.output?.dir && isInside(at(signed.dir), at(options.output.dir))) {
        throw new ConfigError(`auth.signedTokens.dir: ${signed.dir} lies inside output.dir (${options.output.dir}); keep the keys outside the directory the server writes reports to`);
    }
}
