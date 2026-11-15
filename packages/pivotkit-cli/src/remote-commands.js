/*
 * render, validate, describe and sources against a pivotkit-server (remote mode, remote.js): the same
 * findings, notes, exit codes and --json shape as the local commands, the data the server's source.
 * The view is read and --map applied here as locally; what needs the data (its types, the local
 * explanations of a mismatch, `noRowsKept`) does not run here: the server's findings say it.
 *
 * Routes: validate POST /views/validate, describe <view> POST /views/describe, describe --suggest
 * POST /views/suggest, render POST /views/validate and then POST /views/render/file (render --suggest:
 * POST /views/suggest, then the file), sources GET /sources and GET /sources/{id} (with --param
 * POST /sources/describe, since the GET takes no params). --param's values go with the source as
 * `params`, as typed: the server reads a number or true/false from a text where the parameter is one.
 */

import { viewFileText } from "pivotkit-core";
import { RENDER_FORMATS } from "pivotkit-report";
import { CliError, RemoteError, asCliError, shortName } from "./errors.js";
import { fromFields, filtersOf, hasLayoutFlags, mapOf } from "./layout-view.js";
import { layoutOf } from "./layout-flags.js";
import { checkTls, createClient, readToken, serverOf, sourceId, timeoutOf } from "./remote.js";
import { SOURCE_ID } from "./rest-contract.js";
import { writeSafe } from "./safe-files.js";

/** Permissions of a file remote mode writes: only its owner reads it (the server's data). */
const PRIVATE_FILE = 0o600;

/**
 * @typedef {object} Helpers  what remote commands share with the local ones in cli.js
 * @property {string} version  pivotkit-cli's
 * @property {(positionals: string[], values: Record<string, any>, ctx: any) => Promise<any>} readView
 * @property {(view: any, values: Record<string, any>) => any} withMap
 * @property {(values: Record<string, any>, ctx: any) => string} renderFormat  render's checks of -o, -f and the terminal; the format
 * @property {(ctx: any, flag: string, output: string, inputs: Array<[string | undefined, string]>, written: string) => Promise<void>} checkNotInput
 * @property {(values: Record<string, any>, format: string) => any[]} ignoredOptions
 * @property {Record<string, string>} formatNames
 */

/**
 * Runs a command against the server.
 * @param {"render" | "validate" | "describe" | "sources"} command
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {Helpers} helpers
 */
export async function remoteCommand(command, positionals, values, ctx, helpers) {
    const server = serverOf(values, ctx.io.env);
    if (command !== "sources") {
        if (values.source === undefined) {
            throw new CliError("usage", "NO_SOURCE", "with a server, give the source to run on: --source <id> (pivotkit sources lists them)");
        }
        sourceId(values.source);
    }
    // every option and the token are checked before the first line and the first request
    timeoutOf(values);
    const sourceParams = paramsOf(values.param);
    checkTls(server, ctx.io.env);
    const first = await readToken(values, ctx);
    // where the requests go and with which token, so a wrong target shows (the origin only, never the path)
    if (!values.quiet) {
        ctx.io.stderr.write(`server: ${server.origin} (token: ${first.from ?? "none"})\n`);
    }
    // a token others can read is said also with -q
    if (first.warning) {
        ctx.io.stderr.write(`warning: ${first.warning}\n`);
    }
    const client = createClient({ server, values, ctx, userAgent: `pivotkit-cli/${helpers.version}` });
    const run = { render: renderRemote, validate: validateRemote, describe: describeRemote, sources: sourcesRemote }[command];
    return run(positionals, { ...values, sourceParams }, ctx, client, helpers);
}

/**
 * The values of --param name=value as the source's `params`, or none without the flag.
 * @param {string[] | undefined} given
 * @returns {Record<string, string> | undefined}
 */
export function paramsOf(given) {
    if (!given?.length) {
        return undefined;
    }
    /** @type {Record<string, string>} */
    const params = Object.create(null);
    for (const text of given) {
        const at = text.indexOf("=");
        if (at < 1) {
            throw new CliError("usage", "BAD_VALUE", `--param takes name=value, not ${JSON.stringify(text.slice(0, 80))}`);
        }
        const name = text.slice(0, at);
        if (Object.hasOwn(params, name)) {
            throw new CliError("usage", "BAD_VALUE", `--param ${name.slice(0, 64)} is given twice; a parameter takes one value`);
        }
        params[name] = text.slice(at + 1);
    }
    return { ...params };
}

