/*
 * Where operations run. File sources, and tables loaded in the main thread or files handed in (a
 * table job: job.table or job.upload with job.tableKey), run in a pool of worker threads: each with a memory limit
 * (resourceLimits) and a wall-clock limit (a run over it terminates the worker, which is replaced),
 * so a large file or a heavy view cannot stall the server or take the other callers' time. At most
 * `workers` runs at once; a further call waits up to `queueMs` for a free worker, then is BUSY.
 * A code source of a library host is loaded in the main thread (the host's code stays in its
 * process) and computed in a worker as a table job, as an HTTP source is. A table job with a key
 * goes to the worker that kept its data where that one is free, and then without its table; a
 * worker that pushed the data out since answers `need` and gets the table once. An HTTP source's CSV
 * answer is read in a worker too (`read`), which gives back a packed table to keep.
 */

import { Worker } from "node:worker_threads";
import { OperationError } from "pivotkit-report/operations";
import { COMPUTE_DEFAULTS } from "./config.js";
import { CACHE_ENTRIES, KEPT_JOB, READ_JOB, codeTable } from "./data.js";
import { isOwnError, sourceFailure } from "./sources/run.js";

/** The key of createContext's runtime that turns on the tests' look into the workers (internal.hooks); not exported by the package. */
export const COMPUTE_HOOKS = Symbol("pivotkit.computeHooks");

/**
 * @param {{ workers?: number, timeMs?: number, memoryMb?: number, queueMs?: number }} [options]
 * @param {{ worker?: URL, cacheBytes?: number, hooks?: boolean }} [internal]  worker: another worker script (tests that need a worker which misbehaves); cacheBytes: the workers' bound on kept data sets instead of a quarter of memoryMb (tests that need a bound below what a run needs, independent of the run's own memory); hooks: the tests' look into the workers (heapSnapshots, keptDataSets; test/memory.test.js), absent otherwise
 */
