// The chart's tooltip follows the pointer (#376): the element under it wins (a bar, a stacked segment
// with its stack's total, a line point), between elements every series (between stacked bars the total
// only); pie, donut and heatmap keep their item tooltip. The Display setting "All series" (#106,
// chart.tooltip "axis") shows every series wherever the pointer is. Real pointer input: the positions
// come from the chart's own layout (getItemLayout, convertToPixel), not from fixed fractions.
import { test, expect } from "../fixtures.js";
import { ROWS, VIEW, EAST, NORTH, HARDWARE, SERVICES, SOFTWARE, VALUES, mount, pointOf, barMiddle, between, linePoint, sliceMiddle, cellMiddle, hover, settled, tooltipOf } from "./report.js";

/** The visual states of a bar (ECharts' "emphasis" when it lights up, "blur" when it fades). */
const statesOf = (chartEl, series, index) =>
    chartEl.evaluate(async (el, { series, index }) => {
        const { getInstanceByDom } = await import("echarts/core");
        const shape = getInstanceByDom(el).getModel().getSeriesByIndex(series).getData().getItemGraphicEl(index);
        return [...(shape?.currentStates ?? [])];
    }, { series, index });

test.describe("the chart's tooltip follows the pointer", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("pages/host.html");
    });

    test("stacked bars: a segment shows its series and the stack's total and lights up alone; the gap between bars the total only", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true });
        await hover(page, await pointOf(chartEl, barMiddle, { series: HARDWARE, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Hardware 20", "Total 60"]);
        // the hovered segment lights up; the other parts of its stack and its series elsewhere fade
        await expect.poll(() => statesOf(chartEl, HARDWARE, NORTH)).toContain("emphasis");
        expect(await statesOf(chartEl, SOFTWARE, NORTH)).not.toContain("emphasis");
        expect(await statesOf(chartEl, HARDWARE, 2)).toContain("blur");
        // the next segment up, at the same axis position: the tooltip follows
        await hover(page, await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
        // the gap after North's bar: the total only
        await hover(page, await pointOf(chartEl, between, { index: NORTH, part: 0.4, value: 3 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Total 60"]);
        // East has no hardware: its total adds what it has
        await hover(page, await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: EAST }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["East", "Software 40", "Total 52"]);
        // Software hidden in the legend: the total is the stack as it is drawn
        await chartEl.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            getInstanceByDom(el).dispatchAction({ type: "legendUnSelect", name: "Software" });
        });
        await page.mouse.move(10, 10);
        await hover(page, await pointOf(chartEl, between, { index: NORTH, part: 0.4, value: 3 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Total 30"]);
    });

    test("the total line has the size of the other lines, also in a report with a larger font", async ({ page }) => {
        await page.addStyleTag({ content: "#tooltip-report .pk-root { --pk-font-size: 18px; }" });
        const chartEl = await mount(page, { type: "bar", stacked: true });
        await hover(page, await pointOf(chartEl, barMiddle, { series: HARDWARE, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Hardware 20", "Total 60"]);
        const sizes = await chartEl.evaluate((el) => {
            const tip = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
            return [...tip.firstElementChild.children].slice(1).map((row) => getComputedStyle(row.children[1]).fontSize);
        });
        expect(sizes[1]).toBe(sizes[0]);
        expect(parseFloat(sizes[0])).toBeGreaterThan(16);
    });

    test("grouped bars: a bar shows its series only; between bars every series that has a value", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" });
        await hover(page, await pointOf(chartEl, barMiddle, { series: SERVICES, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Services 10"]);
        await expect.poll(() => statesOf(chartEl, SERVICES, NORTH)).toContain("emphasis");
        expect(await statesOf(chartEl, SOFTWARE, NORTH)).not.toContain("emphasis");
        await hover(page, await pointOf(chartEl, between, { index: EAST, part: 0.4, value: 2 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["East", "Services 12", "Software 40"]);
    });

    test("an average does not add up: a stacked segment shows no total, the gap every series", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true }, { view: { values: [{ field: "Revenue", agg: "average" }] } });
        await hover(page, await pointOf(chartEl, barMiddle, { series: HARDWARE, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Hardware 20.00"]);
        await hover(page, await pointOf(chartEl, between, { index: NORTH, part: 0.4, value: 3 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Hardware 20.00", "Services 10.00", "Software 30.00"]);
    });

    test("a sum shown as a rank does not add up: no total; shown as a share of the row total it does", async ({ page }) => {
        const ranked = await mount(page, { type: "bar", stacked: true }, { view: { values: [{ field: "Revenue", agg: "sum", showAs: { type: "rankDescending", axis: "rows" } }] } });
        await hover(page, await pointOf(ranked, barMiddle, { series: HARDWARE, index: NORTH }));
        // Hardware: North 20 is the first of the regions
        await expect.poll(() => tooltipOf(ranked)).toEqual(["North", "Hardware 1"]);
        const shares = await mount(page, { type: "bar", stacked: true }, { view: { values: [{ field: "Revenue", agg: "sum", showAs: { type: "percentOfRowTotal" } }] } });
        await hover(page, await pointOf(shares, barMiddle, { series: HARDWARE, index: NORTH }));
        await expect.poll(async () => (await tooltipOf(shares)).at(-1)).toMatch(/^Total 100(\.0+)?%$/);
    });

    test("lines: a point shows that point; the line between points every series, the one without a value left out", async ({ page }) => {
        const chartEl = await mount(page, { type: "line" });
        await hover(page, await pointOf(chartEl, linePoint, { index: NORTH, value: VALUES[SOFTWARE][NORTH] }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30"]);
        // on Software's line, a third of the way from East (40) to North (30)
        const a = await pointOf(chartEl, linePoint, { index: EAST, value: 40 });
        const b = await pointOf(chartEl, linePoint, { index: NORTH, value: 30 });
        await hover(page, { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 });
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["East", "Services 12", "Software 40"]);
    });

    test("stacked area: the fill shows every series and the total; a point that point and the total", async ({ page }) => {
        const chartEl = await mount(page, { type: "area", stacked: true });
        // inside Hardware's fill, off its points: a quarter of the way from North to South, low
        await hover(page, await pointOf(chartEl, between, { index: NORTH, part: 0.25, value: 4 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Hardware 20", "Services 10", "Software 30", "Total 60"]);
        // Services' point at South sits on Hardware's: 15 + 5
        await hover(page, await pointOf(chartEl, linePoint, { index: 2, value: 20 }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["South", "Services 5", "Total 45"]);
    });

    test("pie and donut: a slice shows that slice; a heatmap's cell that cell", async ({ page }) => {
        // a slice per region: the regions' totals
        for (const type of ["pie", "donut"]) {
            const chartEl = await mount(page, { type }, { view: { cols: [] } });
            await hover(page, await pointOf(chartEl, sliceMiddle, { index: NORTH }));
            await expect.poll(() => tooltipOf(chartEl), type).toEqual(["Sum of Revenue", "North 60"]);
        }
        const chartEl = await mount(page, { type: "heatmap" });
        await hover(page, await pointOf(chartEl, cellMiddle, { x: SERVICES, y: NORTH }));
        await expect.poll(async () => (await tooltipOf(chartEl)).slice(1)).toEqual(["North, Services 10"]);
    });

    test("pie, donut and heatmap with a field on Columns: the tooltip is titled by the value, not by the first column (#537)", async ({ page }) => {
        // a slice adds every column: North 60 is Hardware, Services and Software together
        for (const type of ["pie", "donut"]) {
            const chartEl = await mount(page, { type });
            await hover(page, await pointOf(chartEl, sliceMiddle, { index: NORTH }));
            await expect.poll(() => tooltipOf(chartEl), type).toEqual(["Sum of Revenue", "North 60"]);
        }
        const chartEl = await mount(page, { type: "heatmap" });
        await hover(page, await pointOf(chartEl, cellMiddle, { x: SERVICES, y: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["Sum of Revenue", "North, Services 10"]);
    });

    test("a click on a bar opens its menu, Show the rows its rows, and the tooltip goes (#538, #53)", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true });
        const at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await hover(page, at);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
        await page.mouse.click(at.x, at.y);
        await expect.poll(() => tooltipOf(chartEl)).toEqual([]);
        await page.getByTestId("point-rows").click();
        const panel = page.getByTestId("drill-panel");
        await expect(panel).toBeVisible();
        await expect(panel.getByTestId("drill-count")).toContainText("1");
        await expect.poll(() => tooltipOf(chartEl)).toEqual([]);
        // a click on the scrim beside the panel still closes it
        const scrim = await page.locator(".pk-drill-scrim").boundingBox();
        await page.mouse.click(scrim.x + 10, scrim.y + 10);
        await expect(panel).toHaveCount(0);
    });

    test("after the pointer left in one move, the same segment is named again (#576)", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true });
        const segment = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await hover(page, segment);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
        // out of the chart in one move, as a tap elsewhere does, and back onto the same segment
        await page.mouse.move(5, 5);
        await expect.poll(() => tooltipOf(chartEl)).toEqual([]);
        await hover(page, segment);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
    });

    test("after Display › Legend › Bottom draws the chart again, the segment hovered before is named again (#576)", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true });
        const report = page.locator("#tooltip-report");
        await hover(page, await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
        await report.getByTestId("view-settings").click();
        await report.getByTestId("topic-legend").click();
        await report.getByTestId("legend-bottom").click();
        await expect.poll(() => page.evaluate(() => window.__views.at(-1)?.chart.legend)).toBe("bottom");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(report.getByTestId("view-settings")).toHaveAttribute("aria-expanded", "false");
        await expect.poll(() => chartEl.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            return getInstanceByDom(el).getZr().animation.isFinished();
        })).toBe(true);
        // the legend moved: the segment stands elsewhere
        await hover(page, await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
    });

    test("a redraw under a resting pointer: the segment is named again as soon as the pointer moves (#576)", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true });
        const at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await hover(page, at);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
        // the same report in the dark theme: a new option, drawn in place, the pointer does not move
        await page.evaluate(() => window.__rerender({ theme: "dark" }));
        await expect(page.locator("#tooltip-report .pk-root")).toHaveAttribute("data-pk-theme", "dark");
        await settled(chartEl);
        // the tooltip of the old marks goes, or names the segment: never every series
        expect([[], ["North", "Software 30", "Total 60"]]).toContainEqual(await tooltipOf(chartEl));
        // a pixel's move on the segment names it
        await page.mouse.move(at.x + 1, at.y);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
    });

    test("Display, Tooltip, All series: every series wherever the pointer is, the hovered one first and in the strong weight, with the total", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true });
        const report = page.locator("#tooltip-report");
        await report.getByTestId("view-settings").click();
        await report.getByTestId("topic-tooltip").click();
        await expect(report.getByTestId("tooltip-auto")).toHaveAttribute("aria-checked", "true");
        await report.getByTestId("tooltip-axis").click();
        await expect.poll(() => page.evaluate(() => window.__views.at(-1)?.chart.tooltip)).toBe("axis");
        await page.keyboard.press("Escape");
        await hover(page, await pointOf(chartEl, barMiddle, { series: SERVICES, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Services 10", "Hardware 20", "Software 30", "Total 60"]);
        // the hovered series is set in the strong weight
        const weights = await chartEl.evaluate((el) => {
            const tip = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
            return [...tip.firstElementChild.children].slice(1, 4).map((row) => getComputedStyle(row.children[1]).fontWeight);
        });
        const strong = await page.locator("#tooltip-report .pk-root").evaluate((el) => getComputedStyle(el).getPropertyValue("--pk-weight-strong").trim());
        expect(weights).toEqual([strong, weights[1], weights[1]]);
        expect(weights[1]).not.toBe(strong);
        // the hovered bar still lights up alone
        await expect.poll(() => statesOf(chartEl, SERVICES, NORTH)).toContain("emphasis");
        expect(await statesOf(chartEl, SOFTWARE, NORTH)).not.toContain("emphasis");
    });
});

for (const [width, stacked] of [[1440, false], [390, false], [390, true]]) test(`15 series with long names at ${width} px${stacked ? ", stacked" : ""}: names end in "…", the tooltip stays inside the chart`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("pages/host.html");
    const names = Array.from({ length: 15 }, (_, i) => `A product category with a rather long name, number ${i + 1}`);
    const rows = ["North", "South"].flatMap((Region, r) => names.map((Category, i) => ({ Region, Category, Revenue: 10 + i + r })));
    // stacked: a line chart, whose fill shows every series and the total; else grouped bars
    const chartEl = await mount(page, stacked ? { type: "area", stacked: true } : { type: "bar" }, { rows });
    // the gap after North (the fill of a stacked area): every series there
    await hover(page, await pointOf(chartEl, between, { index: 0, part: 0.45, value: 1 }));
    await expect.poll(async () => (await tooltipOf(chartEl)).length).toBeGreaterThan(3);
    const shown = await tooltipOf(chartEl);
    expect(shown[0]).toBe("North");
    // every series, or the first ones and a line that says how many more: 15 in all; stacked, the
    // total last, and the cut line says the cut ones are in it
    const total = stacked ? shown.at(-1) : null;
    if (stacked) expect(total).toBe(`Total ${names.reduce((sum, _, i) => sum + 10 + i, 0)}`);
    const lines = stacked ? shown.slice(0, -1) : shown;
    const more = lines.at(-1).match(stacked ? /^\+(\d+) more \(in the total\)$/ : /^\+(\d+) more$/);
    expect(lines.length - 1 - (more ? 1 : 0) + (more ? Number(more[1]) : 0)).toBe(15);
    if (stacked && width === 390) expect(more, "a phone cuts the list").not.toBeNull();
    // ECharts slides the tooltip to its place: inside the chart once it is there
    const measure = () => chartEl.evaluate((el) => {
        const t = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
        const [c, r] = [el.getBoundingClientRect(), t.getBoundingClientRect()];
        // the series' names, not the total's
        const nameSpans = [...t.firstElementChild.children].map((row) => row.children[1]).filter((n) => n?.textContent.startsWith("A product"));
        return { inside: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1, cut: nameSpans.length > 0 && nameSpans.every((n) => n.scrollWidth > n.clientWidth) };
    });
    await expect.poll(async () => (await measure()).inside).toBe(true);
    const { cut } = await measure();
    // the long names end in "…"
    expect(cut).toBe(true);
});

test("a host that renders again every 200 ms keeps the segment's tooltip under a resting pointer", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("pages/host.html");
    const report = page.getByTestId("first");
    await report.getByTestId("show-chart").click();
    await report.getByTestId("view-settings").click();
    await report.getByTestId("chart-stacked").click();
    const chartEl = report.getByTestId("pivot-chart");
    await expect(chartEl.locator("canvas").first()).toBeVisible();
    await settled(chartEl);
    await hover(page, await pointOf(chartEl, barMiddle, { series: 0, index: 0 }));
    await expect.poll(async () => (await tooltipOf(chartEl)).length).toBe(3);
    const shown = await tooltipOf(chartEl);
    expect(shown[2]).toMatch(/^Total /);
    // five renders of the host later, the pointer still on the segment
    const renders = Number(await page.getByTestId("host-renders").textContent());
    await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(renders + 4);
    expect(await tooltipOf(chartEl)).toEqual(shown);
});

test.describe("a touch screen", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false });

    test("on a phone, a tap on a stacked segment shows that segment and the total, inside the chart", async ({ page }) => {
        await page.goto("pages/host.html");
        const chartEl = await mount(page, { type: "bar", stacked: true });
        const at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await page.touchscreen.tap(at.x, at.y);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
        const [box, tip] = await chartEl.evaluate((el) => {
            const t = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
            const r = (e) => e.getBoundingClientRect();
            return [r(el), r(t)].map(({ left, right, top, bottom }) => ({ left, right, top, bottom }));
        });
        expect(tip.left).toBeGreaterThanOrEqual(box.left - 1);
        expect(tip.right).toBeLessThanOrEqual(box.right + 1);
    });

    for (const type of ["bar", "heatmap"]) test(`on a phone, the first tap on a ${type === "bar" ? "stacked segment" : "heatmap cell"} shows its tooltip, a second tap opens its menu, Show the rows its rows, and the tooltip goes (#538, #53)`, async ({ page }) => {
        await page.goto("pages/host.html");
        const chartEl = await mount(page, type === "bar" ? { type: "bar", stacked: true } : { type: "heatmap" });
        const at = type === "bar" ? await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH }) : await pointOf(chartEl, cellMiddle, { x: SOFTWARE, y: NORTH });
        const tip = type === "bar" ? ["North", "Software 30", "Total 60"] : ["Sum of Revenue", "North, Software 30"];
        const panel = page.getByTestId("drill-panel");
        await page.touchscreen.tap(at.x, at.y);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(tip);
        // the first tap only shows the tooltip: no panel, also a moment later
        await page.waitForTimeout(400);
        await expect(panel).toHaveCount(0);
        // a tap beside every element (the chart's top left corner), then on the same element: its tooltip again, no panel
        const box = await chartEl.boundingBox();
        await page.touchscreen.tap(box.x + 6, box.y + 6);
        await page.touchscreen.tap(at.x, at.y);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(tip);
        // no panel, also a moment later
        await page.waitForTimeout(400);
        await expect(panel).toHaveCount(0);
        // another element first: its tooltip; then a second tap on it opens its rows
        const other = type === "bar" ? await pointOf(chartEl, barMiddle, { series: HARDWARE, index: NORTH }) : await pointOf(chartEl, cellMiddle, { x: HARDWARE, y: NORTH });
        await page.touchscreen.tap(other.x, other.y);
        await expect.poll(async () => (await tooltipOf(chartEl)).join(" ")).toContain("Hardware 20");
        // no panel, also a moment later
        await page.waitForTimeout(400);
        await expect(panel).toHaveCount(0);
        await page.touchscreen.tap(other.x, other.y);
        // the second tap opens the element's menu; the click a phone sends after the tap does not close it
        await page.waitForTimeout(400);
        await expect(page.getByTestId("point-rows")).toBeVisible();
        await page.getByTestId("point-rows").tap();
        await expect(panel).toBeVisible();
        // the click a phone sends after the tap lands on the panel's scrim: the panel stays, the tooltip is gone
        await page.waitForTimeout(400);
        await expect(panel).toBeVisible();
        await expect(panel).toContainText("Hardware");
        await expect.poll(() => tooltipOf(chartEl)).toEqual([]);
    });

    test("on a phone: the menu on the second tap only, onCellClick on Show the rows; a tap outside the chart starts over; a mouse's double click opens at once (#538, #53)", async ({ page }) => {
        await page.goto("pages/host.html");
        const chartEl = await mount(page, { type: "bar", stacked: true }, { cellClicks: true });
        const at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        const panel = page.getByTestId("drill-panel");
        const clicks = () => page.evaluate(() => window.__cellClicks.length);
        await page.touchscreen.tap(at.x, at.y);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
        // no call, also a moment later
        await page.waitForTimeout(400);
        expect(await clicks()).toBe(0);
        // a tap outside the chart (the page below it), then on the same segment: its tooltip, no rows
        const box = await chartEl.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + 60);
        await page.touchscreen.tap(at.x, at.y);
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 60"]);
        // no rows, also a moment later
        await page.waitForTimeout(400);
        await expect(panel).toHaveCount(0);
        expect(await clicks()).toBe(0);
        // the second tap: the segment's menu, and no call yet; Show the rows: one call, with its rows
        await page.touchscreen.tap(at.x, at.y);
        await expect(page.getByTestId("point-rows")).toBeVisible();
        expect(await clicks()).toBe(0);
        await page.getByTestId("point-rows").tap();
        await expect(panel).toBeVisible();
        // one call, also after the click a phone sends after the tap
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => window.__cellClicks)).toEqual([{ row: ["North"], col: ["Software"], count: 1 }]);
        // a press that starts on the panel and ends on the scrim keeps the panel open
        const p = await panel.boundingBox();
        const scrim = await page.locator(".pk-drill-scrim").boundingBox();
        await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
        await page.mouse.down();
        await page.mouse.move(scrim.x + 4, scrim.y + 4, { steps: 4 });
        await page.mouse.up();
        // the panel stays, also a moment later
        await page.waitForTimeout(300);
        await expect(panel).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        // the same device with a mouse: a double click opens the rows at once
        const hw = await pointOf(chartEl, barMiddle, { series: HARDWARE, index: NORTH });
        await page.mouse.dblclick(hw.x, hw.y);
        await expect(panel).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__cellClicks.length)).toBe(2);
    });
});

