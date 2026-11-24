/*
 * pivotkit render: a view over data (a view file, --link or JSON text with --data; or the data with
 * layout flags or --suggest) rendered by pivotkit-report's render_view into HTML, CSV, JSON, XLSX or
 * SVG, on stdout or into -o; --save-view writes the view rendered as a view file of that data.
 * Nothing is written when the view has errors, unless --lenient.
 */

import { resolve as resolvePath } from "node:path";
import { encode, outsideLimits, viewFileText } from "pivotkit-core";
import { CliError, asCliError, printable, shortName, writeSafe } from "pivotkit-node/files";
import { readData, withViewTypes } from "./data.js";
import { explained, withDataHint, withJsonPosition } from "./explain.js";
import { TEMPLATE_BYTES, checkNotInput, textOf } from "./inputs.js";
import { fromFields, normalized, quoteArg, viewFileFor } from "./layout-view.js";
import { nothingWritten } from "./nothing-written.js";
import { limitsOption, operationEnv, runOperation } from "./operation.js";
import { intOption } from "./options.js";
import { FORMAT_NAMES, ignoredOptions, renderFormat, renderInputs } from "./render-options.js";
import { readView, viewFields, viewFileOf, withMap } from "./view.js";
import { viewFromData } from "./view-from-data.js";
import { versions } from "./versions.js";

/**
 * pivotkit render: the findings, the --json fields and the line that says what was written.
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
export async function renderCommand(positionals, values, ctx) {
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `render takes one view, not ${positionals.length}`);
    }
    const format = renderFormat(values, ctx);
    await checkOutputs(positionals, values, ctx);
    const { made, view, data } = await renderSource(positionals, values, ctx);
    const findings = [...data.notes, ...(made?.findings ?? /** @type {any} */ (view).findings ?? []), ...ignoredOptions(values, format)];
    const env = await renderEnv(values, ctx, data, { format, fromLayout: Boolean(made) });
    const input = { source: data.name, view: view.view, format, ...renderInputs(values) };
    const { result, file: rendered } = await runOperation("render_view", input, env, values.template);
    // the view's findings (the data's notes are in already), explained against the data
    const viewFindings = result.findings.filter((f) => !data.notes.includes(f));
    findings.push(...withDataHint(withJsonPosition(explained(viewFindings, view.view, data), view.view), view, "render"));
    const noRows = noRowsKept(result.summary, findings, view, data);
    if (noRows) {
        findings.push(noRows);
    }
    const failed = findings.some((f) => f.severity === "error" || (values.strict && f.severity === "warning"));
    const writes = Boolean(rendered) && !(failed && !values.lenient);
    /** @type {any} */
    const extra = { summary: result.summary, sheet: data.sheet, ...(made?.picks.length ? { draft: true, picks: made.picks } : {}) };
    const saved = writes && values["save-view"] !== undefined ? await saveView(view, data, values, ctx, made?.built.encoded) : null;
    if (saved) {
        extra.savedView = saved;
    }
    if (!writes) {
        extra.output = null;
    } else {
        const output = await writeReport(rendered.bytes, values, ctx, { format, mediaType: result.mediaType });
        if (output) {
            extra.output = output;
        }
    }
    return { findings, extra, ...renderNote(findings, extra, { made, saved, data, failed, format, summary: result.summary }) };
}

/**
 * The outputs (-o, --save-view) checked before anything is read: none may name an input, and they
 * may not name each other.
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
async function checkOutputs(positionals, values, ctx) {
    // the inputs an output must not replace: the data (the argument with layout flags), else the view and --data
    /** @type {Array<[string | undefined, string]>} */
    const inputs = fromFields(values) ? [[positionals[0] ?? values.data, "data"]] : [[values.link === undefined ? positionals[0] : undefined, "view"], [values.data, "data"]];
    if (values.output !== undefined) {
        await checkNotInput(ctx, "-o", values.output, inputs, "output");
    }
    if (values["save-view"] !== undefined) {
        await checkNotInput(ctx, "--save-view", values["save-view"], inputs.filter(([, what]) => what === "data"), "view file");
    }
    checkSaveView(values);
}

/** -o and --save-view naming the same file would write the view over the report: refused first. */
function checkSaveView(values) {
    const save = values["save-view"];
    if (save === undefined) {
        return;
    }
    if (values.output !== undefined && resolvePath(values.output) === resolvePath(save)) {
        throw new CliError("usage", "SAME_FILE", "-o and --save-view name the same file: give the view file another name");
    }
    if (!/\.json$/i.test(save)) {
        throw new CliError("usage", "UNKNOWN_EXTENSION", `--save-view ${shortName(save)}: a view file is JSON: name it <name>.pivotkit.json`);
    }
}

/**
 * The view and the data to render: made from the data's fields (layout flags, --suggest), else the
 * view given with --map applied and the data of --data with the types its view file lists.
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
async function renderSource(positionals, values, ctx) {
    const made = fromFields(values) ? await viewFromData(positionals, values, ctx, "render") : null;
    const view = made ? made.read : withMap(await readView(positionals, values, ctx), values);
    const data = made ? made.data : withViewTypes(await readData(values, ctx, view.sheet), viewFields(view.view));
    if (!data) {
        throw new CliError("usage", "MISSING_DATA", "render needs data: --data <file>, --data - for stdin, or a server's source: --source <id> with --url or PIVOTKIT_URL");
    }
    return { made, view, data };
}

/**
 * The environment of render_view: the operation's, and the command line's own render options (the
 * template file, --lenient, the byte order mark, the chart's size).
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {any} data
 * @param {{ format: string, fromLayout: boolean }} how
 */
