/*
 * Reading a file the person picked or dropped, for the import UI: in a module worker where the host
 * gives one (`importWorker`; pivotkit-element starts its own dist/import-worker.js) and the reader is
 * one of pivotkit-core's (CSV, JSON: a plugin is code of the page, a worker cannot take it), else on
 * the page, where the readers give the event loop a turn every 16,384 rows. A worker that cannot
 * start (a CSP without worker-src for it, a browser without module workers, a missing file) leaves the
 * read to the page, quietly. Cancel (`signal`) stops the worker at once, or the reader between steps.
 * The worker is a file of the host's origin, never a blob: URL.
 */

import { PivotkitError } from "pivotkit-core";
import { BUILT_IN_READERS, loadReader, readFile, readerFor } from "pivotkit-core/import";

/**
 * The accept attribute of the file input: every extension and media type the readers take, the
 * host's plugins first. Plugins that fail validatePlugin are left out (the read says why).
 * @param {readonly any[]} plugins
 */
export function acceptOf(plugins) {
    const all = [];
    for (const p of [...plugins, ...BUILT_IN_READERS]) {
        for (const a of Array.isArray(p?.accept) ? p.accept : []) {
            if (typeof a === "string" && !all.includes(a)) {
                all.push(a);
            }
        }
    }
    return all.join(",");
}

/**
 * The names of the formats the report reads, for "CSV or text, JSON, Excel workbook": a reader's name
 * in the report's language where `names` has it (the built-in readers and pivotkit-xlsx), else the
 * plugin's own label.
 * @param {readonly any[]} plugins
 * @param {Record<string, string>} [names]  by the reader's `name`
 */
export const formatsOf = (plugins, names = {}) =>
    [...plugins, ...BUILT_IN_READERS]
        .map((p) => (typeof p?.name === "string" && Object.hasOwn(names, p.name) ? names[p.name] : typeof p?.label === "string" ? p.label.trim().slice(0, 100) : ""))
        .filter((t, i, all) => t && all.indexOf(t) === i);

/** How long a worker may take to say it is ready before the page reads the file itself (ms). */
export const WORKER_READY_MS = 10_000;

/**
 * A reader's table as the import UI uses it: what checkTable of pivotkit-core does not ask for, but
 * retype and the preview need, filled in from what is there (a plugin may return the minimal shape),
 * and notes that are no `{ code, params }` left out.
 * @param {any} table
 * @returns {import("pivotkit-core/import").ImportTable}
 */
export function completeTable(table) {
    const n = table.data[0]?.length ?? 0;
    const same = (list) => Array.isArray(list) && list.length === table.columns.length;
    return {
        ...table,
        rowCount: Number.isInteger(table.rowCount) && table.rowCount >= 0 ? table.rowCount : n,
        raw: same(table.raw) && table.raw.every((c) => Array.isArray(c) && c.length === n) ? table.raw : table.data,
        detected: same(table.detected) ? table.detected : table.types,
        hints: table.hints && typeof table.hints === "object" ? table.hints : { decimal: ".", dateOrder: "dmy" },
        notes: table.notes.filter((x) => x && typeof x.code === "string").map((x) => ({ code: x.code, params: x.params && typeof x.params === "object" ? x.params : {}, message: String(x.message ?? x.code) }))
    };
}

/** A worker's table: the shape every reader returns (pivotkit-core's checkTable checks the rest). */
const isTable = (t) => t !== null && typeof t === "object" && Array.isArray(t.columns) && Array.isArray(t.types) && Array.isArray(t.data) && Array.isArray(t.notes);

/** An AbortError, as the readers throw it. */
const aborted = (signal) => signal?.reason ?? new DOMException("The read was cancelled", "AbortError");

/** A worker that did not start: the page reads the file. */
const UNAVAILABLE = Symbol("worker unavailable");

/**
 * Reads the file in a worker. Resolves with the table, or UNAVAILABLE when the worker did not start;
 * rejects with the reader's error (a PivotkitError again) or the signal's AbortError.
 * @param {() => Worker} start
 * @param {Blob} file
 * @param {object} options  plain data: name, sheet, types, locale, limits
 * @param {AbortSignal | undefined} signal
 * @param {((p: import("pivotkit-core/import").ImportProgress) => void) | undefined} onProgress
 * @returns {Promise<any>}
 */
