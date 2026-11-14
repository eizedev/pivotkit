/*
 * Where operations run. File sources run in a pool of worker threads: each with a memory limit
 * (resourceLimits) and a wall-clock limit (a run over it terminates the worker, which is replaced),
 * so a large file or a heavy view cannot stall the server or take the other callers' time. At most
 * `workers` runs at once; a further call waits up to `queueMs` for a free worker, then is BUSY.
 * Code sources of a library host run in the main thread (the host's code stays in its process).
 */

import { Worker } from "node:worker_threads";
import { OPERATIONS, OperationError } from "pivotkit-report/operations";
import { COMPUTE_DEFAULTS } from "./config.js";
import { codeData } from "./data.js";

/**
 * @param {{ workers?: number, timeMs?: number, memoryMb?: number, queueMs?: number }} [options]
 */
export function createComputer(options = {}) {
    const { workers: size, timeMs, memoryMb, queueMs } = { ...COMPUTE_DEFAULTS, ...options };
    /** @type {Array<{ worker: Worker, busy: boolean, exited: boolean, ready: Promise<unknown> }>} */
    const pool = [];
    /** @type {Array<() => void>} calls waiting for a free worker */
    const waiting = [];
    let closed = false;
    let next = 1;

    const spawn = () => {
        const worker = new Worker(new URL("./worker.js", import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: memoryMb, maxYoungGenerationSizeMb: Math.min(64, memoryMb) } });
        worker.unref();
        const slot = { worker, busy: false, exited: false, ready: /** @type {Promise<unknown>} */ (Promise.resolve()) };
        // an error without a listener would end the process: a worker that dies between runs (or while
        // it starts) is only replaced; a run's own listener says what happened to that run
        worker.on("error", () => undefined);
        worker.on("exit", () => {
            slot.exited = true;
            if (!slot.busy) {
                replace(slot);
            }
        });
        // a run's time starts when its worker has loaded its modules, not while a new one starts
        slot.ready = new Promise((resolve) => {
            const onReady = (msg) => {
                if (msg?.ready) {
                    worker.off("message", onReady);
                    resolve(undefined);
                }
            };
            worker.on("message", onReady);
            worker.once("exit", () => resolve(undefined));
        });
        return slot;
    };
    for (let i = 0; i < size; i++) {
        pool.push(spawn());
    }

    /** A free worker, waiting at most queueMs; BUSY after. */
    const acquire = () =>
        new Promise((resolve, reject) => {
            const take = () => {
                const slot = pool.find((s) => !s.busy);
                if (slot) {
                    slot.busy = true;
                    resolve(slot);
                    return true;
                }
                return false;
            };
            if (take()) {
                return;
            }
            const timer = setTimeout(() => {
                waiting.splice(waiting.indexOf(retry), 1);
                reject(new OperationError("BUSY", "the server is busy with other reports; try again in a moment"));
            }, queueMs);
            const retry = () => {
                if (take()) {
                    clearTimeout(timer);
                    waiting.splice(waiting.indexOf(retry), 1);
                }
            };
            waiting.push(retry);
        });

    const release = (slot) => {
        slot.busy = false;
        waiting[0]?.();
    };

    /** Replaces a worker that was terminated or died. */
    function replace(slot) {
        const i = pool.indexOf(slot);
        if (i >= 0 && !closed) {
            pool[i] = spawn();
            waiting[0]?.();
        }
    }

    /**
     * Runs an operation in a worker.
     * @returns {Promise<{ outcome: import("pivotkit-report/operations").OperationOutcome, hidden: number }>}
     */
    async function inWorker(op, input, job) {
        if (closed) {
            throw new OperationError("NOT_READY", "the server is shutting down");
        }
        const slot = await acquire();
        await slot.ready;
        if (slot.exited) {
            // it died while it started: replaced, and this call fails rather than waiting for its time
            slot.busy = false;
            replace(slot);
            throw new OperationError("INTERNAL", "internal error");
        }
        const id = next++;
        return new Promise((resolve, reject) => {
            const { worker } = slot;
            const done = () => {
                clearTimeout(timer);
                worker.off("message", onMessage);
                worker.off("error", onError);
                worker.off("exit", onExit);
            };
            const onMessage = (msg) => {
                if (msg.id !== id) {
                    return;
                }
                done();
                release(slot);
                if (msg.error) {
                    reject(new OperationError(msg.error.code, msg.error.message));
                } else {
                    if (msg.outcome.file) {
                        msg.outcome.file.bytes = msg.outcome.file.bytes instanceof Uint8Array ? msg.outcome.file.bytes : new Uint8Array(msg.outcome.file.bytes);
                    }
                    resolve({ outcome: msg.outcome, hidden: msg.hidden });
                }
            };
            const onError = (e) => {
                done();
                replace(slot);
                const memory = /memory|heap/i.test(String(e?.message)) || e?.code === "ERR_WORKER_OUT_OF_MEMORY";
                reject(new OperationError(memory ? "LIMIT_EXCEEDED" : "INTERNAL", memory ? `the report needs more than the ${memoryMb} MB of memory a run may use (compute.memoryMb)` : "internal error"));
            };
            const onExit = () => {
                done();
                replace(slot);
                reject(new OperationError("INTERNAL", "internal error"));
            };
            const timer = setTimeout(() => {
                done();
                worker.terminate().catch(() => undefined);
                replace(slot);
                reject(new OperationError("TIMEOUT", `the report took longer than ${timeMs / 1000} s (compute.timeMs); make the view smaller or filter more`));
            }, timeMs);
            worker.on("message", onMessage);
            worker.once("error", onError);
            worker.once("exit", onExit);
            try {
                worker.postMessage({ id, op, input, ...job });
            } catch {
                // an input the structured clone cannot copy (nested thousands of levels deep): the
                // worker never got it, so it is free at once rather than after compute.timeMs
                done();
                release(slot);
                reject(new OperationError("INVALID_INPUT", "the input is nested too deeply"));
            }
        });
    }

    /** Runs an operation over a code source in this thread. */
    async function inThread(op, input, job, source) {
        let hidden = 0;
        const env = {
            data: async () => {
                const data = await codeData(job.spec, source);
                hidden = data.hidden;
                return data;
            },
            link: async () => job.link ?? null,
            template: async () => job.template,
            limits: job.spec.limits,
            ...(job.locale ? { locale: job.locale } : {}),
            ...(job.timeZone ? { timeZone: job.timeZone } : {}),
            ...(job.now !== undefined ? { now: job.now } : {}),
            ...(op === "render_view" && (input.format === "svg" || input.format === "html") ? { echarts: await import("echarts") } : {})
        };
        const outcome = await OPERATIONS[op].run(input, env);
        return { outcome, hidden };
    }

    return {
        /**
         * @param {string} op
         * @param {any} input
         * @param {{ spec: import("./data.js").SourceSpec, link?: any, template?: string, locale?: string, timeZone?: string, now?: any }} job
         * @param {{ load: () => Promise<any>, version?: () => unknown }} [source]  a code source
         */
        run: (op, input, job, source) => (source ? inThread(op, input, job, source) : inWorker(op, input, job)),
        /** The workers alive (0 once closed). */
        size: () => (closed ? 0 : pool.filter((s) => !s.exited).length),
        async close() {
            closed = true;
            await Promise.all(pool.map((s) => s.worker.terminate().catch(() => undefined)));
        }
    };
}
