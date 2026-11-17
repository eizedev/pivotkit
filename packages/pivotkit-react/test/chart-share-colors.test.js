// The share of the total in the chart's tooltip, the host's colorMap per theme and the chart image on
// the clipboard (#54).
import { test } from "node:test";
import assert from "node:assert/strict";
import { tooltipContent } from "../src/chart-tooltip.js";
import { colorMapFor } from "../src/chart-colors.js";
import { copyImage } from "../src/files.js";

const fmt = (v) => String(v);
const share = (v) => `${v.toFixed(1)}%`;
/** ECharts' parameters of an axis tooltip at North: Hardware 20, Services 10, Software 30. */
const NORTH = [20, 10, 30].map((value, seriesIndex) => ({ seriesIndex, dataIndex: 0, seriesName: ["Hardware", "Services", "Software"][seriesIndex], name: "North", axisValueLabel: "North", value, color: "#123456" }));
const additive = [0, 1, 2].map(() => ({ type: "bar", additive: true }));

test("the share in the tooltip: of the category's total across series, of the series' total with one series, of the pie (#54)", () => {
    const options = { valueFormatter: fmt, shareFormatter: share, share: true, series: additive };
    // the element under the pointer: its share of the category's 60
    const one = tooltipContent(NORTH, { ...options, hover: { seriesIndex: 2, dataIndex: 0 } });
    assert.deepEqual(one.lines, [{ color: "#123456", name: "Software", value: "30", share: "50.0%" }]);
    // every series: each one's share
    const all = tooltipContent(NORTH, { ...options, mode: "axis" });
    assert.deepEqual(all.lines.map((l) => l.share), ["33.3%", "16.7%", "50.0%"]);
    // one series: its share of the series' total over the categories (seriesTotals)
    const single = tooltipContent([NORTH[0]], { ...options, series: [additive[0]], seriesTotals: [80] });
    assert.equal(single.lines[0].share, "25.0%");
    // a pie: ECharts' own percent of the slices shown
    const pie = tooltipContent({ seriesType: "pie", seriesName: "Sum of Revenue", name: "North", value: 60, percent: 37.5, color: "#abc" }, options);
    assert.equal(pie.lines[0].share, "37.5%");
    // no share: the setting off, a value that does not add up, a part below zero, a heatmap
    assert.equal(tooltipContent(NORTH, { ...options, share: false, mode: "axis" }).lines[0].share, undefined);
    assert.equal(tooltipContent(NORTH, { ...options, mode: "axis", series: additive.map((s) => ({ ...s, additive: false })) }).lines[0].share, undefined);
    assert.equal(tooltipContent([NORTH[0], { ...NORTH[1], value: -10 }], { ...options, mode: "axis" }).lines[0].share, undefined);
    assert.equal(tooltipContent({ seriesType: "heatmap", seriesName: "x", value: [0, 0, 5] }, { ...options, xNames: ["a"], yNames: ["b"] }).lines[0].share, undefined);
});

test("the host's colorMap: one colour, or one for light and one for dark; anything else is left out", () => {
    const map = { Failed: "#e3000f", Success: ["#287233", "#4caf50"], Odd: 3, Three: ["#111", "#222", "#333"] };
    assert.deepEqual(colorMapFor(map, "light"), { Failed: "#e3000f", Success: "#287233" });
    assert.deepEqual(colorMapFor(map, "dark"), { Failed: "#e3000f", Success: "#4caf50" });
    assert.equal(colorMapFor(null, "light"), undefined);
    assert.equal(colorMapFor(["#fff"], "light"), undefined);
    // a name like a prototype's is a name like any other
    assert.deepEqual(colorMapFor(JSON.parse('{"__proto__":"#abc"}'), "light"), JSON.parse('{"__proto__":"#abc"}'));
});

test("the chart image on the clipboard: a PNG item; false without the clipboard or when it is refused", async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const written = [];
    class Item {
        constructor(parts) {
            this.parts = parts;
        }
    }
    const clipboard = { write: async (items) => written.push(...items) };
    assert.equal(await copyImage(blob, { clipboard, ClipboardItem: Item }), true);
    assert.deepEqual(Object.keys(written[0].parts), ["image/png"]);
    assert.equal(await copyImage(blob, { clipboard: undefined, ClipboardItem: Item }), false);
    assert.equal(await copyImage(blob, { clipboard, ClipboardItem: undefined }), false);
    assert.equal(await copyImage(blob, { clipboard: { write: async () => { throw new Error("NotAllowedError"); } }, ClipboardItem: Item }), false);
});

test("the share's basis follows the chart's series: several share the category's total, and one part left has none (#54 review)", () => {
    const options = { valueFormatter: fmt, shareFormatter: share, share: true, series: additive, seriesTotals: [80, 40, 100], mode: "axis" };
    // a null in Services: Hardware and Software share their 50
    const withNull = tooltipContent([NORTH[0], { ...NORTH[1], value: null }, NORTH[2]], options);
    assert.deepEqual(withNull.lines.map((l) => l.share), ["40.0%", "60.0%"]);
    // only Hardware has a value at the category: no share, not its share of the series' 80
    const one = tooltipContent([NORTH[0], { ...NORTH[1], value: null }, { ...NORTH[2], value: null }], options);
    assert.deepEqual(one.lines.map((l) => l.share), [undefined]);
    // two series hidden in the legend: ECharts hands the one left; still no share
    const hidden = tooltipContent([NORTH[0]], options);
    assert.equal(hidden.lines[0].share, undefined);
    // a chart of one series: its own total
    assert.equal(tooltipContent([NORTH[0]], { ...options, series: [additive[0]], seriesTotals: [80] }).lines[0].share, "25.0%");
});
