// The chart as SVG, checked by its structure (its text nodes and marks), not byte for byte: what it
// draws must be what the screen's chart draws (pivotkit-core's chartPlan and the report's marks).
import { test } from "node:test";
import assert from "node:assert/strict";
import { drawnTiles } from "pivotkit-core/chart";
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

test("reference lines (#48): an SVG and the HTML report draw them with their labels, the target in --pk-chart-reference", async () => {
    // North 10, South 12, West 4, (blank) 6 units: average 8, a target of 15 above every bar
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", referenceLines: { average: true, trend: true, target: 15 } } };
    const r = await render(view, SALES, { format: "svg", echarts, ...FIXED });
    // the words of a label follow the sample of its line's dash, a text of its own
    const texts = svgTexts(r.text).map((t) => t.trim());
    assert.ok(texts.includes("Average 8"), texts.join(" | "));
    assert.ok(texts.includes("Target 15"), texts.join(" | "));
    // regions have no order of their own: no trend
    assert.ok(!texts.includes("Trend"));
    // the target in the light --pk-chart-reference (--pk-muted), a host's own colour when it gives one
    assert.ok(r.text.includes('stroke="#5a6270"'), "the reference colour");
    const own = await render(view, SALES, { format: "svg", echarts, tokens: { "--pk-chart-reference": "#b42318" }, ...FIXED });
    assert.ok(own.text.includes('stroke="#b42318"'));
    // the HTML report's chart, its SVG written inline
    const html = await render({ ...view, display: "chart" }, SALES, { format: "html", chart: true, chartEmbed: "inline", echarts, ...FIXED });
    assert.ok(svgTexts(html.text).map((t) => t.trim()).includes("Target 15"));
});

