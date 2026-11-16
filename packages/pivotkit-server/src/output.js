/*
 * The output directory: pivotkit writes reports and schedule drafts there under names marked as its
 * own (OUTPUT_MARK), one write at a time per directory, makes room by deleting the oldest reports
 * (never schedule drafts awaiting approval, never where the operator's own files lie) and cleans up
 * reports older than output.maxAgeDays. A schedule draft in the directory waits for a person to
 * approve it in the host, which takes it away; pivotkit deletes none.
 */

import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { TEMP_FILE_NAME, writeNew } from "pivotkit-cli/files";
import { OperationError } from "pivotkit-report/operations";

/** The output directory's real path, or null. */
export const outputDir = (context) => context.output?.dir ?? null;

/** When the output directory was last cleaned up (output.maxAgeDays), per directory. */
const pruned = new Map();

/**
 * The part of a written file's name that marks it as pivotkit's: "Sales by region.pivotkit-out.xlsx",
 * "Weekly.pivotkit-out.report.json" (a schedule draft; ".pivotkit.json" is a view file), after 22 random characters with output.baseUrl or a download link.
 * Only such files are counted, cleaned up and deleted to make room; an operator's own files are not.
 */
export const OUTPUT_MARK = "pivotkit-out";

/** A report pivotkit wrote; a schedule draft it wrote. */
const REPORT_NAME = new RegExp(`\\.${OUTPUT_MARK}\\.(xlsx|html|csv|json|svg)$`, "i");
const DRAFT_NAME = new RegExp(`\\.${OUTPUT_MARK}\\.report\\.json$`, "i");

/**
 * The reports and drafts pivotkit wrote into the output directory (its top level, by their names'
 * mark; other files and subdirectories are not pivotkit's), oldest first.
 * @param {string} dir
 * @returns {Promise<Array<{ path: string, size: number, mtimeMs: number, draft: boolean }>>}
 */
export async function reportsIn(dir) {
    const entries = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isFile() && (REPORT_NAME.test(e.name) || DRAFT_NAME.test(e.name)));
    const files = await Promise.all(entries.map((e) => stat(join(dir, e.name)).then((info) => ({ path: join(dir, e.name), size: info.size, mtimeMs: info.mtimeMs, draft: DRAFT_NAME.test(e.name) }), () => null)));
    return /** @type {Array<{ path: string, size: number, mtimeMs: number, draft: boolean }>} */ (files.filter(Boolean)).sort((a, b) => a.mtimeMs - b.mtimeMs);
}

/** A write's temporary file older than this was left by a server killed during the write. */
const TEMP_MAX_AGE_MS = 3_600_000;

/**
 * The temporary files of pivotkit's writes into the output directory (pivotkit-cli/files'
 * TEMP_FILE_NAME of a name with the mark): left there by a server killed between creating one and
 * renaming it. They are not reports: neither counted nor deleted to make room.
 * @param {string} dir
 * @returns {Promise<Array<{ path: string, mtimeMs: number }>>}
 */
async function leftoverTempFiles(dir) {
    const entries = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isFile() && TEMP_FILE_NAME.test(e.name) && e.name.includes(`.${OUTPUT_MARK}.`));
    const files = await Promise.all(entries.map((e) => stat(join(dir, e.name)).then((info) => ({ path: join(dir, e.name), mtimeMs: info.mtimeMs }), () => null)));
    return /** @type {Array<{ path: string, mtimeMs: number }>} */ (files.filter(Boolean));
}

/**
 * Removes the reports older than output.maxAgeDays from the output directory (its top level; a
 * schedule draft, which waits for approval, a file of another kind and a subdirectory stay), and the
 * temporary files of its writes older than an hour, at most once an hour; an info line says how many
 * reports went.
 * @param {any} context
 */
export async function prune(context) {
    const days = context.output?.maxAgeDays;
    const dir = outputDir(context);
    // a directory that holds the operator's own files is never cleaned (createContext refuses
    // maxAgeDays there; a context built another way is held to the same rule)
    if (!days || !dir || context.output.cleanUp === false || Date.now() - (pruned.get(dir) ?? 0) < 3_590_000) {
        return;
    }
    pruned.set(dir, Date.now());
    const now = Date.now();
    const before = now - days * 86_400_000;
    let reports = 0;
    for (const file of await reportsIn(dir)) {
        if (!file.draft && file.mtimeMs < before && (await unlink(file.path).then(() => true, () => false))) {
            reports++;
        }
    }
    // one line per sweep that deleted something: the operator must be able to tell where reports went
    if (reports) {
        context.log?.info(`output.maxAgeDays: reports older than ${days} days deleted`, { reports, maxAgeDays: days });
    }
    for (const file of await leftoverTempFiles(dir)) {
        if (file.mtimeMs < now - TEMP_MAX_AGE_MS) {
            await unlink(file.path).catch(() => undefined);
        }
    }
}

/** The write running per output directory: one at a time, so a count checked is the count written. */
const writing = new Map();

