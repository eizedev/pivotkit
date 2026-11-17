/*
 * The output directory: pivotkit writes reports and schedule drafts there under names marked as its
 * own (OUTPUT_MARK), one write at a time per directory, makes room by deleting the oldest reports
 * (never schedule drafts awaiting approval, never where the operator's own files lie) and cleans up
 * reports older than output.maxAgeDays. A schedule draft waits for a person to approve it in the
 * host while its status is "draft"; one the host gave another status goes by output.maxAgeDays, one
 * that still waits only by output.draftMaxAgeDays, which the operator opts into (expiredIn). Drafts
 * may take at most half of output.maxFiles and of output.maxMb (draftCap, draftBytesCap).
 */

import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { TEMP_FILE_NAME, writeNew } from "pivotkit-cli/files";
import { OperationError } from "pivotkit-report/operations";
import { bytesText, countText } from "./text.js";
import { nameSlug } from "./upload.js";

/** The output directory's real path, or null. */
export const outputDir = (context) => context.output?.dir ?? null;

/** When the output directory was last cleaned up (output.maxAgeDays), per directory. */
const pruned = new Map();

/**
 * The part of a written file's name that marks it as pivotkit's: "sales-by-region.pivotkit-out.xlsx",
 * "weekly.pivotkit-out.report.json" (a schedule draft; the name before it is fileSlug's; ".pivotkit.json" is a view file), after 22 random characters with output.baseUrl or a download link.
 * Only such files are counted, cleaned up and deleted to make room; an operator's own files are not.
 */
export const OUTPUT_MARK = "pivotkit-out";

/** Latin letters NFKD does not take apart, written as their base letters ("Ærø" is "AEro"). */
const LATIN_LETTERS = Object.freeze({ ß: "ss", Æ: "AE", æ: "ae", Ø: "O", ø: "o", Œ: "OE", œ: "oe", Ł: "L", ł: "l", Þ: "TH", þ: "th", Đ: "D", đ: "d", Ð: "D", ð: "d", Ħ: "H", ħ: "h", ı: "i", Ŀ: "L", ŀ: "l", Ŧ: "T", ŧ: "t", ĸ: "q", Ŋ: "NG", ŋ: "ng" });
const LATIN_LETTER = new RegExp(`[${Object.keys(LATIN_LETTERS).join("")}]`, "g");

/** Names Windows keeps for devices, with any extension ("con.pivotkit-out.csv" too). */
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/**
 * The name of a file the services make, from a report's title, so a link and a shell take it as it
 * is: upload.js nameSlug (the store's name part) in lower case, after the Latin letters NFKD keeps
 * whole ("Ærø Łódź" is "aero-lodz"). A title without Latin letters or digits is "report-" and 8 hex
 * characters of its SHA-256, so two such titles get two names. A Windows device name gets a "_"
 * first. The title stays the report's own (resource_link's title).
 * @param {unknown} title
 */
export function fileSlug(title) {
    const text = String(title ?? "");
    const slug = nameSlug(text.replace(LATIN_LETTER, (c) => LATIN_LETTERS[/** @type {keyof typeof LATIN_LETTERS} */ (c)])).toLowerCase();
    if (slug === "report" && text.trim() !== "" && text.trim().toLowerCase() !== "report") {
        return `report-${createHash("sha256").update(text).digest("hex").slice(0, 8)}`;
    }
    return WINDOWS_DEVICE.test(slug) ? `_${slug}` : slug;
}

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

/** The most bytes of a schedule draft read to tell whether it still waits; a larger one is kept. */
const DRAFT_READ_BYTES = 1_048_576;

/**
 * Whether a schedule draft still waits for approval: its status is "draft", as pivotkit writes it.
 * A host that approves or rejects a draft in place gives it another status. A draft that cannot be
 * read or parsed, or is larger than DRAFT_READ_BYTES, counts as waiting: nothing waiting is deleted.
 * @param {{ path: string, size: number }} file
 */
