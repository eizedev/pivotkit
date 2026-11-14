/*
 * A view from the data's fields instead of a view file: `describe <data> --suggest` (a draft), and
 * `render <data>` with layout flags (--rows, --values, ...) or --suggest. pivotkit-core's
 * suggestLayout picks a first layout, the flags given replace its parts, and viewFromLayout makes the
 * view (the one function the operations of pivotkit-report use too). A view written to a file names
 * the data as the browser's report names a loaded file (pivotkit-core/import's sourceIdOf), with the
 * workbook's sheet, so the browser opens it as a view of that file.
 */

import { describeSource, encode, normalize, suggestLayout, toViewFile, viewFromLayout } from "pivotkit-core";
import { sourceIdOf } from "pivotkit-core/import";
import { CliError, printable, shortName } from "./errors.js";
import { LAYOUT_FLAGS, layoutOf, parseFilter, parseMap } from "./layout-flags.js";

/** The most bytes of a --filter @file (a filter is small; a view may be larger). */
const FILTER_BYTES = 1_000_000;

/** Whether a layout flag is given (render: the flags mode). */
export const hasLayoutFlags = (values) => LAYOUT_FLAGS.some((flag) => flag !== "map" && values[flag] !== undefined);

/** Whether render or describe makes its view from the data: layout flags or --suggest. */
export const fromFields = (values) => Boolean(values.suggest) || hasLayoutFlags(values);

/**
 * The filters of --filter: JSON text, or @file read through the CLI's safe reader.
 * @param {string[] | undefined} list
 * @param {any} ctx
 */
export async function filtersOf(list, ctx) {
    const out = [];
    for (const value of list ?? []) {
        if (value.startsWith("@")) {
            const path = value.slice(1);
            const bytes = await ctx.readInput(path, "the filter", FILTER_BYTES, "json");
            out.push(...parseFilter(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ""), `--filter @${shortName(path)}`));
        } else {
            out.push(...parseFilter(value, "--filter"));
        }
    }
    return out;
}

/**
 * --map's pairs as an object, from the names the view uses (each "Old=New" split at the "=" whose
 * left part the view uses).
 * @param {string[] | undefined} list
 * @param {string[]} used
 */
export function mapOf(list, used) {
    if (!list?.length) {
        return null;
    }
    const names = new Set(used.map((n) => n.toLowerCase()));
    /** @type {Record<string, string>} */
    const map = Object.create(null);
    for (const value of list) {
        const [from, to] = parseMap(value, names);
        map[from] = to;
    }
    return { ...map };
}

/**
 * The view the layout flags (and --suggest) make from the data: the picks of the suggestion, the flags
 * given over them, viewFromLayout. Its notes as findings: dateGrouped (info), unusedGroup and unusedMap
 * (warnings), noSuggestion (an error: nothing to group by, with the workbook's other sheets).
 * @param {any} data  readData's result
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {{ sheets?: () => Promise<Array<{ name: string, visible: boolean }>> | null, command: string, input: string }} where
 * @returns {Promise<{ view: Record<string, any>, name: string, picks: import("pivotkit-core").LayoutPick[], findings: any[], encoded: import("pivotkit-core").Encoded, layout: import("pivotkit-core").Layout }>}
 */
