// Read time and memory of pivotkit-xlsx on a generated ticket export of 94,000 rows x 20 columns,
// once plain and once with Excel's used range reaching row 900,000 (all 20 columns formatted), next to
// read-excel-file alone on the same file. Timings for the log and the pull request: machines differ.
//
//   npm run bench -w pivotkit-xlsx                 # Node
//   npm run bench -w pivotkit-xlsx -- --browser    # also Chromium (Playwright), the bundle of dist/
import { readFile as readBytes } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeXlsx, ticketRows } from "./make-xlsx.js";

const ROWS = 94_000;
const here = fileURLToPath(new URL(".", import.meta.url));

/** Runs one read in a fresh Node process and returns its numbers (time, peak RSS growth, rows). */
function measureInNode(file, how) {
    const script = `
        const { readFileSync } = await import("node:fs");
        const bytes = readFileSync(${JSON.stringify(file)});
        const rss0 = process.memoryUsage().rss;
        let peak = rss0;
        const sample = () => { peak = Math.max(peak, process.memoryUsage().rss); };
        const timer = setInterval(sample, 5);
        const t0 = performance.now();
        let rows;
        if (${JSON.stringify(how)} === "pivotkit-xlsx") {
            const { read } = await import("pivotkit-xlsx/reader");
            rows = (await read(new Uint8Array(bytes), { name: "tickets.xlsx", onProgress: sample })).rowCount;
        } else {
            // its Node entry: the universal one starts fflate's worker_threads, which fail on Node 26
            const { readSheet } = await import("read-excel-file/node");
            rows = (await readSheet(bytes)).length;
        }
        const ms = performance.now() - t0;
        clearInterval(timer);
        sample();
        console.log(JSON.stringify({ ms: Math.round(ms), peakMB: Math.round((peak - rss0) / 1e6), rows }));
    `;
    const out = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: here, encoding: "utf8" });
    if (out.status !== 0) return { error: (out.stderr || out.stdout).trim().split("\n").slice(-3).join(" ") };
    return JSON.parse(out.stdout.trim().split("\n").at(-1));
}

async function measureInChromium(file) {
    const { chromium } = await import("@playwright/test");
    const dist = join(here, "../dist/");
    // precise numbers from performance.memory (Chromium only), sampled at every progress report
    const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
    const page = await browser.newPage();
    const types = { ".js": "text/javascript", ".html": "text/html" };
    // a strict Content-Security-Policy, as the web component's test page has: no blob: worker allowed
    const csp = "default-src 'none'; script-src 'self'; connect-src 'self'";
    await page.route("http://bench.test/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/") return route.fulfill({ body: "<!doctype html><title>bench</title>", contentType: "text/html", headers: { "content-security-policy": csp } });
        if (path === "/tickets.xlsx") return route.fulfill({ body: await readBytes(file), contentType: "application/octet-stream" });
        const name = path.replace(/^\/dist\//, "");
        return route.fulfill({ body: await readBytes(join(dist, name)), contentType: types[name.slice(name.lastIndexOf("."))] ?? "text/plain" });
    });
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("http://bench.test/");
    const result = await page.evaluate(async () => {
        const plugin = (await import("/dist/index.js")).default;
        const reader = await plugin.load();
        const bytes = await (await fetch("/tickets.xlsx")).arrayBuffer();
        const memory = () => /** @type {any} */ (performance).memory.usedJSHeapSize;
        const before = memory();
        let peak = before;
        const t0 = performance.now();
        const table = await reader.read(new File([bytes], "tickets.xlsx"), { onProgress: () => (peak = Math.max(peak, memory())) });
        peak = Math.max(peak, memory());
        return { ms: Math.round(performance.now() - t0), rows: table.rowCount, peakJsHeapMB: Math.round((peak - before) / 1e6) };
    });
    await browser.close();
    return { ...result, consoleErrors: errors.length };
}

const dir = mkdtempSync(join(tmpdir(), "pivotkit-xlsx-bench-"));
try {
    const files = {
        plain: join(dir, "tickets.xlsx"),
        "used range to row 900,000": join(dir, "tickets-used-range.xlsx")
    };
    writeFileSync(files.plain, makeXlsx({ sheets: [{ name: "Tickets", rows: () => ticketRows(ROWS) }] }));
    writeFileSync(files["used range to row 900,000"], makeXlsx({ sheets: [{ name: "Tickets", rows: () => ticketRows(ROWS), usedRangeTo: 900_000, emptyCells: 20 }] }));
    const browser = process.argv.includes("--browser");
    if (browser) spawnSync("node", ["build.js"], { cwd: join(here, ".."), stdio: "inherit" });
    for (const [label, file] of Object.entries(files)) {
        const size = (await readBytes(file)).length;
        console.log(`\n${label}: ${ROWS.toLocaleString("en-US")} rows x 20 columns, ${(size / 1e6).toFixed(1)} MB`);
        console.log("  Node, pivotkit-xlsx          ", JSON.stringify(measureInNode(file, "pivotkit-xlsx")));
        console.log("  Node, read-excel-file alone  ", JSON.stringify(measureInNode(file, "read-excel-file")));
        if (browser) console.log("  Chromium, pivotkit-xlsx (CSP)", JSON.stringify(await measureInChromium(file)));
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}
