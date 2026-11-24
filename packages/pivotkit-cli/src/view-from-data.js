/*
 * render or describe with layout flags or --suggest: the data read from the argument or --data, and
 * the view made from its fields (layout-view.js), with the findings that came with it and the lines
 * that say what was picked. A view file given where the data belongs, and an exported pivot result
 * given as the data, are said so.
 */

import { extname, resolve as resolvePath } from "node:path";
import { VIEW_FILE_FORMAT, VIEW_FILE_VERSION } from "pivotkit-core";
import { CliError, printable, shortName } from "pivotkit-node/files";
import { DATA_EXTENSIONS, readData } from "./data.js";
import { pivotResultAdvice, pivotResultLines, pivotResultSigns } from "./explain.js";
import { VIEW_BYTES, textOf, withBytes } from "./inputs.js";
import { layoutView, pickLines, quoteArg } from "./layout-view.js";
import { isView } from "./view.js";

/** The flags that make a view from the data, in the order a message names the first one given. */
const VIEW_FLAGS = Object.freeze(["suggest", "rows", "cols", "values", "group", "filter", "chart-type"]);

/**
 * The data (the argument or --data), the view made from its fields, the findings that came with it,
 * and the lines that say what was picked.
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {"render" | "describe"} command
 * @returns {Promise<{ data: import("./data.js").Data, built: any, findings: any[], picks: any[], lines: string[], name: string, description: string, read: { view: string, name: string, source: string, sheet: string | null } }>}
 */
export async function viewFromData(positionals, values, ctx, command) {
    const flag = VIEW_FLAGS.find((f) => values[f] !== undefined);
    const input = dataInput(positionals, values, command, flag);
    const data = await readData({ ...values, data: input }, await notAView(input, values, ctx, command, flag));
    const built = await layoutView(data, values, ctx, { sheets: data.sheets, command, input });
    // an exported pivot result is no data to make a view of: said as for a view that does not fit
    withPivotResult(built.findings, pivotResultSigns(data.table), data.name);
    const draft = Boolean(values.suggest);
    const tool = `pivotkit ${command} --suggest`;
    const name = draft ? `Draft: ${built.name}` : built.name;
    const description = draft ? `A draft suggested by ${tool} from the fields of ${data.name}: check what it shows, then change it in the report or with the layout flags.` : "";
    const fields = data.table.columns.map((c, i) => ({ name: String(c), type: data.table.types[i] }));
    const lines = draft ? pickLines(built.view, `pivotkit ${command} ${quoteArg(shortName(input))} --suggest`, fields) : [];
    const file = { format: VIEW_FILE_FORMAT, formatVersion: VIEW_FILE_VERSION, name, ...(description ? { description } : {}), view: built.view };
    return { data, built, findings: built.findings, picks: built.picks, lines, name, description, read: { view: JSON.stringify(file), name, source: "layout", sheet: data.sheet } };
}

/**
 * The data to make the view of: the argument, else --data. A view given too (--link, or an argument
 * besides --data that is no data file) is a usage error, and so is the data given twice.
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {"render" | "describe"} command
 * @param {string} flag  the flag that makes the view from the data
 */
function dataInput(positionals, values, command, flag) {
    const notBoth = () => new CliError("usage", "VIEW_AND_LAYOUT", `--${flag} makes the view from the data's fields: give a view or layout flags, not both (to change a view file, edit it, or start from pivotkit describe <data> --suggest)`);
    if (values.link !== undefined) {
        throw notBoth();
    }
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `${command} takes one data file, not ${positionals.length}`);
    }
    const arg = positionals[0];
    if (arg !== undefined && values.data !== undefined) {
        const dataLike = DATA_EXTENSIONS.includes(extname(arg).slice(1).toLowerCase()) || resolvePath(arg) === resolvePath(values.data);
        throw dataLike ? new CliError("usage", "DATA_TWICE", `the data twice: give it as the argument (${shortName(arg)}) or with --data, not both`) : notBoth();
    }
    const input = arg ?? values.data;
    if (input === undefined) {
        throw new CliError("usage", "MISSING_DATA", `--${flag} needs the data: pivotkit ${command} <data> --${flag} ..., or a server's source: --source <id> with --url or PIVOTKIT_URL`);
    }
    return input;
}

/**
 * The data looks like an exported pivot result: the lines that say so go before the details of
 * noSuggestion, else a warning (pivotResult) comes first. Changes `findings`.
 * @param {any[]} findings  layoutView's
 * @param {string[]} signs  pivotResultSigns()
 * @param {string} dataName
 */
function withPivotResult(findings, signs, dataName) {
    if (signs.length === 0) {
        return;
    }
    const lines = pivotResultLines(signs, "the rows a report is made from").map(printable);
    const none = findings.find((f) => f.code === "noSuggestion");
    if (none) none.details = [...lines, ...(none.details ?? [])];
    else findings.unshift({ severity: "warning", code: "pivotResult", path: "", message: printable(`${dataName} ${signs.length > 1 ? "looks like" : "may be"} an exported pivot result, not the rows a report is made from`), details: pivotResultAdvice() });
}

/**
 * The data of --suggest or layout flags is no view: a JSON input that is a view (a view file given
 * where the data belongs) is a usage error that says what to give, not the reader's notes on it. JSON
 * is read once here; the context returned hands those bytes to readData.
 * @param {string} input
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {"render" | "describe"} command
 * @param {string} flag  the flag that makes the view from the data
 */
async function notAView(input, values, ctx, command, flag) {
    const format = values["data-format"] ?? (input === "-" ? null : extname(input).slice(1).toLowerCase());
    if (format !== "json" || values.as === "data") {
        return ctx;
    }
    const bytes = await ctx.readInput(input, "the data", ctx.fileLimits.fileBytes, "fileBytes");
    if (bytes.length <= VIEW_BYTES && isView(textOf(bytes))) {
        const name = shortName(input);
        const pasted = quoteArg(input === "-" ? "-" : name);
        throw new CliError("usage", "VIEW_NOT_DATA", `--${flag} makes a view from a data file, and ${name} is a view: give the data (pivotkit ${command} <data> --${flag}${flag === "suggest" ? "" : " ..."}), or ${command} the view with pivotkit ${command} ${pasted} --data <data>`);
    }
    return withBytes(ctx, input, bytes);
}
