// The chart's tooltip follows the pointer (#376): the element under it wins (a bar, a stacked segment
// with its stack's total, a line point), between elements every series (between stacked bars the total
// only); pie, donut and heatmap keep their item tooltip. The Display setting "All series" (#106,
// chart.tooltip "axis") shows every series wherever the pointer is. Real pointer input: the positions
// come from the chart's own layout (getItemLayout, convertToPixel), not from fixed fractions.
import { test, expect } from "./fixtures.js";

/**
 * Revenue per region and category. East sells no hardware: a series without a value at a category.
 * Stacked, North is 60 (20 + 10 + 30), South 45, East 52.
 */
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
// the categories (rows in their order) and the series (columns in theirs)
const EAST = 0;
const NORTH = 1;
const HARDWARE = 0;
const SERVICES = 1;
const SOFTWARE = 2;
const VALUES = [
    [null, 20, 15],
    [12, 10, 5],
    [40, 30, 25]
];

/** Mounts a report of ROWS at the top of the host page, with `chart` (and `view`) over VIEW's; mount again to change it. */
async function mount(page, chart, { theme = "light", view = {}, rows = ROWS } = {}) {
    await page.evaluate(
        async ({ rows, view, theme }) => {
            const React = await import("react");
            const { createRoot } = await import("react-dom/client");
            const { PivotReport } = await import("pivotkit-react");
            if (!window.__tooltipRoot) {
                const el = document.createElement("section");
                el.id = "tooltip-report";
                document.body.prepend(el);
                window.__tooltipRoot = createRoot(el);
                window.__tooltipViews = [];
            }
            // the report before is gone first, so nothing below reads its chart
            window.__tooltipRoot.render(null);
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            window.__tooltipRoot.render(React.createElement(PivotReport, { key: JSON.stringify(view.chart), theme, data: rows, height: 560, defaultView: view, onViewChange: (v) => window.__tooltipViews.push(v) }));
        },
        { rows, view: { ...VIEW, ...view, chart }, theme }
    );
    const chartEl = page.locator("#tooltip-report").getByTestId("pivot-chart");
    await expect(chartEl.locator("canvas").first()).toBeVisible();
    // drawn: the option has the series of this chart, and the first animation is over
    const drawn = { area: "line", donut: "pie" }[chart.type] ?? chart.type;
    await expect.poll(() => chartEl.evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        return getInstanceByDom(el)?.getOption().series?.[0]?.type;
    })).toBe(drawn);
    // the first animation is over: slices and bars stand where their layout says
    await expect.poll(() => chartEl.evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        return getInstanceByDom(el).getZr().animation.isFinished();
    })).toBe(true);
    await page.waitForTimeout(100);
    return chartEl;
}

/**
 * A point of the chart in the page: `at` runs in the page with the chart's ECharts instance and returns
 * [x, y] in the chart's own pixels (relative to its element).
 */
async function pointOf(chartEl, at, arg) {
    const [x, y] = await chartEl.evaluate(async (el, { at, arg }) => {
        const { getInstanceByDom } = await import("echarts/core");
        const chart = getInstanceByDom(el);
        return new Function("chart", "arg", `return (${at})(chart, arg);`)(chart, arg);
    }, { at: at.toString(), arg });
    const box = await chartEl.boundingBox();
    return { x: box.x + x, y: box.y + y };
}

/** The middle of a bar or a stacked segment, from the bar's own layout. */
const barMiddle = (chart, { series, index }) => {
    const l = chart.getModel().getSeriesByIndex(series).getData().getItemLayout(index);
    return [l.x + l.width / 2, l.y + l.height / 2];
};
/** A point of the value axis at `value`, a part of the way from a category to the next one. */
const between = (chart, { index, part, value }) => {
    const a = chart.convertToPixel({ xAxisIndex: 0 }, index);
    const b = chart.convertToPixel({ xAxisIndex: 0 }, index + 1);
    return [a + (b - a) * part, chart.convertToPixel({ yAxisIndex: 0 }, value)];
};
/** A point of a line: its value (the stacked one for a stacked area) at a category. */
const linePoint = (chart, { index, value }) => chart.convertToPixel({ gridIndex: 0 }, [index, value]);
/** The middle of a pie's or donut's slice. */
const sliceMiddle = (chart, { index }) => {
    const l = chart.getModel().getSeriesByIndex(0).getData().getItemLayout(index);
    const angle = (l.startAngle + l.endAngle) / 2;
    const r = (l.r0 + l.r) / 2;
    return [l.cx + r * Math.cos(angle), l.cy + r * Math.sin(angle)];
};
/** The middle of a heatmap's cell. */
const cellMiddle = (chart, { x, y }) => chart.convertToPixel({ seriesIndex: 0 }, [x, y]);

/** Moves the mouse onto a point, from a few pixels away, as a hand does. */
async function hover(page, { x, y }) {
    await page.mouse.move(x - 6, y + 5);
    await page.mouse.move(x, y, { steps: 3 });
}

/**
 * The tooltip shown, one entry per line ("North", "Hardware 20", "Total 60"); [] when none shows.
 * ECharts keeps a hidden tooltip in the chart's element: only a visible one counts.
 */
