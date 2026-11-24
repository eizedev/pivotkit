/*
 * render's output options, the same locally and with a server (remote-commands.js): the format from
 * -f or -o's extension, checked before anything is read; the render_view inputs of its flags; and the
 * options given that do nothing in the format.
 */

import { extname } from "node:path";
import { RENDER_FORMATS } from "pivotkit-report";
import { CliError, printable, shortName } from "pivotkit-node/files";
import { COMMANDS, optionsOf } from "./commands.js";

/** What each output format is, for the line that says what was written. */
export const FORMAT_NAMES = Object.freeze({ html: "an HTML report", csv: "a CSV file", json: "a JSON file", xlsx: "an Excel workbook", svg: "an SVG chart" });

/** The extensions -o names a format by (".htm" is HTML too). */
const EXTENSIONS = Object.freeze({ ...Object.fromEntries(Object.keys(RENDER_FORMATS).map((f) => [f, f])), htm: "html" });

/** The format of an output file by its extension; html on stdout. Another extension is an error, not HTML in a .pdf. */
function formatOf(output) {
    if (!output) {
        return "html";
    }
    const ext = extname(output).slice(1).toLowerCase();
    if (!Object.hasOwn(EXTENSIONS, ext)) {
        throw new CliError("usage", "UNKNOWN_EXTENSION", `${shortName(output)}: ${ext ? `.${printable(ext)} is no format pivotkit writes` : "no extension to take the format from"}; give -f ${COMMANDS.render.options.format.choices?.join(", ")}, or an extension of one`);
    }
    return EXTENSIONS[ext];
}

/**
 * render's output, checked before anything is read (locally and with a server): -o and --json, the
 * name's extension against -f, no workbook to a terminal. The format.
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
export function renderFormat(values, ctx) {
    if (values.output === "-") {
        throw new CliError("usage", "BAD_VALUE", "-o -: the output goes to stdout when -o is left out");
    }
    if (values.json && !values.output) {
        throw new CliError("usage", "JSON_NEEDS_OUTPUT", "--json writes the result on stdout: give the output a file with -o");
    }
    if (values.format && values.output) {
        // -o t.html -f csv would write CSV into an .html file: the name and the format must agree
        const ext = extname(values.output).slice(1).toLowerCase();
        if (Object.hasOwn(EXTENSIONS, ext) && EXTENSIONS[ext] !== values.format) {
            const name = shortName(values.output);
            throw new CliError("usage", "FORMAT_MISMATCH", `${name} names ${FORMAT_NAMES[EXTENSIONS[ext]]}, -f asks for ${FORMAT_NAMES[values.format]}: name it ${name.slice(0, name.length - ext.length)}${values.format}, or leave out -f`);
        }
    }
    const format = values.format ?? formatOf(values.output);
    if (!values.output && format === "xlsx" && ctx.io.stdout.isTTY) {
        throw new CliError("usage", "BINARY_TO_TERMINAL", "an XLSX file is not shown in a terminal: write it to a file with -o, or redirect stdout");
    }
    return format;
}

/**
 * The render_view inputs of render's flags, the same locally and with a server: the title, the
 * chart, how numbers are written and the flat header.
 * @param {Record<string, any>} values
 */
export function renderInputs(values) {
    return {
        ...(values.title !== undefined ? { title: values.title } : {}),
        ...(values.chart ? { chart: values.chart } : {}),
        ...(values.numbers ? { numbers: values.numbers } : {}),
        ...(values["flat-header"] ? { flatHeader: true } : {})
    };
}

/** Warnings for options given that do nothing in the format (their `formats` in the table). */
export function ignoredOptions(values, format) {
    return Object.entries(optionsOf("render"))
        .filter(([name, spec]) => spec.formats && values[name] !== undefined && !spec.formats.includes(format))
        .map(([name, spec]) => ({ severity: "warning", code: "ignoredOption", path: "", message: `--${name} does nothing in ${format} (only in ${spec.formats.join(", ")})` }));
}
