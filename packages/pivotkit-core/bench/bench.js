/*
 * Engine timings for made-up sales data of 2,000, 4,000 and 100,000 rows.
 *
 *   npm run bench -w pivotkit-core            all sizes
 *   node bench/bench.js 100000                one size
 *
 * Each step runs once to warm up, then the median of several runs is printed in milliseconds.
 */

import { computePivot, encode, toEChartsOption, toGrid } from "../src/index.js";
import { toCsv, toXlsx } from "../src/export.js";

// a small deterministic generator (mulberry32), so every run sees the same data
function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pad = (n) => String(n).padStart(2, "0");

export function makeRows(n, seed = 42) {
    const rnd = random(seed);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const regions = ["North", "South", "East", "West", "Central", "Islands", "Overseas", "Online"];
    const countries = Array.from({ length: 40 }, (_, i) => `Country ${i + 1}`);
    const categories = Array.from({ length: 12 }, (_, i) => `Category ${String.fromCharCode(65 + i)}`);
    const products = Array.from({ length: 200 }, (_, i) => `Product ${i + 1}`);
    const reps = Array.from({ length: 300 }, (_, i) => `Rep ${i + 1}`);
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        const day = Math.floor(rnd() * 3 * 365);
        const d = new Date(Date.UTC(2024, 0, 1) + day * 86400000);
        rows[i] = {
            Region: pick(regions),
            Country: pick(countries),
            Category: pick(categories),
            Product: pick(products),
            Rep: pick(reps),
            OrderDate: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(Math.floor(rnd() * 24))}:${pad(Math.floor(rnd() * 60))}:00`,
            Units: 1 + Math.floor(rnd() * 50),
            Price: Math.round(rnd() * 50000) / 100,
            Discount: rnd() < 0.2 ? null : Math.round(rnd() * 30) / 100
        };
    }
    return rows;
}

const VIEWS = {
    "2 rows x 1 col, sum + average": {
        rows: ["Region", "Country"],
        cols: ["Category"],
        values: [{ field: "Units", agg: "sum" }, { field: "Price", agg: "average", format: "currency:EUR" }]
    },
    "median + countUnique + stdev": {
        rows: ["Region"],
        cols: ["Category"],
        values: [{ field: "Price", agg: "median" }, { field: "Rep", agg: "countUnique" }, { field: "Units", agg: "stdev" }]
    },
    "year-month columns, % of row": {
        derived: [{ name: "Month", field: "OrderDate", by: "yearMonth" }],
        rows: ["Region"],
        cols: ["Month"],
        values: [{ field: "Units", agg: "sum", showAs: "percentOfRowTotal" }]
    },
    "3 row levels (8x40x200), top 10 products": {
        rows: ["Region", "Country", "Product"],
        values: [{ field: "Units", agg: "sum" }],
        filters: [{ field: "Product", type: "top", count: 10 }],
        sort: [{ field: "Product", by: "value", order: "desc" }]
    }
};

function median(list) {
    const s = [...list].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

function time(fn, runs) {
    fn();
    const times = [];
    let out;
    for (let i = 0; i < runs; i++) {
        const t0 = performance.now();
        out = fn();
        times.push(performance.now() - t0);
    }
    return { ms: median(times), out };
}

const fmt = (ms) => ms.toFixed(1).padStart(8);

function bench(n) {
    const runs = n >= 50_000 ? 5 : 15;
    const rows = makeRows(n);
    console.log(`\n${n.toLocaleString("en-US")} rows (median of ${runs} runs, ms)`);
    const enc = time(() => encode(rows), runs);
    console.log(`${fmt(enc.ms)}  encode`);
    const data = enc.out;
    for (const [name, view] of Object.entries(VIEWS)) {
        const p = time(() => computePivot(data, view, { locale: "en-US" }), runs);
        const g = time(() => toGrid(p.out, { locale: "en-US" }), runs);
        const cells = g.out.rows.length * g.out.columnCount;
        console.log(`${fmt(p.ms)}  computePivot  ${name}`);
        console.log(`${fmt(g.ms)}  toGrid        ${g.out.rows.length} x ${g.out.columnCount} = ${cells.toLocaleString("en-US")} cells`);
    }
    const first = computePivot(data, VIEWS["2 rows x 1 col, sum + average"], { locale: "en-US" });
    const grid = toGrid(first, { locale: "en-US" });
    const x = time(() => toXlsx(grid), runs);
    console.log(`${fmt(x.ms)}  toXlsx        ${(x.out.length / 1024).toFixed(0)} KB`);
    const c = time(() => toCsv(grid), runs);
    console.log(`${fmt(c.ms)}  toCsv`);
    const e = time(() => toEChartsOption(computePivot(data, { rows: ["Region"], cols: ["Category"], values: [{ field: "Units", agg: "sum" }] })), runs);
    console.log(`${fmt(e.ms)}  computePivot + toEChartsOption (8 x 12 bar)`);
}

const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0);
console.log(`Node ${process.version}, ${process.platform}/${process.arch}`);
for (const n of sizes.length ? sizes : [2_000, 4_000, 100_000]) {
    bench(n);
}
