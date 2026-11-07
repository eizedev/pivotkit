// The built package renders without a browser: a server render of <PivotReport> must not touch
// window or document, and its markup must hold the zones, the fields and the computed table.
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { PivotReport } from "pivotkit-react";
import { LABELS } from "pivotkit-react/labels";

const rows = [
    { Region: "North", Product: "A", Units: 3 },
    { Region: "South", Product: "B", Units: 7 },
    { Region: "North", Product: "B", Units: 2 }
];

function render(props) {
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.join(" "));
    try {
        return { html: renderToString(React.createElement(PivotReport, props)), errors };
    } finally {
        console.error = original;
    }
}

test("the package exports the component, and the labels from pivotkit-react/labels with every text", async () => {
    const mod = await import("pivotkit-react");
    assert.deepEqual(Object.keys(mod).sort(), ["PivotReport"]);
    assert.deepEqual(Object.keys(LABELS), ["en", "de"]);
    // the first load's texts and the menus' (loaded with the menus) in one object
    assert.deepEqual([LABELS.en.zones.rows, LABELS.en.cancel, LABELS.de.showAsNames.runningTotal], ["Rows", "Cancel", "Laufende Summe"]);
});

test("a report renders its zones, fields and table, with no React warning", () => {
    const { html, errors } = render({ data: rows, view: { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] }, theme: "dark" });
    assert.deepEqual(errors, []);
    assert.match(html, /data-pk-theme="dark"/);
    for (const zone of ["Rows", "Columns", "Values", "Filters"]) {
        assert.match(html, new RegExp(`aria-label="${zone}"`));
    }
    assert.match(html, /data-field="Units"/);
    assert.match(html, /Sum of Units/);
    // North: A 3, B 2, total 5; grand total 12
    assert.match(html, /<td[^>]*>5<\/td>/);
    assert.match(html, /<td[^>]*>12<\/td>/);
});

test("German labels and locale, and the empty state with its three steps", () => {
    const { html, errors } = render({ data: rows, locale: "de-DE" });
    assert.deepEqual(errors, []);
    assert.match(html, /Den Bericht in drei Schritten bauen/);
    assert.equal(html.match(/class="pk-step-n"/g).length, 3);
    assert.match(html, /aria-label="Zeilen"/);
});

test("a view that makes too many cells shows the limit message instead of throwing", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ A: `a${i}`, B: `b${i}`, V: i }));
    const { html } = render({ data: many, view: { rows: ["A"], cols: ["B"], values: [{ field: "V", agg: "sum" }] }, limits: { cells: 100 } });
    assert.match(html, /role="alert"/);
    assert.match(html, /more than the limit of 100/);
});

test("ECharts is a file of its own with named imports, loaded on the first chart only", async () => {
    const { readFile } = await import("node:fs/promises");
    const index = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
    const parts = await readFile(new URL("../dist/echarts.js", import.meta.url), "utf8");
    // no static import of echarts in the entry: a report without a chart does not load it
    assert.doesNotMatch(index, /^import[^;]*from\s*"echarts/m);
    assert.match(index, /import\("\.\/echarts\.js"\)/);
    // a namespace import (import("echarts/charts"), import * as) would keep every chart type in a bundle
    assert.doesNotMatch(parts, /import\s*\*|import\("echarts/);
    assert.match(parts, /import \{[^}]*\bBarChart\b[^}]*\} from "echarts\/charts"/);
    const mod = await import("../dist/echarts.js");
    assert.equal(typeof mod.init, "function");
});

test("the report is a named region, never a main landmark inside the host's page", () => {
    const { html } = render({ data: rows, view: { rows: ["Region"] } });
    assert.doesNotMatch(html, /<main[\s>]/);
    assert.match(html, /class="pk-root"[^>]*role="region"[^>]*aria-label="Pivot report"|role="region"[^>]*aria-label="Pivot report"[^>]*class="pk-root"/);
    const de = render({ data: rows, view: { rows: ["Region"] }, locale: "de-DE" }).html;
    assert.match(de, /aria-label="Pivot-Bericht"/);
});

test("a report takes its own region name; yes/no fields read Yes and No", () => {
    const { html } = render({ data: [{ Done: true, N: 1 }, { Done: false, N: 2 }], view: { rows: ["Done"], values: [{ field: "N", agg: "sum" }] }, label: "Tickets per team" });
    assert.match(html, /role="region"[^>]*aria-label="Tickets per team"/);
    assert.match(html, />Yes</);
    assert.match(html, />No</);
    const de = render({ data: [{ Done: true, N: 1 }], view: { rows: ["Done"], values: [{ field: "N", agg: "sum" }] }, locale: "de-DE" }).html;
    assert.match(de, />Ja</);
});

test("the built package names its own version as the generator of the view files it writes", async () => {
    const { readFile } = await import("node:fs/promises");
    const index = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.ok(index.includes(JSON.stringify(pkg.version)), "the version of package.json");
    assert.ok(!index.includes("__PIVOTKIT_REACT_VERSION__"), "build.js replaced the placeholder");
});

test("a server render offers Enlarge but no Full screen (known in the browser only), and hydration can match", () => {
    const html = renderToString(React.createElement(PivotReport, { data: [{ Region: "North", Units: 3 }], defaultView: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] } }));
    assert.match(html, /data-testid="enlarge"/);
    assert.doesNotMatch(html, /data-testid="full-screen"/);
});