test("reference lines (#48): the SVG draws a trend over real time on the data's own points", async () => {
    // 10 a month, with 7 months left out after February: January 10, February 20, October 100
    const rows = [["2026-01-15", 10], ["2026-02-15", 20], ["2026-10-15", 100]].map(([Date, Revenue]) => ({ Date, Revenue }));
    const view = { derived: [{ name: "Month", field: "Date", by: "yearMonth" }], rows: ["Month"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "line", referenceLines: { average: false, trend: true, target: null } } };
    const r = await render(view, rows, { format: "svg", echarts, ...FIXED });
    const points = (d) => [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    // the trend: dotted parts from category to category
    const trend = [...r.text.matchAll(/<path d="([^"]+)"[^>]*stroke-dasharray/g)].map((m) => points(m[1]));
    assert.equal(trend.length, 2);
    assert.deepEqual(trend[0][1], trend[1][0], "the parts join");
    // the line of the data, a straight line in time: the trend passes through each of its points
    const line = [...r.text.matchAll(/<path d="(M[^"]+)"[^>]*stroke-width="2"/g)].map((m) => points(m[1])).find((p) => p.length === 3);
    assert.ok(line, "the data's line");
    const ends = [trend[0][0], trend[0][1], trend[1][1]];
    ends.forEach((p, i) => {
        assert.ok(Math.abs(p[0] - line[i][0]) < 1 && Math.abs(p[1] - line[i][1]) < 1, `point ${i}: ${p} vs ${line[i]}`);
    });
});

test("reference lines (#48): the SVG puts each label at its line, after a sample of its dash in its colour", async () => {
    // North 10, South 12, West 4, (blank) 6: an average of 8 and a target of 8.5, close together
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", referenceLines: { average: true, trend: false, target: 8.5 } } };
    const r = await render(view, SALES, { format: "svg", echarts, ...FIXED });
    const lineY = (stroke) => Number(new RegExp(`<path d="M[\\d.]+ ([\\d.]+)L[\\d.]+ \\1"[^>]*stroke="${stroke}"`).exec(r.text)?.[1]);
    const labelY = (words) => Number(new RegExp(`translate\\([\\d.]+ ([\\d.]+)\\)"[^>]*>\\s*${words}<`).exec(r.text)?.[1]);
    const average = { line: lineY("#2a78d6"), label: labelY("Average 8") };
    const target = { line: lineY("#5a6270"), label: labelY("Target 8.5") };
    assert.ok(Number.isFinite(average.line) && Number.isFinite(target.line), r.text.slice(0, 200));
    assert.ok(Math.abs(target.label - target.line) < 1, JSON.stringify(target));
    // the average is close below the target: its label a line of text lower than the target's, near its own line
    assert.ok(average.label - target.label >= 18 && Math.abs(average.label - average.line) < 6, JSON.stringify({ average, target }));
    // the samples: the average's dash in its series' colour, the target's in the reference colour
    assert.match(r.text, /fill="#2a78d6"[^>]*>– –</);
    assert.match(r.text, /fill="#5a6270"[^>]*>——</);
});

test("high and low points (#574): the SVG and the HTML report draw a dot and a label at each, the glyph in the text colour (#913)", async () => {
    // North 10, South 12, West 4, (blank) 6 units: the highest at South, the lowest at West
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", referenceLines: { average: false, trend: false, target: null, extremes: true } } };
    const r = await render(view, SALES, { format: "svg", echarts, ...FIXED });
    const texts = svgTexts(r.text).map((t) => t.trim());
    assert.ok(texts.includes("▲") && texts.includes("12"), texts.join(" | "));
    assert.ok(texts.includes("▼") && texts.includes("4"), texts.join(" | "));
    // the glyph and the value in the text colour (light --pk-muted), not the series' (#913)
    assert.match(r.text, /fill="#5a6270"[^>]*>▲</);
    assert.match(r.text, /fill="#5a6270"[^>]*> 12</);
    // the label is placed after a second draw, as on the screen: it stays above the plot's top edge
    const html = await render({ ...view, display: "chart" }, SALES, { format: "html", chart: true, chartEmbed: "inline", echarts, ...FIXED });
    assert.ok(svgTexts(html.text).map((t) => t.trim()).includes("▲"));
    // off: no glyph
    const off = await render({ ...view, chart: { type: "bar" } }, SALES, { format: "svg", echarts, ...FIXED });
    assert.ok(!svgTexts(off.text).some((t) => t.includes("▲")));
});

test("a donut of many slices without a legend: the SVG and the HTML report merge the smallest into 'Other (n)' as the screen does (#544)", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ Country: `Country ${String.fromCharCode(65 + i)}`, Population: (20 - i) * 100 }));
    const view = { rows: ["Country"], values: [{ field: "Population", agg: "sum" }], chart: { type: "donut", legend: "off" } };
    const narrow = await render(view, rows, { format: "svg", echarts, size: { width: 358, height: 319 }, ...FIXED });
    const texts = svgTexts(narrow.text).map((t) => t.trim());
    assert.ok(texts.some((t) => /^Other \(\d+\)$/.test(t)), texts.join(" | "));
    // the slice in --pk-chart-other (the light --pk-muted)
    assert.ok(narrow.text.includes('fill="#5a6270"'), "the other slice's colour");
    // German words in a German report
    const de = await render({ ...view, formatting: { locale: "de-DE" } }, rows, { format: "svg", echarts, size: { width: 358, height: 319 }, ...FIXED });
    assert.ok(svgTexts(de.text).some((t) => /^Andere \(\d+\)$/.test(t.trim())), svgTexts(de.text).join(" | "));
    // wide: every slice has room for its label, nothing merged
    const wide = await render(view, rows.slice(0, 6), { format: "svg", echarts, ...FIXED });
    assert.ok(!svgTexts(wide.text).some((t) => /^Other/.test(t.trim())));
});

