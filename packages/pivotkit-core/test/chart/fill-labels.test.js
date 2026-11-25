// Text on coloured fills (#913, #914), in both themes: a treemap's labels on plates, a heatmap's
// numbers in the ink that reads on their cell, the labels of high and low points and reference lines in
// the text colour. Every label reaches 4.5:1 on what is under it (tests/fill-contrast.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartThemeFrom, computePivot, encode, toEChartsOption } from "pivotkit-core";
import { decorateOption, labelColorOn } from "pivotkit-core/chart";
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