export async function layoutView(data, values, ctx, where) {
    const encoded = encode(data.table, { ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}), ...(Object.keys(ctx.limits).length ? { limits: ctx.limits } : {}) });
    const description = describeSource(encoded, { items: 0 });
    const options = ctx.locale ? { locale: ctx.locale } : {};
    const suggestion = values.suggest ? suggestLayout(description, options) : null;
    const filters = await filtersOf(values.filter, ctx);
    const given = layoutOf(values, { fields: data.table.columns.map(String), filters });
    const layout = { ...(suggestion?.layout ?? {}), ...given };
    // a grouping of the suggestion stays only while its field is still placed where the suggestion put it
    if (suggestion && given.groups === undefined && (given.rows || given.cols) && layout.groups) {
        const placed = new Set([...(layout.rows ?? []), ...(layout.cols ?? [])].map((n) => n.toLowerCase()));
        layout.groups = layout.groups.filter((g) => placed.has(g.field.toLowerCase()));
    }
    const map = mapOf(values.map, [...(layout.rows ?? []), ...(layout.cols ?? []), ...(layout.values ?? []).map((v) => v.field ?? ""), ...(layout.groups ?? []).map((g) => g.field), ...filters.map((f) => f.field ?? "")]);
    if (map) layout.map = map;
    let built;
    try {
        built = viewFromLayout(layout, description, options);
    } catch (e) {
        throw new CliError("usage", "BAD_LAYOUT", printable(String(e.message).replace(/^viewFromLayout: /, "")));
    }
    const findings = [];
    const notes = [...(suggestion?.notes ?? []), ...built.notes];
    const nothing = notes.some((n) => n.code === "noSuggestion") && !given.rows && !given.cols;
    if (nothing) {
        const sheets = where.sheets ? await where.sheets().catch(() => []) : [];
        const others = sheets.filter((s) => s.visible && s.name !== data.sheet);
        const sheetText = data.sheet ? `the sheet ${JSON.stringify(data.sheet)} of ${data.name}` : data.name;
        const why = notes.find((n) => n.code === "noSuggestion")?.message ?? "";
        findings.push({
            severity: "error",
            code: "noSuggestion",
            path: "",
            message: printable(`${sheetText} has nothing to group by (${why})`),
            details: others.length
                ? [`the workbook's other sheets: ${others.map((s) => JSON.stringify(printable(s.name))).join(", ")}; try: pivotkit ${where.command} ${shortName(where.input)} --suggest --sheet ${quoteArg(others[0].name)}`]
                : ["give --rows <field> (and --values) to say what to show"]
        });
    }
    for (const n of built.notes) {
        if (n.code === "dateGrouped") findings.push({ severity: "info", code: n.code, path: "", message: printable(`${n.message}; --group "${n.field}:<unit>" for another`) });
        else findings.push({ severity: "warning", code: n.code, path: "", message: printable(n.message) });
    }
    return { view: built.view, name: built.name, picks: suggestion?.picks ?? [], findings, encoded, layout };
}

/** A word as a shell takes it: as it is when it is plain, else in double quotes. */
export const quoteArg = (word) => (/^[\w.,:/@%+-]+$/.test(word) ? word : `"${String(word).replace(/(["\\$`])/g, "\\$1")}"`);

/**
 * What --suggest picked, in lines for stderr: the parts, the other fields a part could take, and a
 * line to paste that changes one part.
 * @param {any[]} picks
 * @param {Record<string, any>} view  the view made
 * @param {string} command  how to run it again ("pivotkit describe sales.csv --suggest")
 * @param {Array<{ name: string, type: string }>} fields
 */
export function pickLines(picks, view, command, fields) {
    const part = (name) => (view[name]?.length ? view[name].join(", ") : null);
    const value = view.values.map((v) => (v.field ? `${v.agg === "count" ? "Count" : v.agg[0].toUpperCase() + v.agg.slice(1)} of ${v.field}` : "Count of rows")).join(", ");
    const parts = [part("rows") && `rows ${part("rows")}`, part("cols") && `columns ${part("cols")}`, `values ${value}`].filter(Boolean);
    const lines = [`draft: ${printable(parts.join("; "))}`];
    const texts = fields.filter((f) => f.type === "string").map((f) => f.name);
    const numbers = picks.find((p) => p.part === "values")?.others ?? [];
    const shown = new Set([...(view.rows ?? []), ...(view.cols ?? [])].map((n) => n.toLowerCase()));
    const otherTexts = texts.filter((t) => !shown.has(t.toLowerCase()));
    if (otherTexts.length) lines.push(`  other text fields: ${printable(otherTexts.join(", "))}`);
    if (numbers.length) lines.push(`  other numbers: ${printable(numbers.join(", "))}`);
    const measured = view.values.find((v) => v.field)?.field;
    if (measured) lines.push(`  to change a part: ${printable(`${command} --values ${quoteArg(`average:${measured}`)}`)} (or --rows, --cols, --group <field>:<unit>)`);
    return lines;
}

/**
 * A view as a view file for the data it was made on: named as the browser names a loaded file
 * (sourceIdOf over the file's name and columns), with the workbook's sheet and the fields the view
 * uses with their types.
 * @param {Record<string, any>} view  normalized
 * @param {any} data  readData's result
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {{ name: string, description?: string, version: string }} meta
 */
export async function viewFileFor(view, data, encoded, meta) {
    const columns = data.table.columns.map(String);
    const id = data.name === "stdin" ? undefined : await sourceIdOf(data.name, columns);
    return toViewFile(view, {
        name: meta.name,
        ...(meta.description ? { description: meta.description } : {}),
        generator: { name: "pivotkit-cli", version: meta.version },
        source: { ...(id ? { id } : {}), name: data.name, ...(id && data.sheet ? { params: { sheet: data.sheet } } : {}) },
        data: encoded
    });
}

/**
 * The view normalized against its data, as a view file holds it.
 * @type {(view: Record<string, any>, encoded: import("pivotkit-core").Encoded, limits: Record<string, number>) => import("pivotkit-core").View}
 */
export const normalized = (view, encoded, limits) => normalize(view, encoded, Object.keys(limits).length ? { limits } : undefined).view;
