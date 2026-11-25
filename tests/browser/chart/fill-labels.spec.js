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
            const plates = parts.filter((p) => p.type === "rect" && p.style?.fill);
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

for (const theme of ["light", "dark"]) {
    test(`treemap, ${theme}: every label on a plate, 4.5:1 on it, the same on every tile`, async ({ page }) => {
        await page.goto("pages/host.html");
        await mountReport(page, { id: "fill-report", rows: REGIONS, view: { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "chart", chart: { type: "treemap" } }, theme, height: 480, props: { colorMap: HOST } });
        const labels = await contrasts(page, await labelsOnMarks(await chartOf(page, "fill-report", "treemap")));
        expect(labels.length).toBeGreaterThanOrEqual(16);
        for (const l of labels) expect(l.ratio, `${l.text}: ${l.ink} on ${l.fill}`).toBeGreaterThanOrEqual(TEXT_MIN);
        expect(labels.every((l) => l.plated)).toBe(true);
        expect(new Set(labels.map((l) => `${l.ink} on ${l.fill}`)).size).toBe(1);
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
