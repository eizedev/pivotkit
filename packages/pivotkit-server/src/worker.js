/*
 * A compute worker. It runs one job at a time, with its own cache of data sets (data.js):
 *
 * - An operation of pivotkit-report's table over a file source, a table the main thread loaded (an
 *   HTTP or code source's) or a file handed in (a table job). The main thread gives it the operation,
 *   its input and what it needs (the source's spec, the link target, the template text, the table).
 *   It gets back the outcome with when the data is from, or an error's code and message. The policy
 *   is applied in the main thread.
 * - A table job may come without its table (`cached`) when this worker kept its data under the job's
 *   key. A worker that no longer holds it answers `need`, and the main thread sends the table.
 * - A read job (data.js READ_JOB) only reads an HTTP source's CSV answer into a packed table without
 *   the hidden columns and gives it back, for the main thread to keep. It keeps the data set by the
 *   job's key, as an operation's job would.
 *
 * A run over its time is ended by terminating the worker (compute.js).
 */

import { parentPort, workerData } from "node:worker_threads";
import { OPERATIONS, OperationError } from "pivotkit-report/operations";
import { readTable } from "pivotkit-node/files";
import { KEPT_JOB, READ_JOB, RECORDS_JOB, asOperationError, keptDataSets, cacheBytesNow, fileData, holds, packedUpload, setCacheBytes, tableData, uploadData } from "./data.js";
import { draftingOf } from "./policy.js";
import { answeredType, columnPieces } from "./records-writer.js";

if (typeof workerData?.cacheBytes === "number") {
    setCacheBytes(workerData.cacheBytes);
}

/** ECharts, loaded on the first SVG or HTML report. */
let echarts = null;

/** The rows jobs waiting for the main thread's next word, by job id: what to write, a pull or a stop. */
const waiting = new Map();

/** The main thread's next word on a rows job: the next control message with its id. */
const nextWord = (id) => new Promise((resolve) => waiting.set(id, resolve));

/**
 * What an operation gets from this worker (pivotkit-report's env): the job's data, read once, and
 * the settings the job brings. `seen` keeps what the data said about itself (hidden columns,
 * statistics, when it is from) for the answer.
 * @param {any} job
 * @param {{ hidden: number, stats: import("./stats.js").SourceStats | null, asOf: string | null }} seen
 */
function envOf(job, seen) {
    const { spec, link, template, locale, timeZone, now, table, upload, tableKey, asOf: given, cached, notes } = job;
    return {
        data: async () => {
            const data = table || cached ? tableData(spec, table ?? null, tableKey ?? null, given ?? null, notes ?? []) : upload ? await uploadData(spec, upload, tableKey ?? null, given ?? null) : await fileData(spec);
            seen.hidden = /** @type {any} */ (data).hidden ?? 0;
            seen.stats = /** @type {any} */ (data).stats ?? null;
            seen.asOf = /** @type {any} */ (data).asOf ?? null;
            return data;
        },
        link: async () => link ?? null,
        template: async () => template,
        ...(echarts ? { echarts } : {}),
        limits: spec.limits,
        drafting: draftingOf(spec.levels),
        // the row count is the operator's to show (policy.rows): an HTML report leaves it out too
        ...(spec.levels.rows === false ? { renderOptions: { rowCount: false } } : {}),
        unknownItems: true,
        ...(locale ? { locale } : {}),
        ...(timeZone ? { timeZone } : {}),
        ...(now !== undefined ? { now } : {})
    };
}

/**
 * A rows job (data.js RECORDS_JOB): the data's head, then the columns the main thread names, one
 * piece per pull; a stop (or any other word) ends it. Its end is always posted (`ended`), so the main
 * thread knows this worker is free. The policy is never decided here: the main thread names the
 * columns that may leave.
 * @param {any} job
 */