/** The source of a request: its id, and its params when --param gave some. */
const sourceOf = (values) => ({ source: values.source, ...(values.sourceParams ? { params: values.sourceParams } : {}) });

/**
 * Every string of a server's answer with the token taken out, for a file or --json (uncut: a view
 * file's names keep their length; JSON escapes control characters). What is printed goes through
 * the client's `clean` as well.
 */
function deepClean(value, clean, depth = 0) {
    if (depth > MAX_DEPTH) {
        throw new RemoteError("NOT_PIVOTKIT", `not a pivotkit server answer (nested deeper than ${MAX_DEPTH} levels)`);
    }
    if (typeof value === "string") {
        return clean(value);
    }
    if (Array.isArray(value)) {
        return value.map((v) => deepClean(v, clean, depth + 1));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [clean(k), deepClean(v, clean, depth + 1)]));
    }
    return value;
}

/** The deepest a server's answer may nest (a view nests far less; the server itself refuses 64). */
const MAX_DEPTH = 64;

/** Whether findings fail the command: an error, or a warning with --strict. */
const failing = (findings, values) => findings.some((f) => f.severity === "error" || (values.strict && f.severity === "warning"));

/**
 * The layout of the layout flags for the server: field names as typed (the server knows the fields;
 * a name it does not know is its finding), --filter read here (@file too), --map as the layout's map.
 */
async function layoutFor(values, ctx) {
    const filters = await filtersOf(values.filter, ctx);
    const layout = layoutOf(values, { fields: [], filters });
    const placed = [...(layout.rows ?? []), ...(layout.cols ?? []), ...(layout.values ?? []).map((v) => v.field ?? ""), ...(layout.groups ?? []).map((g) => g.field), ...filters.map((f) => (typeof f.field === "string" ? f.field : ""))];
    const map = mapOf(values.map, placed);
    return map ? { ...layout, map } : layout;
}

/** With a server the data is its source: a data file given with layout flags is a usage error. */
function noDataArgument(positionals, command) {
    if (positionals.length > 0) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `with --source the data is the server's: give the layout flags without a data file (pivotkit ${command} --source <id> --rows ...)`);
    }
}

async function validateRemote(positionals, values, ctx, client, helpers) {
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `validate takes one view, not ${positionals.length}`);
    }
    const view = helpers.withMap(await helpers.readView(positionals, values, ctx), values);
    const { data } = await jsonOf(client.json("POST", "views/validate", { ...sourceOf(values), view: view.view }));
    const findings = [...(view.findings ?? []), ...client.cleanFindings(data.findings)];
    const valid = data.valid === true && !findings.some((f) => f.severity === "error");
    const warnings = findings.filter((f) => f.severity === "warning").length;
    const note = valid ? `valid: no errors, ${warnings === 0 ? "no warnings" : `${warnings} warning${warnings === 1 ? "" : "s"}`} (with the server's source ${values.source})` : null;
    return { findings, extra: { valid, uses: deepClean(Array.isArray(data.uses) ? data.uses : [], client.strip), source: values.source }, note };
}

async function describeRemote(positionals, values, ctx, client, helpers) {
    if (values.suggest) {
        return suggestRemote(positionals, values, ctx, client, helpers);
    }
    const onlySuggest = ["output", "map"].find((f) => values[f] !== undefined) ?? (hasLayoutFlags(values) ? ["rows", "cols", "values", "group", "filter", "chart-type"].find((f) => values[f] !== undefined) : undefined);
    if (onlySuggest) {
        throw new CliError("usage", "NEEDS_SUGGEST", `--${onlySuggest} acts with --suggest only: pivotkit describe --source <id> --suggest --${onlySuggest} ...`);
    }
    if (positionals[0] === undefined) {
        throw new CliError("usage", "MISSING_VIEW", "with a server, describe takes a view (pivotkit describe <view> --source <id>); the fields of a source: pivotkit sources <id>");
    }
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `describe takes one view, not ${positionals.length}`);
    }
    let view;
    try {
        view = await helpers.readView(positionals, values, ctx);
    } catch (e) {
        // a source's id where the view belongs (pivotkit describe sales --source sales)
        const arg = positionals[0];
        throw e instanceof CliError && e.code === "NOT_FOUND" && SOURCE_ID.test(arg) ? new CliError(e.kind, e.code, `${e.message}; the fields of a source: pivotkit sources ${arg}`) : e;
    }
    const { data } = await jsonOf(client.json("POST", "views/describe", { ...sourceOf(values), view: view.view }));
    const text = data.description && typeof data.description.text === "string" ? client.clean(data.description.text) : "";
    if (!values.json && text) {
        ctx.io.stdout.write(`${client.clean(data.name) || "view"}: ${text}\n`);
    }
    const { findings, ...rest } = data;
    return { findings: client.cleanFindings(findings), extra: { kind: "view", ...deepClean(rest, client.strip), source: values.source } };
}

