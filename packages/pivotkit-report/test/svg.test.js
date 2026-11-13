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

/** The font size (px) of each text of an SVG with the text, as the reader sees it. */
const textSizes = (svg) => [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].map((m) => ({ text: m[2], size: Number(/font-size="(\d*\.?\d+)px"/.exec(m[1])?.[1]) }));

/** Views that write every kind of chart text: axes, group labels, value labels, a legend, slices, cells and a colour scale. */
const TEXT_VIEWS = {
    bars: { rows: ["Region", "Product"], cols: ["Q"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", valueLabels: "value", groupLabels: "on", title: "Units" } },
    horizontal: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", horizontal: true, legend: "bottom", valueLabels: "value" } },
    lines: { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "line", legend: "right" } },
    pie: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "pie" } },
    donut: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "donut", labelPosition: "inside" } },
    heatmap: { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "heatmap" } }
};

// #221: ECharts writes 12 px unless told otherwise, below the 14 px minimum and no token
test("every text of a chart is at least 14 px, and a host's --pk-chart-text-size reaches every one but the title", async () => {
    for (const [name, view] of Object.entries(TEXT_VIEWS)) {
        const plain = textSizes((await render(view, SALES, { format: "svg", echarts, size: { width: 640, height: 400 }, ...FIXED })).text);
        assert.ok(plain.length > 3, `${name}: texts drawn`);
        assert.deepEqual(plain.filter((t) => !(t.size >= 14)), [], `${name}: text below 14 px`);
        const host = textSizes((await render(view, SALES, { format: "svg", echarts, size: { width: 640, height: 400 }, tokens: { "--pk-chart-text-size": "18px" }, ...FIXED })).text);
        assert.deepEqual(host.filter((t) => t.text !== "Units" && t.size !== 18), [], `${name}: the host's size`);
    }
});
