/*
 * A compute worker: runs one operation of pivotkit-report's table over a file source, a table the
 * main thread loaded (an HTTP or code source's) or a file handed in (a table job) at a time, with its own cache of data sets
 * (data.js). The main thread gives it the operation, its input and what it needs (the source's spec,
 * the link target, the template text, the table) and gets back the outcome with when the data is
 * from, or an error's code and message; the policy is applied in the main thread. A run over its time is ended by
 * terminating the worker (compute.js). A table job may come without its table (`cached`) when this
 * worker kept its data under the job's key; a worker that no longer holds it answers `need`, and the
 * main thread sends the table.
 */

import { parentPort, workerData } from "node:worker_threads";
import { OPERATIONS, OperationError } from "pivotkit-report/operations";
import { readTable } from "pivotkit-cli/files";
import { asOperationError, fileData, holds, setCacheBytes, tableData, uploadData } from "./data.js";
import { draftingOf } from "./policy.js";

if (typeof workerData?.cacheBytes === "number") {
    setCacheBytes(workerData.cacheBytes);
}

/** ECharts, loaded on the first SVG or HTML report. */
let echarts = null;

parentPort?.on("message", async (job) => {
    const { id, op, input, spec, link, template, locale, timeZone, now, table, upload, tableKey, asOf: given, cached } = job;
    if (cached && !holds(tableKey ?? null)) {
        // pushed out since: the main thread sends the table
        parentPort.postMessage({ id, need: true });
        return;
    }
    try {
        if (!Object.hasOwn(OPERATIONS, op)) {
            throw new OperationError("INTERNAL", "unknown operation");
        }
        if (op === "render_view" && (input.format === "svg" || input.format === "html")) {
            echarts ??= await import("echarts");
        }
        let hidden = 0;
        /** @type {import("./stats.js").SourceStats | null} */
        let stats = null;
        /** @type {string | null} */
        let asOf = null;
        const env = {
            data: async () => {
                const data = table || cached ? tableData(spec, table ?? null, tableKey ?? null, given ?? null) : upload ? await uploadData(spec, upload, tableKey ?? null, given ?? null) : await fileData(spec);
                hidden = /** @type {any} */ (data).hidden ?? 0;
                stats = /** @type {any} */ (data).stats ?? null;
                asOf = /** @type {any} */ (data).asOf ?? null;
                return data;
            },
            link: async () => link ?? null,
            template: async () => template,
            ...(echarts ? { echarts } : {}),
            limits: spec.limits,
            drafting: draftingOf(spec.levels),
            unknownItems: true,
            ...(locale ? { locale } : {}),
            ...(timeZone ? { timeZone } : {}),
            ...(now !== undefined ? { now } : {})
        };
        const outcome = await OPERATIONS[op].run(input, env);
        // a file's bytes go over as a buffer of their own (transferred, not copied)
        if (outcome.file) {
            outcome.file.bytes = outcome.file.bytes.slice();
        }
        const transfer = /** @type {any[]} */ (outcome.file ? [outcome.file.bytes.buffer] : []);
        // whether this worker kept the table's data, so the next job with its key comes without the table
        parentPort.postMessage({ id, outcome, hidden, stats, asOf, kept: holds(tableKey ?? null) }, transfer);
    } catch (e) {
        const error = asOperationError(e, spec?.path);
        parentPort.postMessage({ id, error: { code: error.code, message: error.message } });
    }
});

// the readers load on first use: read a tiny file once, so a run's time is the run's, not the loading's
await readTable(new TextEncoder().encode("a\n1\n"), "warm-up.csv").catch(() => undefined);
await readTable(new TextEncoder().encode("[]"), "warm-up.json").catch(() => undefined);
parentPort?.postMessage({ ready: true });
