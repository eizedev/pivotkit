/*
 * The one table of the CLI: its commands, their arguments and their options with what each takes. The
 * argument parser (node:util parseArgs), `pivotkit help` and the shell completions (completion.js)
 * are all made from it, so they cannot drift apart.
 */

import { createRequire } from "node:module";
import { CATALOG } from "pivotkit-core";

/**
 * @typedef {object} OptionSpec
 * @property {"string" | "boolean"} type
 * @property {string} [short]  one letter
 * @property {boolean} [multiple]  may be given more than once
 * @property {string} [value]  the value's name in the help ("file", "dir")
 * @property {string[]} [choices]  the values it takes (checked, and offered by the completions)
 * @property {"file" | "dir"} [complete]  what a shell completes for its value
 * @property {string} [env]  the environment variable that gives its default
 * @property {string[]} [formats]  render: the output formats it acts in (given with another, a warning)
 * @property {string[]} [commands]  a global option: the commands it acts in, whose help lists it (every
 *   command still takes it, so a script can pass it to all); default every command
 * @property {string} text  one line of help
 */

/** The documentation site, from package.json's homepage (its CLI page): "https://pivotkit.eize.dev/". */
export const DOCS = new URL("/", createRequire(import.meta.url)("../package.json").homepage).href;

/** @type {Readonly<Record<string, OptionSpec>>} Options every command takes. */
export const GLOBAL_OPTIONS = Object.freeze({
    json: { type: "boolean", text: "Write the result as one JSON object on stdout (render: needs -o)." },
    quiet: { type: "boolean", short: "q", text: "Write no notes and warnings to stderr; errors still." },
    verbose: { type: "boolean", commands: ["render", "validate", "describe"], text: "Also write how the data was read (encoding, separator, sheet) to stderr." },
    locale: { type: "string", value: "tag", env: "PIVOTKIT_LOCALE", commands: ["render", "describe"], text: "Numbers, dates and the report's words in this locale when the view names none, and the names of groupings (default en-US; de-DE: German)." },
    "time-zone": { type: "string", value: "zone", env: "PIVOTKIT_TIME_ZONE", commands: ["render", "validate", "describe"], text: "Time zone of the data's dates and of the generated time (default UTC)." },
    now: { type: "string", value: "date", env: "PIVOTKIT_NOW", commands: ["render"], text: 'The "today" of relative date filters and the generated time; fix it for the same output on every run.' },
    limit: { type: "string", multiple: true, value: "key=n", commands: ["render", "validate", "describe"], text: "Set one of pivotkit-core's limits (rows=200000); may be given more than once." },
    "allow-dir": { type: "string", multiple: true, value: "dir", complete: "dir", text: "Read and write only inside this directory (symbolic links and .. resolved); may be given more than once." },
    help: { type: "boolean", short: "h", text: "Show the help of the command." }
});

/** @type {Readonly<Record<string, OptionSpec>>} Options of commands that read data. */
const DATA_OPTIONS = Object.freeze({
    data: { type: "string", value: "file", complete: "file", text: "The data: a CSV, JSON or XLSX file, or - for stdin." },
    "data-format": { type: "string", value: "format", choices: ["csv", "json", "xlsx"], text: "The data's format; needed for stdin, else taken from the file's extension." },
    sheet: { type: "string", value: "name", text: "The sheet of a workbook to read (default the one the view names, else the first visible one)." }
});

/** @type {Readonly<Record<string, OptionSpec>>} Options of commands that read a view. */
const VIEW_OPTIONS = Object.freeze({
    link: { type: "string", value: "url", text: "Read the view from a pivotkit link (an address or its #fragment) instead of <view>." },
    key: { type: "string", value: "key", text: "The report's key in the link (when its page has more than one report)." }
});

/**
 * @type {Readonly<Record<string, OptionSpec>>} The layout flags: a view from field names, without a view
 * file (render), or the parts of a suggested view to change (describe and render with --suggest). One
 * value names one thing; each may be given again, outer first.
 */
