/*
 * The options of the browser path (records 0020 and 0021): the browser token a person's token is
 * exchanged for (POST /api/v1/sources/records/token), and the pages that may read rows with it.
 *
 *   "rest": { "browser": { "origins": ["https://intranet.example.com"], "minutes": 5,
 *                          "key": { "file": "secrets/browser.key" }, "levels": ["signedIn"] } }
 *
 * - origins: the pages that may call the rows route with a browser token (CORS). None by default:
 *   only a page on the server's own origin. rest.cors.origins keeps its own job.
 * - minutes: how long a browser token lives, never longer than the person's own token.
 * - key: the secret the token's key is derived from. With a state directory the server makes it at
 *   the first start (state.js planState); without either, a random key per process.
 * - levels: the access levels a live link may carry (link-access.js).
 *
 * The browser path follows the rows route's right (policy.profiles.<p>.records): without it, nobody
 * gets a browser token. A key is declared here once, never also in config.js or another fragment.
 */

import { CREATABLE_SECRET_REF, ConfigError, checkOrigins, throwRange } from "./shared.js";

export const NAME = "browser";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    rest: { browser: { object: { origins: "strings", minutes: "integer", key: CREATABLE_SECRET_REF, levels: "strings" } } }
});

/** The access levels a live link may carry: only me, every signed-in person, a group of the sign-in. */
export const ACCESS_LEVELS = Object.freeze(["me", "signedIn", "group"]);

/** The settings where the operator writes none. */
export const BROWSER_DEFAULTS = Object.freeze({ minutes: 5, levels: Object.freeze(["signedIn"]) });

/** The longest lifetime of a browser token, in minutes. */
export const BROWSER_MAX_MINUTES = 60;

/**
 * The browser path's settings of a server, with the defaults.
 * @param {import("../config.js").ServerOptions} options
 * @returns {{ origins: string[], minutes: number, key: { env?: string, file?: string } | null, levels: string[] }}
 */
export function browserSettingsOf(options) {
    const b = /** @type {any} */ (options.rest)?.browser ?? {};
    return { origins: [...(b.origins ?? [])], minutes: b.minutes ?? BROWSER_DEFAULTS.minutes, key: b.key ?? null, levels: [...(b.levels ?? BROWSER_DEFAULTS.levels)] };
}

/**
 * Whether any profile may read rows, so the browser path can be used at all.
 * @param {import("../config.js").ServerOptions} options
 */
export const browserPathUsed = (options) => Object.values(options.policy?.profiles ?? {}).some((p) => /** @type {any} */ (p)?.records?.length);

/**
 * Checks the settings; throws ConfigError. A value out of its range goes to `range`.
 * @param {import("../config.js").ServerOptions} options
 * @param {import("./shared.js").RangeProblem} [range]
 */
export function validate(options, range = throwRange) {
    const b = /** @type {any} */ (options.rest)?.browser;
    if (!b) {
        return;
    }
    if (b.minutes !== undefined && (b.minutes < 1 || b.minutes > BROWSER_MAX_MINUTES)) {
        range(`rest.browser.minutes: from 1 to ${BROWSER_MAX_MINUTES}`);
    }
    checkOrigins(b.origins, "rest.browser.origins", "https://intranet.example.com");
    if (b.levels !== undefined) {
        if (!b.levels.length) {
            throw new ConfigError(`rest.browser.levels: at least one of ${ACCESS_LEVELS.join(", ")}, or leave it out`);
        }
        const unknown = b.levels.find((l) => !ACCESS_LEVELS.includes(l));
        if (unknown !== undefined) {
            throw new ConfigError(`rest.browser.levels: "${String(unknown).slice(0, 40)}" is no level; the levels are ${ACCESS_LEVELS.join(", ")}`);
        }
    }
}
