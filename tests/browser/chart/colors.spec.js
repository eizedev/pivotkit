// Chart extras (#54) with real pointer input: the chart image on the clipboard, a fixed colour per
// series or slice (the host's colorMap and the view's colours from Display), and the share of the total
// in the tooltip. Positions come from the chart's own layout.
import { expect, test, toolbar } from "../fixtures.js";
import { barMiddle, chartOf, hover, inChart, mountReport, pointOf, ROWS, settled, sliceMiddle, tooltipOf, VIEW } from "./report.js";

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

/** Mounts a report of ROWS with `chart` over `view`, 560 px high; mount again to change it. */
async function mount(page, chart, { theme = "light", colorMap, view = VIEW } = {}) {
    await mountReport(page, { id: "color-report", rows: ROWS, view: { ...view, chart }, theme, height: 560, exports: true, props: { colorMap } });
    return chartOf(page, "color-report");
}

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
const lastChart = (page) => page.evaluate(() => window.__views.at(-1)?.chart);

/** The colour ECharts draws each tile of a treemap with, by name (its root, named for the series, left out). */
const tileColors = (chart) => {
    const series = chart.getModel().getSeriesByIndex(0);
    const data = series.getData();
    const out = {};
    for (let i = 0; i < data.count(); i++) {
        if (data.getName(i) !== series.name) out[data.getName(i)] = data.getItemVisual(i, "style").fill;
    }
    return out;
};

/** #rrggbb as getComputedStyle writes it. */
const rgbOf = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