const LAYOUT_OPTIONS = Object.freeze({
    suggest: { type: "boolean", text: "A draft view from the data's fields: text fields with few values as rows and columns, a date grouped by its span, the first number summed." },
    rows: { type: "string", multiple: true, value: "field", text: "A field on the rows (again for the next level); a date is grouped by its span unless --group says how." },
    cols: { type: "string", multiple: true, value: "field", text: "A field on the columns." },
    values: { type: "string", multiple: true, value: "agg:field", text: 'A value: sum:Revenue, "average:Mean °C", count (rows), or a field alone (a number summed, else counted).' },
    group: { type: "string", multiple: true, value: "field:unit", text: "Group a field where it is placed: Date:yearMonth, Date:month (Jan to Dec of every year), Revenue:bin:500." },
    filter: { type: "string", multiple: true, value: "json", text: 'A filter as a view writes it, as JSON or @file.json: {"field":"Region","type":"in","items":["North"]}.' },
    "chart-type": { type: "string", value: "type", choices: [...CATALOG.chartTypes], text: "Show the chart of this type (with layout flags or --suggest)." },
    map: { type: "string", multiple: true, value: "old=new", text: "The view's field old is the data's new (a column renamed since the view was made): --map Revenue=Turnover." }
});

/**
 * @typedef {object} CommandSpec
 * @property {string} usage
 * @property {string} text
 * @property {Array<{ name: string, text: string, optional?: boolean, complete?: "file" | "shell" | "command" | "example" }>} args
 * @property {Readonly<Record<string, OptionSpec>>} options  besides GLOBAL_OPTIONS
 * @property {string[]} [examples]
 */

