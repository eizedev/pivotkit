// Text on coloured fills (#913, #914, #984) as ECharts drew it: a treemap's labels in white on tiles darkened where they need it, a heatmap's
// numbers in the ink that reads on their cell, each at 4.5:1 on what is under it, in both themes; the
// labels of high and low points never across another bar. After a theme switch every label and tile
// takes the colours a fresh render in that theme gives.
import { BOLD_WIDTH, ELLIPSIS, TILE_MIN_CHARS, textWidth, tileLine } from "../../../packages/pivotkit-core/src/chart-measure.js";
import { TEXT_MIN } from "../../fill-contrast.js";
import { installContrast } from "../contrast.js";
import { expect, test } from "../fixtures.js";
import { chartOf, inChart, inPage, mountReport, ROWS, tooltipOf, VIEW } from "./report.js";

/** Every text ECharts drew, sorted: its words, fill, outline colour and outline width. */
const drawnTexts = (chartEl) =>
    inChart(chartEl, (chart) => {
        const out = [];
        for (const el of chart.getZr().storage.getDisplayList(true)) {
            if ((el.type !== "tspan" && el.type !== "text") || el.ignore || el.invisible) continue;
            const s = el.style;
            if (!s.text) continue;
            out.push([String(s.text), String(s.fill ?? ""), s.lineWidth ? String(s.stroke ?? "") : "", s.lineWidth ?? 0].join(" | "));
        }
        return out.sort();
    });

/** Each label drawn on a mark (a tile, a cell): its words, its colour and the mark's fill under them. */
const labelsOnMarks = (chartEl) =>
    inChart(chartEl, (chart) => {
        const out = [];
        for (const el of chart.getZr().storage.getDisplayList(true)) {
            const text = el.getTextContent?.();
            if (!text || text.ignore || text.invisible || !el.style?.fill) continue;
            for (const span of (text.childrenRef?.() ?? []).filter((p) => p.type === "tspan" && p.style?.text?.trim())) {
                out.push({ text: span.style.text, ink: span.style.fill, fill: el.style.fill });
            }
        }
        return out;
    });

const contrasts = async (page, labels) => {
    await installContrast(page);
    return page.evaluate((labels) => labels.map((l) => ({ ...l, ratio: window.__pkContrast.ratio(window.__pkContrast.parse(l.ink), window.__pkContrast.parse(l.fill)) })), labels);
};

/** Eight regions, one tile each, and a host's light grey, near black and pale yellow among the colours. */
const REGIONS = ["Central", "West", "North", "South", "East", "Alps", "Coast", "Islands"].map((Region, i) => ({ Region, Revenue: 4000 - i * 380 }));
const HOST = { Central: "#d9d9d9", West: "#1f1f1f", North: "gold" };
/** The room around a tile's text at the default --pk-chart-tile-padding, px. */
const PADDING = 8;
/**
 * The smallest tile that writes a label at `fontSize`, from pivotkit-core's measures (treemapLabels):
 * room for the fewest characters of a cut name as bold capitals (the widest) and one line, between
 * the padding on every side; `none`: narrower than this no cut name fits, even of lower case.
 */
const tileMin = (fontSize) => ({
    width: textWidth(`${"M".repeat(TILE_MIN_CHARS)}${ELLIPSIS}`, fontSize) * BOLD_WIDTH + 2 * PADDING,
    height: tileLine(fontSize) + 2 * PADDING,
    none: textWidth(`${"a".repeat(TILE_MIN_CHARS)}${ELLIPSIS}`, fontSize) * BOLD_WIDTH + 2 * PADDING
});
/** Twenty countries by population: wide tiles and tiles too narrow for a name. */
const COUNTRIES = [["India", 1450], ["China", 1410], ["United States", 340], ["Indonesia", 283], ["Pakistan", 251], ["Nigeria", 232], ["Brazil", 212], ["Bangladesh", 173], ["Russian Federation", 143], ["Ethiopia", 132], ["Mexico", 130], ["Japan", 124], ["Egypt, Arab Rep.", 116], ["Philippines", 115], ["Congo, Dem. Rep.", 109], ["Viet Nam", 101], ["Iran, Islamic Rep.", 91], ["Turkiye", 85], ["Germany", 83], ["Thailand", 71]].map(([Country, Population]) => ({ Country, Population }));