const tooltipOf = (chartEl) =>
    chartEl.evaluate((el) => {
        const tip = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
        if (!tip || getComputedStyle(tip).visibility === "hidden" || getComputedStyle(tip).display === "none" || Number(getComputedStyle(tip).opacity) === 0) {
            return [];
        }
        const box = tip.firstElementChild;
        return box ? [...box.children].map((row) => [...(row.children.length ? row.children : [row])].map((c) => c.textContent.trim()).filter(Boolean).join(" ")) : [];
    });

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

    test("a part below zero: the total is the sum of the parts", async ({ page }) => {
        const rows = ROWS.map((r) => (r.Region === "North" && r.Category === "Services" ? { ...r, Revenue: -10 } : r));
        const chartEl = await mount(page, { type: "bar", stacked: true }, { rows });
        await hover(page, await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH }));
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Software 30", "Total 40"]);
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

    test("Display, Tooltip, All series: every series wherever the pointer is, the hovered one first and in the strong weight, with the total", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true });
        const report = page.locator("#tooltip-report");
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("tooltip-auto")).toHaveAttribute("aria-pressed", "true");
        await report.getByTestId("tooltip-axis").click();
        await expect.poll(() => page.evaluate(() => window.__tooltipViews.at(-1)?.chart.tooltip)).toBe("axis");
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
    await report.getByTestId("chart-type").click();
    await report.getByTestId("chart-stacked").click();
    const chartEl = report.getByTestId("pivot-chart");
    await expect(chartEl.locator("canvas").first()).toBeVisible();
    await page.waitForTimeout(600);
    await hover(page, await pointOf(chartEl, barMiddle, { series: 0, index: 0 }));
    await expect.poll(async () => (await tooltipOf(chartEl)).length).toBe(3);
    const shown = await tooltipOf(chartEl);
    expect(shown[2]).toMatch(/^Total /);
    // five renders of the host later, the pointer still on the segment
    const renders = Number(await page.getByTestId("host-renders").textContent());
    await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(renders + 4);
    expect(await tooltipOf(chartEl)).toEqual(shown);
});

test("on a phone, a tap on a stacked segment shows that segment and the total, inside the chart", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false });
    const page = await context.newPage();
    const problems = [];
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
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
    expect(problems).toEqual([]);
    await context.close();
});

test("under a strict Content-Security-Policy: segments, the gap, bars, lines, areas and slices, without a violation", async ({ page }) => {
    // six charts swept by the pointer: slower than one hover
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("pages/element-csp.html");
    const el = page.locator("#strict");
    await expect(el.locator(".pk-root")).toBeVisible();
    const chartEl = el.getByTestId("pivot-chart");
    // the web component bundles its ECharts, so this page has no instance to ask: the pointer sweeps
    // across the plot and collects every tooltip it sees
    const sweep = async (rows) => {
        const box = await chartEl.boundingBox();
        const seen = new Set();
        for (const fy of rows) {
            for (let x = box.x + 40; x < box.x + box.width - 20; x += 14) {
                await page.mouse.move(x, box.y + box.height * fy);
                const tip = await tooltipOf(chartEl);
                if (tip.length) seen.add(tip.join(" | "));
            }
        }
        return [...seen];
    };
    const show = async (chart, view = {}) => {
        await page.evaluate(({ rows, view }) => {
            const r = document.getElementById("strict");
            r.data = rows;
            r.defaultView = view;
        }, { rows: ROWS, view: { ...VIEW, ...view, chart } });
        await expect(chartEl.locator("canvas").first()).toBeVisible();
        await page.waitForTimeout(600);
    };
    await show({ type: "bar", stacked: true });
    const bars = await sweep([0.55, 0.8]);
    expect(bars).toContain("North | Total 60");
    expect(bars.some((t) => /^North \| (Hardware 20|Services 10|Software 30) \| Total 60$/.test(t)), bars.join("\n")).toBe(true);
    expect(bars.some((t) => t.includes("|  |") || /Hardware $/.test(t)), bars.join("\n")).toBe(false);
    await show({ type: "bar" });
    const grouped = await sweep([0.6, 0.8]);
    expect(grouped).toContain("East | Services 12 | Software 40");
    expect(grouped.some((t) => /^North \| (Hardware 20|Services 10|Software 30)$/.test(t)), grouped.join("\n")).toBe(true);
    await show({ type: "line" });
    const lines = await sweep([0.3, 0.45, 0.6, 0.75]);
    expect(lines).toContain("East | Services 12 | Software 40");
    await show({ type: "area", stacked: true });
    const areas = await sweep([0.7, 0.85]);
    expect(areas).toContain("North | Hardware 20 | Services 10 | Software 30 | Total 60");
    for (const type of ["pie", "donut"]) {
        await show({ type }, { cols: [] });
        const slices = await sweep([0.4, 0.5, 0.6]);
        expect(slices.some((t) => /^Sum of Revenue \| (North 60|South 45|East 52)$/.test(t)), `${type}: ${slices.join("\n")}`).toBe(true);
    }
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
});
