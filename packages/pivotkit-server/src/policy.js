/*
 * The exposure policy: what the model may see of a source. Per field one level, set by the operator
 * per source over the server's default:
 *
 * - "show": names, counts and values (items, smallest and largest); results over it may come back
 *   inline;
 * - "summary" (the default): name, type and counts, no value; a result that touches it goes to a
 *   file, and its shape (rows, bytes) is withheld;
 * - "hide": the column is dropped when the data is read; nothing about it reaches the model but the
 *   number of hidden fields.
 *
 * Applied in the main thread to what an operation returns, never inside the operation, so one policy
 * module guards every tool and route. Names are matched case-insensitively, as pivotkit-core matches
 * fields.
 *
 * A profile (policy.profiles.<name>) is a policy of the same shape bound to a caller (a token, an
 * OAuth client or scope). It is laid over the source's policy: a field the source's policy hides
 * stays hidden in every profile; any other field takes the profile's level for it, else the
 * profile's default, else the source's level. A caller without a profile gets the source's policy,
 * never more.
 */

import { findingText } from "pivotkit-report/operations";

/** The levels, from most to least visible. */
/** @type {readonly ["show", "summary", "hide"]} */
export const POLICY_LEVELS = Object.freeze(/** @type {const} */ (["show", "summary", "hide"]));

/** The most characters of a field name that reaches the model. */
export const NAME_TEXT = 80;

/** Findings whose text or suggestion comes from the data's values, not from the view or the schema. */
const DATA_FINDINGS = new Set(["itemCase", "filterEmpty", "chartCut", "tableCut"]);

/**
 * @typedef {object} Policy
 * @property {"show" | "summary" | "hide"} default
 * @property {Map<string, "show" | "summary" | "hide">} fields  by lower-case name
 * @property {number} items  values listed per "show" field
 * @property {boolean} rows  the row count is shown
 * @property {boolean} counts  distinct and blank counts are shown
 * @property {{ cells: number, bytes: number } | false} inline  results that may come back in the tool result
 * @property {boolean} results  REST: the caller may download the rendered file
 */

/** The server's policy defaults. */
export const POLICY_DEFAULTS = Object.freeze({ default: "summary", items: 20, rows: true, counts: true, inline: Object.freeze({ cells: 500, bytes: 32_768 }), results: false });

/**
 * A source's policy: its own settings over the server's, fields merged (the source's win); with a
 * profile, the profile laid over that (see the top of this file).
 * @param {any} server  options.policy
 * @param {any} [source]  options.sources[id].policy
 * @param {any} [profile]  options.policy.profiles[name]
 * @returns {Policy}
 */
export function resolvePolicy(server = {}, source = {}, profile = undefined) {
    const pick = (key) => profile?.[key] ?? source?.[key] ?? server?.[key] ?? POLICY_DEFAULTS[key];
    /** @type {Map<string, "show" | "summary" | "hide">} */
    const fields = new Map();
    // the source's rules override the server's; two names of one part that match the same field
    // ("Customer Name" and "customer  name") keep the stricter level, whichever comes last
    const strictness = { show: 0, summary: 1, hide: 2 };
    for (const part of [server?.fields, source?.fields]) {
        const own = new Map();
        for (const [name, level] of Object.entries(part ?? {})) {
            const key = fieldKey(name);
            const before = own.get(key);
            own.set(key, before !== undefined && strictness[before] > strictness[level] ? before : level);
        }
        for (const [key, level] of own) {
            fields.set(key, level);
        }
    }
    let level = source?.default ?? server?.default ?? POLICY_DEFAULTS.default;
    if (profile) {
        const base = { default: level, fields: new Map(fields) };
        if (profile.default) {
            // a field the base names keeps "hide", any other takes the profile's default; so does
            // every other field, unless the base hides it by default
            for (const [name, l] of base.fields) {
                fields.set(name, l === "hide" ? "hide" : profile.default);
            }
            level = level === "hide" ? "hide" : profile.default;
        }
        for (const [name, l] of Object.entries(profile.fields ?? {})) {
            const key = fieldKey(name);
            fields.set(key, levelOf(base, key) === "hide" ? "hide" : l);
        }
    }
    const inline = pick("inline");
    return { default: level, fields, items: pick("items"), rows: pick("rows"), counts: pick("counts"), inline: inline === false ? false : { ...POLICY_DEFAULTS.inline, ...inline }, results: pick("results") === true };
}

