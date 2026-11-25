// Text on coloured fills (#913, #914), in both themes: a treemap's labels on plates, a heatmap's
// numbers in the ink that reads on their cell, the labels of high and low points and reference lines in
// the text colour. Every label reaches 4.5:1 on what is under it (tests/fill-contrast.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartThemeFrom, computePivot, encode, toEChartsOption } from "pivotkit-core";
import { decorateOption, drawnTiles, labelColorOn } from "pivotkit-core/chart";
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

test("treemap, both themes: every label on a plate in the background colour, the same on every tile; 4.5:1 on it", () => {
    const r = computePivot(REGIONS, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    for (const colorMap of [undefined, HOST]) {
        const measured = fillContrasts((style) => {
            const [s] = drawn(r, style, colorMap ? { colorMap } : {}).series;
            // one look: no tile has a label colour or an outline of its own
            assert.deepEqual(s.data.filter((/** @type {any} */ d) => d.label), []);
            assert.equal(s.label.textBorderWidth, undefined);
            const plate = s.label.rich.plate;
            assert.equal(s.label.formatter({ name: "North", value: 3240 }), "{plate|North}\n{plate|3,240}");
            return [{ name: `plate${colorMap ? " (host colours)" : ""}`, ink: plate.color, fill: plate.backgroundColor }];
        });
        assert.deepEqual(unreadable(measured), []);
        assert.deepEqual(measured.map((m) => [m.theme, m.ink, m.fill]), [
            ["light", THEME_TOKENS.light["--pk-text"], THEME_TOKENS.light["--pk-surface"]],
            ["dark", THEME_TOKENS.dark["--pk-text"], THEME_TOKENS.dark["--pk-surface"]]
        ]);
    }
    // a "}" in a name would end the plate's text in ECharts' markup: it stands between two runs of it
    const [s] = drawn(r, { getPropertyValue: (/** @type {string} */ n) => THEME_TOKENS.light[n] ?? "" }).series;
    assert.equal(s.label.formatter({ name: "A}B", value: 1 }), "{plate|A}}{plate|B}\n{plate|1}");
});

test("treemap with the tiles of a first draw (tileOf): each label on a plate in its tile's middle, cut to the tile with an ellipsis; none where fewer than 4 characters fit", () => {
    const r = computePivot(REGIONS, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    const style = { getPropertyValue: (/** @type {string} */ n) => THEME_TOKENS.light[n] ?? "" };
    /** @type {Record<string, { width: number, height: number }>} */
    const tiles = {
        Central: { width: 300, height: 200 },
        // 30 px wide: not even "Wes…" fits
        West: { width: 30, height: 60 },
        // 20 px tall: no line fits; 23 px: one does, with a pixel above and below
        North: { width: 300, height: 20 },
        South: { width: 300, height: 23 },
        // 56 px wide and 40 px tall: "Isla…" fits, the value "1,340" too, but a line only
        Islands: { width: 56, height: 40 },
        // 50 px wide: "Coa…" would fit, but a name cut to 3 characters is a stub: no label
        Coast: { width: 50, height: 60 }
    };
    /** @type {Array<[number, string]>} */
    const asked = [];
    const tileOf = (/** @type {number} */ i, /** @type {string} */ name) => (asked.push([i, name]), tiles[name] ?? null);
    const [s] = decorateOption(toEChartsOption(r, { theme: chartThemeFrom(style) }), style, { width: 800, height: 480, tileOf }).series;
    const byName = Object.fromEntries(s.data.map((/** @type {any} */ d) => [d.name, d]));
    // asked by item and name, so a tile is never another item's
    assert.deepEqual(asked, s.data.map((/** @type {any} */ d, /** @type {number} */ i) => [i, d.name]));
    const line = s.label.rich.plate.lineHeight;
    // two lines of `line` px in the middle of the tile's 200 px, on the series' plate
    assert.deepEqual(byName.Central.label.padding, [(200 - 2 * line) / 2, 5, 0, 5]);
    assert.equal(byName.Central.label.formatter(), "{plate|Central}\n{plate|4,000}");
    assert.equal(byName.Central.label.rich, undefined, "on the series' plate");
    // cut with an ellipsis, on the plate; the value, with no line left, left out whole, not cut
    assert.equal(byName.Islands.label.formatter(), "{plate|Isla…}");
    assert.deepEqual(byName.Islands.label.padding, [(40 - line) / 2, 5, 0, 5]);
    // no empty plate where nothing fits: the tooltip has the value
    assert.equal(byName.West.label.show, false);
    assert.equal(byName.Coast.label.show, false);
    assert.equal(byName.North.label.show, false);
    assert.equal(byName.South.label.formatter(), "{plate|South}");
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

test("treemap without a background colour it can draw: no plates, each label in the ink that reads on its tile", () => {
    const r = computePivot(REGIONS, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "treemap" }, formatting: { locale: "en-US" } });
    const missing = { getPropertyValue: (/** @type {string} */ n) => (n === "--pk-surface" ? "" : (THEME_TOKENS.light[n] ?? "")) };
    const unreadableSurface = { getPropertyValue: (/** @type {string} */ n) => (n === "--pk-surface" ? "oklch(0.98 0 0)" : (THEME_TOKENS.light[n] ?? "")) };
    const readColor = (/** @type {string} */ c) => (c.startsWith("#") ? c : null);
    for (const style of [missing, unreadableSurface]) {
        const [s] = decorateOption(toEChartsOption(r, { theme: chartThemeFrom(missing) }), style, { width: 800, height: 480, readColor }).series;
        assert.equal(s.label.rich.plate, undefined, style.getPropertyValue("--pk-surface"));
        const out = s.label.formatter({ name: "North", value: 3240, color: "#1f1f1f" });
        const key = /^\{(\w+)\|/.exec(out)?.[1] ?? "";
        assert.ok(/** @type {number} */ (contrastOnFill(s.label.rich[key].color, "#1f1f1f")) >= 4.5, out);
    }
});

/** A colour `t` of the way from `a` to `b` (#rrggbb), mixed as ECharts mixes a visual map's colours: per channel. */
const mix = (/** @type {string} */ a, /** @type {string} */ b, /** @type {number} */ t) => {
    const ch = (/** @type {string} */ c, /** @type {number} */ i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
    return `rgba(${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)).join(",")},1)`;
};

test("heatmap, both themes: each number in the ink that reads on its cell, 4.5:1; the ink turns from dark to light once along the scale", () => {
    const r = computePivot(encode(REVENUE), { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "heatmap" }, formatting: { locale: "en-US" } });
    const inks = /** @type {Record<string, string[]>} */ ({});
    const measured = fillContrasts((style, tokens, theme) => {
        const out = drawn(r, style);
        const [s] = out.series;
        const [low, high] = out.visualMap.inRange.color;
        // the cell's colour ECharts hands the formatter (p.color), from the low end to the high one
        return Array.from({ length: 11 }, (_, i) => {
            const fill = mix(low, high, i / 10);
            const key = /^\{(\w+)\|/.exec(s.label.formatter({ value: [0, 0, 12], color: fill }))?.[1] ?? "";
            const ink = s.label.rich[key]?.color;
            (inks[theme] ??= []).push(ink);
            return { name: `cell ${i}`, ink, fill };
        });
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
