/*
 * pivotkit describe: a view in words (pivotkit-report's describe_view, against --data or the fields
 * its view file lists), or data: its rows, its fields with their types and example values, and a
 * workbook's sheets (describe_source). JSON is read once to tell a view from data. With --suggest it
 * is suggest.js.
 */

import { extname } from "node:path";
import { fromViewFile } from "pivotkit-core";
import { CliError, printable, shortName } from "pivotkit-node/files";
import { readData, sheetLabel, withViewTypes } from "./data.js";
import { explained } from "./explain.js";
import { VIEW_BYTES, textOf, withBytes } from "./inputs.js";
import { hasLayoutFlags, quoteArg } from "./layout-view.js";
import { operationEnv, runOperation } from "./operation.js";
import { intOption } from "./options.js";
import { suggestCommand } from "./suggest.js";
import { isView, listedFields, viewFields } from "./view.js";

/**
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
export async function describeCommand(positionals, values, ctx) {
    if (values.suggest) {
        return suggestCommand(positionals, values, ctx);
    }
    refuseSuggestOptions(values);
    // --data alone (describe --data - --data-format csv) is the data to describe; with an argument it is a view's data
    const dataAlone = positionals[0] === undefined && values.data !== undefined;
    if (dataAlone && values.as === "view") {
        throw new CliError("usage", "MISSING_INPUT", "--as view needs the view as the argument: pivotkit describe <view> --data <data>");
    }
    const input = dataAlone ? values.data : positionals[0];
    if (input === undefined) {
        throw new CliError("usage", "MISSING_INPUT", "describe needs a view or a data file (the argument, or --data <file>)");
    }
    const items = intOption("items", values.items, 0, 1000) ?? 0;
    const read = await inputKind(input, values, ctx);
    refuseMixedInputs(input, read.kind, dataAlone, values);
    return read.kind === "view" ? describeView(input, read.text, values, ctx) : describeData(input, read, items, values, ctx);
}

/** The options that act with --suggest only are a usage error without it. */
function refuseSuggestOptions(values) {
    const onlySuggest = ["output", "lenient", "map", "save-view"].find((f) => values[f] !== undefined) ?? (hasLayoutFlags(values) ? ["rows", "cols", "values", "group", "filter", "chart-type"].find((f) => values[f] !== undefined) : undefined);
    if (onlySuggest) {
        throw new CliError("usage", "NEEDS_SUGGEST", `--${onlySuggest} acts with --suggest only: pivotkit describe <data> --suggest --${onlySuggest} ...`);
    }
}

/**
 * Whether the input is a view or data: --as, else JSON text or a JSON file (or stdin without
 * --data-format) that is a view; everything else is data.
 * @param {string} input
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @returns {Promise<{ kind: string, text: string | null, bytes: Uint8Array | null }>}  with the JSON read to tell, kept for reading it as data
 */
async function inputKind(input, values, ctx) {
    if (values.as) {
        return { kind: values.as, text: null, bytes: null };
    }
    if (input.trimStart().startsWith("{")) {
        return { kind: isView(input) ? "view" : "data", text: input, bytes: null };
    }
    const ext = input === "-" ? values["data-format"] ?? "" : extname(input).slice(1).toLowerCase();
    if (ext !== "json" && (input !== "-" || values["data-format"])) {
        return { kind: "data", text: null, bytes: null };
    }
    const bytes = await ctx.readInput(input, "the input", Math.max(VIEW_BYTES, ctx.fileLimits.fileBytes), "fileBytes");
    // a file larger than a view may be is data: not decoded and parsed only to tell
    const text = bytes.length <= VIEW_BYTES ? textOf(bytes) : null;
    return { kind: text !== null && isView(text) ? "view" : "data", text, bytes };
}

/**
 * describe takes one thing to describe: a view (with its data in --data), or data. Data given twice,
 * or a view given as --data, would leave one input out: a usage error says which.
 * @param {string} input  the argument, or --data alone
 * @param {string} kind  "view" or "data", as read
 * @param {boolean} dataAlone  --data without an argument
 * @param {Record<string, any>} values
 */
