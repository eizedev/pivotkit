/*
 * What `pivotkit --version` says: the versions of this package and the two it renders with, and with
 * --json what a bug report or a CI log needs besides them.
 */

import { createRequire } from "node:module";
import { LIMITS } from "pivotkit-core";
import { knownTimeZone } from "./options.js";
import { CLI_VERSION } from "./user-agent.js";

/** The versions of this package and the two it renders with. */
export function versions() {
    const require = createRequire(import.meta.url);
    const of = (name) => require(`${name}/package.json`).version;
    return { "pivotkit-cli": CLI_VERSION, "pivotkit-report": of("pivotkit-report"), "pivotkit-core": of("pivotkit-core") };
}

/**
 * What a bug report or a CI log needs besides the versions: Node, the defaults the environment sets
 * (and whether Intl knows them) and pivotkit-core's limits.
 * @param {Record<string, string | undefined>} env
 */
export function environment(env) {
    const locale = env.PIVOTKIT_LOCALE || null;
    const timeZone = env.PIVOTKIT_TIME_ZONE || null;
    const now = env.PIVOTKIT_NOW || null;
    return {
        node: process.version,
        locale: { value: locale ?? "en-US", from: locale ? "PIVOTKIT_LOCALE" : "default", known: knownDateLocale(locale ?? "en-US") },
        timeZone: { value: timeZone ?? "UTC", from: timeZone ? "PIVOTKIT_TIME_ZONE" : "default", known: knownTimeZone(timeZone ?? "UTC") },
        now: { value: now, from: now ? "PIVOTKIT_NOW" : "the clock" },
        limits: { ...LIMITS }
    };
}

/**
 * Whether this runtime has a date format for a locale tag.
 * @param {string} tag
 */
function knownDateLocale(tag) {
    try {
        return Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0;
    } catch {
        return false;
    }
}
