// The report's marks on the chart's option (chart-decorate.js): a donut on a phone, and the colours
// a canvas can draw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toEChartsOption } from "pivotkit-core";
import { BOTTOM_LEGEND_ROOM, pieLabelRoom } from "pivotkit-core/chart";
import { decorate, screenColor } from "../../src/chart-decorate.js";

test("a donut on a phone: a right legend moves to the bottom, numbers that do not fit the ring go outside", () => {
    const rows = ["Central", "East", "North", "South", "West"].map((R, i) => ({ R, V: [32, 11, 17, 18, 22][i] }));
    const r = computePivot(encode(rows), { rows: ["R"], values: [{ field: "V", agg: "sum" }], display: "chart", chart: { type: "donut", legend: "right", labelPosition: "inside" } });
    const option = toEChartsOption(r);
    const style = /** @type {any} */ ({ getPropertyValue: () => "" });
    // wide: the legend stays on the right, the numbers inside the ring
    const wide = decorate(option, style, 480, undefined, 1280);
    assert.equal(wide.legend.orient, "vertical");
    assert.equal(wide.series[0].label.position, "inside");
    assert.equal(wide.series[0].right, option.series[0].right);
    // 390 px: the legend at the bottom with its room, the pie given back the width the legend took
    const phone = decorate(option, style, 480, undefined, 358);
    assert.equal(phone.legend.orient, undefined);
    assert.equal(phone.legend.right, undefined);
    assert.equal(phone.legend.bottom, 0);
    assert.equal(phone.series[0].right, undefined);
    assert.equal(phone.series[0].bottom, BOTTOM_LEGEND_ROOM + pieLabelRoom(480));
    assert.equal(phone.series[0].label.position, "inside");
    // so low that the ring is too thin for the numbers: they are written outside, on a line, in the text colour
    const low = decorate(option, /** @type {any} */ ({ getPropertyValue: (n) => (n === "--pk-text" ? "#eee" : "") }), 150, undefined, 358);
    assert.equal(low.series[0].label.position, undefined);
    assert.equal(low.series[0].label.color, "#eee");
    assert.deepEqual(low.series[0].labelLine, { show: true });
    assert.equal(low.series[0].label.formatter, option.series[0].label.formatter);
    // a bar chart's plot gets the width back too
    const bars = toEChartsOption(computePivot(encode(rows.map((x) => ({ ...x, C: "a" }))), { rows: ["R"], cols: ["C"], values: [{ field: "V", agg: "sum" }], chart: { type: "bar", legend: "right" } }));
    const narrowBars = decorate(bars, style, 480, undefined, 358);
    assert.equal(narrowBars.grid.right, 24);
    assert.equal(narrowBars.grid.bottom, BOTTOM_LEGEND_ROOM + 8);
});

test("screenColor: a colour ECharts reads as it is, another as the canvas draws it, null for one the canvas does not take (#386)", () => {
    // a 2D context as a browser's: fillStyle keeps its colour when it is given one it does not take,
    // and a pixel is what the last fillStyle it took paints
    const DRAWN = { transparent: [0, 0, 0, 0], "oklch(0.96 0.02 250)": [232, 243, 255, 255], "rgb(178 34 34)": [178, 34, 34, 255] };
    const SHOWN = { transparent: "rgba(0, 0, 0, 0)", "oklch(0.96 0.02 250)": "oklch(0.96 0.02 250)", "rgb(178 34 34)": "#b22222" };
    let style = "#000000";
    const ctx = {
        get fillStyle() {
            return Object.hasOwn(SHOWN, style) ? SHOWN[style] : style;
        },
        set fillStyle(v) {
            if (Object.hasOwn(DRAWN, v)) style = v;
        },
        clearRect() {},
        fillRect() {},
        getImageData: () => ({ data: Uint8ClampedArray.from(DRAWN[style]) })
    };
    const doc = { createElement: () => ({ getContext: () => ctx }) };
    const hexOnly = (c) => /^#[\da-f]{6}$/i.test(c);
    const kept = globalThis.CSS;
    // CSS.supports takes all of these, light-dark() and an unresolved var() included
    globalThis.CSS = { supports: () => true };
    try {
        const read = screenColor(/** @type {any} */ (doc), hexOnly);
        assert.equal(read("#003366"), "#003366");
        assert.equal(read("oklch(0.96 0.02 250)"), "#e8f3ff");
        assert.equal(read("rgb(178 34 34)"), "#b22222");
        // the canvas does not take them: fillStyle stays the sentinel, never the colour drawn before
        assert.equal(read("light-dark(#fff, #000)"), null);
        assert.equal(read("var(--pk-missing)"), null);
    } finally {
        globalThis.CSS = kept;
    }
    // without CSS.supports (no browser) nothing is drawn
    assert.equal(screenColor(/** @type {any} */ (doc), hexOnly)("oklch(0.5 0.1 200)"), null);
});
