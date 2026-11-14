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
 * module guards every tool. Names are matched case-insensitively, as pivotkit-core matches fields.
 */

import { findingText } from "pivotkit-report/operations";

/** The levels, from most to least visible. */
export const POLICY_LEVELS = Object.freeze(["show", "summary", "hide"]);

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
 */

/** The server's policy defaults. */
export const POLICY_DEFAULTS = Object.freeze({ default: "summary", items: 20, rows: true, counts: true, inline: Object.freeze({ cells: 500, bytes: 32_768 }) });

/**
 * A source's policy: its own settings over the server's, fields merged (the source's win).
 * @param {any} server  options.policy
 * @param {any} [source]  options.sources[id].policy
 * @returns {Policy}
 */
export function resolvePolicy(server = {}, source = {}) {
    const pick = (key) => source?.[key] ?? server?.[key] ?? POLICY_DEFAULTS[key];
    const fields = new Map();
    for (const part of [server?.fields, source?.fields]) {
        for (const [name, level] of Object.entries(part ?? {})) {
            fields.set(name.toLowerCase(), level);
        }
    }
    const inline = pick("inline");
    return { default: pick("default"), fields, items: pick("items"), rows: pick("rows"), counts: pick("counts"), inline: inline === false ? false : { ...POLICY_DEFAULTS.inline, ...inline } };
}

/** A field's level. */
export const levelOf = (policy, name) => policy.fields.get(String(name).trim().toLowerCase()) ?? policy.default;

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
    const lower = hidden.map((h) => h.toLowerCase()).filter(Boolean);
    return findings
        // a reader's note of how it read the file (its encoding, its separator) is no help to the model
        .filter((f) => f.severity !== "info")
        .filter((f) => !(closed && DATA_FINDINGS.has(f.code)))
        .map((f) => (lower.some((h) => f.message.toLowerCase().includes(h) || f.suggestion?.toLowerCase().includes(h)) ? { severity: f.severity, code: f.code, path: "", message: f.code } : f));
}