function refuseMixedInputs(input, kind, dataAlone, values) {
    if (kind === "data" && !dataAlone && values.data !== undefined) {
        throw new CliError("usage", "DATA_TWICE", `${shortName(input)} is data, and so is --data ${shortName(values.data)}: describe one of them (pivotkit describe <data>), or give a view with --data`);
    }
    if (dataAlone && kind === "view") {
        const name = quoteArg(input === "-" ? "-" : shortName(input));
        throw new CliError("usage", "VIEW_NOT_DATA", `--data ${shortName(input)} is a view, not data: describe it with pivotkit describe ${name} (and its data with --data <data>)`);
    }
}

/**
 * The sheet the view was made on (source.params.sheet), read from its view file; null for a view
 * file that cannot be read.
 * @param {string} view
 */
function sheetOfView(view) {
    const viewFile = fromViewFile(view);
    return !viewFile.failed && typeof viewFile.source?.params?.sheet === "string" ? viewFile.source.params.sheet : null;
}

/**
 * A view described: its text on stdout (not with --json), its findings explained against the data.
 * @param {string} input
 * @param {string | null} text  the input as read to tell what it is
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
async function describeView(input, text, values, ctx) {
    const view = text ?? (input.trimStart().startsWith("{") ? input : textOf(await ctx.readInput(input, "the view", VIEW_BYTES, "json")));
    const data = withViewTypes(await readData(values, ctx, sheetOfView(view)), viewFields(view));
    const fields = data ? null : listedFields({ view });
    if (!data && fields === null) {
        throw new CliError("usage", "MISSING_DATA", "describing a view needs its data (--data) or a view file that lists its fields (source.fields)");
    }
    const { result } = await runOperation("describe_view", { source: data?.name || "view file", view }, operationEnv(ctx, data, fields));
    const { findings, ...extra } = result;
    if (!values.json && result.description) {
        ctx.io.stdout.write(`${printable(result.name || "view")}: ${printable(result.description.text)}\n`);
    }
    const notes = data?.notes ?? [];
    const viewFindings = findings.filter((f) => !notes.includes(f));
    return { findings: [...notes, ...explained(viewFindings, view, data)], extra: { kind: "view", ...extra, sheet: data?.sheet ?? null } };
}

/**
 * Data described: its rows and fields on stdout (not with --json), a workbook's sheets too.
 * @param {string} input
 * @param {{ text: string | null, bytes: Uint8Array | null }} read  the input as read to tell what it is
 * @param {number} items  --items: example values per field
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
async function describeData(input, { text, bytes }, items, values, ctx) {
    // the bytes or the text read to tell (JSON that is no view), else the file
    const known = bytes ?? (text !== null ? new TextEncoder().encode(text) : null);
    const data = await readData({ ...values, data: input, "data-format": values["data-format"] ?? (known ? "json" : undefined) }, known ? withBytes(ctx, input, known) : ctx);
    const { result } = await runOperation("describe_source", { source: data.name, items }, operationEnv(ctx, data));
    // what describeSource gives (the examples are for a model, not for a log)
    const summary = { rows: result.rows, fields: result.fields, text: result.text };
    const sheets = data.sheets ? await data.sheets() : null;
    if (!values.json) {
        printData(ctx.io.stdout, summary, sheets, data.sheet);
    }
    return { findings: data.notes, extra: { kind: "data", description: summary, sheet: data.sheet, ...(sheets ? { sheets } : {}) } };
}

/**
 * The description of data for a person: its text, a workbook's sheets with the one read marked, and
 * a line per field with its example values.
 * @param {{ write(chunk: string): unknown }} stdout
 * @param {{ text: string, fields: any[] }} summary
 * @param {Array<{ name: string, visible: boolean }> | null} sheets
 * @param {string | null} sheetRead
 */
function printData(stdout, summary, sheets, sheetRead) {
    stdout.write(`${printable(summary.text)}\n`);
    if (sheets && sheets.length > 0) {
        stdout.write(`  sheets: ${sheets.map((s) => sheetLabel(s, s.name === sheetRead)).join(", ")}\n`);
    }
    for (const f of summary.fields) {
        stdout.write(`  ${printable(f.text)}${f.items?.length ? `; e.g. ${f.items.map((v) => printable(JSON.stringify(v))).join(", ")}` : ""}\n`);
    }
}