for (const theme of ["light", "dark"]) {
    test(`treemap, ${theme} (#984): every label white, 4.5:1 on its tile as drawn; a host's pale colours darkened, its dark one kept`, async ({ page }) => {
        await page.goto("pages/host.html");
        await mountReport(page, { id: "fill-report", rows: REGIONS, view: { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "chart", chart: { type: "treemap" } }, theme, height: 480, props: { colorMap: HOST } });
        const chartEl = await chartOf(page, "fill-report", "treemap");
        const labels = await contrasts(page, await labelsOnMarks(chartEl));
        expect(labels.length).toBeGreaterThanOrEqual(16);
        for (const l of labels) expect(l.ratio, `${l.text}: ${l.ink} on ${l.fill}`).toBeGreaterThanOrEqual(TEXT_MIN);
        // one colour for every label, as ECharts writes them
        expect([...new Set(labels.map((l) => l.ink.toLowerCase()))]).toEqual(["#ffffff"]);
        // the tiles as drawn: the pale grey and gold (a name, through ECharts' parser) darker, the near black as set
        const fills = await inChart(chartEl, (chart) => Object.fromEntries(chart.getOption().series[0].data.map((d) => [d.name, d.itemStyle?.color])));
        expect(fills.West).toBe("#1f1f1f");
        expect(fills.Central).not.toBe("#d9d9d9");
        expect(fills.North).not.toBe("gold");
    });

    test(`treemap, ${theme}, 390 px: each label at its tile's top left, cut to fit, 4.5:1, none on a tile too small`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 900 });
        await page.goto("pages/host.html");
        await mountReport(page, { id: "fill-report", rows: COUNTRIES, view: { rows: ["Country"], values: [{ field: "Population", agg: "sum" }], display: "chart", chart: { type: "treemap" } }, theme, height: 560 });
        const chartEl = await chartOf(page, "fill-report", "treemap");
        // the size the chart writes the tiles' text at (--pk-chart-tile-size, the page's)
        const min = tileMin(await inChart(chartEl, (chart) => chart.getOption().series[0].label.rich.name.fontSize));
        const tiles = await inChart(chartEl, (chart) => {
            const out = [];
            for (const el of chart.getZr().storage.getDisplayList(true)) {
                const text = el.getTextContent?.();
                if (!text || !el.style?.fill) continue;
                const shown = !text.ignore && !text.invisible;
                const box = el.getBoundingRect().clone();
                box.applyTransform(el.getComputedTransform());
                const parts = text.childrenRef?.() ?? [];
                const words = [];
                for (const p of parts.filter((p) => shown && p.type === "tspan" && p.style?.text?.trim())) {
                    const r = p.getBoundingRect().clone();
                    r.applyTransform(text.getComputedTransform());
                    words.push(r);
                }
                out.push({ name: words.length ? parts.find((p) => p.type === "tspan")?.style.text : "(none)", tile: { x: box.x, y: box.y, width: box.width, height: box.height }, words });
            }
            return out;
        });
        expect(tiles.length).toBe(COUNTRIES.length);
        let below = 0;
        for (const t of tiles) {
            const size = `${Math.round(t.tile.width)} x ${Math.round(t.tile.height)} px`;
            // a tile with room for the fewest characters of a cut name and one line shows words
            if (t.tile.width >= min.width && t.tile.height >= min.height) expect(t.words.length, `a tile of ${size} without words`).toBeGreaterThan(0);
            // a tile too narrow even for lower case, or lower than a line, shows none
            if (t.tile.width < min.none || t.tile.height < min.height) {
                below++;
                expect(t.words, `${t.name}: words on a tile of ${size}`).toEqual([]);
            }
            if (!t.words.length) continue;
            // the words inside the tile, the first at its top left, the padding away from its edges
            const left = Math.min(...t.words.map((r) => r.x));
            const top = Math.min(...t.words.map((r) => r.y));
            expect(Math.abs(left - (t.tile.x + PADDING)), `${t.name}: ${JSON.stringify(t)}`).toBeLessThanOrEqual(2);
            expect(top - t.tile.y, `${t.name}: ${JSON.stringify(t)}`).toBeGreaterThanOrEqual(PADDING - 2);
            for (const r of t.words) {
                expect(r.x + r.width, `${t.name}: wider than its tile`).toBeLessThanOrEqual(t.tile.x + t.tile.width - PADDING + 2);
                expect(r.y + r.height, `${t.name}: lower than its tile`).toBeLessThanOrEqual(t.tile.y + t.tile.height + 1);
            }
        }
        expect(below, "tiles below the smallest that can write a label").toBeGreaterThan(0);
        // cut with an ellipsis where the name is wider than its tile: 4.5:1 on the tile
        const labels = await contrasts(page, await labelsOnMarks(chartEl));
        for (const l of labels) expect(l.ratio, `${l.text}: ${l.ink} on ${l.fill}`).toBeGreaterThanOrEqual(TEXT_MIN);
        expect(labels.some((l) => l.text.endsWith("\u2026"))).toBe(true);
    });

    test(`heatmap, ${theme}: every number 4.5:1 on the cell ECharts drew`, async ({ page }) => {
        await page.goto("pages/host.html");
        await mountReport(page, { id: "fill-report", rows: ROWS, view: { ...VIEW, chart: { type: "heatmap" } }, theme, height: 480 });
        const labels = await contrasts(page, await labelsOnMarks(await chartOf(page, "fill-report", "heatmap")));
        expect(labels.length).toBe(8);
        for (const l of labels) expect(l.ratio, `${l.text}: ${l.ink} on ${l.fill}`).toBeGreaterThanOrEqual(TEXT_MIN);
    });
}

