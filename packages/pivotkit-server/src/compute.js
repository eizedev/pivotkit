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
import { CACHE_ENTRIES, KEPT_JOB, READ_JOB, RECORDS_JOB, codeTable } from "./data.js";
import { isOwnError, sourceFailure } from "./sources/run.js";

/**
 * The head of a rows job: the data's columns (their names and the types the answer gives them), its
 * row count and, for a view, the fields it uses and how many errors it has.
 * @typedef {{ columns: Array<{ name: string, type: "string" | "number" | "boolean" | "date" | null }>, rows: number, uses?: string[], viewErrors?: number }} RecordsHead
 */

/**
 * What the main thread does with a rows job after its head: write these columns (indices into the
 * head's) in pieces of about `pieceChars` characters, take the next piece (null at the end), or stop.
 * @typedef {{ write(columns: number[], pieceChars: number): void, next(): Promise<Uint8Array | null>, stop(): Promise<void> }} RecordsWriter
 */

/** The key of createContext's runtime that turns on the tests' look into the workers (internal.hooks); not exported by the package. */
export const COMPUTE_HOOKS = Symbol("pivotkit.computeHooks");

/**
 * The flags without `--input-type`, in both spellings, or undefined when they hold none. A worker
 * that loads a file refuses that flag at once (ERR_INPUT_TYPE_NOT_ALLOWED), so a host run with
 * `node --input-type=module -e` got no worker. `-e` and `-p` stay: a worker that loads a file
 * ignores them.
 * @param {readonly string[]} args
 * @returns {string[] | undefined}
 */
function withoutInputType(args) {
    /** @type {string[]} */
    const kept = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--input-type") {
            i++; // its value
        } else if (!args[i].startsWith("--input-type=")) {
            kept.push(args[i]);
        }
    }
    return kept.length === args.length ? undefined : kept;
}

/**
 * The host's node flags without `--input-type` (withoutInputType), or undefined when there is none
 * to drop: the worker then inherits the flags as Node does.
 * @param {readonly string[]} [execArgv]
 * @returns {string[] | undefined}
 */
export function workerExecArgv(execArgv = process.execArgv) {
    return withoutInputType(execArgv);
}

/**
 * NODE_OPTIONS split as Node splits it: a space ends an argument outside double quotes, a double
 * quote opens or closes a quoted part anywhere, and inside one a backslash takes the next character
 * as it is. Outside quotes a backslash is a plain character, and so is a single quote. Null for
 * text Node refuses (an unterminated quote or a backslash at the end): such a host does not start.
 * @param {string} text
 * @returns {string[] | null}
 */
function nodeOptionsArgs(text) {
    /** @type {string[]} */
    const args = [];
    let current = null;
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        if (c === "\\" && quoted) {
            if (i + 1 === text.length) {
                return null;
            }
            c = text[++i];
        } else if (c === " " && !quoted) {
            if (current !== null) {
                args.push(current);
                current = null;
            }
            continue;
        } else if (c === '"') {
            quoted = !quoted;
            current ??= "";
            continue;
        }
        current = (current ?? "") + c;
    }
    if (quoted) {
        return null;
    }
    if (current !== null) {
        args.push(current);
    }
    return args;
}