/**
 * The strict CSP page (the web component, which bundles its own ECharts, so there is no instance to
 * ask for positions): the pointer sweeps along lines across the plot. A MutationObserver in the page
 * keeps every tooltip text ECharts writes, so a sweep reads the page once at the end, not after every
 * position.
 */
const CSP_CASES = [
    {
        name: "stacked bars: a segment with its total, the gap the total only",
        chart: { type: "bar", stacked: true },
        rows: [0.55, 0.8],
        check: (seen) => {
            expect(seen).toContain("North | Total 60");
            expect(seen.some((t) => /^North \| (Hardware 20|Services 10|Software 30) \| Total 60$/.test(t)), seen.join("\n")).toBe(true);
            expect(seen.some((t) => t.includes("|  |") || /Hardware $/.test(t)), seen.join("\n")).toBe(false);
        }
    },
    {
        name: "grouped bars: a bar alone, between bars every series",
        chart: { type: "bar" },
        rows: [0.8],
        check: (seen) => {
            expect(seen).toContain("East | Services 12 | Software 40");
            expect(seen.some((t) => /^North \| (Hardware 20|Services 10|Software 30)$/.test(t)), seen.join("\n")).toBe(true);
        }
    },
    {
        name: "lines: every series between the points",
        chart: { type: "line" },
        rows: [0.45, 0.85],
        check: (seen) => expect(seen).toContain("East | Services 12 | Software 40")
    },
    {
        name: "stacked area: the fill every series and the total",
        chart: { type: "area", stacked: true },
        rows: [0.8],
        check: (seen) => expect(seen).toContain("North | Hardware 20 | Services 10 | Software 30 | Total 60")
    },
    ...["pie", "donut"].map((type) => ({
        name: `${type}: a slice`,
        chart: { type },
        view: { cols: [] },
        rows: [0.5],
        check: (seen) => expect(seen.some((t) => /^Sum of Revenue \| (North 60|South 45|East 52)$/.test(t)), seen.join("\n")).toBe(true)
    }))
];

