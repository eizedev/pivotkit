/*
 * A compute worker: runs one operation of pivotkit-report's table over a file source at a time, with
 * its own cache of data sets (data.js). The main thread gives it the operation, its input and what it
 * needs (the source's spec, the link target, the template text) and gets back the outcome or an
 * error's code and message; the policy is applied in the main thread. A run over its time is ended by
 * terminating the worker (compute.js).
 */

import { parentPort } from "node:worker_threads";
import { OPERATIONS, OperationError } from "pivotkit-report/operations";
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
        const env = {
            data: async () => fileData(spec),
            link: async () => link ?? null,
            template: async () => template,
            ...(echarts ? { echarts } : {}),
            limits: spec.limits,
            ...(locale ? { locale } : {}),
            ...(timeZone ? { timeZone } : {}),
            ...(now !== undefined ? { now } : {})
        };
        const outcome = await OPERATIONS[op].run(input, env);
        const data = await fileData(spec).catch(() => null);
        const transfer = /** @type {any[]} */ (outcome.file ? [outcome.file.bytes.buffer] : []);
        parentPort.postMessage({ id, outcome, hidden: data?.hidden ?? 0 }, transfer);
    } catch (e) {
        const error = asOperationError(e, spec?.path);
        parentPort.postMessage({ id, error: { code: error.code, message: error.message } });
    }
});

parentPort?.postMessage({ ready: true });
