// A report with a chart of revenue per region and category on the host page, and where its elements
// are: shared by the specs that click, tap or point at a chart's bars, slices and cells. Real pointer
// input: the positions come from the chart's own layout (getItemLayout, convertToPixel).
import { expect } from "./fixtures.js";

/**
 * Revenue per region and category. East sells no hardware: a series without a value at a category.
 * Stacked, North is 60 (20 + 10 + 30), South 45, East 52.
 */
export const ROWS = [
    { Region: "North", Category: "Hardware", Revenue: 20 },
    { Region: "North", Category: "Services", Revenue: 10 },
    { Region: "North", Category: "Software", Revenue: 30 },
    { Region: "South", Category: "Hardware", Revenue: 15 },
    { Region: "South", Category: "Services", Revenue: 5 },
    { Region: "South", Category: "Software", Revenue: 25 },
    { Region: "East", Category: "Services", Revenue: 12 },
    { Region: "East", Category: "Software", Revenue: 40 }
];
export const VIEW = { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], display: "chart" };
// the categories (rows in their order) and the series (columns in theirs)
export const EAST = 0;
export const NORTH = 1;
export const HARDWARE = 0;
export const SERVICES = 1;
export const SOFTWARE = 2;
export const VALUES = [
    [null, 20, 15],
    [12, 10, 5],
    [40, 30, 25]
];

/** Mounts a report of ROWS at the top of the host page, with `chart` (and `view`) over VIEW's; mount again to change it. */
export async function mount(page, chart, { theme = "light", view = {}, rows = ROWS, cellClicks = false } = {}) {
    await page.evaluate(
        async ({ rows, view, theme, cellClicks }) => {
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
            window.__cellClicks = [];
            // onCellClick's calls, as row, column and count
            const onCellClick = cellClicks ? ({ row, col, count }) => window.__cellClicks.push({ row, col, count }) : undefined;
            // the chart's height the measures below were taken at, the zones folded: their heading
            // and the tabs take 13 px more than before, on a phone 12
            const height = window.innerWidth < 640 ? 572 : 573;
            // what a test needs to render the same report again in place
            Object.assign(window, { __tooltipChart: view.chart, __tooltipRows: rows, __tooltipHeight: height, __tooltipView: view });
            window.__tooltipRoot.render(React.createElement(PivotReport, { key: JSON.stringify(view.chart), theme, data: rows, height, defaultView: view, onCellClick, onViewChange: (v) => window.__tooltipViews.push(v) }));
        },
        { rows, view: { ...VIEW, ...view, chart }, theme, cellClicks }
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
export async function pointOf(chartEl, at, arg) {
    const [x, y] = await chartEl.evaluate(async (el, { at, arg }) => {
        const { getInstanceByDom } = await import("echarts/core");
        const chart = getInstanceByDom(el);
        return new Function("chart", "arg", `return (${at})(chart, arg);`)(chart, arg);
    }, { at: at.toString(), arg });
    const box = await chartEl.boundingBox();
    return { x: box.x + x, y: box.y + y };
}

/** The middle of a bar or a stacked segment, from the bar's own layout. */
export const barMiddle = (chart, { series, index }) => {
    const l = chart.getModel().getSeriesByIndex(series).getData().getItemLayout(index);
    return [l.x + l.width / 2, l.y + l.height / 2];
};
/** A point of the value axis at `value`, a part of the way from a category to the next one. */
export const between = (chart, { index, part, value }) => {
    const a = chart.convertToPixel({ xAxisIndex: 0 }, index);
    const b = chart.convertToPixel({ xAxisIndex: 0 }, index + 1);
    return [a + (b - a) * part, chart.convertToPixel({ yAxisIndex: 0 }, value)];
};
/** A point of a line: its value (the stacked one for a stacked area) at a category. */
export const linePoint = (chart, { index, value }) => chart.convertToPixel({ gridIndex: 0 }, [index, value]);
/** The middle of a pie's or donut's slice. */
export const sliceMiddle = (chart, { index }) => {
    const l = chart.getModel().getSeriesByIndex(0).getData().getItemLayout(index);
    const angle = (l.startAngle + l.endAngle) / 2;
    const r = (l.r0 + l.r) / 2;
    return [l.cx + r * Math.cos(angle), l.cy + r * Math.sin(angle)];
};
/** The middle of a heatmap's cell. */
export const cellMiddle = (chart, { x, y }) => chart.convertToPixel({ seriesIndex: 0 }, [x, y]);

/** Moves the mouse onto a point, from a few pixels away, as a hand does. */
export async function hover(page, { x, y }) {
    await page.mouse.move(x - 6, y + 5);
    await page.mouse.move(x, y, { steps: 3 });
}

/**
 * The tooltip shown, one entry per line ("North", "Hardware 20", "Total 60"); [] when none shows.
 * ECharts keeps a hidden tooltip in the chart's element: only a visible one counts.
 */
export const tooltipOf = (chartEl) =>
    chartEl.evaluate((el) => {
        const tip = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
        if (!tip || getComputedStyle(tip).visibility === "hidden" || getComputedStyle(tip).display === "none" || Number(getComputedStyle(tip).opacity) === 0) {
            return [];
        }
        const box = tip.firstElementChild;
        return box ? [...box.children].map((row) => [...(row.children.length ? row.children : [row])].map((c) => c.textContent.trim()).filter(Boolean).join(" ")) : [];
    });