async function stillWaiting(file) {
    if (file.size > DRAFT_READ_BYTES) {
        return true;
    }
    try {
        const status = JSON.parse(await readFile(file.path, "utf8"))?.status;
        return typeof status !== "string" || status === "draft";
    } catch {
        return true;
    }
}

/** A time `days` days back, or -Infinity for 0 (no age limit: nothing is that old). */
const daysBack = (days) => (days > 0 ? Date.now() - days * 86_400_000 : -Infinity);

/**
 * The files the age limits delete: pivotkit's reports and the schedule drafts no longer waiting
 * (stillWaiting), older than `days` (output.maxAgeDays); the drafts that still wait, older than
 * `draftDays` (output.draftMaxAgeDays). 0 is no limit. The sweep (prune) and check-config share
 * this rule.
 * @param {string} dir
 * @param {number} days
 * @param {number} [draftDays]
 * @returns {Promise<Array<{ path: string, size: number, mtimeMs: number, draft: boolean, waiting: boolean }>>}
 */
export async function expiredIn(dir, days, draftDays = 0) {
    const before = daysBack(days);
    const waitedSince = daysBack(draftDays);
    const expired = [];
    for (const file of await reportsIn(dir)) {
        if (file.mtimeMs >= Math.max(before, waitedSince)) {
            continue;
        }
        const waiting = file.draft && (await stillWaiting(file));
        if (file.mtimeMs < (waiting ? waitedSince : before)) {
            expired.push({ ...file, waiting });
        }
    }
    return expired;
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
 * Removes what the age limits delete (expiredIn: reports and drafts no longer waiting, older than
 * output.maxAgeDays; drafts that still wait, older than output.draftMaxAgeDays) from the output
 * directory (its top level; a file of another kind and a subdirectory stay), and the temporary files
 * of its writes older than an hour, at most once an hour; an info line per limit says how many went.
 * @param {any} context
 */
export async function prune(context) {
    const days = context.output?.maxAgeDays ?? 0;
    const draftDays = context.output?.draftMaxAgeDays ?? 0;
    const dir = outputDir(context);
    // a directory that holds the operator's own files is never cleaned (createContext refuses
    // both limits there; a context built another way is held to the same rule)
    if ((!days && !draftDays) || !dir || context.output.cleanUp === false || Date.now() - (pruned.get(dir) ?? 0) < 3_590_000) {
        return;
    }
    pruned.set(dir, Date.now());
    const now = Date.now();
    const deleted = { reports: 0, drafts: 0 };
    let waiting = 0;
    for (const file of await expiredIn(dir, days, draftDays)) {
        if (await unlink(file.path).then(() => true, () => false)) {
            if (file.waiting) {
                waiting++;
            } else {
                deleted[file.draft ? "drafts" : "reports"]++;
            }
        }
    }
    // one line per limit that deleted something: the operator must be able to tell where they went
    if (deleted.reports || deleted.drafts) {
        context.log?.info(`output.maxAgeDays: reports and schedule drafts no longer waiting older than ${countText(days, "day")} deleted`, { ...deleted, maxAgeDays: days });
    }
    if (waiting) {
        context.log?.info(`output.draftMaxAgeDays: schedule drafts still waiting for approval older than ${countText(draftDays, "day")} deleted`, { drafts: waiting, draftMaxAgeDays: draftDays });
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
 * them): when only drafts are left, it refuses. Drafts that still wait may take at most half of
 * output.maxFiles (draftCap) and of output.maxMb (draftBytesCap), so callers who may draft cannot
 * fill the directory and stop every render (checkDraftRoom). A
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
    if (draft) {
        checkDraftRoom(await waitingDrafts(files), bytes, maxFiles, maxMb);
    }
    let count = files.length;
    let total = files.reduce((sum, f) => sum + f.size, 0);
    const reports = files.filter((f) => !f.draft);
    let deleted = 0;
    while (count + 1 > maxFiles || total + bytes > maxBytes) {
        const oldest = cleanUp ? reports.shift() : undefined;
        if (!oldest) {
            const over = count + 1 > maxFiles ? `holds ${count} files, the most it may (output.maxFiles: ${maxFiles})` : `is full (output.maxMb: ${maxMb})`;
            const why = !cleanUp ? " and holds the operator's own files, so the server deletes none there" : " and what is left are schedule drafts, awaiting approval or not, which are not deleted to make room";
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
 * The schedule drafts among pivotkit's files that still wait for approval (stillWaiting): the ones
 * the drafts' caps count. A draft the host approved or rejected counts as a file, not as a draft.
 * @param {Array<{ path: string, size: number, mtimeMs: number, draft: boolean }>} files  reportsIn
 */
export async function waitingDrafts(files) {
    const waiting = [];
    for (const file of files) {
        if (file.draft && (await stillWaiting(file))) {
            waiting.push(file);
        }
    }
    return waiting;
}

/**
 * Refuses a new schedule draft of `bytes` the drafts' caps leave no room for: one larger than all
 * drafts may take (nobody can help but the operator), more drafts waiting than draftCap, or more
 * bytes than draftBytesCap. A draft that just fits is taken.
 * @param {Array<{ size: number }>} waiting  waitingDrafts
 * @param {number} bytes
 * @param {number} maxFiles
 * @param {number} maxMb
 */
function checkDraftRoom(waiting, bytes, maxFiles, maxMb) {
    const files = draftCap(maxFiles);
    const most = draftBytesCap(maxMb);
    // two sizes that round to the same text ("512.0 KiB of the 512 KiB") are said in bytes
    const rounded = (n) => bytesText(n).replace(".0 ", " ");
    const sizes = (a, b) => (a !== b && rounded(a) === rounded(b) ? [a, b].map((n) => `${n.toLocaleString("en-US")} bytes`) : [bytesText(a), bytesText(b)]);
    if (files === 0) {
        throw new OperationError("NO_OUTPUT", "output.maxFiles 1 leaves no room for drafts; the operator raises it");
    }
    if (bytes > most) {
        const [size, cap] = sizes(bytes, most);
        throw new OperationError("NO_OUTPUT", `the schedule draft takes ${size}, more than all drafts together may take (${cap}, half of output.maxMb); the operator raises output.maxMb`);
    }
    if (waiting.length + 1 > files) {
        throw new OperationError("NO_OUTPUT", `the output directory holds ${waiting.length} schedule drafts awaiting approval, the most it may (half of output.maxFiles); a person must approve or remove some first, or the operator raises output.maxFiles`);
    }
    const taken = waiting.reduce((sum, f) => sum + f.size, 0);
    if (taken + bytes > most) {
        const [size, cap] = sizes(taken, most);
        throw new OperationError("NO_OUTPUT", `the schedule drafts awaiting approval take ${size} of the ${cap} they may (half of output.maxMb); a person must approve or remove some first, or the operator raises output.maxMb`);
    }
}

/**
 * The most schedule drafts the output directory may hold: half of output.maxFiles, rounded down
 * (none at 1, so a draft never takes the one place a render needs).
 */
export const draftCap = (maxFiles) => Math.floor(maxFiles / 2);

/** The most bytes the schedule drafts in the output directory may take: half of output.maxMb. */
export const draftBytesCap = (maxMb) => Math.floor((maxMb * 1_048_576) / 2);

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
        return writeNew(dir, fileSlug(file.name), `${OUTPUT_MARK}.${file.extension}`, file.bytes, { prefix }).catch((e) => Promise.reject(outputErrorOf(e)));
    });
    return {
        name,
        ...(context.output.showPath ? { path: join(dir, name) } : {}),
        ...(context.output.baseUrl ? { url: new URL(encodeURIComponent(name), context.output.baseUrl.endsWith("/") ? context.output.baseUrl : `${context.output.baseUrl}/`).href } : {}),
        mediaType: file.mediaType
    };
}
