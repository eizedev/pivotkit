// Text on coloured fills (#913, #914) as ECharts drew it: a treemap's labels on plates, a heatmap's
// numbers in the ink that reads on their cell, each at 4.5:1 on what is under it, in both themes; the
// labels of high and low points never across another bar. After a theme switch every label and plate
// takes the colours a fresh render in that theme gives.
import { TEXT_MIN } from "../../fill-contrast.js";
import { installContrast } from "../contrast.js";
import { expect, test } from "../fixtures.js";
import { chartOf, inChart, mountReport, ROWS, VIEW } from "./report.js";

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

/**
 * Each label drawn on a mark (a tile, a cell): its words, its colour and what is under them, the
 * label's own background (a plate) where it has one, else the mark's fill.
 */
const labelsOnMarks = (chartEl) =>
    inChart(chartEl, (chart) => {
        const out = [];
        for (const el of chart.getZr().storage.getDisplayList(true)) {
            const text = el.getTextContent?.();
            if (!text || text.ignore || text.invisible || !el.style?.fill) continue;
            const parts = text.childrenRef?.() ?? [];
            // a label too wide for a plate has a transparent one: none
            const plates = parts.filter((p) => p.type === "rect" && p.style?.fill && p.style.fill !== "transparent");
            for (const span of parts.filter((p) => p.type === "tspan" && p.style?.text?.trim())) {
                const plate = plates.find((p) => {
                    const a = p.getBoundingRect();
                    const b = span.getBoundingRect();
                    return a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.width >= b.x + b.width - 1 && a.y + a.height >= b.y + b.height - 1;
                });
                out.push({ text: span.style.text, ink: span.style.fill, fill: plate ? plate.style.fill : el.style.fill, plated: Boolean(plate) });
            }
        }
        return out;
    });

const contrasts = async (page, labels) => {
    await installContrast(page);
    return page.evaluate((labels) => labels.map((l) => ({ ...l, ratio: window.__pkContrast.ratio(window.__pkContrast.parse(l.ink), window.__pkContrast.parse(l.fill)) })), labels);
};

/** Eight regions, one tile each, and a host's light grey and near black among the colours. */
const REGIONS = ["Central", "West", "North", "South", "East", "Alps", "Coast", "Islands"].map((Region, i) => ({ Region, Revenue: 4000 - i * 380 }));
const HOST = { Central: "#d9d9d9", West: "#1f1f1f" };
/** Twenty countries by population: wide tiles and tiles too narrow for a name on a plate. */
const COUNTRIES = [["India", 1450], ["China", 1410], ["United States", 340], ["Indonesia", 283], ["Pakistan", 251], ["Nigeria", 232], ["Brazil", 212], ["Bangladesh", 173], ["Russian Federation", 143], ["Ethiopia", 132], ["Mexico", 130], ["Japan", 124], ["Egypt, Arab Rep.", 116], ["Philippines", 115], ["Congo, Dem. Rep.", 109], ["Viet Nam", 101], ["Iran, Islamic Rep.", 91], ["Turkiye", 85], ["Germany", 83], ["Thailand", 71]].map(([Country, Population]) => ({ Country, Population }));

for (const theme of ["light", "dark"]) {
    test(`treemap, ${theme}: every label 4.5:1 on what is under it, one look on every plate`, async ({ page }) => {
        await page.goto("pages/host.html");
        await mountReport(page, { id: "fill-report", rows: REGIONS, view: { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "chart", chart: { type: "treemap" } }, theme, height: 480, props: { colorMap: HOST } });
        const labels = await contrasts(page, await labelsOnMarks(await chartOf(page, "fill-report", "treemap")));
        expect(labels.length).toBeGreaterThanOrEqual(16);
        for (const l of labels) expect(l.ratio, `${l.text}: ${l.ink} on ${l.fill}`).toBeGreaterThanOrEqual(TEXT_MIN);
        // one look on every plate; a label too wide for its tile has none
        expect(new Set(labels.filter((l) => l.plated).map((l) => `${l.ink} on ${l.fill}`)).size).toBe(1);
        expect(labels.filter((l) => l.plated).length).toBeGreaterThanOrEqual(labels.length / 2);
    });

    test(`treemap, ${theme}, 390 px: each label in its tile's middle, 4.5:1 with or without a plate, no plate without words`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 900 });
        await page.goto("pages/host.html");
        await mountReport(page, { id: "fill-report", rows: COUNTRIES, view: { rows: ["Country"], values: [{ field: "Population", agg: "sum" }], display: "chart", chart: { type: "treemap" } }, theme, height: 560 });
        const chartEl = await chartOf(page, "fill-report", "treemap");
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
                const plates = parts.filter((p) => p.type === "rect" && p.style?.fill && p.style.fill !== "transparent").map((p) => {
                    const r = p.getBoundingRect();
                    return { width: r.width, words: parts.some((w) => w.type === "tspan" && w.style?.text?.trim() && Math.abs(w.getBoundingRect().y - r.y) < r.height) };
                });
                const y0 = Math.min(...words.map((r) => r.y));
                const y1 = Math.max(...words.map((r) => r.y + r.height));
                out.push({ name: words.length ? parts.find((p) => p.type === "tspan")?.style.text : "(none)", tile: [box.y, box.y + box.height], size: [box.width, box.height], words: words.length ? [y0, y1] : null, plates: shown ? plates : [] });
            }
            return out;
        });
        expect(tiles.length).toBe(COUNTRIES.length);
        for (const t of tiles) {
            for (const p of t.plates) expect(p.words, `${t.name}: a plate ${p.width} px wide without words`).toBe(true);
            // a tile with room for a line of text (5 px padding around it) and a letter shows words
            if (t.size[0] >= 30 && t.size[1] >= 30) expect(t.words, `a tile of ${t.size.map(Math.round).join(" x ")} px without words`).not.toBeNull();
            if (!t.words) continue;
            // the words' middle within 2 px of the tile's
            expect(Math.abs((t.words[0] + t.words[1]) / 2 - (t.tile[0] + t.tile[1]) / 2), `${t.name}: ${JSON.stringify(t)}`).toBeLessThanOrEqual(2);
        }
        // on a plate or, too wide for one, on the tile: 4.5:1 either way, both kinds drawn
        const labels = await contrasts(page, await labelsOnMarks(chartEl));
        for (const l of labels) expect(l.ratio, `${l.text}: ${l.ink} on ${l.fill}`).toBeGreaterThanOrEqual(TEXT_MIN);
        expect(new Set(labels.map((l) => l.plated))).toEqual(new Set([true, false]));
    });

    test(`heatmap, ${theme}: every number 4.5:1 on the cell ECharts drew`, async ({ page }) => {
        await page.goto("pages/host.html");
        await mountReport(page, { id: "fill-report", rows: ROWS, view: { ...VIEW, chart: { type: "heatmap" } }, theme, height: 480 });
        const labels = await contrasts(page, await labelsOnMarks(await chartOf(page, "fill-report", "heatmap")));
        expect(labels.length).toBe(8);
        for (const l of labels) expect(l.ratio, `${l.text}: ${l.ink} on ${l.fill}`).toBeGreaterThanOrEqual(TEXT_MIN);
    });
}

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
            // the texts and, for each label on a mark, its ink and what is under it (a treemap's plate)
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