/** @type {Readonly<Record<string, CommandSpec>>} */
export const COMMANDS = Object.freeze({
    render: {
        usage: "pivotkit render <view> --data <file> [-o <file>] [options]\n       pivotkit render <data> (--rows <field> ... --values <agg:field> | --suggest) [-o <file>] [options]",
        text: "Run a view over data and write the result: an HTML report, CSV, JSON, XLSX or the chart as SVG.",
        args: [{ name: "view", text: "A view file, a view as JSON text, or - for stdin; with layout flags or --suggest: the data.", optional: true, complete: "file" }],
        options: {
            ...VIEW_OPTIONS,
            ...DATA_OPTIONS,
            ...LAYOUT_OPTIONS,
            "save-view": { type: "string", value: "file", complete: "file", text: "Also write the view used as a view file (after --map; with layout flags or --suggest the view they make)." },
            format: { type: "string", short: "f", value: "format", choices: ["html", "csv", "json", "xlsx", "svg"], text: "The output's format; default -o's extension (another one is an error), html on stdout." },
            output: { type: "string", short: "o", value: "file", complete: "file", text: "Write to this file (replaced if it is a file) instead of stdout." },
            template: { type: "string", value: "file", complete: "file", formats: ["html"], text: "html: the print template with {{placeholders}} (default the built-in one)." },
            title: { type: "string", value: "text", formats: ["html", "xlsx"], text: "html, xlsx: the report's title (default the view file's name)." },
            chart: { type: "string", value: "when", choices: ["auto", "on", "off"], formats: ["html"], text: "html: the chart above the table: auto (when the view shows the chart), on or off." },
            width: { type: "string", value: "px", formats: ["svg", "html"], text: "svg, html: the chart's width (default 800)." },
            height: { type: "string", value: "px", formats: ["svg", "html"], text: "svg, html: the chart's height (default 480)." },
            bom: { type: "string", value: "when", choices: ["auto", "on", "off"], formats: ["csv"], text: "csv: a byte order mark first, so Excel reads UTF-8: auto (in a file of -o, not on stdout), on or off." },
            lenient: { type: "boolean", text: "Write the output also when the view has errors (as the report shows it); the exit code is still 1." },
            strict: { type: "boolean", text: "Warnings are findings too (exit 1)." }
        },
        examples: ["pivotkit render sales.pivotkit.json --data sales.csv -o sales.html", 'pivotkit render sales.xlsx --rows Region --cols Month --group Month:yearMonth --values sum:Revenue -o sales.html', "pivotkit render sales.csv --suggest -o draft.html --save-view draft.pivotkit.json", "pivotkit render view.json --data - --data-format csv --format csv < sales.csv > out.csv", "pivotkit render view.json --data sales.xlsx -o chart.svg --now 2026-11-13"]
    },
    validate: {
        usage: "pivotkit validate <view> [--data <file>] [options]",
        text: "Check a view against data (or the fields its view file lists): errors exit 1, warnings too with --strict.",
        args: [{ name: "view", text: "A view file, a view as JSON text, or - for stdin.", optional: true, complete: "file" }],
        options: { ...VIEW_OPTIONS, ...DATA_OPTIONS, strict: { type: "boolean", text: "Warnings are findings too (exit 1)." } },
        examples: ["pivotkit validate sales.pivotkit.json --data sales.csv --strict"]
    },
    describe: {
        usage: "pivotkit describe <view | data> [options]\n       pivotkit describe <data> --suggest [-o <file>] [layout flags]",
        text: "Describe a view (what it shows and filters) or a data file (its fields, types and counts); --suggest writes a draft view of the data.",
        args: [{ name: "input", text: "A view file or a data file (CSV, JSON, XLSX), or - for stdin.", complete: "file" }],
        options: {
            ...DATA_OPTIONS,
            ...LAYOUT_OPTIONS,
            output: { type: "string", short: "o", value: "file", complete: "file", text: "--suggest: write the draft view file here (replaced if it is a file) instead of stdout." },
            lenient: { type: "boolean", text: "--suggest: write the draft also when the data has nothing to group by (a count of rows); the exit code is still 1." },
            strict: { type: "boolean", text: "Warnings are findings too (exit 1)." },
            as: { type: "string", value: "kind", choices: ["view", "data"], text: "Read the input as a view or as data (default: a view when it is one)." },
            items: { type: "string", value: "n", text: "data: list up to n values of each field (default none: names, types and counts only)." }
        },
        examples: ["pivotkit describe sales.csv --json", "pivotkit describe sales.pivotkit.json --data sales.csv", "pivotkit describe sales.xlsx --suggest -o draft.pivotkit.json", 'pivotkit describe weather.csv --suggest --values "average:Mean °C"']
    },
    example: {
        usage: "pivotkit example [name] [--list]",
        text: "Write an example's data and views into the current directory (never over a file) and say what to run next.",
        args: [{ name: "name", text: "The example (default sales); --list names them all.", optional: true, complete: "example" }],
        options: { list: { type: "boolean", text: "List the examples and their files; write nothing." } },
        examples: ["pivotkit example", "pivotkit example weather", "pivotkit example --list"]
    },
    completion: {
        usage: "pivotkit completion <bash | zsh | fish | powershell>",
        text: "Print the shell's completion script for pivotkit.",
        args: [{ name: "shell", text: "bash, zsh, fish or powershell.", complete: "shell" }],
        options: {},
        examples: ['eval "$(pivotkit completion bash)"', "pivotkit completion powershell | Out-String | Invoke-Expression"]
    },
    help: {
        usage: "pivotkit help [command]",
        text: "Show the help of pivotkit or of a command.",
        args: [{ name: "command", text: "A command.", optional: true, complete: "command" }],
        options: {}
    }
});

/** The shells completion() writes for. */
export const SHELLS = Object.freeze(["bash", "zsh", "fish", "powershell"]);

/** The options of a command: its own and the global ones. */
export const optionsOf = (command) => ({ ...GLOBAL_OPTIONS, ...(COMMANDS[command]?.options ?? {}) });
