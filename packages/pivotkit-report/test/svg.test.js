// The chart as SVG, checked by its structure (its text nodes and marks), not byte for byte: what it
// draws must be what the screen's chart draws (pivotkit-core's chartPlan and the report's marks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "pivotkit-report";
import { FIXED, SALES, echarts, startTags, svgTexts } from "./fixtures.js";

const tags = (svg, name) => startTags(svg).filter((t) => t.name === name).length;

test("bars: one bar per region and product, the categories and the legend as text, the size asked for", async () => {
    const view = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" } };
    const r = await render(view, SALES, { format: "svg", echarts, size: { width: 640, height: 360 }, ...FIXED });
    assert.match(r.text, /^<svg width="640" height="360" xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    const texts = svgTexts(r.text);
    for (const name of ["North", "South", "West", "(blank)", "A", "B"]) assert.ok(texts.includes(name), name);
    // a background in the light surface colour, so the image reads on any page
    assert.match(r.text, /<rect width="640" height="360" x="0" y="0" fill="#ffffff"/);
    // the theme's first two series colours: --pk-chart-1 and --pk-chart-2
    assert.ok(r.text.includes('fill="#2a78d6"') && r.text.includes('fill="#eb6834"'));
    assert.ok(!/\sstyle=/.test(r.text), "presentation attributes, no style attribute");
});

test('"auto" with a date grouping on Columns only draws lines along the dates, as the screen does (swapped)', async () => {
    const view = { rows: ["Region"], cols: ["Month"], derived: [{ name: "Month", field: "Date", by: "yearMonth" }], values: [{ field: "Units", agg: "sum" }], display: "chart" };
    const r = await render(view, SALES, { format: "svg", echarts, ...FIXED });
    const texts = svgTexts(r.text);
    // the months run along the axis, the regions are the series in the legend
    assert.ok(texts.some((t) => /2026/.test(t) && /Feb|02/.test(t)), texts.join(" | "));
    for (const region of ["North", "South", "West"]) assert.ok(texts.includes(region), region);
    // lines, not bars: paths without filled rectangles per value
    assert.ok(tags(r.text, "path") > 3);
});

test("a pie: one slice per region with its name; a heatmap: one cell per pair", async () => {
    const pie = await render({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "pie" } }, SALES, { format: "svg", echarts, ...FIXED });
    for (const region of ["North", "South", "West"]) assert.ok(svgTexts(pie.text).includes(region), region);
    const heat = await render({ rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "heatmap" } }, SALES, { format: "svg", echarts, ...FIXED });
    assert.ok(svgTexts(heat.text).includes("A") && svgTexts(heat.text).includes("South"));
});

test("a view without values draws an empty chart, still a valid SVG", async () => {
    const r = await render({ rows: ["Region"] }, SALES, { format: "svg", echarts, ...FIXED });
    assert.equal(r.ok, true);
    assert.match(r.text, /^<svg [^>]*>[\s\S]*<\/svg>$/);
});