/** describe --suggest: the server's draft as a view file, on stdout or into -o. */
async function suggestRemote(positionals, values, ctx, client, helpers) {
    noDataArgument(positionals, "describe");
    if (values.output !== undefined) {
        if (values.output === "-") {
            throw new CliError("usage", "BAD_VALUE", "-o -: the draft goes to stdout when -o is left out");
        }
        if (!/\.json$/i.test(values.output)) {
            throw new CliError("usage", "UNKNOWN_EXTENSION", `-o ${shortName(values.output)}: a view file is JSON: name it <name>.pivotkit.json`);
        }
        await helpers.checkNotInput(ctx, "-o", values.output, [[values["token-file"], "token"]], "draft");
    }
    const { data } = await jsonOf(client.json("POST", "views/suggest", { ...sourceOf(values), layout: await layoutFor(values, ctx) }));
    const findings = client.cleanFindings(data.findings);
    const picks = deepClean(Array.isArray(data.picks) ? data.picks : [], client.strip);
    const lines = picks.filter((p) => typeof p?.text === "string").map((p) => `picked: ${client.clean(p.text)}`);
    /** @type {any} */
    const extra = { kind: "source", draft: true, picks, source: values.source };
    if (failing(findings, values) || !data.view || typeof data.view !== "object") {
        return { findings, extra: { ...extra, output: null }, note: "nothing written: the draft has errors.", noteIsError: true };
    }
    const view = deepClean(data.view, client.strip);
    const text = viewFileText(view);
    if (values.output !== undefined) {
        const bytes = new TextEncoder().encode(text);
        await writeFile(values.output, bytes, ctx);
        const out = shortName(values.output);
        extra.output = { file: out, bytes: bytes.length };
        const report = out.replace(/(\.pivotkit)?\.json$/i, "") + ".html";
        return { findings, extra, note: [...lines, `wrote ${out}: a draft view of the server's source ${values.source}`, `next: pivotkit render ${out} --source ${values.source} -o ${report} (with the same server)`].join("\n") };
    }
    if (values.json) {
        extra.view = view;
    } else {
        ctx.io.stdout.write(text);
    }
    return { findings, extra, note: [...lines, `next: pivotkit describe --source ${values.source} --suggest -o ${values.source}.pivotkit.json`].join("\n") };
}

async function renderRemote(positionals, values, ctx, client, helpers) {
    const format = helpers.renderFormat(values, ctx);
    const layoutMode = fromFields(values);
    if (layoutMode) {
        noDataArgument(positionals, "render");
    } else if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `render takes one view, not ${positionals.length}`);
    }
    if (values.output !== undefined && !layoutMode) {
        await helpers.checkNotInput(ctx, "-o", values.output, [[positionals[0], "view"], [values["token-file"], "token"]], "output");
    } else if (values.output !== undefined) {
        await helpers.checkNotInput(ctx, "-o", values.output, [[values["token-file"], "token"]], "output");
    }
    const findings = [...helpers.ignoredOptions(values, format)];
    /** @type {Record<string, unknown>} the view or the layout to render */
    let what;
    if (layoutMode && values.suggest) {
        // a draft first (the server's suggest_view); the file of that view next
        const { data } = await jsonOf(client.json("POST", "views/suggest", { ...sourceOf(values), layout: await layoutFor(values, ctx) }));
        findings.push(...client.cleanFindings(data.findings));
        what = { view: data.view };
    } else {
        const given = layoutMode ? { layout: await layoutFor(values, ctx) } : await (async () => {
            const view = helpers.withMap(await helpers.readView(positionals, values, ctx), values);
            findings.push(...(view.findings ?? []));
            return { view: view.view };
        })();
        // the view's findings first, so warnings (and --strict) are known before the file is made; a
        // token scoped for render_view but not validate_view (auth.toolScopes) renders without them
        try {
            const { data } = await jsonOf(client.json("POST", "views/validate", { ...sourceOf(values), ...given }));
            findings.push(...client.cleanFindings(data.findings));
        } catch (e) {
            if (!(e instanceof RemoteError && e.code === "INSUFFICIENT_SCOPE")) {
                throw e;
            }
            // a warning, so --strict stops: its warnings could not be checked
            findings.push({ severity: "warning", code: "notValidated", path: "", message: "the view was not checked first: this token may not validate (auth.toolScopes); the server's errors still stop the file, its warnings are not known" });
        }
        what = given;
    }
    /** @type {any} */
    const extra = { summary: null, sheet: null, source: values.source };
    if (failing(findings, values) || (!what.view && !what.layout)) {
        return { findings, extra: { ...extra, output: null }, note: "nothing written: the view has errors.", noteIsError: true };
    }
    const answer = await client.file({ ...sourceOf(values), ...what, format, ...(values.title !== undefined ? { title: values.title } : {}), ...(values.chart ? { chart: values.chart } : {}) });
    if ("viewErrors" in answer) {
        findings.push(...answer.viewErrors);
        return { findings, extra: { ...extra, output: null }, note: "nothing written: the view has errors.", noteIsError: true };
    }
    if (values.output) {
        await writeFile(values.output, answer.bytes, ctx);
        extra.output = { file: shortName(values.output), format, mediaType: RENDER_FORMATS[format].mediaType, bytes: answer.bytes.length };
        return { findings, extra, note: `wrote ${extra.output.file}: ${helpers.formatNames[format]} of the server's source ${values.source}` };
    }
    ctx.io.stdout.write(answer.bytes);
    return { findings, extra, note: null };
}

