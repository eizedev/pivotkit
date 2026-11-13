/*
 * The import worker (pivotkit-react/import-worker, dist/import-worker.js): reads a file with
 * pivotkit-core/import's built-in readers (CSV, TSV, text, JSON) off the page, so a large file does not
 * stop the report. import-run.js starts it per file through the host's `importWorker` and ends it when
 * the file is read or the read is cancelled. Protocol: "ready" once loaded; then { file, options }
 * (plain data) in, "progress" and one "done" (the table) or "error" (code, message, details) out. A
 * plugin's reader never runs here: plugins are functions of the page.
 */

import { readFile } from "pivotkit-core/import";

const scope = /** @type {any} */ (globalThis);

scope.onmessage = async (/** @type {MessageEvent} */ event) => {
    const { file, options } = event.data ?? {};
    try {
        const table = await readFile(file, { ...options, plugins: [], onProgress: (/** @type {any} */ progress) => scope.postMessage({ type: "progress", progress }) });
        scope.postMessage({ type: "done", table });
    } catch (error) {
        const e = /** @type {any} */ (error);
        scope.postMessage({ type: "error", error: { code: typeof e?.code === "string" ? e.code : undefined, message: String(e?.message ?? e), details: e?.details && typeof e.details === "object" ? { ...e.details } : {} } });
    }
};

scope.postMessage({ type: "ready" });
