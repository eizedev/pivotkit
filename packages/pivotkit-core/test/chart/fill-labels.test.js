// Text on coloured fills (#913, #914, #984), in both themes: a treemap's labels in white on tiles
// darkened where they need it, a heatmap's
// numbers in the ink that reads on their cell, the labels of high and low points and reference lines in
// the text colour. Every label reaches 4.5:1 on what is under it (tests/fill-contrast.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartThemeFrom, computePivot, encode, toEChartsOption } from "pivotkit-core";
import { decorateOption, drawnTiles, labelColorOn } from "pivotkit-core/chart";
import { contrastOf, tileFill } from "../../src/chart-colors.js";
import { THEME_TOKENS, contrastOnFill, fillContrasts, unreadable } from "../../../../tests/fill-contrast.js";
import { MONTH, MONTHLY, REVENUE } from "./fixtures.js";

/** Eight regions, one tile each: every colour of the palette. */
const REGIONS = encode(["Central", "West", "North", "South", "East", "Alps", "Coast", "Islands"].map((Region, i) => ({ Region, Revenue: 4000 - i * 380 })));
/** A host's palette with a light grey and a near black next to the theme's colours. */
const HOST = { Central: "#d9d9d9", West: "#1f1f1f", North: "#9ecbff" };
const PALETTE = (/** @type {Readonly<Record<string, string>>} */ tokens) => Array.from({ length: 8 }, (_, i) => tokens[`--pk-chart-${i + 1}`]);

/** The option a report draws in a theme: the core's option and the report's marks, from the tokens. */
const drawn = (/** @type {any} */ r, /** @type {any} */ style, /** @type {object} */ options = {}, width = 800) => decorateOption(toEChartsOption(r, { theme: chartThemeFrom(style), ...options }), style, { width, height: 480 });

test("labelColorOn: the theme's ink that reads best; where neither reaches 4.5:1, black or white", () => {
    const dark = "#1a1d23";
    const light = "#ffffff";
    assert.equal(labelColorOn("#eda100", [dark, light]), dark, "dark text on yellow");
    assert.equal(labelColorOn("#6250d6", [dark, light]), light, "light text on violet");
    assert.equal(labelColorOn("rgb(237, 161, 0)", [dark, light]), dark);
    // a mid blue: dark text 3.8:1, white 4.4:1; black reaches 4.8:1
    assert.equal(labelColorOn("#2a78d6", [dark, light]), "#000000");
    // a colour it cannot read: the first token
    assert.equal(labelColorOn("oklch(0.5 0.1 200)", [dark, light]), dark);
    // every colour of both themes' palettes, and the host's, takes an ink that reaches 4.5:1
    const measured = fillContrasts((_, tokens) => {
        const inks = [tokens["--pk-text"], tokens["--pk-surface"]];
        return [...PALETTE(tokens), ...Object.values(HOST)].map((fill) => ({ name: fill, ink: labelColorOn(fill, inks), fill }));
    });
    assert.deepEqual(unreadable(measured), []);
});

/** A tile's colour and its label's, as decorateOption gives them: every tile of the series. */
const tilesOf = (/** @type {any} */ s) => s.data.map((/** @type {any} */ d) => ({ name: d.name, ink: s.label.color, fill: d.itemStyle.color }));
/** A style of the light theme's tokens with `extra` over them. */
const lightWith = (/** @type {Record<string, string>} */ extra = {}) => ({ getPropertyValue: (/** @type {string} */ n) => extra[n] ?? THEME_TOKENS.light[n] ?? "" });

