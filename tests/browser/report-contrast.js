// The HTML report's colours as a reader sees them: made-up sales with a colour scale, data bars and a
// chart, and a measure of the drawn page (report-theme.spec.js, report-templates.spec.js,
// download-link.spec.js): every text of the page against what is drawn behind it, WCAG 2.2's
// contrast, a data bar blended over its cell; the colours of the report's parts; and
// expectReportColours, the checks the report specs share.
import { installContrast } from "./contrast.js";
import { expect } from "./fixtures.js";

const REGIONS = ["North", "South", "East", "West", "Central"];
const PRODUCTS = ["Hardware", "Services", "Software"];
/** Made-up sales: every region and product, the units growing so the scale has a low and a high end. */
export const ROWS = REGIONS.flatMap((region, r) => PRODUCTS.map((product, p) => ({ Region: region, Product: product, Units: 10 + r * 30 + p * 7, Price: 5 + ((r * 3 + p) % 7) })));

export const VIEWS = {
    scale: { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale" } }] },
    bars: { rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum", conditional: { type: "dataBar" } }, { field: "Price", agg: "average" }] },
    chart: { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" }, display: "chart" }
};

/** 120 items in 6 groups: more categories than a report's chart draws (REPORT_LIMITS.categories). */
const ITEMS = Array.from({ length: 120 }, (_, i) => ({ Group: `Group ${Math.floor(i / 20) + 1}`, Item: `Item ${String(i + 1).padStart(3, "0")}`, Units: i + 1 }));

/**
 * The views each report spec draws in every theme: VIEWS over ROWS, and `notes`, the report's texts
 * that only some reports show: the description, the note under a chart cut at its categories (on the
 * chart's light card), the note under a table cut at its cells, the "+" of a collapsed group, and the
 * chart as inline SVG, so the texts drawn in it are measured too.
 */
export const CASES = {
    scale: { view: VIEWS.scale, rows: ROWS, options: {}, shows: ["scale cells", "grand total background"] },
    bars: { view: VIEWS.bars, rows: ROWS, options: {}, shows: ["data bars", "cell background", "subtotal background", "grand total background"] },
    chart: { view: VIEWS.chart, rows: ROWS, options: {}, shows: ["chart card", "cell background", "grand total background"] },
    notes: {
        view: { rows: ["Group", "Item"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" }, display: "chart", collapsed: { rows: [["Group 2"]] } },
        rows: ITEMS,
        options: { chartEmbed: "inline", tableCells: 120, description: "Units of every item, by group" },
        shows: ["chart card", "chart note", "chart texts", "collapsed +", "muted text", "subtotal background"]
    }
};

/** What every report shows, whatever its view and template (a table cut at its cells has no grand total). */
const ALWAYS_SHOWN = ["body background", "body text", "header background", "row header background", "table text", "table borders"];

/**
 * Runs in the page: every element with text of its own (outside the chart's image), its contrast on
 * what is behind it and whether it is light text on a dark ground; the texts of a chart drawn inline
 * (their fill on the chart's card) and the "+" of a collapsed group; the scale's cells by value with
 * their distance from the surface and their text's contrast; the data bars by length; the colours of
 * the report's parts, each as the set of colours its elements take; the page's surface, text and
 * colour scheme. sRGB colours as the page computes them ("rgb()", "rgba()", "color(srgb ...)").
 */
const measureInPage = () => {
    // contrast.js's helpers, on colours as { r, g, b, a }
    const kit = window.__pkContrast;
    const parse = (c) => {
        const [r, g, b, a] = kit.parse(c);
        return { r, g, b, a };
    };
    const lum = ({ r, g, b }) => kit.lum([r, g, b]);
    const ratio = (a, b) => kit.ratio([a.r, a.g, a.b], [b.r, b.g, b.b]);
    const over = (top, under) => {
        const [r, g, b] = kit.over([top.r, top.g, top.b, top.a], [under.r, under.g, under.b, 1]);
        return { r, g, b };
    };
    const backgroundOf = (el) => {
        for (let e = el; e; e = e.parentElement) {
            const bg = parse(getComputedStyle(e).backgroundColor);
            if (bg.a > 0) return bg;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
    };
    const css = ({ r, g, b }) => `rgb(${[r, g, b].map(Math.round).join(", ")})`;
    const card = document.querySelector(".pk-report-chart");
    /** A text on its ground: the contrast, light on dark or not, on the chart's card or not. */
    const entry = (text, on, fg, bg, el) => ({ text, on, ratio: ratio(fg, bg), lightOnDark: lum(fg) > lum(bg), inCard: Boolean(card?.contains(el)) });
    const texts = [];
    const own = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    for (const el of document.body.querySelectorAll("*")) {
        if (!own(el) || el.closest("svg") || el.getClientRects().length === 0) continue;
        const style = getComputedStyle(el);
        const fg = parse(style.color);
        const bg = backgroundOf(el);
        texts.push(entry(el.textContent.trim(), "background", fg, bg, el));
        const bar = el.classList.contains("pk-has-bar") ? style.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/)?.[0] : null;
        if (bar) texts.push(entry(el.textContent.trim(), "bar", fg, over(parse(bar), bg), el));
        // the "+" of a collapsed group, drawn by ::before in its own colour
        if (el.classList.contains("pk-collapsed")) texts.push(entry(`+ before ${el.textContent.trim()}`, "background", parse(getComputedStyle(el, "::before").color), bg, el));
    }
    // a chart drawn inline: its texts' fill on what is behind the chart
    for (const el of document.querySelectorAll("svg text")) {
        if (!el.textContent.trim()) continue;
        texts.push(entry(el.textContent.trim(), "chart", parse(getComputedStyle(el).fill), backgroundOf(el.closest("svg")), el));
    }
    const surface = backgroundOf(document.body);
    const number = (el) => Number(el.textContent.replace(/[^\d.]/g, ""));
    // the scale's cells by their value, with how far each is from the surface and their text's contrast
    const scale = [...document.querySelectorAll(".pk-has-scale")].map((el) => ({ value: number(el), distance: ratio(backgroundOf(el), surface), ratio: ratio(parse(getComputedStyle(el).color), backgroundOf(el)) })).sort((a, b) => a.value - b.value);
    // the data bars by their length in %
    const bars = [...document.querySelectorAll(".pk-has-bar")].map((el) => ({ value: number(el), length: parseFloat(getComputedStyle(el).getPropertyValue("--pk-bar")) })).sort((a, b) => a.value - b.value);
    /** The colours a part's elements take, each once: `bg` the colour drawn behind them. */
    const colours = (selector, of) => {
        const els = [...document.querySelectorAll(selector)];
        return els.length === 0 ? null : [...new Set(els.map((el) => (of === "bg" ? css(backgroundOf(el)) : getComputedStyle(el)[of])))].sort();
    };
    const parts = {
        "body background": colours("body", "bg"),
        "body text": colours("body", "color"),
        "header background": colours("thead .pk-th:not(.pk-grand)", "bg"),
        "row header background": colours(".pk-th.pk-row:not(.pk-sub):not(.pk-grand)", "bg"),
        "cell background": colours(".pk-td:not(.pk-sub):not(.pk-grand):not(.pk-has-scale)", "bg"),
        "subtotal background": colours(".pk-table .pk-sub", "bg"),
        "grand total background": colours(".pk-table .pk-grand", "bg"),
        "table text": colours(".pk-th, .pk-td", "color"),
        "table borders": colours(".pk-th, .pk-td", "borderTopColor"),
        "muted text": colours(".pk-report-details, .pk-report-description:not(:empty), .pk-report-note:not(figcaption)", "color"),
        "chart card": colours(".pk-report-chart", "bg"),
        "chart card border": colours(".pk-report-chart", "borderTopColor"),
        "chart note": colours(".pk-report-chart .pk-report-note", "color")
    };
    return { texts, scale, bars, parts, body: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color, colorScheme: getComputedStyle(document.documentElement).colorScheme };
};

/**
 * The measure of the page as it is drawn now (measureInPage, with contrast.js's helpers).
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<ReturnType<typeof measureInPage>>}
 */
export async function measure(page) {
    await installContrast(page);
    return page.evaluate(measureInPage);
}

/** A hex token as the page computes it. */
export const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

/**
 * The checks every report spec makes of a measured page (`seen`, measure's): each part in its theme's
 * colour, the same in every element of it (no light and dark mixed), light text on dark grounds on a
 * dark screen and dark text on light ones otherwise, the chart's card light with its own texts dark,
 * every text 4.5:1 on what is behind it (WCAG AA), a scale's low, middle and high cells and a data
 * bar's shortest and longest among them, and a colour scale running from the surface outwards.
 * This checks that the page is wired to its tokens; whether the token values themselves meet WCAG AA
 * on every surface, scale step and bar is held by pivotkit-report's test/contrast.test.js.
 * @param {Awaited<ReturnType<typeof measure>>} seen
 * @param {{ name: string, tokens: Record<string, string>, light: Record<string, string>, dark: boolean, media: "screen" | "print", shows: string[] }} expected
 *   tokens: the theme the page shows; light: the light theme the chart is drawn in (its card's
 *   surface, its note's colour); dark: a dark screen; shows: what the case must show besides
 *   ALWAYS_SHOWN (a part's name, "scale cells", "data bars", "chart texts", "collapsed +"), so a
 *   part the page lost fails instead of being left unchecked
 */
export function expectReportColours(seen, { name, tokens, light, dark, media, shows }) {
    const shown = {
        ...Object.fromEntries(Object.entries(seen.parts).map(([part, colours]) => [part, colours !== null])),
        "scale cells": seen.scale.length > 0,
        "data bars": seen.bars.length > 0,
        "chart texts": seen.texts.some((t) => t.on === "chart"),
        "collapsed +": seen.texts.some((t) => t.text.startsWith("+ before "))
    };
    for (const what of [...ALWAYS_SHOWN, ...shows]) expect(shown[what], `${name}: shows ${what}`).toBe(true);
    const want = {
        "body background": tokens["--pk-surface"],
        "body text": tokens["--pk-text"],
        "header background": tokens["--pk-surface-2"],
        "row header background": tokens["--pk-surface"],
        "cell background": tokens["--pk-surface"],
        "subtotal background": tokens["--pk-total"],
        "grand total background": tokens["--pk-total-strong"],
        "table text": tokens["--pk-text"],
        "table borders": tokens["--pk-border"],
        "muted text": tokens["--pk-muted"],
        // the chart is drawn in the light colours: its card keeps the light surface on a dark screen,
        // and the note on it the light muted text; its border is the page's (none on paper)
        "chart card": light["--pk-surface"],
        "chart card border": media === "screen" ? tokens["--pk-border"] : null,
        "chart note": light["--pk-muted"]
    };
    for (const [part, hex] of Object.entries(want)) {
        if (seen.parts[part] === null || hex === null) continue;
        expect(seen.parts[part], `${name}: ${part}`).toEqual([rgb(hex)]);
    }
    // a dark screen: light text on dark grounds everywhere but the chart's light card; else dark on light
    const mixed = seen.texts.filter((t) => t.lightOnDark !== (dark && !t.inCard)).map((t) => `${t.text.slice(0, 40)} on its ${t.on}`);
    expect(mixed, `${name}: texts in the other theme's polarity`).toEqual([]);
    expect(seen.texts.length, name).toBeGreaterThan(10);
    const low = seen.texts.filter((t) => t.ratio < 4.5).map((t) => `${t.text.slice(0, 40)} on its ${t.on}: ${t.ratio.toFixed(2)}`);
    expect(low, `${name}: texts below 4.5:1`).toEqual([]);
    if (seen.scale.length > 0) {
        // the low, middle and high cells are among those measured, each 4.5:1
        const values = seen.scale.map((c) => c.value);
        const middle = (values[0] + values.at(-1)) / 2;
        const mid = seen.scale.reduce((a, c) => (Math.abs(c.value - middle) < Math.abs(a.value - middle) ? c : a));
        expect(Math.abs(mid.value - middle), `${name}: a cell at the scale's middle`).toBeLessThan((values.at(-1) - values[0]) / 10);
        for (const [end, cell] of [["low", seen.scale[0]], ["middle", mid], ["high", seen.scale.at(-1)]]) expect(cell.ratio, `${name}: the scale's ${end} cell (${cell.value})`).toBeGreaterThanOrEqual(4.5);
        // the smallest value is the cell nearest the surface, the largest the one furthest from it
        const distances = seen.scale.map((c) => c.distance);
        expect(Math.min(...distances), `${name}: the low end is the nearest to the surface`).toBe(distances[0]);
        expect(distances[0], `${name}: the low end`).toBeLessThan(distances.at(-1));
    }
    if (seen.bars.length > 0) {
        // the full bar and a short one are among the texts measured on a bar
        expect(seen.bars.at(-1).length, `${name}: the longest bar`).toBe(100);
        expect(seen.bars[0].length, `${name}: the shortest bar`).toBeLessThan(20);
        expect(seen.texts.filter((t) => t.on === "bar").length, `${name}: texts on a bar`).toBe(seen.bars.length);
    }
}
