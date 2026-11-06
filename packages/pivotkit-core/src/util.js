/*
 * Small helpers shared by several modules. Not part of the public API.
 */

import { PivotkitError } from "./errors.js";

export const MS_PER_DAY = 86_400_000;

/** The locale used when neither the view nor the options name one. */
export const DEFAULT_LOCALE = "en-US";

/** "7" -> "07" */
export const pad = (n, width = 2) => String(n).padStart(width, "0");

/**
 * The options argument of a public function: undefined becomes {}, anything that is not a plain object
 * throws, so a call in an older shape (a locale string where the options go) fails loudly instead of
 * being ignored.
 */
export function optionsOf(options, fn) {
    if (options === undefined || options === null) return {};
    if (typeof options !== "object" || Array.isArray(options)) {
        throw new PivotkitError("INVALID_OPTION", `${fn}: options must be an object, got ${JSON.stringify(options)}`);
    }
    return options;
}

/** True for an object that is not an array (and not null). */
export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** An own property of a plain object, else undefined: view keys are never looked up on prototypes. */
export const get = (obj, key) => (isPlainObject(obj) && Object.hasOwn(obj, key) ? obj[key] : undefined);

/** The number, or null for anything that is not a finite number. */
export const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** "#abc" or "#aabbcc" -> "aabbcc" */
export function hexDigits(hex) {
    return hex.length === 4 ? hex.slice(1).split("").map((x) => x + x).join("") : hex.slice(1);
}

/** "#aabbcc" -> [170, 187, 204] */
export function hexToRgb(hex) {
    const h = hexDigits(hex);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/**
 * Decimal places of a number as written in its shortest form: 0.1 -> 1, 2.5e-7 -> 8, 1e21 -> 0.
 * @param {number} x
 */
export function decimalsOf(x) {
    if (!Number.isFinite(x)) {
        return 0;
    }
    const [mantissa, exponent] = String(Math.abs(x)).split("e");
    const dot = mantissa.indexOf(".");
    const fraction = dot === -1 ? 0 : mantissa.length - dot - 1;
    return Math.max(0, fraction - Number(exponent ?? 0));
}

/**
 * @typedef {object} Cache  a bounded cache (least recently used go first)
 * @property {number} limit
 * @property {number} size
 * @property {(key: string) => any} get
 * @property {(key: string, value: any) => any} set
 * @property {(key: string, make: () => any) => any} getOrSet  the cached value, made and stored on a miss
 */

/**
 * A bounded cache that forgets the least recently used entry first.
 * @param {number} limit
 * @returns {Cache}
 */
export function createCache(limit) {
    /** @type {Map<string, any>} */
    const map = new Map();
    return {
        limit,
        get size() {
            return map.size;
        },
        /** @param {string} key */
        get(key) {
            if (!map.has(key)) {
                return undefined;
            }
            const value = map.get(key);
            map.delete(key);
            map.set(key, value);
            return value;
        },
        /**
         * @param {string} key
         * @param {any} value
         */
        set(key, value) {
            map.delete(key);
            map.set(key, value);
            if (map.size > limit) {
                map.delete(map.keys().next().value);
            }
            return value;
        },
        /**
         * @param {string} key
         * @param {() => any} make
         */
        getOrSet(key, make) {
            const hit = this.get(key);
            return hit !== undefined ? hit : this.set(key, make());
        }
    };
}

/**
 * The canonical form of a locale tag; null for anything that is not one.
 * @param {unknown} locale
 */
export function canonicalLocale(locale) {
    if (typeof locale !== "string" || locale.length === 0 || locale.length > 64) {
        return null;
    }
    try {
        return Intl.getCanonicalLocales(locale)[0] ?? null;
    } catch {
        return null;
    }
}

/**
 * The one locale precedence of pivotkit-core: the view's locale, then the caller's option, then
 * "en-US". The runtime's locale is never used, so a report looks the same on every machine.
 * @param {string | null | undefined} viewLocale  view.formatting.locale (already normalized)
 * @param {unknown} optionLocale  options.locale; an invalid tag is a programmer error
 * @returns {string}
 */
export function resolveLocale(viewLocale, optionLocale) {
    if (viewLocale) {
        return viewLocale;
    }
    if (optionLocale === undefined || optionLocale === null) {
        return DEFAULT_LOCALE;
    }
    const canonical = canonicalLocale(optionLocale);
    if (!canonical) {
        throw new PivotkitError("INVALID_OPTION", `options.locale ${JSON.stringify(optionLocale)} is not a locale`);
    }
    return canonical;
}
