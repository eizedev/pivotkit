/*
 * A compute worker: runs one operation of pivotkit-report's table over a file source at a time, with
 * its own cache of data sets (data.js). The main thread gives it the operation, its input and what it
 * needs (the source's spec, the link target, the template text) and gets back the outcome or an
 * error's code and message; the policy is applied in the main thread. A run over its time is ended by
 * terminating the worker (compute.js).
 */

import { parentPort } from "node:worker_threads";
import { OPERATIONS, OperationError } from "pivotkit-report/operations";
import { readTable } from "pivotkit-cli/files";
import { asOperationError, fileData } from "./data.js";

/** ECharts, loaded on the first SVG or HTML report. */
let echarts = null;

parentPort?.on("message", async (job) => {
    const { id, op, input, spec, link, template, locale, timeZone, now } = job;
    try {
        if (!Object.hasOwn(OPERATIONS, op)) {
            throw new OperationError("INTERNAL", "unknown operation");
        }
        if (op === "render_view" && (input.format === "svg" || input.format === "html")) {
            echarts ??= await import("echarts");
        }
        let hidden = 0;
        const env = {
            data: async () => {
                const data = await fileData(spec);
                hidden = /** @type {any} */ (data).hidden ?? 0;
                return data;
            },
            link: async () => link ?? null,
            template: async () => template,
            ...(echarts ? { echarts } : {}),
            limits: spec.limits,
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
        parentPort.postMessage({ id, outcome, hidden }, transfer);
    } catch (e) {
        const error = asOperationError(e, spec?.path);
        parentPort.postMessage({ id, error: { code: error.code, message: error.message } });
    }
});

// the readers load on first use: read a tiny file once, so a run's time is the run's, not the loading's
await readTable(new TextEncoder().encode("a\n1\n"), "warm-up.csv").catch(() => undefined);
await readTable(new TextEncoder().encode("[]"), "warm-up.json").catch(() => undefined);
parentPort?.postMessage({ ready: true });
