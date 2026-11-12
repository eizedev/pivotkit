// Browser benchmark of the report above the designed 100,000 rows: <PivotReport> (pivotkit-react's
// dist/, bundled as the playground bundles it) with the playground's generated data sets (fixed seed),
// in Chromium, Firefox and WebKit from the pinned Playwright, headless. For each size and view it
// measures, in the page (page.jsx), the time from the data handed to the report to the first table,
// the interactions of a person (open a filter's values, take a value out, add a field, export XLSX,
// switch to the chart), the longest time the page could not paint, long tasks (Chromium) and the
// memory of the page's JavaScript (Chromium, through the DevTools protocol after a garbage collection). Every run is a
// new page; the median of the runs is printed. A size that fails (a limit, a crash, a timeout) is
// recorded, and the larger sizes of that view in that engine are not run.
//
//   npm run bench:browser                                        all engines, sizes and views, 5 runs
//   npm run bench:browser -- --runs 3 --sizes 100000,250000 --browsers chromium --json out.json
//
// Timings for the documentation (docs/concepts/limits.md, "Measured in the browser"): machines differ.
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, loadavg, platform, release, totalmem } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as esbuild from "esbuild";
import { chromium, firefox, webkit } from "@playwright/test";
import { options as packageOptions } from "../../packages/pivotkit-react/build.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = join(here, "dist");
const ENGINES = { chromium, firefox, webkit };

const { values: args } = parseArgs({
    options: {
        runs: { type: "string", default: "5" },
        sizes: { type: "string", default: "100000,250000,500000,1000000" },
        browsers: { type: "string", default: "chromium,firefox,webkit" },
        views: { type: "string" },
        json: { type: "string" }
    }
});
const RUNS = Number(args.runs);
const SIZES = args.sizes.split(",").map(Number);
const BROWSERS = args.browsers.split(",");

/**
 * The views: two of the playground's presets and one with the aggregators that keep a value per row
 * and cell. `interact` runs the person's steps on the first one.
 */