function inWorker(start, file, options, signal, onProgress, readyMs = WORKER_READY_MS) {
    /** @type {Worker} */
    let worker;
    try {
        worker = start();
    } catch {
        return Promise.resolve(UNAVAILABLE);
    }
    if (!worker || typeof worker.postMessage !== "function") {
        return Promise.resolve(UNAVAILABLE);
    }
    return new Promise((resolve, reject) => {
        let ready = false;
        // a worker that never says it is ready (a file that is no worker, a blocked load without an
        // error event): the page reads the file
        const late = setTimeout(() => {
            end();
            resolve(UNAVAILABLE);
        }, readyMs);
        const end = () => {
            clearTimeout(late);
            worker.terminate?.();
            signal?.removeEventListener("abort", stop);
        };
        const stop = () => {
            end();
            reject(aborted(signal));
        };
        if (signal?.aborted) {
            stop();
            return;
        }
        signal?.addEventListener("abort", stop, { once: true });
        worker.onmessage = (event) => {
            const m = event.data;
            if (m?.type === "ready" && !ready) {
                ready = true;
                clearTimeout(late);
                try {
                    worker.postMessage({ file, options });
                } catch {
                    // options a worker cannot take (not plain data): the page reads the file
                    end();
                    resolve(UNAVAILABLE);
                }
            } else if (m?.type === "progress") {
                if (m.progress && typeof m.progress === "object") {
                    onProgress?.(m.progress);
                }
            } else if (m?.type === "done") {
                end();
                if (isTable(m.table)) {
                    resolve(m.table);
                } else {
                    reject(new Error("The import worker returned no table"));
                }
            } else if (m?.type === "error") {
                end();
                const e = m.error ?? {};
                reject(typeof e.code === "string" ? new PivotkitError(e.code, String(e.message ?? ""), e.details ?? {}) : new Error(String(e.message ?? "The file could not be read")));
            }
        };
        worker.onmessageerror = () => {
            end();
            reject(new Error("The import worker's answer could not be read"));
        };
        worker.onerror = (event) => {
            event.preventDefault?.();
            end();
            if (ready) {
                reject(new Error(String(event.message || "The file could not be read")));
            } else {
                resolve(UNAVAILABLE);
            }
        };
    });
}

/**
 * @typedef {object} ImportRead
 * @property {any[]} [plugins]  the host's reader plugins
 * @property {(() => Worker) | undefined} [worker]  starts the host's import worker
 * @property {string | number} [sheet]
 * @property {string} [locale]
 * @property {object} [limits]
 * @property {AbortSignal} [signal]
 * @property {(p: import("pivotkit-core/import").ImportProgress) => void} [onProgress]
 * @property {number} [readyMs]  how long the worker may take to start (WORKER_READY_MS; tests)
 */

/**
 * Reads a file into pivotkit-core/import's table: in the host's worker when the reader is a built-in
 * one and the worker starts, else on the page.
 * @param {File} file
 * @param {ImportRead} options
 * @returns {Promise<import("pivotkit-core/import").ImportTable>}
 */
export async function readImport(file, { plugins = [], worker, sheet, locale, limits, signal, onProgress, readyMs } = {}) {
    const plain = { name: file.name, ...(sheet !== undefined ? { sheet } : {}), ...(locale ? { locale } : {}), ...(limits ? { limits } : {}) };
    const reader = readerFor(file, plugins);
    if (worker && reader && BUILT_IN_READERS.includes(reader)) {
        const table = await inWorker(worker, file, plain, signal, onProgress, readyMs);
        if (table !== UNAVAILABLE) {
            return completeTable(table);
        }
    }
    signal?.throwIfAborted();
    return completeTable(await readFile(file, { ...plain, plugins, signal, onProgress }));
}

/**
 * The sheets of a file whose reader has several (a workbook), or [] for one table.
 * @param {File} file
 * @param {{ plugins?: any[], limits?: object, signal?: AbortSignal }} options
 * @returns {Promise<import("pivotkit-core/import").SheetInfo[]>}
 */
export async function sheetsOf(file, { plugins = [], limits, signal } = {}) {
    const reader = readerFor(file, plugins);
    if (!reader) {
        return [];
    }
    const mod = await loadReader(reader);
    if (typeof mod.sheets !== "function") {
        return [];
    }
    const list = await mod.sheets(file, { name: file.name, ...(limits ? { limits } : {}), signal });
    return Array.isArray(list) ? list.filter((s) => s && typeof s.name === "string" && Number.isInteger(s.index)) : [];
}