test("a combo and a treemap reach the SVG (#518)", async () => {
    // the combo: Units as bars, Price as a line on its own axis, each axis named after its value
    const combo = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }, { field: "Price", agg: "average" }], chart: { type: "combo" } };
    const c = await render(combo, SALES, { format: "svg", echarts, ...FIXED });
    const texts = svgTexts(c.text).map((t) => t.trim());
    assert.ok(texts.some((t) => t.includes("Sum of Units")) && texts.some((t) => t.includes("Average of Price")), texts.join(" | "));
    assert.ok(/<path d="M[^"]*"[^>]*stroke-width="2"/.test(c.text), "the line");
    // the treemap: a tile per region, named on it
    const treemap = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "treemap" } };
    const t = await render(treemap, SALES, { format: "svg", echarts, ...FIXED });
    const tiles = svgTexts(t.text).map((x) => x.trim());
    for (const region of ["North", "South", "West"]) {
        assert.ok(tiles.includes(region), `${region}: ${tiles.join(" | ")}`);
    }
    // each label at its tile's top left (#984): its name in bold, its value below it, both white, the
    // padding (8 px) from the tile's left edge
    const lines = [...t.text.matchAll(/<text [^>]*x="([-\d.e]+)" y="([-\d.e]+)" transform="translate\(([^)]+)\)" fill="([^"]+)"[^>]*font-weight="(\d+)">([^<]*)<\/text>/g)].map(([, x, y, at, fill, weight, text]) => ({ x: Number(x), y: Number(y), at, fill, weight, text }));
    for (const region of ["North", "South", "West"]) {
        const name = lines.find((l) => l.text === region);
        const value = lines.find((l) => l !== name && l.at === name?.at);
        assert.ok(name && value && name.x === 8 && value.x === 8 && name.y < value.y && name.y < 30, `${region}: ${JSON.stringify([name, value])}`);
        assert.deepEqual([name.fill, name.weight, value.fill, value.weight], ["#ffffff", "600", "#ffffff", "400"]);
    }
    // a host's colour in a name, too light for white, drawn darker; the text still white on it
    const gold = await render(treemap, SALES, { format: "svg", echarts, ...FIXED, colorMap: { North: "gold" } });
    assert.ok(!/fill="(?:gold|#ffd700)"/i.test(gold.text), "gold darkened");
    assert.ok(gold.text.includes('fill="#877200"'), "gold mixed with black to 4.6:1");
});

test("100 % stacked bars and hidden series reach the SVG (#36)", async () => {
    const view = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] };
    const stacked = await render({ ...view, chart: { type: "bar", stacked: true, stackPercent: true, zoom: "on" } }, SALES, { format: "svg", echarts, ...FIXED });
    const texts = svgTexts(stacked.text);
    // the value axis runs from 0 % to 100 %
    assert.ok(texts.includes("100%") && texts.includes("0%"), texts.join(" | "));
    const plain = await render({ ...view, chart: { type: "bar", stacked: true } }, SALES, { format: "svg", echarts, ...FIXED });
    assert.ok(!svgTexts(plain.text).includes("100%"));
    // B hidden: its bars are not drawn, the legend shows it greyed out
    const all = await render({ ...view, chart: { type: "bar" } }, SALES, { format: "svg", echarts, ...FIXED });
    const hidden = await render({ ...view, chart: { type: "bar", hidden: ["B"] } }, SALES, { format: "svg", echarts, ...FIXED });
    assert.ok(tags(hidden.text, "path") < tags(all.text, "path"));
    assert.ok(svgTexts(hidden.text).includes("B"));
});

test("a 100 % stack's value labels write each part's share in the SVG and the HTML report; a negative part below zero, a zero-sum category left out", async () => {
    const view = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", stacked: true, stackPercent: true, valueLabels: "value" } };
    // North: A 8 of 10, B 2 of 10
    const svg = await render(view, SALES, { format: "svg", echarts, ...FIXED });
    const texts = svgTexts(svg.text);
    assert.ok(texts.includes("80.0%") && texts.includes("20.0%"), texts.join(" | "));
    const html = await render({ ...view, display: "chart" }, SALES, { format: "html", echarts, chartEmbed: "inline", ...FIXED });
    assert.ok(html.text.includes(">80.0%<") && html.text.includes(">100%<"));
    // a part below zero takes its share below the axis; a category adding up to nothing has no bar
    const rows = [
        { Region: "North", Product: "A", Units: 30 },
        { Region: "North", Product: "B", Units: -10 },
        { Region: "South", Product: "A", Units: 0 },
        { Region: "South", Product: "B", Units: 0 }
    ];
    const signed = svgTexts((await render(view, rows, { format: "svg", echarts, ...FIXED })).text);
    assert.ok(signed.includes("75.0%") && signed.includes("-25.0%") && signed.includes("-100%"), signed.join(" | "));
    assert.ok(!signed.includes("0.0%"));
});

