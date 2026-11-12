// The page of the browser benchmark (bench/browser/run.js): <PivotReport> from pivotkit-react's dist/,
// as the playground bundles it, with the playground's generated data sets (fixed seed). The runner
// drives it through window.bench and with real clicks; every time is taken here, in the page, with
// performance.now(), so the round trips between Node and the browser are not part of it.
//
// A step's time runs from its start (the data handed to the report, or the click that starts an
// interaction) to the first animation frame in which the page shows the step's result: the frame the
// browser paints next. While it waits, the page records the longest gap between two animation frames
// (in every engine: the longest time the page could not paint) and, where the engine reports them
// (Chromium), the long tasks over 50 ms.
import React from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import "pivotkit-react/styles.css";
import { sales, tickets } from "../../examples/playground/src/data.js";

const GENERATORS = { sales, tickets };
const TIMEOUT_MS = 300_000;

/** @type {Record<string, unknown>[] | null} */
let rows = null;
const root = createRoot(/** @type {HTMLElement} */ (document.getElementById("app")));
let mounts = 0;

// long tasks: Chromium only (PerformanceObserver.supportedEntryTypes says so in each engine)
const longTaskSupport = typeof PerformanceObserver === "function" && (PerformanceObserver.supportedEntryTypes ?? []).includes("longtask");
/** @type {{ start: number, duration: number }[]} */
const longTasks = [];
const keepLongTasks = (entries) => {
    for (const e of entries) longTasks.push({ start: e.startTime, duration: e.duration });
};
const longTaskObserver = longTaskSupport ? new PerformanceObserver((list) => keepLongTasks(list.getEntries())) : null;
longTaskObserver?.observe({ type: "longtask", buffered: true });

// the XLSX download: saveBlob (pivotkit-react's files.js) clicks a link with a download name
let downloadedAt = 0;
const click = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function benchClick() {
    if (this.download) downloadedAt = performance.now();
    return click.call(this);
};

const $ = (selector) => document.querySelector(selector);
const text = (selector) => $(selector)?.textContent ?? "";
const tableShown = () => Boolean($('[data-testid="pivot-table"] tbody tr[data-r]'));
const errorShown = () => Boolean($(".pk-error"));

/** What the person sees of the result: the row count, the zones, the table's head and first rows, the chart. */
function signature() {
    const body = [...document.querySelectorAll('[data-testid="pivot-table"] tbody tr[data-r]')].slice(0, 3).map((tr) => tr.textContent);
    const chips = [...document.querySelectorAll(".pk-chip")].map((c) => c.getAttribute("data-chip"));
    return JSON.stringify([text('[data-testid="row-count"]'), chips, text('[data-testid="pivot-table"] thead'), body, Boolean($('[data-testid="pivot-chart"] canvas'))]);
}

/** The conditions a step waits for; `before` is the signature when the step was armed. */
const DONE = {
    // the first result: a table, or the message that says why there is none (a limit)
    table: () => tableShown() || errorShown(),
    // the result changed (a filter, a field added) and is a table again
    changed: (before) => signature() !== before && (tableShown() || errorShown()),
    // the Filter level lists the field's values with their counts
    values: () => Boolean($(".pk-chip-menu .pk-value")),
    // the chart's canvas is in the page
    chart: () => Boolean($('[data-testid="pivot-chart"] canvas')) || errorShown(),
    // the XLSX file was handed to the browser as a download
    download: (_before, t0) => downloadedAt > t0
};

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));

/** The pivotkit:* measures of the performance timeline between t0 and t1, summed per name. */
function measures(t0, t1) {
    const out = {};
    for (const e of performance.getEntriesByType("measure")) {
        if (e.name.startsWith("pivotkit:") && e.startTime >= t0 && e.startTime <= t1) {
            const k = e.name.slice(9);
            out[k] = (out[k] ?? 0) + e.duration;
        }
    }
    return out;
}

/**
 * Waits, frame by frame, until `done` holds; resolves with the step's numbers. `start()` returns the
 * step's start time (0 while the step has not started: a click not yet dispatched).
 */
async function watch(done, before, start) {
    let last = await frame();
    let maxGap = 0;
    const deadline = performance.now() + TIMEOUT_MS;
    for (;;) {
        const now = await frame();
        const t0 = start();
        // only gaps after the step started count: before it the page is idle
        if (t0 > 0) maxGap = Math.max(maxGap, now - Math.max(last, t0));
        last = now;
        if (t0 > 0 && done(before, t0)) {
            // a long task is reported after it ended: wait for its entry, then take what is queued
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (longTaskObserver) keepLongTasks(longTaskObserver.takeRecords());
            const tasks = longTasks.filter((t) => t.start + t.duration >= t0 && t.start <= now);
            return {
                ms: now - t0,
                maxFrameGapMs: maxGap,
                longTasks: longTaskSupport ? { count: tasks.length, longestMs: Math.max(0, ...tasks.map((t) => t.duration)), totalMs: tasks.reduce((s, t) => s + t.duration, 0) } : null,
                measures: measures(t0, now),
                error: errorShown() ? text(".pk-error") : null,
                rowCount: text('[data-testid="row-count"]')
            };
        }
        if (now > deadline) throw new Error(`timeout after ${TIMEOUT_MS} ms`);
    }
}

/** @type {Promise<any> | null} */
let armed = null;

window.bench = {
    /** Generates a data set of the playground in this page; not part of any step's time. */
    generate(dataset, n) {
        const t0 = performance.now();
        rows = GENERATORS[dataset](n);
        return { ms: performance.now() - t0, rows: rows.length };
    },
    /** Hands the rows to a new report with a view and waits for the first table. */
    render(view) {
        const t0 = performance.now();
        mounts += 1;
        root.render(<PivotReport key={mounts} data={rows} defaultView={view} locale="en-US" height="860px" fileName="bench" />);
        return watch(DONE.table, null, () => t0);
    },
    /** Arms a step that the runner's next click starts: its start is that click's dispatch. */
    arm(kind) {
        const before = signature();
        let t0 = 0;
        document.addEventListener("click", () => (t0 = performance.now()), { capture: true, once: true });
        armed = watch(DONE[kind], before, () => t0);
        return true;
    },
    /** The numbers of the armed step, once it is done. */
    result() {
        const r = armed;
        armed = null;
        return r;
    },
    longTaskSupport
};
