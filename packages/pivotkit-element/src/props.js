/*
 * The attributes of <pivot-report> and how each maps to a property and a prop of <PivotReport>. One
 * table: the element reads it for observedAttributes, its accessors and the props it renders. Pure,
 * no DOM: tested with node --test.
 *
 * - "string", "number", "theme", "height": the attribute is the property's storage (reflected), as
 *   with a native element: setting the property sets the attribute, null or undefined removes it.
 * - "flag": a boolean attribute (present = true). "on-unless-false": true unless the attribute is
 *   "false" (drill-down defaults to on).
 * - "json": the attribute is parsed into the property (a view); setting the property does not write
 *   the attribute back, since a view is an object.
 */

/**
 * @typedef {"string" | "number" | "theme" | "height" | "flag" | "on-unless-false" | "json"} AttributeKind
 * @typedef {{ attr: string, prop: string, kind: AttributeKind }} AttributeDef
 */

/** @type {readonly AttributeDef[]} */
export const ATTRIBUTES = Object.freeze([
    { attr: "locale", prop: "locale", kind: "string" },
    { attr: "theme", prop: "theme", kind: "theme" },
    { attr: "height", prop: "height", kind: "height" },
    { attr: "time-zone", prop: "timeZone", kind: "string" },
    { attr: "file-name", prop: "fileName", kind: "string" },
    { attr: "label", prop: "label", kind: "string" },
    { attr: "drill-down", prop: "drillDown", kind: "on-unless-false" },
    { attr: "drill-down-limit", prop: "drillDownLimit", kind: "number" },
    { attr: "save-templates", prop: "saveTemplates", kind: "flag" },
    { attr: "view", prop: "view", kind: "json" },
    { attr: "default-view", prop: "defaultView", kind: "json" }
]);

/** Properties without an attribute: objects and arrays a host sets from script. */
export const OBJECT_PROPS = Object.freeze(["data", "dataKey", "templates", "labels", "fieldDefaults", "limits"]);

const THEMES = new Set(["auto", "light", "dark"]);

/**
 * The property value of an attribute value.
 * @param {AttributeDef} def
 * @param {string | null} value  the attribute, null when absent
 * @returns {unknown}
 */
export function fromAttribute(def, value) {
    switch (def.kind) {
        case "flag":
            return value !== null;
        case "on-unless-false":
            return value === null || value.trim().toLowerCase() !== "false";
        case "theme": {
            const theme = value?.trim().toLowerCase();
            return theme && THEMES.has(theme) ? theme : "auto";
        }
        case "number": {
            const n = value === null || value.trim() === "" ? NaN : Number(value);
            return Number.isFinite(n) ? n : undefined;
        }
        case "height": {
            if (value === null || value.trim() === "") {
                return undefined;
            }
            // "480" is pixels like the prop's number; "100%", "40rem" stay CSS lengths
            const n = Number(value);
            return Number.isFinite(n) ? n : value.trim();
        }
        case "json":
            return parseJson(value);
        default:
            return value === null ? undefined : value;
    }
}

/**
 * The attribute value a property value writes, or null to remove the attribute. Not used for "json".
 * @param {AttributeDef} def
 * @param {unknown} value
 * @returns {string | null}
 */
export function toAttribute(def, value) {
    switch (def.kind) {
        case "flag":
            return value ? "" : null;
        case "on-unless-false":
            return value === false ? "false" : null;
        case "number":
        case "height":
            return value === null || value === undefined || value === "" ? null : String(value);
        default:
            return value === null || value === undefined ? null : String(value);
    }
}

/**
 * A JSON attribute: an object, or undefined when the text is empty or not a JSON object. A view is
 * user input either way; pivotkit-core normalizes it.
 * @param {string | null} text
 * @returns {object | undefined}
 */
export function parseJson(text) {
    if (text === null || text.trim() === "") {
        return undefined;
    }
    try {
        const value = JSON.parse(text);
        return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The locale of the report: the `locale` attribute, else the element's own `lang`, else the
 * report's default ("en-US"). The page's language is not read: a report on a German page with an
 * English element stays English unless it says otherwise.
 * @param {string | undefined} locale
 * @param {string | undefined | null} lang
 */
export function localeOf(locale, lang) {
    return locale?.trim() || lang?.trim() || undefined;
}