test("fixed colours per name reach the SVG: the view's over the host's colorMap (#54)", async () => {
    const view = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] };
    const r = await render({ ...view, chart: { type: "bar", colors: [{ name: "B", color: "#123456" }] } }, SALES, { format: "svg", echarts, colorMap: { a: "#abcdef", B: "#ff0000" }, ...FIXED });
    assert.ok(r.text.includes('fill="#123456"') && r.text.includes('fill="#abcdef"'));
    assert.ok(!r.text.includes('fill="#ff0000"'));
    const pie = await render({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "pie" } }, SALES, { format: "svg", echarts, colorMap: { South: "#00ff00" }, ...FIXED });
    assert.ok(pie.text.includes('fill="#00ff00"'));
    await assert.rejects(render(view, SALES, { format: "svg", echarts, colorMap: ["#fff"], ...FIXED }), /colorMap/);
});

test("colorMap takes a pair of colours for light and dark, as the React prop does; the report draws the light one (#54 review)", async () => {
    const view = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" } };
    const r = await render(view, SALES, { format: "svg", echarts, colorMap: { A: ["#0a0b0c", "#f0f0f0"] }, ...FIXED });
    assert.ok(r.text.includes('fill="#0a0b0c"') && !r.text.includes('fill="#f0f0f0"'));
});

test("drawnTiles against ECharts itself: a flat treemap's tiles by item; in a tree with children no tile is taken for another item's", () => {
    const draw = (/** @type {object[]} */ data) => {
        const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 600, height: 400 });
        chart.setOption({ animation: false, series: [{ type: "treemap", data, breadcrumb: { show: false } }] });
        return chart;
    };
    const flat = draw([{ name: "a", value: 30 }, { name: "b", value: 10 }]);
    try {
        const tileOf = /** @type {(i: number, name: string) => { width: number, height: number } | null} */ (drawnTiles(flat));
        const [a, b] = [tileOf(0, "a"), tileOf(1, "b")];
        assert.ok(a && b, "both tiles found");
        // the tiles share the chart in the values' proportion: 3 to 1
        assert.ok(Math.abs((a.width * a.height) / (b.width * b.height) - 3) < 0.01, `${a.width}x${a.height} ${b.width}x${b.height}`);
        assert.equal(tileOf(0, "b"), null);
        assert.equal(tileOf(2, "c"), null);
    } finally {
        flat.dispose();
    }
    // ECharts lists a tree depth first: an item after one with children is not at its index + 1
    const nested = draw([{ name: "a", value: 30 }, { name: "b", children: [{ name: "b1", value: 5 }, { name: "b2", value: 5 }] }, { name: "c", value: 10 }]);
    try {
        const tileOf = /** @type {(i: number, name: string) => unknown} */ (drawnTiles(nested));
        assert.ok(tileOf(0, "a"));
        assert.ok(tileOf(1, "b"));
        assert.equal(tileOf(2, "c"), null, "b1 sits where c would");
    } finally {
        nested.dispose();
    }
    const bar = echarts.init(null, null, { renderer: "svg", ssr: true, width: 600, height: 400 });
    bar.setOption({ xAxis: { data: ["a"] }, yAxis: {}, series: [{ type: "bar", data: [1] }] });
    assert.equal(drawnTiles(bar), undefined);
    bar.dispose();
});
