// Two chart types (#518) picked in Chart settings by real clicks: bars and lines (the first value as
// bars, the others as lines on an axis of their own) and a treemap (a tile per category, its label on a
// plate in the background colour, fill-labels.spec.js). The drawn marks come from the chart's own model.
import { installContrast } from "../contrast.js";
import { expect, test } from "../fixtures.js";
import { mountReport } from "./report.js";

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

/** Opens the host page at `width` and mounts a report of ROWS, 640 px high, with `view` as its starting view. */
async function mount(page, view, { theme = "light", width = 1440 } = {}) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("pages/host.html");
    await mountReport(page, { id: "types-report", rows: ROWS, view: { rows: ["Region"], display: "chart", ...view }, theme, height: 640 });
    return page.locator("#types-report");
}

/** The series ECharts drew: type, value axis and, for a treemap, its tiles and its labels' plate. */
const drawnSeries = (report) =>
    report.getByTestId("pivot-chart").evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        const chart = getInstanceByDom(el);
        if (!chart || !chart.getZr().animation.isFinished()) return null;
        const option = chart.getOption();
        return option.series.map((s) => ({ type: s.type, axis: s.yAxisIndex ?? 0, tiles: s.type === "treemap" ? s.data.map((d) => ({ name: d.name, fill: d.itemStyle?.color, own: d.label ?? null })) : null, plate: s.label?.rich?.plate ?? null, axes: (option.yAxis ?? []).length }));
    });

/** WCAG contrast of two opaque colours the page resolves. */
async function contrast(page, a, b) {
    await installContrast(page);
    return page.evaluate(([a, b]) => {
        const { parse, ratio } = window.__pkContrast;
        return ratio(parse(a), parse(b));
    }, [a, b]);
}

test("Chart settings offers bars and lines; with one value it is greyed out and says why; with two it draws bars and a line on its own axis", async ({ page }) => {
    let report = await mount(page, { values: [TWO[0]], chart: { type: "bar" } });
    await report.getByTestId("view-settings").click();
    const combo = report.getByTestId("chart-combo");
    await expect(combo).toBeDisabled();
    await expect(combo).toContainText("Bars and lines");
    await expect(combo).toContainText("Needs two values.");
    await expect(report.getByTestId("chart-treemap")).toBeEnabled();
    report = await mount(page, { values: TWO, chart: { type: "bar" } });
    await report.getByTestId("view-settings").click();
    await report.getByTestId("chart-combo").click();
    await expect.poll(() => page.evaluate(() => window.__views.at(-1)?.chart.type)).toBe("combo");
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
    test(`treemap at ${width} px, ${theme}: a tile per region, each label on a plate it reads on`, async ({ page }) => {
        const report = await mount(page, { values: [TWO[0]], chart: { type: "bar" } }, { theme, width });
        await report.getByTestId("view-settings").click();
        await report.getByTestId("chart-treemap").click();
        await expect.poll(async () => (await drawnSeries(report))?.[0]?.type).toBe("treemap");
        const [{ tiles, plate }] = await drawnSeries(report);
        expect(tiles.map((t) => t.name).sort()).toEqual(["Central", "East", "North", "South", "West"]);
        // every label the same: on a plate it reads on at 4.5:1, whatever the tile's colour. A tile's own
        // label sets only its padding (the tile's middle) and, too wide for a plate, no plate (fill-labels.spec.js)
        expect(tiles.flatMap((t) => Object.keys(t.own ?? {}).filter((k) => k !== "padding" && k !== "rich"))).toEqual([]);
        expect(tiles.filter((t) => t.own?.rich && t.own.rich.plate?.backgroundColor !== "transparent")).toEqual([]);
        const ratio = await contrast(page, plate.color, plate.backgroundColor);
        expect(ratio, `${plate.color} on ${plate.backgroundColor}`).toBeGreaterThanOrEqual(4.5);
        // no tip about pies: a treemap holds many parts
        await expect(report.getByText("A pie works for")).toHaveCount(0);
    });
}
