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

/**
 * A value from a view as an issue's params show it: a text as it is, anything else as JSON, at most
 * 100 characters (an issue quotes user input; it must stay short).
 * @param {unknown} value
 * @returns {string}
 */
export function shown(value) {
    let text;
    try {
        text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
    } catch {
        text = String(value);
    }
    // the value goes into an issue a UI shows: no controls, invisible or direction characters
    const clean = text.slice(0, 400).replace(SPACED, " ").replace(HIDDEN_ALL, "");
    return clean.length > 100 ? `${clean.slice(0, 99)}…` : clean;
}

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
 * The canonical form of a locale tag; null for anything that is not one, and for a tag the runtime has
 * no number format for (such as "xx-XX"): Intl would take the machine's locale for it.
 * @param {unknown} locale
 */
export function canonicalLocale(locale) {
    const tag = localeTag(locale);
    return tag && Intl.NumberFormat.supportedLocalesOf(tag).length > 0 ? tag : null;
}

/**
 * The canonical form of a locale tag, whether the runtime knows it or not; null for anything that is
 * not one.
 * @param {unknown} locale
 */
function localeTag(locale) {
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
 * Whether options.locale is a well-formed tag the runtime has no data for ("xx-XX"): resolveLocale
 * takes "en-US" for it, and computePivot reports it as a warning.
 * @param {unknown} optionLocale
 */
export function unknownOptionLocale(optionLocale) {
    return optionLocale !== undefined && optionLocale !== null && localeTag(optionLocale) !== null && canonicalLocale(optionLocale) === null;
}

/**
 * The one locale precedence of pivotkit-core: the view's locale, then the caller's option, then
 * "en-US". The runtime's locale is never used, so a report looks the same on every machine.
 * @param {string | null | undefined} viewLocale  view.formatting.locale (already normalized)
 * @param {unknown} optionLocale  options.locale; a text that is no locale tag is a programmer error,
 *   a tag the runtime has no data for ("xx-XX") takes "en-US" (unknownOptionLocale)
 * @returns {string}
 */
export function resolveLocale(viewLocale, optionLocale) {
    if (viewLocale) {
        return viewLocale;
    }
    if (optionLocale === undefined || optionLocale === null) {
        return DEFAULT_LOCALE;
    }
    if (unknownOptionLocale(optionLocale)) {
        return DEFAULT_LOCALE;
    }
    const canonical = canonicalLocale(optionLocale);
    if (!canonical) {
        throw new PivotkitError("INVALID_OPTION", `options.locale ${JSON.stringify(optionLocale)} is not a locale`);
    }
    return canonical;
}

// The one list of characters a text from outside loses (file names and values, view files,
// templates, issue texts). CONTROLS: C0 controls except tab, line feed and carriage return, DEL and
// C1 controls. HIDDEN: invisible format characters (soft hyphen, U+180E, zero width space, word
// joiner, byte order mark, tag characters; the joiners U+200C and U+200D stay, scripts and emoji need
// them), lone surrogates, and the characters that change the direction of text (U+061C, U+200E,
// U+200F, U+202A-U+202E, U+2066-U+206F): a name like "invoice" + U+202E + "txt.exe" shows reversed.
// eslint-disable-next-line no-control-regex
export const CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
export const HIDDEN = /[\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\u{E0000}-\u{E007F}]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
const HIDDEN_ALL = new RegExp(HIDDEN.source, "gu");
// controls, tabs and line breaks: one space for a run of them
const SPACED = new RegExp(`(?:${CONTROLS.source}|[\\t\\r\\n\\u2028\\u2029])+`, "gu");

/**
 * Plain text of at most `max` characters: controls and line breaks become a space, invisible and
 * direction characters (HIDDEN) go, runs of spaces one space, the ends trimmed; a longer text is cut
 * and ends with "…". With `{ id: true }` (an identifier, a field's name, a view file's text) the
 * inner spaces stay as given and a longer text is only cut: a name keeps matching the data's, and a
 * view file's texts read as written. Undefined for anything else and for empty text.
 * @param {unknown} value
 * @param {number} max
 * @param {{ id?: boolean }} [options]
 * @returns {string | undefined}
 */
export function plainText(value, max, { id = false } = {}) {
    if (typeof value !== "string") {
        return undefined;
    }
    const spaced = value.slice(0, max * 4).replace(SPACED, " ").replace(HIDDEN_ALL, "");
    const text = (id ? spaced : spaced.replace(/\s+/g, " ")).trim();
    if (!text) {
        return undefined;
    }
    if (text.length <= max) {
        return text;
    }
    return id ? text.slice(0, max) : `${text.slice(0, max - 1).trimEnd()}…`;
}