test("treemap, both themes (#984): every label white, in one look; a tile white does not read on darkened to 4.6:1, no further", () => {
    const r = computePivot(REGIONS, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    for (const colorMap of [undefined, HOST]) {
        const measured = fillContrasts((style) => {
            const [s] = drawn(r, style, colorMap ? { colorMap } : {}).series;
            // one look: no plate, no outline, no tile with a label colour of its own
            assert.equal(s.label.color, "#ffffff");
            assert.equal(s.label.textBorderWidth, undefined);
            assert.equal(s.label.position, "insideTopLeft");
            assert.deepEqual(Object.keys(s.label.rich).sort(), ["name", "value"]);
            assert.equal(s.label.formatter({ name: "North", value: 3240 }), "{name|North}\n{value|3,240}");
            return tilesOf(s).map((/** @type {any} */ t) => ({ ...t, name: `${t.name}${colorMap ? " (host colours)" : ""}` }));
        });
        assert.deepEqual(unreadable(measured, 4.6), []);
    }
    // a tile on which white reads keeps its colour; the others are darkened only as far as it takes:
    // one hundredth less and white would not reach 4.6:1
    const [s] = drawn(r, lightWith()).series;
    // the tiles in the palette's order (the names sorted: Alps the first colour)
    const fills = tilesOf(s).map((/** @type {any} */ t) => t.fill);
    const palette = PALETTE(THEME_TOKENS.light);
    palette.forEach((color, i) => {
        if (/** @type {number} */ (contrastOf("#ffffff", color)) >= 4.6) {
            assert.equal(fills[i], color, `${color}: white reads on it`);
        } else {
            const ratio = /** @type {number} */ (contrastOf("#ffffff", fills[i]));
            assert.ok(ratio >= 4.6 && ratio < 4.75, `${color} as ${fills[i]}: ${ratio.toFixed(2)}, darkened just enough`);
        }
    });
    // #008300 and #6250d6 read white as they are; #eda100 (yellow) does not
    assert.deepEqual([fills[5], fills[6]], ["#008300", "#6250d6"]);
    assert.notEqual(fills[3], "#eda100");
    // a "}" in a name would end the name's text in ECharts' markup: it stands between two runs of it
    assert.equal(s.label.formatter({ name: "A}B", value: 1 }), "{name|A}}{name|B}\n{value|1}");
});

test("tileFill: the tile as it is where the ink reads; else mixed with black for a light ink, white for a dark one; a floor of 0 or a colour it cannot read keeps it", () => {
    assert.equal(tileFill("#6250d6", "#ffffff", 4.6), "#6250d6");
    const yellow = tileFill("#eda100", "#ffffff", 4.6);
    assert.ok(/** @type {number} */ (contrastOf("#ffffff", yellow)) >= 4.6, yellow);
    // a dark ink on a near black: the tile lightened
    const light = tileFill("#1f1f1f", "#111111", 4.6);
    assert.ok(/** @type {number} */ (contrastOf("#111111", light)) >= 4.6 && /** @type {number} */ (contrastOf("#ffffff", light)) < 4.6, light);
    assert.equal(tileFill("#eda100", "#ffffff", 0), "#eda100");
    assert.equal(tileFill("gold", "#ffffff", 4.6), "gold");
    // a floor no mix reaches (a mid grey ink): black, the darkest
    assert.equal(tileFill("#eda100", "#808080", 21), "#000000");
});

test("treemap: a host's colour in any form ECharts reads (a name, hsl(), #rgb) is darkened too, through ECharts' parser", () => {
    const r = computePivot(REGIONS, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    const style = lightWith();
    const colorMap = { Central: "gold", West: "hsl(50, 100%, 50%)", North: "#fc0" };
    // ECharts' color.parse, for these three
    const parsed = /** @type {Record<string, number[]>} */ ({ gold: [255, 215, 0, 1], "hsl(50, 100%, 50%)": [255, 213, 0, 1], "#fc0": [255, 204, 0, 1] });
    const parseColor = (/** @type {string} */ c) => parsed[c] ?? null;
    const [s] = decorateOption(toEChartsOption(r, { theme: chartThemeFrom(style), colorMap }), style, { width: 800, height: 480, parseColor }).series;
    for (const t of tilesOf(s).filter((/** @type {any} */ t) => t.name in colorMap)) {
        assert.ok(/** @type {number} */ (contrastOf(t.ink, t.fill)) >= 4.6, `${t.name}: ${t.fill}`);
    }
});

test("treemap: a named text colour is read through parseColor, so the tiles still keep the contrast; a weight out of 1 to 1000 falls back", () => {
    const r = computePivot(REGIONS, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    const style = lightWith({ "--pk-chart-tile-text": "white", "--pk-chart-tile-weight": "0", "--pk-weight-normal": "5000" });
    const parseColor = (/** @type {string} */ c) => (c === "white" ? [255, 255, 255, 1] : /^#[0-9a-f]{6}$/i.test(c) ? [0, 1, 2].map((i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16)).concat(1) : null);
    const [s] = decorateOption(toEChartsOption(r, { theme: chartThemeFrom(style) }), style, { width: 800, height: 480, parseColor }).series;
    assert.equal(s.label.color, "white");
    for (const t of tilesOf(s)) assert.ok(/** @type {number} */ (contrastOf("#ffffff", t.fill)) >= 4.6, `${t.name}: ${t.fill}`);
    const [plain] = drawn(r, lightWith()).series;
    assert.equal(s.label.rich.name.fontWeight, plain.label.rich.name.fontWeight);
    assert.equal(s.label.rich.value.fontWeight, plain.label.rich.value.fontWeight);
});

test("treemap: the tokens set the text's colour, its contrast, size, weights and padding; --pk-chart-tile-contrast 0 keeps every colour", () => {
    const r = computePivot(REGIONS, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    const palette = PALETTE(THEME_TOKENS.light);
    const host = lightWith({ "--pk-chart-tile-text": "#111111", "--pk-chart-tile-size": "16px", "--pk-chart-tile-weight": "700", "--pk-weight-normal": "300", "--pk-chart-tile-padding": "4px" });
    const [s] = drawn(r, host).series;
    assert.equal(s.label.color, "#111111");
    assert.deepEqual(s.label.rich.name, { fontSize: 16, lineHeight: 22, fontWeight: 700, color: "#111111" });
    assert.deepEqual(s.label.rich.value, { fontSize: 16, lineHeight: 22, fontWeight: 300, color: "#111111" });
    assert.equal(s.label.padding, 4);
    // a dark text: a tile too dark for it is lightened
    assert.deepEqual(unreadable(tilesOf(s).map((/** @type {any} */ t) => ({ theme: "light", ...t, ratio: contrastOf(t.ink, t.fill) })), 4.6), []);
    // a higher floor darkens more; 0 keeps the palette's colours as they are
    const [strict] = drawn(r, lightWith({ "--pk-chart-tile-contrast": "7" })).series;
    assert.deepEqual(unreadable(tilesOf(strict).map((/** @type {any} */ t) => ({ theme: "light", ...t, ratio: contrastOf(t.ink, t.fill) })), 7), []);
    const [off] = drawn(r, lightWith({ "--pk-chart-tile-contrast": "0" })).series;
    assert.deepEqual(tilesOf(off).map((/** @type {any} */ t) => t.fill), palette);
    // without any token: DEFAULT_THEME's white, 4.6:1, 8 px and the chart's text size
    const [bare] = drawn(r, { getPropertyValue: () => "" }).series;
    assert.equal(bare.label.color, "#ffffff");
    assert.equal(bare.label.padding, 8);
    assert.equal(bare.label.rich.name.fontSize, 14);
});

test("treemap with the tiles of a first draw (tileOf): each label at its tile's top left, cut to the tile with an ellipsis, the value whole or not at all; none where fewer than 4 characters or no line fit", () => {
    const r = computePivot(REGIONS, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    const style = lightWith();
    /** @type {Record<string, { width: number, height: number }>} */
    const tiles = {
        Central: { width: 300, height: 200 },
        // 30 px wide: not even "Wes…" fits
        West: { width: 30, height: 60 },
        // 34 px tall: no line of 19 px fits between the 8 px padding above and below; 35 px: one does
        North: { width: 300, height: 34 },
        South: { width: 300, height: 35 },
        // 64 px wide and 60 px tall: "Isla…" fits, the value "1,340" too, and two lines
        Islands: { width: 64, height: 60 },
        // 62 px wide: "Coa…" would fit, but a name cut to 3 characters is a stub: no label
        Coast: { width: 58, height: 60 }
    };
    /** @type {Array<[number, string]>} */
    const asked = [];
    const tileOf = (/** @type {number} */ i, /** @type {string} */ name) => (asked.push([i, name]), tiles[name] ?? null);
    const [s] = decorateOption(toEChartsOption(r, { theme: chartThemeFrom(style) }), style, { width: 800, height: 480, tileOf }).series;
    const byName = Object.fromEntries(s.data.map((/** @type {any} */ d) => [d.name, d]));
    // asked by item and name, so a tile is never another item's
    assert.deepEqual(asked, s.data.map((/** @type {any} */ d, /** @type {number} */ i) => [i, d.name]));
    assert.equal(byName.Central.label.formatter(), "{name|Central}\n{value|4,000}");
    assert.equal(byName.Central.label.rich, undefined, "in the series' styles");
    assert.equal(byName.Islands.label.formatter(), "{name|Isla…}\n{value|1,340}");
    // no label where nothing fits: the tooltip has the value
    assert.equal(byName.West.label.show, false);
    assert.equal(byName.Coast.label.show, false);
    assert.equal(byName.North.label.show, false);
    // one line: the name, the value left out whole, not cut
    assert.equal(byName.South.label.formatter(), "{name|South}");
    // a tile not drawn yet: the series' label
    assert.equal(byName.East.label, undefined);
});

test("drawnTiles: a treemap's tiles by item and name, its root left out; nothing for another chart", () => {
    const data = { count: () => 2, getName: (/** @type {number} */ i) => ["", "A"][i], getItemLayout: () => ({ width: 300, height: 200 }) };
    const chart = (/** @type {string} */ subType) => ({ getModel: () => ({ getSeriesByIndex: () => ({ subType, getData: () => data }) }) });
    const tileOf = /** @type {(i: number, name: string) => unknown} */ (drawnTiles(chart("treemap")));
    // the root at 0, the first item at 1
    assert.deepEqual(tileOf(0, "A"), { width: 300, height: 200 });
    // another name at that place, or past the end: unknown
    assert.equal(tileOf(0, "B"), null);
    assert.equal(tileOf(1, "A"), null);
    assert.equal(drawnTiles(chart("bar")), undefined);
    assert.equal(drawnTiles({}), undefined);
});

/** A colour `t` of the way from `a` to `b` (#rrggbb), mixed as ECharts mixes a visual map's colours: per channel. */
const mix = (/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ t) => {
    const ch = (/** @type {string} */ c, /** @type {number} */ i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
    return `rgba(${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)).join(",")},1)`;
};

test("heatmap, both themes: each number in the ink that reads on its cell (inRange and outOfRange), 4.5:1; the ink turns from dark to light once along the scale", () => {
    const r = computePivot(encode(REVENUE), { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "heatmap" }, formatting: { locale: "en-US" } });
    const inks = /** @type {Record<string, string[]>} */ ({});
    const measured = fillContrasts((style, tokens, theme) => {
        const base = toEChartsOption(r, { theme: chartThemeFrom(style) });
        const out = decorateOption({ ...base, visualMap: { ...base.visualMap, outOfRange: { color: [HOST.West, HOST.Central] } } }, style, { width: 800, height: 480 });
        assert.deepEqual(out.visualMap.outOfRange.color, [HOST.West, HOST.Central]);
        const [s] = out.series;
        const [low, high] = out.visualMap.inRange.color;
        const [outLow, outHigh] = out.visualMap.outOfRange.color;
        const inkOf = (/** @type {string} */ fill) => {
            const key = /^\{(\w+)\|/.exec(s.label.formatter({ value: [0, 0, 12], color: fill }))?.[1] ?? "";
            return s.label.rich[key]?.color;
        };
        // the cell's colour ECharts hands the formatter (p.color), from the low end to the high one
        const inRange = Array.from({ length: 11 }, (_, i) => {
            const fill = mix(low, high, i / 10);
            const ink = inkOf(fill);
            (inks[theme] ??= []).push(ink);
            return { name: `cell ${i}`, ink, fill };
        });
        // cells outside the visual map's range (outOfRange): host neutrals, mid-tones (black/white fallback) and theme fills
        const outFills = [
            ...Array.from({ length: 5 }, (_, i) => mix(outLow, outHigh, i / 4)),
            HOST.North,
            tokens["--pk-surface-2"],
            tokens["--pk-border"],
            tokens["--pk-muted"]
        ];
        const outOfRange = outFills.map((fill, i) => ({ name: `outOfRange ${i} (${fill})`, ink: inkOf(fill), fill }));
        return [...inRange, ...outOfRange];
    });
    assert.deepEqual(unreadable(measured), []);
    // dark or light: closer to black or to white
    const side = (/** @type {string} */ ink) => (/** @type {number} */ (contrastOnFill(ink, "#000000")) > /** @type {number} */ (contrastOnFill(ink, "#ffffff")) ? "light" : "dark");
    for (const [theme, list] of Object.entries(inks)) {
        const changes = list.filter((ink, i) => i > 0 && side(ink) !== side(list[i - 1])).length;
        assert.ok(changes <= 1, `${theme}: ${list.join(" ")}`);
    }
});

test("high and low points and reference lines, both themes: the glyph, the value and the words in the text colour, 4.5:1 on the background", () => {
    const rows = encode(MONTHLY);
    const r = computePivot(rows, { derived: [MONTH], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale: "en-US" }, chart: { type: "bar", referenceLines: { average: true, trend: false, target: null, extremes: true } } });
    // a host's light grey and pale blue series: their dots keep the colour, the labels do not take it
    const colorMap = { A: "#d0d4da", B: "#9ecbff" };
    const measured = fillContrasts((style) => {
        const out = drawn(r, style, { colorMap });
        const surface = style.getPropertyValue("--pk-surface");
        return out.series.flatMap((/** @type {any} */ s) => [
            ...(s.markPoint?.data ?? []).flatMap((/** @type {any} */ d) => [
                { name: `${s.name} ${d.name} value`, ink: d.label.color, fill: surface },
                { name: `${s.name} ${d.name} glyph`, ink: d.label.rich.s.color ?? d.label.color, fill: surface },
                // the outline around the letters is the background's colour too
                { name: `${s.name} ${d.name} outline`, ink: d.label.color, fill: d.label.textBorderColor }
            ]),
            ...(s.markLine?.data ?? []).map((/** @type {any} */ d) => ({ name: `${s.name} ${d.name}`, ink: d.label.color, fill: surface }))
        ]);
    });
    assert.ok(measured.length >= 12, String(measured.length));
    assert.deepEqual(unreadable(measured), []);
    // the measure itself: an unreadable colour is named, not passed
    assert.equal(contrastOnFill("var(--pk-nothing)", "#ffffff", {}), null);
    assert.deepEqual(unreadable([{ theme: "light", name: "x", ink: "oklch(0.5 0.1 200)", fill: "#ffffff", ratio: null }]), ["light x: oklch(0.5 0.1 200) on #ffffff = unreadable"]);
});