async function renderEnv(values, ctx, data, { format, fromLayout }) {
    const template = values.template !== undefined ? textOf(await ctx.readInput(values.template, "the template", TEMPLATE_BYTES, "template")) : undefined;
    const echarts = format === "svg" || format === "html" ? await import("echarts") : undefined;
    const width = intOption("width", values.width, 100, 8000);
    const height = intOption("height", values.height, 100, 8000);
    return {
        ...operationEnv(ctx, data),
        // a view from the layout flags: an item of --filter that is none of the field's values is a warning with the one meant
        ...(fromLayout ? { unknownItems: true } : {}),
        ...(echarts ? { echarts } : {}),
        renderOptions: {
            strict: !values.lenient,
            ...(template !== undefined ? { template } : {}),
            // a byte order mark lets Excel read a CSV file as UTF-8; a program reading stdout gets none
            ...(format === "csv" ? { bom: values.bom === "on" || ((values.bom ?? "auto") === "auto" && Boolean(values.output)) } : {}),
            ...(width || height ? { size: { ...(width ? { width } : {}), ...(height ? { height } : {}) } } : {})
        }
    };
}

/**
 * Filters that keep no row give a table of zeros: a warning says so, not left for the reader to
 * wonder. Null when rows are kept or the view has errors.
 * @param {any} summary  render_view's
 * @param {any[]} findings
 * @param {{ view: unknown }} view
 * @param {{ name: string }} data
 */
function noRowsKept(summary, findings, view, data) {
    const s = summary;
    if (!(s && s.sourceRows > 0 && s.keptRows === 0) || findings.some((f) => f.severity === "error")) {
        return null;
    }
    const read = viewFileOf(view.view);
    const dated = /** @type {any[]} */ (read.view?.filters ?? []).some((f) => f?.type === "relative");
    return { severity: "warning", code: "noRowsKept", path: "", message: printable(`the filters keep none of the ${s.sourceRows.toLocaleString("en-US")} rows of ${data.name}${dated ? " (a date filter counts from --now or today)" : ""}`) };
}

/**
 * The rendered file written into -o, or on stdout without -o. What -o got, for --json; nothing for stdout.
 * @param {Uint8Array} bytes
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {{ format: string, mediaType: string }} what
 */
async function writeReport(bytes, values, ctx, { format, mediaType }) {
    if (!values.output) {
        ctx.io.stdout.write(bytes);
        if (format === "html" && ctx.io.stdout.isTTY && !values.quiet) {
            ctx.io.stderr.write("an HTML report was written to the terminal: add -o report.html to save it\n");
        }
        return undefined;
    }
    try {
        await writeSafe(values.output, bytes, { cwd: ctx.io.cwd, allow: ctx.allow });
    } catch (e) {
        const error = asCliError(e, values.output);
        // -o /dev/stdout: a device is never replaced, and stdout is where the output goes without -o
        throw error.code === "SPECIAL_FILE" ? new CliError(error.kind, error.code, `${error.message}; to write to stdout, leave out -o`) : error;
    }
    return { file: shortName(values.output), format, mediaType, bytes: bytes.length };
}

/**
 * --save-view: the view rendered (normalized) as a view file for the data it ran on, the source named
 * as the browser names the file, with the workbook's sheet.
 */
async function saveView(view, data, values, ctx, known) {
    const encoded = known ?? encode(data.table, { ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}), ...limitsOption(ctx.limits) });
    const read = viewFileOf(view.view);
    const viewUsed = normalized(/** @type {any} */ (read.view ?? {}), encoded, outsideLimits(ctx.limits));
    const name = values.title ?? (read.name || "");
    const file = await viewFileFor(viewUsed, data, encoded, { name, ...(read.description ? { description: read.description } : {}), version: versions()["pivotkit-cli"] });
    const bytes = new TextEncoder().encode(viewFileText(file));
    try {
        await writeSafe(values["save-view"], bytes, { cwd: ctx.io.cwd, allow: ctx.allow });
    } catch (e) {
        throw asCliError(e, values["save-view"]);
    }
    return { file: shortName(values["save-view"]), bytes: bytes.length };
}

/**
 * The line for a person: what was written (with the picks of a draft and the view saved), or why
 * nothing was.
 * @param {any[]} findings
 * @param {any} extra
 * @param {{ made: any, saved: { file: string } | null, data: { name: string }, failed: boolean, format: string, summary: any }} run
 * @returns {{ note: string | null, noteIsError?: boolean }}
 */
function renderNote(findings, extra, { made, saved, data, failed, format, summary }) {
    if (extra.output === null) {
        return { note: nothingWritten(findings), noteIsError: true };
    }
    const savedLines = saved ? [`wrote ${saved.file}: the view, to render again with pivotkit render ${quoteArg(saved.file)} --data ${quoteArg(data.name)}`] : [];
    if (!extra.output) {
        const lines = [...(made?.lines ?? []), ...savedLines];
        return { note: lines.length ? lines.join("\n") : null };
    }
    const file = extra.output.file;
    if (failed) {
        const errors = findings.filter((f) => f.severity === "error").length;
        const mismatch = findings.some((f) => f.code === "dataMismatch");
        return { note: `wrote ${file} despite ${errors} error${errors === 1 ? "" : "s"} (--lenient)${mismatch ? ": the data lacks the view's fields, so the report shows none of them" : ""}` };
    }
    const lines = [...(made?.lines ?? []), `wrote ${file}: ${FORMAT_NAMES[format]}${summary ? `, ${summary.rows} rows x ${summary.columns} columns, from ${summary.sourceRows.toLocaleString("en-US")} rows of ${data.name}` : ""}`, ...savedLines];
    return { note: lines.join("\n") };
}