async function sourcesRemote(positionals, values, ctx, client) {
    if (positionals.length > 1) {
        throw new CliError("usage", "EXTRA_ARGUMENT", `sources takes one id, not ${positionals.length}`);
    }
    const id = positionals[0];
    if (id === undefined) {
        if (values.sourceParams) {
            throw new CliError("usage", "BAD_VALUE", "--param goes with a source: pivotkit sources <id> --param name=value");
        }
        const { data } = await jsonOf(client.json("GET", "sources"));
        const list = deepClean(Array.isArray(data.sources) ? data.sources : [], client.strip).filter((s) => s && typeof s.id === "string");
        if (!values.json) {
            // a loop, not Math.max(...list): a list of hundreds of thousands would overflow the stack
            let width = 0;
            for (const s of list) width = Math.min(30, Math.max(width, s.id.length));
            for (const s of list) {
                // the params every call needs (--param), by name
                const needs = Array.isArray(s.params) ? s.params.filter((p) => p?.required === true && typeof p.name === "string").map((p) => client.clean(p.name)) : [];
                const line = `${client.clean(s.id).padEnd(width)}  ${client.clean(s.title ?? "")}${s.description ? ` - ${client.clean(s.description)}` : ""}${needs.length ? ` (needs: ${needs.join(", ")})` : ""}`;
                ctx.io.stdout.write(`${line.trimEnd()}\n`);
            }
        }
        const note = list.length ? null : "this token reaches no source of the server (the operator gives each token its sources)";
        return { findings: [], extra: { kind: "sources", sources: list }, note };
    }
    sourceId(id, "the id");
    // GET /sources/{id} takes no params: with --param the POST route of describe_source
    const { data } = await jsonOf(values.sourceParams ? client.json("POST", "sources/describe", { source: id, params: values.sourceParams }) : client.json("GET", `sources/${encodeURIComponent(id)}`));
    const description = deepClean({ rows: data.rows ?? null, fields: Array.isArray(data.fields) ? data.fields : [], text: data.text ?? "", ...(typeof data.hiddenFields === "number" ? { hiddenFields: data.hiddenFields } : {}) }, client.strip);
    if (!values.json) {
        ctx.io.stdout.write(`${client.clean(description.text)}\n`);
        for (const f of description.fields) {
            if (typeof f?.text === "string") {
                ctx.io.stdout.write(`  ${client.clean(f.text)}\n`);
            }
        }
    }
    return { findings: client.cleanFindings(data.notes), extra: { kind: "source", source: id, description } };
}

/** A JSON route's object; the view's errors of a 422 there are no answer the route gives. */
async function jsonOf(pending) {
    const answer = await pending;
    if (!("data" in answer)) {
        throw new CliError("internal", "UNEXPECTED_ANSWER", "the server answered a JSON route with a view's errors");
    }
    return answer;
}

/** A file remote mode writes: only after the whole answer is read, through a temporary file, 0600. */
async function writeFile(path, bytes, ctx) {
    try {
        await writeSafe(path, bytes, { cwd: ctx.io.cwd, allow: ctx.allow, mode: PRIVATE_FILE });
    } catch (e) {
        throw asCliError(e, path);
    }
}