// On a phone a tap on a tile shows its tooltip: the whole name and the value of a tile whose label is cut
// or left out
test.describe("a touch screen", () => {
    test.use({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: false });

    test("treemap, 390 px: a tap on a tile without words or with a cut name shows its whole name and value", async ({ page }) => {
        await page.goto("pages/host.html");
        await mountReport(page, { id: "fill-report", rows: COUNTRIES, view: { rows: ["Country"], values: [{ field: "Population", agg: "sum" }], display: "chart", chart: { type: "treemap" } }, theme: "light", height: 560 });
        const chartEl = await chartOf(page, "fill-report", "treemap");
        // each tile's middle and what it writes: "" for none
        const tiles = await inChart(chartEl, (chart) => {
            const out = [];
            for (const el of chart.getZr().storage.getDisplayList(true)) {
                const text = el.getTextContent?.();
                if (!text || !el.style?.fill) continue;
                const box = el.getBoundingRect().clone();
                box.applyTransform(el.getComputedTransform());
                const shown = !text.ignore && !text.invisible;
                const words = shown ? (text.childrenRef?.() ?? []).filter((p) => p.type === "tspan" && p.style?.text?.trim()).map((p) => p.style.text) : [];
                out.push({ middle: [box.x + box.width / 2, box.y + box.height / 2], words });
            }
            return out;
        });
        const bare = tiles.find((t) => t.words.length === 0);
        const cut = tiles.find((t) => t.words[0]?.endsWith(ELLIPSIS));
        expect(bare, "a tile without words").toBeTruthy();
        expect(cut, "a tile with a cut name").toBeTruthy();
        let before = "";
        for (const tile of [bare, cut]) {
            const at = await inPage(chartEl, tile.middle);
            await page.touchscreen.tap(at.x, at.y);
            // the tile's own tooltip, not the one of the tile tapped before
            await expect.poll(async () => (await tooltipOf(chartEl)).join(" ")).not.toBe(before);
            const tip = (await tooltipOf(chartEl)).join(" ");
            before = tip;
            const country = COUNTRIES.find((c) => tip.includes(`${c.Country} ${c.Population}`));
            expect(country, `a tile writing ${JSON.stringify(tile.words)}: ${tip}`).toBeTruthy();
            if (tile === cut) expect(country.Country.startsWith(tile.words[0].slice(0, -1)), `${tile.words[0]}: ${tip}`).toBe(true);
            // a person's pace between the taps, no double tap
            await page.waitForTimeout(400);
        }
    });
});