const VIEWS = {
    "sum, 2 row fields x 1 column field": {
        dataset: "sales",
        view: { rows: ["Region", "Country"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum", format: "currency:EUR" }], sort: [{ field: "Region", by: "value", order: "desc" }] },
        interact: true
    },
    "median by month (date grouping), filtered": {
        dataset: "tickets",
        view: {
            rows: ["Created (Year and month)"],
            cols: ["Priority"],
            derived: [{ name: "Created (Year and month)", field: "Created", by: "yearMonth" }],
            values: [{ field: "Lead hours", agg: "median", format: "duration:h" }],
            filters: [{ field: "Status", type: "in", items: ["Resolved", "Closed"], blanks: "exclude" }]
        }
    },
    "countUnique of an ID + median": {
        dataset: "tickets",
        view: { rows: ["Team"], cols: ["Channel"], values: [{ field: "Ticket", agg: "countUnique" }, { field: "Lead hours", agg: "median", format: "duration:h" }] }
    }
};
const viewNames = args.views ? args.views.split(",").map((i) => Object.keys(VIEWS)[Number(i)]) : Object.keys(VIEWS);

/** Builds pivotkit-react's dist/ and the page, minified, production React, as the playground. */
async function build() {
    await esbuild.build({ ...packageOptions, logLevel: "warning" });
    await mkdir(out, { recursive: true });
    await esbuild.build({
        absWorkingDir: here,
        entryPoints: { page: "page.jsx" },
        outdir: out,
        bundle: true,
        format: "esm",
        splitting: true,
        chunkNames: "chunks/[name]-[hash]",
        platform: "browser",
        target: ["es2022", "chrome111", "firefox113", "safari16.4"],
        jsx: "automatic",
        minify: true,
        define: { "process.env.NODE_ENV": '"production"' },
        legalComments: "none",
        logLevel: "warning"
    });
    await writeFile(
        join(out, "index.html"),
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<title>pivotkit browser benchmark</title>\n<link rel="stylesheet" href="./page.css" />\n<script type="module" src="./page.js"></script>\n</head>\n<body><div id="app"></div></body>\n</html>\n'
    );
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

/** A file server for dist/ on a free port of 127.0.0.1. */
async function serve() {
    const server = createServer(async (req, res) => {
        const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^\/+/, "") || "index.html";
        try {
            const body = await readFile(join(out, path));
            res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
    const address = server.address();
    return { server, url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/` };
}

/**
 * The memory of the page's JavaScript after a garbage collection, in bytes (Chromium: the DevTools
 * protocol): the JavaScript heap, the backing stores of ArrayBuffers (the typed arrays of the encoded
 * columns live there, not in the heap) and the embedder's heap (the DOM).
 */
async function heap(cdp) {
    if (!cdp) return null;
    await cdp.send("HeapProfiler.collectGarbage");
    const h = await cdp.send("Runtime.getHeapUsage");
    return h.usedSize + (h.backingStorageSize ?? 0) + (h.embedderHeapUsedSize ?? 0);
}

/** One run: a new page, the data generated, the view rendered, then the person's steps. */
async function run(browser, engine, url, name, n) {
    const { dataset, view, interact } = VIEWS[name];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const problems = [];
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(`${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    let crashed = false;
    page.on("crash", () => (crashed = true));
    // the machine's load when the run starts: another program at work makes every number larger
    const result = { problems, load: loadavg()[0] };
    try {
        await page.goto(url);
        await page.waitForFunction(() => Boolean(window.bench));
        const cdp = engine === "chromium" ? await context.newCDPSession(page) : null;
        const empty = await heap(cdp);
        result.generate = await page.evaluate(([d, k]) => window.bench.generate(d, k), [dataset, n]);
        const withData = await heap(cdp);
        result.render = await page.evaluate((v) => window.bench.render(v), view);
        const rendered = await heap(cdp);
        if (cdp) result.heap = { dataMB: (withData - empty) / 1e6, reportMB: (rendered - withData) / 1e6, totalMB: rendered / 1e6 };
        // the table shows every row of the data set: a check that the result is the one asked for
        if (!result.render.error && dataset === "sales" && result.render.rowCount !== `${n.toLocaleString("en-US")} rows`) {
            result.wrong = `row count "${result.render.rowCount}", expected ${n} rows`;
        }
        if (interact && !result.render.error) result.steps = await steps(page, n, result);
    } catch (error) {
        result.failed = crashed ? "the page crashed" : String(error?.message ?? error).split("\n")[0];
    } finally {
        await context.close().catch(() => {});
    }
    return result;
}

/** A step: armed in the page, started by a real click, timed in the page. */
async function step(page, kind, act) {
    await page.evaluate((k) => window.bench.arm(k), kind);
    await act();
    return page.evaluate(() => window.bench.result());
}

/** The person's steps on the sales view, each with a check of what the page shows after it. */
async function steps(page, n, result) {
    const out = {};
    await page.getByTestId("chip-menu-Region").click();
    out["open a filter's values"] = await step(page, "values", () => page.locator(".pk-chip-menu").getByTestId("topic-filter").click());
    const west = page.locator(".pk-value", { hasText: "West" });
    const count = Number((await west.locator(".pk-count").textContent()).replace(/,/g, ""));
    out["take a value out of a filter"] = await step(page, "changed", () => west.locator("input").uncheck());
    if (out["take a value out of a filter"].rowCount !== `${(n - count).toLocaleString("en-US")} rows`) {
        result.wrong = `after the filter: "${out["take a value out of a filter"].rowCount}", expected ${n - count} rows`;
    }
    await page.keyboard.press("Escape");
    await page.getByTestId("field-menu-Channel").click();
    out["add a field"] = await step(page, "changed", () => page.getByRole("menuitem", { name: "Add to Rows" }).click());
    await page.getByTestId("export").click();
    const download = page.waitForEvent("download");
    out["export XLSX"] = await step(page, "download", () => page.getByTestId("export-xlsx").click());
    out["export XLSX"].bytes = (await readFile(await (await download).path())).length;
    out["switch to the chart"] = await step(page, "chart", () => page.getByTestId("show-chart").click());
    return out;
}

const median = (list) => {
    const s = list.filter((x) => typeof x === "number").sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
};

/** The median of each number of the runs, by path ("render.ms", "steps.add a field.ms"). */
function summarize(runs) {
    const ok = runs.filter((r) => !r.failed && !r.render?.error);
    const pick = (path) => median(ok.map((r) => path.split(".").reduce((o, k) => o?.[k], r)));
    const paths = new Set();
    const walk = (o, prefix) => {
        for (const [k, v] of Object.entries(o ?? {})) {
            if (typeof v === "number") paths.add(prefix + k);
            else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, `${prefix}${k}.`);
        }
    };
    for (const r of ok) walk(r, "");
    return {
        runs: runs.length,
        ok: ok.length,
        failed: runs.find((r) => r.failed)?.failed ?? null,
        limit: runs.find((r) => r.render?.error)?.render.error ?? null,
        wrong: runs.find((r) => r.wrong)?.wrong ?? null,
        problems: [...new Set(runs.flatMap((r) => r.problems))].slice(0, 5),
        firstTableMs: runs.map((r) => r.render?.ms ?? null),
        loadMax: Math.max(...runs.map((r) => r.load)),
        median: Object.fromEntries([...paths].map((p) => [p, pick(p)]))
    };
}

const fmt = (ms) => (ms === null || ms === undefined ? "-" : ms >= 10_000 ? `${(ms / 1000).toFixed(0)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

await build();
const { server, url } = await serve();
const report = {
    date: new Date().toISOString().slice(0, 10),
    machine: { cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length, memoryGB: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${release()}`, arch: arch(), node: process.version },
    runs: RUNS,
    browsers: {},
    results: {}
};
try {
    for (const engine of BROWSERS) {
        const browser = await ENGINES[engine].launch();
        report.browsers[engine] = browser.version();
        console.log(`\n${engine} ${browser.version()}`);
        report.results[engine] = {};
        for (const name of viewNames) {
            report.results[engine][name] = {};
            let stopped = null;
            for (const n of SIZES) {
                if (stopped) {
                    report.results[engine][name][n] = { skipped: `not run: ${stopped}` };
                    continue;
                }
                const runs = [];
                for (let i = 0; i < RUNS; i++) {
                    const r = await run(browser, engine, url, name, n);
                    runs.push(r);
                    // a failure is not repeated: the next runs would fail the same way, slowly
                    if (r.failed || r.render?.error) break;
                }
                const s = summarize(runs);
                report.results[engine][name][n] = s;
                const m = s.median;
                const note = s.failed ? `FAILED: ${s.failed}` : s.limit ? `LIMIT: ${s.limit}` : "";
                console.log(
                    `  ${name}, ${n.toLocaleString("en-US")} rows: first table ${fmt(m["render.ms"])} (encode ${fmt(m["render.measures.encode"])}, computePivot ${fmt(m["render.measures.computePivot"])}, toGrid ${fmt(m["render.measures.toGrid"])}), longest frame gap ${fmt(m["render.maxFrameGapMs"])}` +
                        (m["render.longTasks.count"] !== undefined ? `, long tasks ${m["render.longTasks.count"]} (longest ${fmt(m["render.longTasks.longestMs"])})` : "") +
                        (m["heap.reportMB"] !== undefined ? `, heap data ${Math.round(m["heap.dataMB"])} MB + report ${Math.round(m["heap.reportMB"])} MB` : "") +
                        `, load ${s.loadMax.toFixed(1)}` +
                        (s.ok < s.runs ? ` [${s.ok}/${s.runs} ok]` : "") +
                        (note ? ` ${note}` : "") +
                        (s.wrong ? ` WRONG: ${s.wrong}` : "") +
                        (s.problems.length ? ` console: ${s.problems.join(" | ")}` : "")
                );
                for (const k of ["open a filter's values", "take a value out of a filter", "add a field", "export XLSX", "switch to the chart"]) {
                    if (m[`steps.${k}.ms`] !== undefined) console.log(`      ${k}: ${fmt(m[`steps.${k}.ms`])}, longest frame gap ${fmt(m[`steps.${k}.maxFrameGapMs`])}`);
                }
                if (s.failed || s.limit) stopped = `${n.toLocaleString("en-US")} rows failed`;
            }
        }
        await browser.close();
    }
} finally {
    server.close();
}
if (args.json) await writeFile(args.json, `${JSON.stringify(report, null, 2)}\n`);