export function createComputer(options = {}, internal = {}) {
    const { workers: size, timeMs, memoryMb, queueMs } = { ...COMPUTE_DEFAULTS, ...options };
    /** @type {Array<{ worker: Worker, busy: boolean, exited: boolean, ready: Promise<unknown>, keys: string[], cacheBytes: number | null }>} */
    const pool = [];
    /** How many table jobs went with their table, and how many without (the worker had kept it). */
    const sent = { tables: 0, cached: 0 };
    /** @type {Array<() => void>} calls waiting for a free worker */
    const waiting = [];
    let closed = false;
    let next = 1;

    const spawn = () => {
        // the data sets a worker keeps take at most a quarter of its memory
        const worker = new Worker(internal.worker ?? new URL("./worker.js", import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: memoryMb, maxYoungGenerationSizeMb: Math.min(64, memoryMb) }, workerData: { cacheBytes: internal.cacheBytes ?? Math.floor((memoryMb * 1_048_576) / 4), hooks: internal.hooks === true } });
        worker.unref();
        /** @type {string[]} the table keys it said it kept, oldest first (its cache may have pushed them out since) */
        const keys = [];
        const slot = { worker, busy: false, exited: false, ready: /** @type {Promise<unknown>} */ (Promise.resolve()), keys, cacheBytes: /** @type {number | null} */ (null) };
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
                    slot.cacheBytes = typeof msg.cacheBytes === "number" ? msg.cacheBytes : null;
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

    /** A free worker, the one that kept `key`'s data if it is free, waiting at most queueMs; BUSY after. */
    const acquire = (key = null) =>
        new Promise((resolve, reject) => {
            const take = () => {
                const slot = (key !== null ? pool.find((s) => !s.busy && s.keys.includes(key)) : undefined) ?? pool.find((s) => !s.busy);
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

    /** Notes a key a worker kept (or that it no longer holds it). */
    const note = (slot, key, kept) => {
        const at = slot.keys.indexOf(key);
        if (at >= 0) {
            slot.keys.splice(at, 1);
        }
        if (kept) {
            slot.keys.push(key);
            if (slot.keys.length > CACHE_ENTRIES) {
                slot.keys.shift();
            }
        }
    };

    /**
     * Runs an operation in a worker.
     * @returns {Promise<{ outcome: import("pivotkit-report/operations").OperationOutcome, hidden: number, stats: import("./stats.js").SourceStats | null, asOf: string | null, stale: { since: string } | null }>}
     */
    async function inWorker(op, input, job, signal = undefined) {
        if (closed) {
            throw new OperationError("NOT_READY", "the server is shutting down");
        }
        const key = typeof job.tableKey === "string" && (job.table || job.upload) ? job.tableKey : null;
        const slot = await acquire(key);
        // an idle worker is unref'd, so it never keeps the process alive; a call waiting for one
        // must, or a host's process can end while the worker starts or runs (Node 22 does)
        const { worker } = slot;
        worker.ref();
        try {
            return await runIn(slot, key, op, input, job, signal);
        } finally {
            worker.unref();
        }
    }

    /** inWorker's run on the worker it took. */
    async function runIn(slot, key, op, input, job, signal) {
        await slot.ready;
        if (slot.exited) {
            // it died while it started: replaced, and this call fails rather than waiting for its time
            slot.busy = false;
            replace(slot);
            throw new OperationError("INTERNAL", "internal error");
        }
        if (signal?.aborted) {
            // its callers went away while it waited for a worker
            release(slot);
            throw signal.reason;
        }
        const id = next++;
        return new Promise((resolve, reject) => {
            const { worker } = slot;
            const done = () => {
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                worker.off("message", onMessage);
                worker.off("error", onError);
                worker.off("exit", onExit);
            };
            /** Posts the job, without its table when the worker kept it; false when it cannot be copied. */
            const post = (full) => {
                const message = { id, op, input, ...job };
                if (!full) {
                    delete message.table;
                    delete message.upload;
                    message.cached = true;
                }
                try {
                    worker.postMessage(message);
                } catch {
                    // an input the structured clone cannot copy (nested thousands of levels deep): the
                    // worker never got it, so it is free at once rather than after compute.timeMs
                    done();
                    release(slot);
                    reject(new OperationError("INVALID_INPUT", "the input is nested too deeply"));
                    return;
                }
                sent[full ? "tables" : "cached"] += key !== null ? 1 : 0;
            };
            let resent = false;
            const onMessage = (msg) => {
                if (msg.id !== id) {
                    return;
                }
                if (msg.need) {
                    // the worker pushed the data out: the table once, within the same time (its answer
                    // then says whether it kept it, and note() records that)
                    if (resent) {
                        done();
                        release(slot);
                        reject(new OperationError("INTERNAL", "internal error"));
                        return;
                    }
                    resent = true;
                    post(true);
                    return;
                }
                done();
                if (key !== null) {
                    note(slot, key, msg.kept === true);
                }
                release(slot);
                if (msg.error) {
                    reject(new OperationError(msg.error.code, msg.error.message));
                } else {
                    if (msg.outcome.file) {
                        msg.outcome.file.bytes = msg.outcome.file.bytes instanceof Uint8Array ? msg.outcome.file.bytes : new Uint8Array(msg.outcome.file.bytes);
                    }
                    resolve({ outcome: msg.outcome, hidden: msg.hidden, stats: msg.stats ?? null, asOf: msg.asOf ?? null, stale: msg.stale ?? null });
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
            // the callers went away: the worker is stopped and replaced, as one over its time is
            const onAbort = () => {
                done();
                worker.terminate().catch(() => undefined);
                replace(slot);
                reject(signal?.reason);
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            worker.on("message", onMessage);
            worker.once("error", onError);
            worker.once("exit", onExit);
            post(key === null || !slot.keys.includes(key));
        });
    }

    /**
     * A code source's own { load } (a host calling the pool itself), once: no time limit, nothing
     * kept (sources/code.js does that), its errors answered as runLoad answers them; then a table job.
     */
    async function loadOnce(op, input, job, source) {
        let read;
        try {
            read = codeTable(job.spec, await source.load());
        } catch (e) {
            throw isOwnError(e) ? e : sourceFailure(e);
        }
        return inWorker(op, input, { ...job, table: read.table, tableKey: null, asOf: read.asOf });
    }

    /** The tests' look into the workers: only for a computer made with internal.hooks. */
    const hooks = {
        /**
         * A heap snapshot of each worker alive; a snapshot holds only what is still reachable, after
         * V8 collected the rest.
         * @param {import("node:v8").HeapSnapshotOptions} [options]
         * @returns {Promise<import("node:stream").Readable[]>}
         */
        heapSnapshots: async (options = {}) => {
            await Promise.all(pool.map((s) => s.ready));
            return Promise.all(pool.filter((s) => !s.exited).map((s) => /** @type {any} */ (s.worker).getHeapSnapshot(options)));
        },
        /** What the data sets a worker keeps hold (data.js keptDataSets; with one worker, that worker's). */
        keptDataSets: async () => /** @type {{ texts: string[], numbers: number[], bytes: Uint8Array[] }} */ (/** @type {unknown} */ ((await inWorker(KEPT_JOB, null, {})).outcome))
    };

    return {
        ...(internal.hooks === true ? hooks : {}),
        /**
         * @param {string} op
         * @param {any} input
         * @param {{ spec: import("./data.js").SourceSpec, link?: any, template?: string, locale?: string, timeZone?: string, now?: any, notes?: import("pivotkit-report/operations").Finding[], table?: { columns: string[], rows: unknown[][] } | { columns: string[], types?: string[], data: unknown[][] } | import("./packed.js").PackedTable, upload?: { bytes: Uint8Array, format: string, sheet?: string }, tableKey?: string | null, asOf?: string | null }} job
         *   a table job (data loaded in this thread, computed in a worker): table (a code source's packed, packed.js) or upload, with tableKey (sources/keys.js; null: not kept) and asOf
         * @param {{ load: () => unknown }} [source]  a code source's own load, called once in this thread
         */
        run: (op, input, job, source) => (source ? loadOnce(op, input, job, source) : inWorker(op, input, job)),
        /**
         * An HTTP source's CSV answer read in a worker (within compute.timeMs and compute.memoryMb)
         * into a packed table without the columns the levels hide, and the reader's notes (data.js
         * packedUpload): what sources/http.js keeps. The worker keeps the data set by `tableKey`, so
         * the operation's job that follows goes to it without the table.
         * @param {import("./data.js").SourceSpec} spec
         * @param {{ bytes: Uint8Array, format: "csv" }} upload
         * @param {string | null} tableKey
         * @param {string | null} asOf
         * @param {AbortSignal} [signal]  fires when every caller of the load went away: the read stops
         * @returns {Promise<{ table: import("./packed.js").PackedTable, notes: import("pivotkit-report/operations").Finding[] }>}
         */
        read: async (spec, upload, tableKey, asOf, signal = undefined) => /** @type {any} */ ((await inWorker(READ_JOB, null, { spec, upload, tableKey, asOf }, signal)).outcome),
        /** The bound on kept data sets each worker reported when it was ready (tests, once the workers started). */
        async bounds() {
            await Promise.all(pool.map((s) => s.ready));
            return pool.map((s) => s.cacheBytes);
        },
        /** How many table jobs with a key went with their table and how many without it (tests). */
        sent: () => ({ ...sent }),
        /** The workers alive (0 once closed). */
        size: () => (closed ? 0 : pool.filter((s) => !s.exited).length),
        async close() {
            closed = true;
            await Promise.all(pool.map((s) => s.worker.terminate().catch(() => undefined)));
        }
    };
}