for (const { name, chart, view = {}, rows, check } of CSP_CASES) {
    test(`under a strict Content-Security-Policy, ${name}, without a violation`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        // no animation (--pk-duration 0ms): the marks stand where they end at the first frame
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("pages/element-csp.html");
        const el = page.locator("#strict");
        await expect(el.locator(".pk-root")).toBeVisible();
        await page.evaluate(({ rows, view }) => {
            const r = document.getElementById("strict");
            r.data = rows;
            r.defaultView = view;
        }, { rows: ROWS, view: { ...VIEW, ...view, chart } });
        const chartEl = el.getByTestId("pivot-chart");
        await expect(chartEl.locator("canvas").first()).toBeVisible();
        // every tooltip text written into the chart, as "North | Hardware 20 | Total 60"
        await chartEl.evaluate((node) => {
            const seen = new Set();
            const read = () => {
                const tip = [...node.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
                const box = tip?.firstElementChild;
                if (box) {
                    seen.add([...box.children].map((row) => [...(row.children.length ? row.children : [row])].map((c) => c.textContent.trim()).filter(Boolean).join(" ")).join(" | "));
                }
            };
            new MutationObserver(read).observe(node, { childList: true, subtree: true, characterData: true });
            window.__tooltips = seen;
        });
        // drawn and settled: the chart draws again when its box settles (the report lays itself out),
        // so the sweep waits until two reads of the canvas, a few frames apart, are the same picture
        let last = "";
        await expect.poll(async () => {
            const now = await chartEl.locator("canvas").first().evaluate(async (c) => {
                await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
                // a small copy to read from (reading the chart's own canvas again and again makes
                // Chromium warn): enough to see a mark move
                const copy = document.createElement("canvas");
                copy.width = 240;
                copy.height = 120;
                const ctx = copy.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(c, 0, 0, copy.width, copy.height);
                const { data } = ctx.getImageData(0, 0, copy.width, copy.height);
                let sum = 0;
                let marks = 0;
                for (let i = 3; i < data.length; i += 4) {
                    sum = (sum * 31 + data[i - 3] + data[i - 2] * 7 + data[i - 1] * 13 + data[i]) % 1_000_000_007;
                    marks += data[i] > 0 ? 1 : 0;
                }
                return marks ? `${c.width}x${c.height}:${sum}` : "";
            });
            const same = now !== "" && now === last;
            last = now;
            return same;
        }, { intervals: [100, 100, 200, 200, 400] }).toBe(true);
        const box = await chartEl.boundingBox();
        for (const fy of rows) {
            const y = box.y + box.height * fy;
            // a move every 16 px, each its own event (a move with steps can reach the page as fewer
            // events, so a slice can be passed over): narrower than a bar (48 px) and a slice
            for (let x = box.x + 40; x < box.x + box.width - 20; x += 16) {
                await page.mouse.move(x, y);
            }
        }
        // the last position's tooltip is written: the observer has seen the sweep
        const seen = await page.evaluate(() => [...window.__tooltips]);
        check(seen);
        expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });
}
