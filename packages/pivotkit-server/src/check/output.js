/*
 * check-config's section for the output directory (output.*): where reports go, whether the
 * directory is there or will be made, what the start refuses (createContext in context.js: the same
 * checks, so a PROBLEM here that stops the start is one there), how full it may get, the drafts'
 * share of it, and how long reports and drafts stay.
 *
 *   Output: reports
 *     /srv/pivotkit/reports
 *     will be created at start
 *     at most 1000 files and 1024 MiB of pivotkit's; schedule drafts at most 500 files and 512 MiB
 *     when full, the oldest reports are deleted to make room; drafts are kept
 *     reports older than 30 days are deleted; schedule drafts stay until a person approves or removes them
 *
 * check/index.js says what a section returns.
 */

import { lstat, realpath } from "node:fs/promises";
import { isInside } from "pivotkit-cli/files";
import { OUTPUT_DEFAULTS, maxAgeDaysOf, pathOf } from "../config.js";
import { OUTPUT_INSIDE_ALLOWED, SHARED_OUTPUT_TEXT, cannotCreate, entryOf, notWritable, notWritableText, outputRefusal, ownFileDirs, plannedPath } from "../context.js";
import { draftBytesCap, draftCap, expiredIn, reportsIn, waitingDrafts } from "../output.js";
import { bytesText, countText } from "../text.js";
import { personBound } from "../sources/auth.js";
import { heading, plain, problem, warning } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, registry) {
    const out = options.output ?? {};
    if (!out.dir) {
        return { items: [heading("Output: none (reports only as inline csv or json where the policy allows)")], upgrade: [] };
    }
    const items = [heading(`Output: ${out.dir}`)];
    // drafts are made over configured sources not bound to a person (registry.js schedulable)
    const drafts = Object.values(options.sources ?? {}).some((s) => s && !personBound(options, s));
    const upgrade = [
        ...(drafts ? [{ text: "schedule drafts take at most half of output.maxMb (output.draftMaxAgeDays lets waiting drafts expire)", anchor: "draft-quota" }] : []),
        { text: "inline csv and json results round numbers as the view shows them; report files and drafts are named in lower case without spaces", anchor: "results-0-8" }
    ];
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
        return { items, upgrade };
    }
    const refused = await notWritable(dir);
    if (refused) {
        items.push(problem(notWritableText(refused), { effect: "the server starts; every report fails with NO_OUTPUT" }));
    }
    if (out.baseUrl) {
        items.push(plain(`served at ${out.baseUrl}`));
    }
    const real = await realpath(dir).catch(() => dir);
    const shared = (await ownFileDirs(options)).includes(real);
    const maxFiles = out.maxFiles ?? OUTPUT_DEFAULTS.maxFiles;
    const maxMb = out.maxMb ?? OUTPUT_DEFAULTS.maxMb;
    const draftBytes = draftBytesCap(maxMb);
    items.push(plain(`at most ${maxFiles} files and ${bytesText(maxMb * 1_048_576)} of pivotkit's; schedule drafts at most ${draftCap(maxFiles)} files and ${bytesText(draftBytes)}`));
    // waiting drafts written under a larger output.maxMb, or before drafts had a byte quota: new ones are refused (makeRoom)
    const draftsNow = (await waitingDrafts(await reportsIn(dir))).reduce((sum, f) => sum + f.size, 0);
    if (draftsNow > draftBytes) {
        items.push(warning(`schedule drafts awaiting approval take ${bytesText(draftsNow)}, more than the ${bytesText(draftBytes)} they may (half of output.maxMb): new drafts are refused until a person approves or removes some, or you raise output.maxMb`));
    }
    if (shared) {
        items.push(plain("no age limit: the directory holds other files"));
        const limits = /** @type {const} */ (["maxAgeDays", "draftMaxAgeDays"]).filter((key) => out[key]);
        for (const key of limits) {
            items.push(problem(`output.${key} in a directory that holds the configuration or a source, template or token file; give the reports a directory of their own`, stop));
        }
        if (!limits.length) {
            // the start warns of it too (createContext)
            items.push(warning(SHARED_OUTPUT_TEXT));
        }
    } else {
        items.push(plain("when full, the oldest reports are deleted to make room; drafts are kept"));
        const days = maxAgeDaysOf(options, shared);
        const draftDays = out.draftMaxAgeDays ?? OUTPUT_DEFAULTS.draftMaxAgeDays;
        const reportsLine = days > 0 ? `reports older than ${countText(days, "day")} are deleted` : "no age limit for reports (output.maxAgeDays 0)";
        const draftsLine = draftDays > 0 ? `schedule drafts that wait for approval are deleted after ${countText(draftDays, "day")}` : "schedule drafts stay until a person approves or removes them";
        items.push(plain(`${reportsLine}; ${draftsLine}`));
        // what the next start's sweep deletes (output.js expiredIn)
        const old = await expiredIn(dir, days, draftDays);
        const aged = old.filter((f) => !f.waiting);
        const drafts = aged.filter((f) => f.draft).length;
        const reports = aged.length - drafts;
        if (aged.length) {
            const parts = [...(reports ? [`${reports} report${reports === 1 ? "" : "s"}`] : []), ...(drafts ? [`${drafts} schedule draft${drafts === 1 ? "" : "s"} no longer waiting for approval`] : [])];
            items.push(warning(`${parts.join(" and ")} ${aged.length === 1 ? "is" : "are"} older than ${countText(days, "day")} and ${aged.length === 1 ? "is" : "are"} deleted at the next start; copy them away or set output.maxAgeDays: 0`));
        }
        const waiting = old.length - aged.length;
        if (waiting) {
            const one = waiting === 1;
            items.push(warning(`${waiting} schedule draft${one ? "" : "s"} waiting for approval ${one ? "is" : "are"} older than ${countText(draftDays, "day")} and ${one ? "is" : "are"} deleted at the next start; copy ${one ? "it" : "them"} away or set output.draftMaxAgeDays: 0`));
        }
    }
    return { items, upgrade };
}