test("grouped bars (#913): a high or low point's label crosses no other bar and no other label", async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 900 });
    await page.goto("pages/host.html");
    // four teams by four priorities, counted: a light grey and a pale blue series among them
    const counts = [[215, 192, 60, 124], [230, 140, 75, 105], [82, 64, 56, 70], [215, 175, 170, 172]];
    const rows = counts.flatMap((row, t) => row.flatMap((n, p) => Array.from({ length: n }, () => ({ Team: `Team ${t + 1}`, Priority: ["High", "Low", "Medium", "Urgent"][p] }))));
    await mountReport(page, { id: "fill-report", rows, view: { rows: ["Team"], cols: ["Priority"], values: [{ field: "Team", agg: "count" }], display: "chart", chart: { type: "bar", referenceLines: { average: true, trend: false, target: null, extremes: true } } }, theme: "light", height: 520, props: { colorMap: { Low: "#d0d4da", Medium: "#9ecbff" } } });
    const chartEl = await chartOf(page, "fill-report", "bar");
    const drawn = await inChart(chartEl, (chart) => {
        const model = chart.getModel();
        const bars = [];
        model.eachSeriesByType("bar", (s) => {
            const data = s.getData();
            for (let i = 0; i < data.count(); i++) {
                const l = data.getItemLayout(i);
                if (l) bars.push({ series: s.seriesIndex, index: i, x0: Math.min(l.x, l.x + l.width), x1: Math.max(l.x, l.x + l.width), y0: Math.min(l.y, l.y + l.height), y1: Math.max(l.y, l.y + l.height) });
            }
        });
        const labels = [];
        chart.getZr().storage.getDisplayList(true).forEach((el) => {
            const text = el.getTextContent?.();
            if (!text || text.ignore || text.invisible || !/[▲▼]/.test(text.style?.text ?? "")) return;
            const r = text.getBoundingRect().clone();
            r.applyTransform(text.getComputedTransform());
            const own = model.getSeriesByIndex(el.__ecMarkerSeries ?? -1);
            labels.push({ text: text.style.text, x0: r.x, x1: r.x + r.width, y0: r.y, y1: r.y + r.height, center: el.x, series: own ? own.seriesIndex : null });
        });
        return { bars, labels };
    });
    expect(drawn.labels.length).toBeGreaterThan(0);
    const cover = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;
    for (const l of drawn.labels) {
        // its own bar is the one under its dot
        const others = drawn.bars.filter((b) => !(l.center >= b.x0 && l.center <= b.x1));
        for (const b of others) expect(cover(l, b), `${l.text} across a bar of series ${b.series} at ${b.index}`).toBe(false);
        for (const o of drawn.labels) if (o !== l) expect(cover(l, o), `${l.text} over ${o.text}`).toBe(false);
    }
});

for (const type of ["treemap", "heatmap"]) {
    for (const [from, to] of [
        ["light", "dark"],
        ["dark", "light"]
    ]) {
        test(`${type}: after a switch from ${from} to ${to}, every label as a fresh render in ${to} draws it`, async ({ page }) => {
            await page.goto("pages/host.html");
            const view = { ...VIEW, chart: { type } };
            await mountReport(page, { id: "fill-report", rows: ROWS, view, theme: from, height: 480 });
            await chartOf(page, "fill-report", type);
            await page.evaluate((theme) => window.__rerender({ theme }), to);
            await expect.poll(() => page.locator("#fill-report .pk-root").getAttribute("data-pk-theme")).toBe(to);
            let chartEl = await chartOf(page, "fill-report", type);
            // the texts and, for each label on a mark, its ink and the tile or cell under it
            const drawn = async (el) => ({ texts: await drawnTexts(el), marks: (await labelsOnMarks(el)).map((l) => `${l.text} | ${l.ink} on ${l.fill}`).sort() });
            const switched = await drawn(chartEl);
            expect(switched.texts.length).toBeGreaterThan(0);
            expect(switched.marks.length).toBeGreaterThan(0);
            await mountReport(page, { id: "fill-report", rows: ROWS, view, theme: to, height: 480 });
            chartEl = await chartOf(page, "fill-report", type);
            expect(switched).toEqual(await drawn(chartEl));
        });
    }
}
