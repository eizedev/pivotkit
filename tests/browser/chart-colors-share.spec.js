// Chart extras (#54) with real pointer input: the chart image on the clipboard, a fixed colour per
// series or slice (the host's colorMap and the view's colours from Display), and the share of the total
// in the tooltip. Positions come from the chart's own layout.
import { test, expect } from "./fixtures.js";

/** Revenue per region and category. North adds up to 60 (20 + 10 + 30). */
const ROWS = [
    { Region: "North", Category: "Hardware", Revenue: 20 },
    { Region: "North", Category: "Services", Revenue: 10 },
    { Region: "North", Category: "Software", Revenue: 30 },
    { Region: "South", Category: "Hardware", Revenue: 15 },
    { Region: "South", Category: "Services", Revenue: 5 },
    { Region: "South", Category: "Software", Revenue: 25 },
    { Region: "East", Category: "Services", Revenue: 12 },
    { Region: "East", Category: "Software", Revenue: 40 }
];
const VIEW = { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], display: "chart" };

/** navigator.clipboard.write that keeps the types and the first bytes of what it was given (every engine, no permission). */
async function captureImageClipboard(page) {
    await page.addInitScript(() => {
        window.__images = [];
        if (!navigator.clipboard) return;
        navigator.clipboard.write = async (items) => {
            for (const item of items) {
                const type = item.types[0];
                const blob = await item.getType(type);
                const head = [...new Uint8Array(await blob.slice(0, 4).arrayBuffer())];
                window.__images.push({ type, size: blob.size, head });
            }
        };
    });
}

/** Mounts a report at the top of the host page; mount again to change it. */
async function mount(page, chart, { theme = "light", colorMap, view = VIEW } = {}) {
    await page.evaluate(
        async ({ view, theme, colorMap, rows }) => {
            const React = await import("react");
            const { createRoot } = await import("react-dom/client");
            const { PivotReport } = await import("pivotkit-react");
            if (!window.__colorRoot) {
                const el = document.createElement("section");
                el.id = "color-report";
                document.body.prepend(el);
                window.__colorRoot = createRoot(el);
            }
            window.__colorRoot.render(null);
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            window.__colorViews = [];
            window.__exports = [];
            window.__colorRoot.render(
                React.createElement(PivotReport, { key: JSON.stringify({ view, theme }), theme, data: rows, height: 560, defaultView: view, colorMap, onViewChange: (v) => window.__colorViews.push(v), onExport: (f) => void window.__exports.push({ kind: f.kind, fileName: f.fileName, type: f.blob.type }) })
            );
        },
        { view: { ...view, chart }, theme, colorMap, rows: ROWS }
    );
    const chartEl = page.locator("#color-report").getByTestId("pivot-chart");
    await expect(chartEl.locator("canvas").first()).toBeVisible();
    await settled(chartEl);
    return chartEl;
}

async function settled(chartEl) {
    await expect.poll(() => chartEl.evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        const chart = getInstanceByDom(el);
        return Boolean(chart?.getOption().series?.length) && chart.getZr().animation.isFinished();
    })).toBe(true);
}

/** Runs `at(chart, arg)` in the page with the chart's ECharts instance. */
const inChart = (chartEl, at, arg) =>
    chartEl.evaluate(async (el, { at, arg }) => {
        const { getInstanceByDom } = await import("echarts/core");
        return new Function("chart", "arg", `return (${at})(chart, arg);`)(getInstanceByDom(el), arg);
    }, { at: at.toString(), arg });

/** The colour ECharts draws each series with (bars), or each slice with (a pie). */
const drawnColors = (chart) => {
    const model = chart.getModel();
    const first = model.getSeriesByIndex(0);
    if (first.subType === "pie") {
        const data = first.getData();
        return Object.fromEntries(Array.from({ length: data.count() }, (_, i) => [data.getName(i), data.getItemVisual(i, "style").fill]));
    }
    return Object.fromEntries(model.getSeries().map((s) => [s.name, s.getData().getVisual("style").fill]));
};
const barMiddle = (chart, { series, index }) => {
    const l = chart.getModel().getSeriesByIndex(series).getData().getItemLayout(index);
    return [l.x + l.width / 2, l.y + l.height / 2];
};
const sliceMiddle = (chart, { index }) => {
    const l = chart.getModel().getSeriesByIndex(0).getData().getItemLayout(index);
    const angle = (l.startAngle + l.endAngle) / 2;
    const r = (l.r0 + l.r) / 2;
    return [l.cx + r * Math.cos(angle), l.cy + r * Math.sin(angle)];
};
async function hover(page, chartEl, [x, y]) {
    const box = await chartEl.boundingBox();
    await page.mouse.move(box.x + x - 6, box.y + y + 5);
    await page.mouse.move(box.x + x, box.y + y, { steps: 3 });
}
const tooltipOf = (chartEl) =>
    chartEl.evaluate((el) => {
        const tip = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
        if (!tip || getComputedStyle(tip).visibility === "hidden" || getComputedStyle(tip).display === "none" || Number(getComputedStyle(tip).opacity) === 0) {
            return [];
        }
        const box = tip.firstElementChild;
        return box ? [...box.children].map((row) => [...(row.children.length ? row.children : [row])].map((c) => c.textContent.trim()).filter(Boolean).join(" ")) : [];
    });