async function records(job) {
    const { id, input } = job;
    const seen = { hidden: 0, stats: null, asOf: null };
    const env = envOf(job, seen);
    const read = await env.data();
    // a view says which fields it needs: the fields it uses, as the data spells them
    const view = input?.view !== undefined ? (await OPERATIONS.validate_view.run({ source: job.spec.id, view: input.view }, env)).result : null;
    const columns = read.data.columns.filter((c) => !c.derived);
    const head = { columns: columns.map((c) => ({ name: c.name, type: answeredType(c) })), rows: read.data.length, ...(view ? { uses: view.uses ?? [], viewErrors: (view.findings ?? []).filter((f) => f.severity === "error").length } : {}) };
    parentPort.postMessage({ id, head, hidden: seen.hidden, stats: null, asOf: seen.asOf, kept: holds(job.tableKey ?? null) });
    let word = await nextWord(id);
    if (word.write) {
        const pieces = columnPieces(read.data, word.write.columns.map((i) => columns[i]), word.write.pieceChars);
        const encoder = new TextEncoder();
        for (word = await nextWord(id); word.pull; word = await nextWord(id)) {
            const next = pieces.next();
            if (next.done) {
                break;
            }
            const bytes = encoder.encode(next.value);
            parentPort.postMessage({ id, piece: bytes }, [bytes.buffer]);
        }
    }
    waiting.delete(id);
    parentPort.postMessage({ id, ended: true });
}

parentPort?.on("message", async (job) => {
    if (job.word !== undefined) {
        // the main thread's word on a rows job that waits for it
        const resolve = waiting.get(job.id);
        waiting.delete(job.id);
        resolve?.(job.word);
        return;
    }
    const { id, op, input, spec, tableKey, cached } = job;
    if (cached && !holds(tableKey ?? null)) {
        // pushed out since: the main thread sends the table
        parentPort.postMessage({ id, need: true });
        return;
    }
    try {
        if (op === KEPT_JOB && workerData?.hooks === true) {
            // what this worker keeps, for the main thread to look at (tests); runs nothing
            parentPort.postMessage({ id, outcome: keptDataSets(), hidden: 0, stats: null, asOf: null });
            return;
        }
        if (op === READ_JOB) {
            // an HTTP source's CSV answer, read for the main thread to keep: no operation runs
            parentPort.postMessage({ id, outcome: await packedUpload(spec, job.upload, tableKey ?? null, job.asOf ?? null), hidden: 0, stats: null, asOf: null, kept: holds(tableKey ?? null) });
            return;
        }
        if (op === RECORDS_JOB) {
            await records(job);
            return;
        }
        if (!Object.hasOwn(OPERATIONS, op)) {
            throw new OperationError("INTERNAL", "unknown operation");
        }
        if (op === "render_view" && (input.format === "svg" || input.format === "html")) {
            echarts ??= await import("echarts");
        }
        const seen = { hidden: 0, stats: null, asOf: null };
        const outcome = await OPERATIONS[op].run(input, envOf(job, seen));
        // a file's bytes go over as a buffer of their own: copied once here, then transferred, so the
        // message does not copy them again
        if (outcome.file) {
            outcome.file.bytes = outcome.file.bytes.slice();
        }
        const transfer = /** @type {any[]} */ (outcome.file ? [outcome.file.bytes.buffer] : []);
        // whether this worker kept the table's data, so the next job with its key comes without the table
        parentPort.postMessage({ id, outcome, hidden: seen.hidden, stats: seen.stats, asOf: seen.asOf, kept: holds(tableKey ?? null) }, transfer);
    } catch (e) {
        waiting.delete(id);
        const error = asOperationError(e, spec?.path);
        parentPort.postMessage({ id, error: { code: error.code, message: error.message } });
    }
});

// the readers load on first use: read a tiny file once, so a run's time is the run's, not the loading's
await readTable(new TextEncoder().encode("a\n1\n"), "warm-up.csv").catch(() => undefined);
await readTable(new TextEncoder().encode("[]"), "warm-up.json").catch(() => undefined);
// with the bound of the data sets it keeps, as it applies it (compute.js bounds())
parentPort?.postMessage({ ready: true, cacheBytes: cacheBytesNow() });