/** A field's level. */
/** A field name as the policy matches it: Unicode NFC (a file from macOS may write "ö" as two code points), trimmed, lower case. */
// whitespace counts as one space, whichever kind (a no-break or ideographic space, a doubled one: an
// Excel header often has them), so a rule on "Customer Name" also matches such a column
export const fieldKey = (name) => String(name).normalize("NFC").replace(/\s+/gu, " ").trim().toLowerCase();

/** A reader's name for a repeated header ("Email (2)", "email (3)"): the part before it is the first one's name. */
const REPEATED = /^(.*\S) \(\d+\)$/;

/**
 * A field's level: its own, else the default. A column the reader renamed because its header repeats
 * a hidden one ("Email (2)" next to "Email") is hidden too, unless the policy names it.
 * @param {{ default: string, fields: Map<string, string> }} policy
 * @param {string} name
 * @returns {any}
 */
export function levelOf(policy, name) {
    const key = fieldKey(name);
    const own = policy.fields.get(key);
    if (own) {
        return own;
    }
    const base = REPEATED.exec(key)?.[1];
    if (base !== undefined && (policy.fields.get(base) ?? policy.default) === "hide") {
        return "hide";
    }
    return policy.default;
}

/** The names of a table's columns the policy hides (dropped before anything else sees the data). */
export const hiddenColumns = (policy, columns) => columns.filter((c) => levelOf(policy, c) === "hide");

/** A field's name as the model sees it: cleaned and capped. */
const nameText = (name) => {
    const clean = findingText(name);
    return clean.length > NAME_TEXT ? `${clean.slice(0, NAME_TEXT - 1)}…` : clean;
};

/**
 * describe_source's result as the policy allows: each field with its level, values only for "show"
 * fields, counts only when allowed; the text rebuilt from what is left (no value in it).
 * @param {any} result  describe_source's result (asked with items = policy.items)
 * @param {Policy} policy
 * @param {number} hidden  the number of columns dropped
 */
export function exposeSource(result, policy, hidden) {
    const fields = result.fields.map((f) => {
        const level = levelOf(policy, f.name);
        const name = nameText(f.name);
        /** @type {Record<string, unknown>} */
        const out = { name, type: f.type, level };
        if (policy.counts && f.distinct !== undefined) {
            out.distinct = f.distinct;
            out.blanks = f.blanks;
        }
        if (level === "show") {
            // a date's first values say little: its smallest and largest stand for it
            if (f.items && f.type !== "date") {
                out.items = f.items.slice(0, policy.items).map((v) => (typeof v === "string" ? nameText(v) : v));
            }
            if (f.min !== undefined) {
                out.min = typeof f.min === "string" ? nameText(f.min) : f.min;
                out.max = typeof f.max === "string" ? nameText(f.max) : f.max;
            }
        }
        out.aggregators = f.aggregators;
        out.filters = f.filters;
        out.text = `${name}: ${f.type}, ${level}${out.distinct !== undefined ? `, ${out.distinct} distinct, ${out.blanks} blank` : ""}`;
        return out;
    });
    const rows = policy.rows ? result.rows : null;
    return {
        rows,
        fields,
        hiddenFields: hidden,
        text: `${rows === null ? "" : `${rows} rows, `}${fields.length} fields${hidden ? ` (${hidden} more hidden by the operator)` : ""}`,
        examples: result.examples,
        notes: (result.notes ?? []).filter((n) => n.severity !== "info")
    };
}

/** Whether a view that uses these fields touches one whose values the model may not see. */
export const touchesClosed = (policy, uses) => (uses ?? []).some((f) => levelOf(policy, f) !== "show");

/**
 * Findings as the policy allows: for a view that touches a field whose values are not shown, the
 * findings that come from the data's values (an item spelt differently, a filter that keeps nothing)
 * are left out, since they would tell whether an item exists; notes of how a file was read ("info")
 * too. Reader notes that name a hidden
 * column keep only their code.
 * @param {Array<{ severity: string, code: string, path?: string, message: string, suggestion?: string }>} findings
 * @param {Policy} policy
 * @param {string[]} uses
 * @param {string[]} [hidden]  the hidden columns' names
 */
export function exposeFindings(findings, policy, uses, hidden = []) {
    const closed = touchesClosed(policy, uses);
    const lower = hidden.map(fieldKey).filter(Boolean);
    return findings
        // a reader's note of how it read the file (its encoding, its separator) is no help to the model
        .filter((f) => f.severity !== "info")
        .filter((f) => !(closed && DATA_FINDINGS.has(f.code)))
        .map((f) => (lower.some((h) => fieldKey(f.message).includes(h) || (f.suggestion !== undefined && fieldKey(f.suggestion).includes(h))) ? { severity: f.severity, code: f.code, path: "", message: f.code } : f));
}