test.describe("chart extras (#54)", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await captureImageClipboard(page);
        await page.goto("pages/host.html");
    });

    test("Export, Copy chart image puts a PNG of the chart on the clipboard, after the host's onExport", async ({ page }) => {
        await mount(page, { type: "bar" });
        const report = page.locator("#color-report");
        await toolbar(report, "export");
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

    test("Chart settings › Entries: the colour beside a series, picked, stays in the view and wins over the host's; Default gives it back", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" }, { colorMap: { Hardware: "#e3000f" } });
        const report = page.locator("#color-report");
        await toolbar(report, "view-settings");
        await report.getByTestId("topic-series").click();
        const level = report.getByTestId("level-series");
        // each series: its switch, then its colour, as items of the menu
        const swatch = level.getByRole("menuitem", { name: "Colour of Hardware" });
        await level.getByRole("menuitemcheckbox", { name: "Hardware" }).focus();
        await page.keyboard.press("ArrowDown");
        await expect(swatch).toBeFocused();
        // the colour field starts from the colour the chart draws
        const field = report.getByTestId("series-0-color-field");
        await expect(field).toHaveValue("#e3000f");
        await field.fill("#00aa00");
        await expect.poll(() => lastChart(page).then((c) => c?.colors)).toEqual([{ name: "Hardware", color: "#00aa00" }]);
        await settled(chartEl);
        expect((await inChart(chartEl, drawnColors)).Hardware).toBe("#00aa00");
        // the level stays, the focus back on the colour
        await expect(swatch).toBeFocused();
        // Default: the host's colour again
        await level.getByRole("menuitem", { name: "Default: Hardware" }).click();
        await expect.poll(() => lastChart(page).then((c) => c?.colors)).toEqual([]);
        await settled(chartEl);
        expect((await inChart(chartEl, drawnColors)).Hardware).toBe("#e3000f");
    });

    test("Copy chart image on a page that refuses the clipboard offers the PNG as a download", async ({ page }) => {
        await mount(page, { type: "bar" });
        await page.evaluate(() => {
            navigator.clipboard.write = async () => {
                throw new DOMException("refused", "NotAllowedError");
            };
        });
        const report = page.locator("#color-report");
        await toolbar(report, "export");
        await report.getByTestId("export-copy-chart").click();
        const toast = report.locator(".pk-toasts");
        await expect(toast).toContainText("This page does not allow copying the image.");
        const download = page.waitForEvent("download");
        await toast.getByRole("button", { name: "Download PNG" }).click();
        expect((await download).suggestedFilename()).toBe("pivot.png");
        expect(await page.evaluate(() => window.__exports.map((e) => e.kind))).toEqual(["copy-chart", "png"]);
    });

    test("Chart settings › Entries: a click on the colour reaches the browser's colour field, named with its colour; the focus comes back after a pick", async ({ page }) => {
        // the native colour picker cannot be driven by a test: the field's own click stands for it, and
        // is stopped there so no picker opens
        const chartEl = await mount(page, { type: "line" }, { view: { ...VIEW, cols: [] } });
        const report = page.locator("#color-report");
        await toolbar(report, "view-settings");
        // one series: listed for its colour, its switch always on
        await report.getByTestId("topic-series").click();
        const level = report.getByTestId("level-series");
        await expect(level.getByRole("menuitemcheckbox", { name: "Sum of Revenue" })).toHaveAttribute("aria-disabled", "true");
        const field = report.getByTestId("series-0-color-field");
        await field.evaluate((el) => {
            window.__fieldClicks = 0;
            el.addEventListener("click", (e) => {
                window.__fieldClicks += 1;
                e.preventDefault();
            });
        });
        const drawn = (await inChart(chartEl, drawnColors))["Sum of Revenue"].toLowerCase();
        const swatch = level.getByRole("menuitem", { name: `Colour of Sum of Revenue, ${drawn}` });
        await expect(swatch).toHaveAttribute("aria-haspopup", "dialog");
        await swatch.click();
        await expect.poll(() => page.evaluate(() => window.__fieldClicks)).toBe(1);
        // a colour picked: the view has it, the focus is back on the swatch, named with the new colour
        await field.fill("#aa5500");
        await expect.poll(() => lastChart(page).then((c) => c?.colors)).toEqual([{ name: "Sum of Revenue", color: "#aa5500" }]);
        await expect(level.getByRole("menuitem", { name: "Colour of Sum of Revenue, #aa5500" })).toBeFocused();
    });

    test("Chart settings › Entries: each colour starts as the chart draws it; a view's colour for a name not shown can be removed", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", colors: [{ name: "Gone", color: "#123456" }] });
        const report = page.locator("#color-report");
        await toolbar(report, "view-settings");
        await expect(report.getByTestId("topic-state-series")).toContainText("3 of 3 shown");
        await report.getByTestId("topic-series").click();
        const level = report.getByTestId("level-series");
        // the palette's colours as the chart draws them
        const drawn = await inChart(chartEl, drawnColors);
        await expect(report.getByTestId("series-1-color-field")).toHaveValue(drawn.Services.toLowerCase());
        // the name no series has: under its own title, with Remove
        await expect(level).toContainText("Colours of names not shown");
        await level.getByRole("menuitem", { name: "Remove: Gone" }).click();
        await expect.poll(() => lastChart(page).then((c) => c?.colors)).toEqual([]);
    });

    test("Chart settings › Entries of a treemap (#1009): each dot shows its tile's colour; a pale colour set stays in its field", async ({ page }) => {
        const chartEl = await mount(page, { type: "treemap", colors: [{ name: "North", color: "#ffd700" }] }, { view: { rows: ["Region"], values: VIEW.values, display: "chart" } });
        const tiles = await inChart(chartEl, tileColors);
        expect(Object.keys(tiles).sort()).toEqual(["East", "North", "South"]);
        // the gold is too pale for the tiles' text: drawn darker
        expect(tiles.North).not.toBe("#ffd700");
        const report = page.locator("#color-report");
        await toolbar(report, "view-settings");
        await report.getByTestId("topic-series").click();
        const level = report.getByTestId("level-series");
        for (const [name, fill] of Object.entries(tiles)) {
            const swatch = level.getByRole("menuitem", { name: new RegExp(`^Colour of ${name}, `) });
            await expect(swatch.locator(".pk-dot")).toHaveCSS("background-color", rgbOf(fill));
        }
        // the palette's tiles: the field starts from the colour drawn
        await expect(level.getByRole("menuitem", { name: `Colour of East, ${tiles.East}` }).locator("xpath=following-sibling::input[1]")).toHaveValue(tiles.East);
        // North: the dot shows the tile (above), the field and the name keep the gold set
        const north = level.getByRole("menuitem", { name: "Colour of North, #ffd700" });
        await expect(north.locator("xpath=following-sibling::input[1]")).toHaveValue("#ffd700");
    });

    test("Display › Tooltip › Share in the tooltip: a bar's share of its category, a slice's share of the pie", async ({ page }) => {
        let chartEl = await mount(page, { type: "bar" });
        const report = page.locator("#color-report");
        await hover(page, await pointOf(chartEl, barMiddle, { series: 2, index: 1 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30"]);
        await toolbar(report, "view-settings");
        await report.getByTestId("topic-tooltip").click();
        await report.getByTestId("chart-tooltip-share").click();
        await expect.poll(() => lastChart(page).then((c) => c?.tooltipShare)).toBe(true);
        // a switch keeps its level; Escape goes back, then closes
        await expect(report.getByTestId("chart-tooltip-share")).toHaveAttribute("aria-checked", "true");
        await page.keyboard.press("Escape");
        await expect(report.getByTestId("topic-state-tooltip")).toContainText("Share in the tooltip");
        await page.keyboard.press("Escape");
        await settled(chartEl);
        await page.mouse.move(5, 5);
        // North's software: 30 of 60
        await hover(page, await pointOf(chartEl, barMiddle, { series: 2, index: 1 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30 50.0%"]);
        // a pie: North is 60 of 157
        chartEl = await mount(page, { type: "pie", tooltipShare: true });
        await hover(page, await pointOf(chartEl, sliceMiddle, { index: 1 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["Sum of Revenue", "North 60 38.2%"]);
    });
});

// The browser's own clipboard, not a stand-in: only Chromium lets a test grant reading it. It runs in
// CI only: on a developer's machine the browser may share the system's clipboard and replace what is on it
test("Chromium: Copy chart image leaves a PNG on the real clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "only Chromium grants clipboard-read to a test");
    test.skip(!process.env.CI, "CI only: it would replace the clipboard of the machine that runs it");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("pages/host.html");
    await mount(page, { type: "bar" });
    const report = page.locator("#color-report");
    await toolbar(report, "export");
    await report.getByTestId("export-copy-chart").click();
    await expect(report.locator(".pk-toasts")).toContainText("Chart copied as an image");
    const read = await page.evaluate(async () => {
        const [item] = await navigator.clipboard.read();
        const blob = await item.getType("image/png");
        return { types: item.types, size: blob.size, head: [...new Uint8Array(await blob.slice(0, 4).arrayBuffer())] };
    });
    expect(read.types).toContain("image/png");
    expect(read.head).toEqual([137, 80, 78, 71]);
    expect(read.size).toBeGreaterThan(1000);
});