/** Runs fn after the write before it in this directory has finished. */
async function oneAtATime(dir, fn) {
    const before = writing.get(dir) ?? Promise.resolve();
    const mine = before.then(fn);
    const done = mine.catch(() => undefined);
    writing.set(dir, done);
    try {
        return await mine;
    } finally {
        if (writing.get(dir) === done) {
            writing.delete(dir);
        }
    }
}

/** A failed write of the output directory as the caller's answer: what the operator must fix. */
export function outputErrorOf(e) {
    if (e?.code === "EROFS") {
        return new OperationError("NO_OUTPUT", "the output directory is on a read-only file system; the operator must mount a writable volume there (output.dir)");
    }
    if (["EACCES", "EPERM"].includes(e?.code)) {
        return new OperationError("NO_OUTPUT", "the output directory is not writable by the server's user; the operator must fix its owner or mode (output.dir)");
    }
    if (e?.code === "ENOSPC" || e?.code === "EDQUOT") {
        return new OperationError("NO_OUTPUT", "the disk of the output directory is full; the operator must make room (output.maxMb)");
    }
    return e;
}

/**
 * Makes room for a new file of `bytes`: while the directory would hold more than output.maxFiles
 * of pivotkit's files or output.maxMb, its oldest reports are deleted, whoever made them; so a caller
 * that renders without pause shortens how long the reports stay, but never stops the others from
 * rendering. Schedule drafts count but are never deleted to make room (a person has yet to approve
 * them): when only drafts are left, it refuses. Drafts may take at most half of output.maxFiles
 * (draftCap), so callers who may draft cannot fill the directory and stop every render. A
 * directory that holds the operator's own files (output.cleanUp false) is never cleaned: a full one
 * refuses.
 * @returns {Promise<number>}  the files deleted
 */
export async function makeRoom(context, dir, bytes, draft) {
    const { maxFiles, maxMb, cleanUp } = context.output;
    const maxBytes = maxMb * 1_048_576;
    if (bytes > maxBytes) {
        throw new OperationError("NO_OUTPUT", `the report is larger than the output directory may hold (output.maxMb: ${maxMb})`);
    }
    const files = await reportsIn(dir);
    const drafts = files.filter((f) => f.draft).length;
    if (draft && drafts + 1 > draftCap(maxFiles)) {
        throw new OperationError("NO_OUTPUT", draftCap(maxFiles) === 0 ? "output.maxFiles 1 leaves no room for drafts; the operator raises it" : `the output directory holds ${drafts} schedule drafts awaiting approval, the most it may (half of output.maxFiles); a person must approve or remove some first, or the operator raises output.maxFiles`);
    }
    let count = files.length;
    let total = files.reduce((sum, f) => sum + f.size, 0);
    const reports = files.filter((f) => !f.draft);
    let deleted = 0;
    while (count + 1 > maxFiles || total + bytes > maxBytes) {
        const oldest = cleanUp ? reports.shift() : undefined;
        if (!oldest) {
            const over = count + 1 > maxFiles ? `holds ${count} files, the most it may (output.maxFiles: ${maxFiles})` : `is full (output.maxMb: ${maxMb})`;
            const why = !cleanUp ? " and holds the operator's own files, so the server deletes none there" : " and what is left are schedule drafts awaiting approval, which are not deleted";
            throw new OperationError("NO_OUTPUT", `the output directory ${over}${why}; the operator must clean it up`);
        }
        await unlink(oldest.path).catch((e) => (e?.code === "ENOENT" ? undefined : Promise.reject(outputErrorOf(e))));
        count--;
        total -= oldest.size;
        deleted++;
    }
    return deleted;
}

/**
 * The most schedule drafts the output directory may hold: half of output.maxFiles, rounded down
 * (none at 1, so a draft never takes the one place a render needs).
 */
export const draftCap = (maxFiles) => Math.floor(maxFiles / 2);

/**
 * Writes a file an operation made into the output directory; its name, path and address.
 * @param {boolean} [draft]  a schedule draft (draftCap holds), not a report
 * @param {{ prefix?: string }} [how]  prefix: the start of the stored name (delivery.js: a link's nonce); default 22 random characters under output.baseUrl, else none
 */
export async function writeOutput(context, file, draft = false, how = {}) {
    const dir = outputDir(context);
    if (!dir) {
        return null;
    }
    await prune(context);
    // a directory a web server serves gets names nobody can guess
    const prefix = how.prefix ?? (context.output.baseUrl ? `${randomBytes(16).toString("base64url")}-` : "");
    const name = await oneAtATime(dir, async () => {
        const deleted = await makeRoom(context, dir, file.bytes.length, draft);
        if (deleted) {
            context.log.info("output directory full: the oldest reports deleted", { deleted });
        }
        return writeNew(dir, file.name, `${OUTPUT_MARK}.${file.extension}`, file.bytes, { prefix }).catch((e) => Promise.reject(outputErrorOf(e)));
    });
    return {
        name,
        ...(context.output.showPath ? { path: join(dir, name) } : {}),
        ...(context.output.baseUrl ? { url: new URL(encodeURIComponent(name), context.output.baseUrl.endsWith("/") ? context.output.baseUrl : `${context.output.baseUrl}/`).href } : {}),
        mediaType: file.mediaType
    };
}