/** Opens a toolbar menu of the report: its button, or its entry in "More" on a narrow report. */
async function menu(report, testId) {
    const own = report.getByTestId(testId);
    if (await own.isVisible()) {
        await own.click();
    } else {
        await report.getByTestId("more").click();
        await report.getByTestId(`more-${testId}`).click();
    }
    await expect(report.locator(".pk-popover")).toBeVisible();
}
const lastChart = (page) => page.evaluate(() => window.__colorViews.at(-1)?.chart);

test.describe("chart extras (#54)", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await captureImageClipboard(page);
        await page.goto("pages/host.html");
    });

    test("Export, Copy chart image puts a PNG of the chart on the clipboard, after the host's onExport", async ({ page }) => {
        await mount(page, { type: "bar" });
        const report = page.locator("#color-report");
        await menu(report, "export");
        await report.getByTestId("export-copy-chart").click();
        await expect.poll(() => page.evaluate(() => window.__images)).toEqual([expect.objectContaining({ type: "image/png", head: [137, 80, 78, 71] })]);
        expect(await page.evaluate(() => window.__images[0].size)).toBeGreaterThan(1000);
        expect(await page.evaluate(() => window.__exports)).toEqual([{ kind: "copy-chart", fileName: "pivot.png", type: "image/png" }]);
        await expect(report.locator(".pk-toasts")).toContainText("Chart copied as an image");
    });

    test("the host's colorMap fixes a series' colour by name, one per theme; others keep the palette", async ({ page }) => {
        const colorMap = { hardware: "#e3000f", Software: ["#287233", "#4caf50"] };
        let chartEl = await mount(page, { type: "bar" });
        const palette = await inChart(chartEl, drawnColors);
        chartEl = await mount(page, { type: "bar" }, { colorMap });
        const light = await inChart(chartEl, drawnColors);
        expect([light.Hardware, light.Software]).toEqual(["#e3000f", "#287233"]);
        // Services keeps the palette's colour of its place
        expect(light.Services).toBe(palette.Services);
        chartEl = await mount(page, { type: "bar" }, { colorMap, theme: "dark" });
        expect((await inChart(chartEl, drawnColors)).Software).toBe("#4caf50");
        // a pie colours its slices by name
        chartEl = await mount(page, { type: "pie" }, { colorMap: { north: "#123456" } });
        expect((await inChart(chartEl, drawnColors)).North).toBe("#123456");
    });

    test("Display, Colours: a colour picked for a series stays in the view and wins over the host's; Default gives it back", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" }, { colorMap: { Hardware: "#e3000f" } });
        const report = page.locator("#color-report");
        await menu(report, "chart-type");
        const colors = report.getByTestId("chart-colors");
        const hardware = colors.getByLabel("Colour of Hardware");
        // the field shows the colour the chart draws
        await expect(hardware).toHaveValue("#e3000f");
        await hardware.fill("#00aa00");
        await expect.poll(() => lastChart(page).then((c) => c?.colors)).toEqual([{ name: "Hardware", color: "#00aa00" }]);
        await settled(chartEl);
        expect((await inChart(chartEl, drawnColors)).Hardware).toBe("#00aa00");
        // Default: the host's colour again
        await colors.getByRole("button", { name: "Default: Hardware" }).click();
        await expect.poll(() => lastChart(page).then((c) => c?.colors)).toEqual([]);
        await settled(chartEl);
        expect((await inChart(chartEl, drawnColors)).Hardware).toBe("#e3000f");
    });

    test("Display, Share in the tooltip: a bar's share of its category, a slice's share of the pie", async ({ page }) => {
        let chartEl = await mount(page, { type: "bar" });
        const report = page.locator("#color-report");
        await hover(page, chartEl, await inChart(chartEl, barMiddle, { series: 2, index: 1 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30"]);
        // a new chart: one drawn again under an element hovered before does not name it (an older defect)
        chartEl = await mount(page, { type: "bar" });
        await menu(report, "chart-type");
        // a click on the switch's words, as a hand does
        await report.locator(".pk-switch").filter({ hasText: "Share in the tooltip" }).click();
        await expect.poll(() => lastChart(page).then((c) => c?.tooltipShare)).toBe(true);
        await page.keyboard.press("Escape");
        await settled(chartEl);
        await page.mouse.move(5, 5);
        // North's software: 30 of 60
        await hover(page, chartEl, await inChart(chartEl, barMiddle, { series: 2, index: 1 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30 50.0%"]);
        // a pie: North is 60 of 157
        chartEl = await mount(page, { type: "pie", tooltipShare: true });
        await hover(page, chartEl, await inChart(chartEl, sliceMiddle, { index: 1 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["Sum of Revenue", "North 60 38.2%"]);
    });
});
