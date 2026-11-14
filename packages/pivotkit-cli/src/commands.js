/*
 * The one table of the CLI: its commands, their arguments and their options with what each takes. The
 * argument parser (node:util parseArgs), `pivotkit help` and the shell completions (completion.js)
 * are all made from it, so they cannot drift apart.
 */

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
 * @property {string} text  one line of help
 */

/** @type {Readonly<Record<string, OptionSpec>>} Options every command takes. */
export const GLOBAL_OPTIONS = Object.freeze({
    json: { type: "boolean", text: "Write the result as one JSON object on stdout (render: needs -o)." },
    quiet: { type: "boolean", short: "q", text: "Write no notes and warnings to stderr; errors still." },
    locale: { type: "string", value: "tag", env: "PIVOTKIT_LOCALE", text: "render: numbers, dates and texts in this locale when the view names none (default en-US); checked by every command." },
    "time-zone": { type: "string", value: "zone", env: "PIVOTKIT_TIME_ZONE", text: "Time zone of the data's dates and of the generated time (default UTC)." },
    now: { type: "string", value: "date", env: "PIVOTKIT_NOW", text: 'render: the "today" of relative date filters and the generated time; fix it for the same output on every run; checked by every command.' },
    limit: { type: "string", multiple: true, value: "key=n", text: "Set one of pivotkit-core's limits (rows=200000); may be given more than once." },
    "allow-dir": { type: "string", multiple: true, value: "dir", complete: "dir", text: "Read and write only inside this directory (symbolic links and .. resolved); may be given more than once." },
    help: { type: "boolean", short: "h", text: "Show the help of the command." }
});

/** @type {Readonly<Record<string, OptionSpec>>} Options of commands that read data. */
const DATA_OPTIONS = Object.freeze({
    data: { type: "string", value: "file", complete: "file", text: "The data: a CSV, JSON or XLSX file, or - for stdin." },
    "data-format": { type: "string", value: "format", choices: ["csv", "json", "xlsx"], text: "The data's format; needed for stdin, else taken from the file's extension." },
    sheet: { type: "string", value: "name", text: "The sheet of a workbook to read (default the first visible one)." }
});

/** @type {Readonly<Record<string, OptionSpec>>} Options of commands that read a view. */
const VIEW_OPTIONS = Object.freeze({
    link: { type: "string", value: "url", text: "Read the view from a pivotkit link (an address or its #fragment) instead of <view>." },
    key: { type: "string", value: "key", text: "The report's key in the link (when its page has more than one report)." }
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
        usage: "pivotkit render <view> --data <file> [-o <file>] [options]",
        text: "Run a view over data and write the result: an HTML report, CSV, JSON, XLSX or the chart as SVG.",
        args: [{ name: "view", text: "A view file, a view as JSON text, or - for stdin.", optional: true, complete: "file" }],
        options: {
            ...VIEW_OPTIONS,
            ...DATA_OPTIONS,
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
        examples: ["pivotkit render sales.pivotkit.json --data sales.csv -o sales.html", "pivotkit render view.json --data - --data-format csv --format csv < sales.csv > out.csv", "pivotkit render view.json --data sales.xlsx -o chart.svg --now 2026-11-13"]
    },
    validate: {
        usage: "pivotkit validate <view> [--data <file>] [options]",
        text: "Check a view against data (or the fields its view file lists): errors exit 1, warnings too with --strict.",
        args: [{ name: "view", text: "A view file, a view as JSON text, or - for stdin.", optional: true, complete: "file" }],
        options: { ...VIEW_OPTIONS, ...DATA_OPTIONS, strict: { type: "boolean", text: "Warnings are findings too (exit 1)." } },
        examples: ["pivotkit validate sales.pivotkit.json --data sales.csv --strict"]
    },
    describe: {
        usage: "pivotkit describe <view | data> [options]",
        text: "Describe a view (what it shows and filters) or a data file (its fields, types and counts).",
        args: [{ name: "input", text: "A view file or a data file (CSV, JSON, XLSX), or - for stdin.", complete: "file" }],
        options: {
            ...DATA_OPTIONS,
            as: { type: "string", value: "kind", choices: ["view", "data"], text: "Read the input as a view or as data (default: a view when it is one)." },
            items: { type: "string", value: "n", text: "data: list up to n values of each field (default none: names, types and counts only)." }
        },
        examples: ["pivotkit describe sales.csv --json", "pivotkit describe sales.pivotkit.json --data sales.csv"]
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
