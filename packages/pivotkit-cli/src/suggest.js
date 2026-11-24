/*
 * pivotkit describe <data> --suggest: a draft view of the data as a view file, on stdout or into -o;
 * what was picked and what to run next on stderr. Nothing to group by is an error (noSuggestion): no
 * file without --lenient.
 */

import { outsideLimits, validate, viewFileText } from "pivotkit-core";
import { findingOf } from "pivotkit-report/operations";
import { CliError, asCliError, shortName, writeSafe } from "pivotkit-node/files";
import { explained } from "./explain.js";
import { checkNotInput } from "./inputs.js";
import { normalized, quoteArg, viewFileFor } from "./layout-view.js";
import { nothingWritten } from "./nothing-written.js";
import { versions } from "./versions.js";
import { viewFromData } from "./view-from-data.js";

/**
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
export async function suggestCommand(positionals, values, ctx) {
    if (values.as === "view") {
        throw new CliError("usage", "BAD_VALUE", "--suggest makes a view from data: leave out --as view");
    }
    if (values.output !== undefined) {
        await checkDraftOutput(values.output, positionals[0] ?? values.data, ctx);
    }
    const made = await viewFromData(positionals, values, ctx, "describe");
    const { data, built } = made;
    const { errors, warnings } = validate(built.view, built.encoded, { limits: outsideLimits(ctx.limits) });
    // the draft's findings explained against the data, as render explains a view's
    const findings = [...data.notes, ...made.findings, ...explained([...errors, ...warnings].map(findingOf), made.read.view, data)];
    const failed = findings.some((f) => f.severity === "error" || (values.strict && f.severity === "warning"));
    const file = await viewFileFor(normalized(built.view, built.encoded, outsideLimits(ctx.limits)), data, built.encoded, { name: made.name, description: made.description, version: versions()["pivotkit-cli"] });
    const text = viewFileText(file);
    const sheets = data.sheets ? await data.sheets() : null;
    /** @type {any} */
    const extra = { kind: "data", draft: true, picks: built.picks, sheet: data.sheet, ...(sheets ? { sheets } : {}) };
    const input = shortName(positionals[0] ?? values.data);
    if (failed && !values.lenient) {
        return { findings, extra: { ...extra, output: null }, note: nothingWritten(findings, "draft"), noteIsError: true };
    }
    if (values.output !== undefined) {
        extra.output = await writeDraft(text, values.output, ctx);
        const report = extra.output.file.replace(/(\.pivotkit)?\.json$/i, "") + ".html";
        return { findings, extra, note: [...made.lines, `wrote ${extra.output.file}: a draft view of ${data.name}${failed ? " despite its errors (--lenient)" : ""}`, `next: pivotkit render ${quoteArg(extra.output.file)} --data ${quoteArg(input)} -o ${quoteArg(report)}`].join("\n") };
    }
    if (values.json) {
        extra.view = file;
    } else {
        ctx.io.stdout.write(text);
    }
    const save = input.replace(/\.[^.]+$/, "") + ".pivotkit.json";
    return { findings, extra, note: [...made.lines, `next: pivotkit describe ${quoteArg(input)} --suggest -o ${quoteArg(save)}`].join("\n") };
}

/**
 * -o of a draft, checked before anything is read: a view file, not stdout, not the data.
 * @param {string} output
 * @param {string | undefined} input  the data
 * @param {any} ctx
 */
async function checkDraftOutput(output, input, ctx) {
    if (output === "-") {
        throw new CliError("usage", "BAD_VALUE", "-o -: the draft goes to stdout when -o is left out");
    }
    if (!/\.json$/i.test(output)) {
        throw new CliError("usage", "UNKNOWN_EXTENSION", `-o ${shortName(output)}: a view file is JSON: name it <name>.pivotkit.json`);
    }
    await checkNotInput(ctx, "-o", output, [[input, "data"]], "draft");
}

/**
 * The draft written into -o. What was written, for --json.
 * @param {string} text
 * @param {string} output
 * @param {any} ctx
 */
async function writeDraft(text, output, ctx) {
    const bytes = new TextEncoder().encode(text);
    try {
        await writeSafe(output, bytes, { cwd: ctx.io.cwd, allow: ctx.allow });
    } catch (e) {
        throw asCliError(e, output);
    }
    return { file: shortName(output), bytes: bytes.length };
}