/** NODE_OPTIONS text that nodeOptionsArgs reads as these arguments: one with a space, a quote or a backslash is quoted. */
const nodeOptionsText = (args) => args.map((a) => (/[ "\\]/.test(a) ? `"${a.replace(/["\\]/g, "\\$&")}"` : a)).join(" ");

/**
 * The host's environment with `--input-type` taken out of NODE_OPTIONS, or undefined when there is
 * none. A worker reads NODE_OPTIONS too and fails as with the flag on the command line. Every other
 * variable and every other argument of NODE_OPTIONS stays, written back so Node reads it the same.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {NodeJS.ProcessEnv | undefined}
 */
export function workerEnv(env = process.env) {
    const args = typeof env.NODE_OPTIONS === "string" ? nodeOptionsArgs(env.NODE_OPTIONS) : null;
    const kept = args && withoutInputType(args);
    return kept ? { ...env, NODE_OPTIONS: nodeOptionsText(kept) } : undefined;
}

/** How Node starts its message for ERR_WORKER_INVALID_EXEC_ARGV; the refused flags follow, joined by ", ". */
const REFUSED_PREFIX = "Initiated Worker with invalid execArgv flags: ";

/**
 * The flags of `execArgv` that Node named in its ERR_WORKER_INVALID_EXEC_ARGV, or null for another
 * error. Node names each refused flag as it was given, so a flag counts when it stands in that list
 * whole. Node's docs say a worker takes no V8 options and no options of the whole process.
 * @param {unknown} error
 * @param {readonly string[]} execArgv
 * @returns {Set<string> | null}
 */
function refusedFlags(error, execArgv) {
    const { code, message } = /** @type {{ code?: unknown, message?: unknown }} */ (error ?? {});
    if (code !== "ERR_WORKER_INVALID_EXEC_ARGV" || typeof message !== "string" || !message.startsWith(REFUSED_PREFIX)) {
        return null;
    }
    const list = message.slice(REFUSED_PREFIX.length);
    return new Set(execArgv.filter((a) => list === a || list.startsWith(`${a}, `) || list.endsWith(`, ${a}`) || list.includes(`, ${a}, `)));
}

/**
 * A worker for `file`, with the host's flags and NODE_OPTIONS cleaned (workerExecArgv, workerEnv).
 * A cleaned NODE_OPTIONS needs an explicit flag list too: a worker that inherits its flags keeps the
 * host's `--input-type` from NODE_OPTIONS. Node refuses an explicit list that holds a V8 flag or a
 * flag of the whole process, such as --max-old-space-size or --stack-size, though it ignores them
 * when inherited. Then the flags Node names are dropped and every other one stays: preloads,
 * conditions and the like. The worker's memory limit comes from resourceLimits anyway.
 * @param {URL} file
 * @param {import("node:worker_threads").WorkerOptions} options
 */
function startWorker(file, options) {
    const env = workerEnv();
    const execArgv = workerExecArgv() ?? (env ? [...process.execArgv] : undefined);
    if (execArgv === undefined) {
        return new Worker(file, options);
    }
    const cleaned = { ...options, ...(env ? { env } : {}) };
    try {
        return new Worker(file, { ...cleaned, execArgv });
    } catch (e) {
        const refused = refusedFlags(e, execArgv);
        if (!refused?.size) {
            throw e;
        }
        return new Worker(file, { ...cleaned, execArgv: execArgv.filter((a) => !refused.has(a)) });
    }
}

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
    /** How many pieces of rows answers came from the workers (one per pull: tests check none comes unasked). */
    let piecesIn = 0;
    /** @type {Array<() => void>} calls waiting for a free worker */
    const waiting = [];
    let closed = false;
    let next = 1;

    const spawn = () => {
        // the data sets a worker keeps take at most a quarter of its memory
        const worker = startWorker(internal.worker ?? new URL("./worker.js", import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: memoryMb, maxYoungGenerationSizeMb: Math.min(64, memoryMb) }, workerData: { cacheBytes: internal.cacheBytes ?? Math.floor((memoryMb * 1_048_576) / 4), hooks: internal.hooks === true } });
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
        if (op === RECORDS_JOB) {
            // ref'd until the rows job ends: streamIn unrefs it
            return /** @type {any} */ (streamIn(slot, key, input, job));
        }
        try {
            return await runIn(slot, key, op, input, job, signal);
        } finally {
            worker.unref();
        }
    }

    /**
     * One job on the worker it took, the part every job shares: it posts the job (without its table when
     * the worker kept it, with it once more when the worker asks), and ends it when the worker fails,
     * exits, runs over compute.timeMs or its callers go away. `onMessage` gets the job's other messages;
     * `fail` gets each way the job fails, as an OperationError, after the job ended and the worker was
     * released or replaced. `onEnd` runs once when the job ends, whichever way.
     * @param {any} slot
     * @param {string | null} key  the data's key; null: never kept
     * @param {Record<string, unknown>} message  op, input and the job's data, without the id
     * @param {{ memoryText: string, timeText: string, signal?: AbortSignal, onMessage: (msg: any, job: { id: number, end: () => void }) => void, fail: (e: unknown) => void, onEnd?: () => void }} how  memoryText: the start of the out-of-memory message ("the rows need"); timeText: the timeout's message
     * @returns {{ id: number, end: () => void }}  end(): ends the job; once ended, a no-op
     */
    function attach(slot, key, message, how) {
        const { worker } = slot;
        const id = next++;
        let ended = false;
        let resent = false;
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let timer;
        const end = () => {
            if (ended) {
                return;
            }
            ended = true;
            clearTimeout(timer);
            how.signal?.removeEventListener("abort", onAbort);
            worker.off("message", onWorkerMessage);
            worker.off("error", onError);
            worker.off("exit", onExit);
            how.onEnd?.();
        };
        const job = { id, end };
        /** The worker is stopped and replaced: over its time, or its callers went away. */
        const stop = (error) => {
            end();
            worker.terminate().catch(() => undefined);
            replace(slot);
            how.fail(error);
        };
        const post = (full) => {
            /** @type {Record<string, unknown>} */
            const sending = { id, ...message };
            if (!full) {
                delete sending.table;
                delete sending.upload;
                sending.cached = true;
            }
            try {
                worker.postMessage(sending);
            } catch (e) {
                // an input the structured clone cannot copy: nested thousands of levels deep (a
                // RangeError), or a value it cannot clone at all, such as a function in a host's own
                // table (a DataCloneError). The worker never got it, so it is free at once rather
                // than after compute.timeMs
                end();
                release(slot);
                how.fail(new OperationError("INVALID_INPUT", e instanceof RangeError ? "the input is nested too deeply" : "the input holds a value that cannot be sent to a worker"));
                return;
            }
            sent[full ? "tables" : "cached"] += key !== null ? 1 : 0;
        };
        const onWorkerMessage = (msg) => {
            if (msg.id !== id) {
                return;
            }
            if (msg.need) {
                // the worker pushed the data out: the table once, within the same time (its answer
                // then says whether it kept it, and note() records that)
                if (resent) {
                    end();
                    release(slot);
                    how.fail(new OperationError("INTERNAL", "internal error"));
                    return;
                }
                resent = true;
                post(true);
                return;
            }
            how.onMessage(msg, job);
        };
        const onError = (e) => {
            end();
            replace(slot);
            const memory = /memory|heap/i.test(String(e?.message)) || e?.code === "ERR_WORKER_OUT_OF_MEMORY";
            how.fail(new OperationError(memory ? "LIMIT_EXCEEDED" : "INTERNAL", memory ? `${how.memoryText} more than the ${memoryMb} MB of memory a run may use (compute.memoryMb)` : "internal error"));
        };
        const onExit = () => {
            end();
            replace(slot);
            how.fail(new OperationError("INTERNAL", "internal error"));
        };
        const onAbort = () => stop(how.signal?.reason);
        timer = setTimeout(() => stop(new OperationError("TIMEOUT", how.timeText)), timeMs);
        how.signal?.addEventListener("abort", onAbort, { once: true });
        worker.on("message", onWorkerMessage);
        worker.once("error", onError);
        worker.once("exit", onExit);
        post(key === null || !slot.keys.includes(key));
        return job;
    }

    /**
     * A rows job (data.js RECORDS_JOB) on the worker it took: resolves with the data's head and a
     * writer once the worker has read the data. The worker stays taken until the job ends: the writer
     * wrote every piece, or was stopped, or the job ran over compute.timeMs (the worker is then
     * terminated and replaced). Pieces come one per `next()`, so this thread holds at most one.
     * @returns {Promise<{ outcome: { head: RecordsHead }, hidden: number, stats: null, asOf: string | null, stale: null, writer: RecordsWriter }>}
     */
    async function streamIn(slot, key, input, job) {
        await slot.ready;
        const { worker } = slot;
        if (slot.exited) {
            slot.busy = false;
            worker.unref();
            replace(slot);
            throw new OperationError("INTERNAL", "internal error");
        }
        return new Promise((resolve, reject) => {
            let headed = false;
            let ended = false;
            /** @type {{ resolve: (piece: Uint8Array | null) => void, reject: (e: unknown) => void } | null} the next() waiting for a piece */
            let waiter = null;
            /** @type {unknown} why the job failed after its head, for the next next() */
            let failed = null;
            /** @type {Array<() => void>} who waits for the end (stop()) */
            const onEnd = [];
            /** The job failed: before its head the promise rejects, after it the waiting or next next() does. */
            const fail = (error) => {
                if (!headed) {
                    reject(error);
                } else if (waiter) {
                    waiter.reject(error);
                    waiter = null;
                } else {
                    failed = error;
                }
            };
            /** @type {RecordsWriter} */
            const writer = {
                write(columns, pieceChars) {
                    word({ write: { columns, pieceChars } });
                },
                next() {
                    if (failed) {
                        return Promise.reject(failed);
                    }
                    if (ended) {
                        return Promise.resolve(null);
                    }
                    return new Promise((res, rej) => {
                        waiter = { resolve: res, reject: rej };
                        word({ pull: true });
                    });
                },
                stop() {
                    if (ended) {
                        return Promise.resolve();
                    }
                    return new Promise((res) => {
                        onEnd.push(res);
                        word({ stop: true });
                    });
                }
            };
            const running = attach(slot, key, { op: RECORDS_JOB, input, ...job }, {
                memoryText: "the rows need",
                // the whole job, its reading and writing, within compute.timeMs: a writer nobody drains ends too
                timeText: `the rows took longer than ${timeMs / 1000} s (compute.timeMs) to read and send`,
                fail,
                onEnd: () => {
                    ended = true;
                    worker.unref();
                    onEnd.splice(0).forEach((f) => f());
                },
                onMessage: (msg, own) => {
                    if (msg.head) {
                        headed = true;
                        if (key !== null) {
                            note(slot, key, msg.kept === true);
                        }
                        resolve({ outcome: { head: msg.head }, hidden: msg.hidden ?? 0, stats: null, asOf: msg.asOf ?? null, stale: null, writer });
                        return;
                    }
                    if (msg.piece) {
                        piecesIn++;
                        const piece = msg.piece instanceof Uint8Array ? msg.piece : new Uint8Array(msg.piece);
                        waiter?.resolve(piece);
                        waiter = null;
                        return;
                    }
                    // the job ended (written, stopped) or failed: the worker is free
                    own.end();
                    release(slot);
                    if (msg.error) {
                        fail(new OperationError(msg.error.code, msg.error.message));
                    } else {
                        waiter?.resolve(null);
                        waiter = null;
                    }
                }
            });
            /** A word to the worker about the running job (write, pull, stop), while it runs. */
            function word(w) {
                if (!ended) {
                    worker.postMessage({ id: running.id, word: w });
                }
            }
        });
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
        return new Promise((resolve, reject) => {
            attach(slot, key, { op, input, ...job }, {
                memoryText: "the report needs",
                timeText: `the report took longer than ${timeMs / 1000} s (compute.timeMs); make the view smaller or filter more`,
                // the callers went away: the worker is stopped and replaced, as one over its time is
                signal,
                fail: reject,
                onMessage: (msg, own) => {
                    own.end();
                    if (key !== null) {
                        note(slot, key, msg.kept === true);
                    }
                    release(slot);
                    if (msg.error) {
                        reject(new OperationError(msg.error.code, msg.error.message));
                        return;
                    }
                    if (msg.outcome.file) {
                        msg.outcome.file.bytes = msg.outcome.file.bytes instanceof Uint8Array ? msg.outcome.file.bytes : new Uint8Array(msg.outcome.file.bytes);
                    }
                    resolve({ outcome: msg.outcome, hidden: msg.hidden, stats: msg.stats ?? null, asOf: msg.asOf ?? null, stale: msg.stale ?? null });
                }
            });
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
        /** How many pieces of rows answers came from the workers (tests: one per read of an answer). */
        pieces: () => piecesIn,
        /** The workers alive (0 once closed). */
        size: () => (closed ? 0 : pool.filter((s) => !s.exited).length),
        async close() {
            closed = true;
            await Promise.all(pool.map((s) => s.worker.terminate().catch(() => undefined)));
        }
    };
}
