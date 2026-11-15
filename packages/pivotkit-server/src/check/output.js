/*
 * check-config's section for the output directory (output.*): where reports go, whether the
 * directory is there or will be made, what the start refuses (createContext in context.js: the same
 * checks, so a PROBLEM here that stops the start is one there), how full it may get and how long
 * reports stay.
 *
 *   Output: reports
 *     /srv/pivotkit/reports
 *     will be created at start
 *     when full, the oldest reports are deleted to make room; drafts are kept
 *     reports and drafts older than 30 days are deleted
 *
 * check/index.js says what a section returns.
 */

import { lstat, realpath } from "node:fs/promises";
import { isInside } from "pivotkit-cli/files";
import { OUTPUT_DEFAULTS, maxAgeDaysOf, pathOf } from "../config.js";
import { OUTPUT_INSIDE_ALLOWED, cannotCreate, entryOf, outputRefusal, ownFileDirs, plannedPath, writable } from "../context.js";
import { draftCap } from "../present.js";
import { heading, plain, problem } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, registry) {
    const out = options.output ?? {};
    if (!out.dir) {
        return { items: [heading("Output: none (reports only as inline csv or json where the policy allows)")], upgrade: [] };
    }
    const items = [heading(`Output: ${out.dir}`)];
    const dir = pathOf(options, out.dir);
    // only ENOENT is missing: any other error (a name too long, a symbolic link loop) cannot be made
    const entry = await entryOf(dir);
    const info = entry.info;
    const found = Boolean(info?.isDirectory());
    // a missing directory is made at start (output.create), when its nearest existing parent lets it be
    const dangling = Boolean(!info && !entry.code && (await entryOf(dir, lstat)).info);
    const notMade = !info ? (entry.code ?? (dangling ? "dangling" : out.create === false ? "off" : await cannotCreate(dir))) : null;
    const stop = { stops: /** @type {const} */ (true) };
    // the full path on a line of its own (never cut), where it says more than output.dir
    if (dir !== out.dir) {
        items.push(plain(dir));
    }
    if (!info && !notMade) {
        items.push(plain("will be created at start"));
    }
    if (info && !found) {
        items.push(problem("output.dir: not a directory", stop));
    } else if (notMade === "dangling") {
        items.push(problem("output.dir: a symbolic link to nothing (its target does not exist)", stop));
    } else if (notMade === "off") {
        items.push(problem("output.dir: not found (create it first, or leave output.create on)", stop));
    } else if (notMade) {
        items.push(problem(`output.dir: ${outputRefusal(notMade, out.create !== false)}`, stop));
    }
    // what the start refuses: the directory, or where it will be made, inside an allowed directory
    const where = info ? await realpath(dir).catch(() => null) : notMade ? null : await plannedPath(dir);
    if (where && registry.allow.some((allowed) => isInside(where, allowed) || isInside(allowed, where))) {
        items.push(problem(`output.dir: ${OUTPUT_INSIDE_ALLOWED}`, stop));
    }
    if (!found) {
        return { items, upgrade: [] };
    }
    if (!(await writable(dir))) {
        items.push(problem(`output.dir is not writable by the user ${process.getuid?.() ?? ""} the server runs as`, { effect: "the server starts; every report fails with NO_OUTPUT" }));
    }
    if (out.baseUrl) {
        items.push(plain(`served at ${out.baseUrl}`));
    }
    const real = await realpath(dir).catch(() => dir);
    const shared = (await ownFileDirs(options)).includes(real);
    const maxFiles = out.maxFiles ?? OUTPUT_DEFAULTS.maxFiles;
    items.push(plain(`at most ${maxFiles} files of pivotkit's (${draftCap(maxFiles)} of them schedule drafts) and ${out.maxMb ?? OUTPUT_DEFAULTS.maxMb} MB`));
    if (shared) {
        items.push(plain("it holds the configuration or a source, template or token file: nothing there is deleted, and a full directory refuses new reports"));
        items.push(plain("no age limit: the directory holds other files"));
        if (out.maxAgeDays) {
            items.push(problem("output.maxAgeDays in a directory that holds the configuration or a source, template or token file; give the reports a directory of their own", stop));
        }
    } else {
        items.push(plain("when full, the oldest reports are deleted to make room; drafts are kept"));
        const days = maxAgeDaysOf(options, shared);
        items.push(plain(days > 0 ? `reports and drafts older than ${days} days are deleted` : "no age limit (output.maxAgeDays 0)"));
    }
    return { items, upgrade: [] };
}
