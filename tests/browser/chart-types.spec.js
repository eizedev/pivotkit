// Two chart types (#518) picked in Chart settings by real clicks: bars and lines (the first value as
// bars, the others as lines on an axis of their own) and a treemap (a tile per category, its label in
// the token colour that reads on it). The drawn marks come from the chart's own model.
import { test, expect } from "./fixtures.js";

/** Revenue and units of five regions: two values of very different sizes. */
const ROWS = [
    ["Central", 3_790_750, 16_240],
    ["West", 2_318_960, 11_000],
    ["North", 1_531_742, 2_362],
    ["South", 2_010_480, 12_507],
    ["East", 2_838_900, 2_800]
].map(([Region, Revenue, Units]) => ({ Region, Revenue, Units }));
const TWO = [
    { field: "Revenue", agg: "sum" },
    { field: "Units", agg: "sum" }
];

/** Mounts a report of ROWS with `view` as its starting view; mount again to change it. */
async function mount(page, view, { theme = "light", width = 1440 } = {}) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("pages/host.html");
    await page.evaluate(
        async ({ rows, view, theme }) => {
            const React = await import("react");
            const { createRoot } = await import("react-dom/client");
            const { PivotReport } = await import("pivotkit-react");
            const el = document.createElement("section");
            el.id = "types-report";
            document.body.prepend(el);
            window.__typesViews = [];
            createRoot(el).render(React.createElement(PivotReport, { theme, data: rows, height: 640, defaultView: view, onViewChange: (v) => window.__typesViews.push(v) }));
        },
        { rows: ROWS, view: { rows: ["Region"], display: "chart", ...view }, theme }
    );
    return page.locator("#types-report");
}

/** The series ECharts drew: type, value axis and, for a treemap, each tile's fill and label colour. */
const drawnSeries = (report) =>
    report.getByTestId("pivot-chart").evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        const chart = getInstanceByDom(el);
        if (!chart || !chart.getZr().animation.isFinished()) return null;
        const option = chart.getOption();
        return option.series.map((s) => ({ type: s.type, axis: s.yAxisIndex ?? 0, tiles: s.type === "treemap" ? s.data.map((d) => ({ name: d.name, fill: d.itemStyle?.color, ink: d.label?.color, outline: d.label?.textBorderColor ?? null })) : null, axes: (option.yAxis ?? []).length }));
    });

/** WCAG contrast of two colours the page resolves. */
const contrast = (page, a, b) =>
    page.evaluate(
        ([a, b]) => {
            const rgb = (c) => {
                const probe = document.createElement("span");
                probe.style.color = c;
                document.body.append(probe);
                const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
                probe.remove();
                return m;
            };
            const lum = (c) => {
                const [r, g, b] = rgb(c).map((v) => {
                    const s = v / 255;
                    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
                });
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            const [x, y] = [lum(a), lum(b)];
            return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        },
        [a, b]
    );

test("Chart settings offers bars and lines; with one value it is greyed out and says why; with two it draws bars and a line on its own axis", async ({ page }) => {
    let report = await mount(page, { values: [TWO[0]], chart: { type: "bar" } });
    await report.getByTestId("view-settings").click();
    const combo = report.getByTestId("chart-combo");
    await expect(combo).toBeDisabled();
    await expect(combo).toContainText("Bars and lines");
    await expect(combo).toContainText("Needs two fields in Values.");
    await expect(report.getByTestId("chart-treemap")).toBeEnabled();
    report = await mount(page, { values: TWO, chart: { type: "bar" } });
    await report.getByTestId("view-settings").click();
    await report.getByTestId("chart-combo").click();
    await expect.poll(() => page.evaluate(() => window.__typesViews.at(-1)?.chart.type)).toBe("combo");
    await expect.poll(async () => (await drawnSeries(report))?.map((s) => [s.type, s.axis])).toEqual([
        ["bar", 0],
        ["line", 1]
    ]);
    expect((await drawnSeries(report))[0].axes).toBe(2);
    // the text for screen readers names the type
    await expect(report.getByTestId("chart-summary")).toContainText("Bars and lines");
});

for (const [width, theme] of [
    [1440, "light"],
    [1440, "dark"],
    [390, "light"],
    [390, "dark"]
]) {
    test(`treemap at ${width} px, ${theme}: a tile per region, each label in the token colour that reads on its tile`, async ({ page }) => {
        const report = await mount(page, { values: [TWO[0]], chart: { type: "bar" } }, { theme, width });
        await report.getByTestId("view-settings").click();
        await report.getByTestId("chart-treemap").click();
        await expect.poll(async () => (await drawnSeries(report))?.[0]?.type).toBe("treemap");
        const [{ tiles }] = await drawnSeries(report);
        expect(tiles.map((t) => t.name).sort()).toEqual(["Central", "East", "North", "South", "West"]);
        // the label reads at 4.5:1 on its tile, or against the outline it gets where no token does
        for (const t of tiles) {
            const ratio = await contrast(page, t.ink, t.outline ?? t.fill);
            expect(ratio, `${t.name}: ${t.ink} on ${t.outline ?? t.fill}`).toBeGreaterThanOrEqual(4.5);
        }
        // no tip about pies: a treemap holds many parts
        await expect(report.getByText("A pie works for")).toHaveCount(0);
    });
}
