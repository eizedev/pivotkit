// A report with a chart of revenue per region and category on the host page, and what every chart spec
// needs to read the chart ECharts drew: when it has settled, a function run with its instance, where its
// bars, slices and cells are, the pointer moved onto them, and the tooltip shown. Real pointer input:
// the positions come from the chart's own layout (getItemLayout, convertToPixel).
import { expect, twoFrames } from "../fixtures.js";
import { REVENUE } from "../../../packages/pivotkit-core/test/chart/fixtures.js";

/** Revenue per region and category (pivotkit-core's chart fixtures): East sells no hardware. */
export const ROWS = REVENUE;
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

/**
 * The report's height the chart specs' measures were taken at, the zones folded: on a phone a pixel
 * less, as its tabs are.
 * @param {import("@playwright/test").Page} page
 */
export const chartHeight = (page) => ((page.viewportSize()?.width ?? 1280) < 640 ? 572 : 573);

/**
 * Mounts a PivotReport at the top of the host page (pages/host.html), in a section of its own with
 * the id `id`; mount again with the same id to replace it. The report before is gone first, so
 * nothing reads its chart. The page keeps what the report reports: its views in window.__views, with
 * `cellClicks` its onCellClick calls in window.__cellClicks ({ row, col, count }), with `exports` its
 * onExport calls in window.__exports ({ kind, fileName, type }). window.__rerender(changes) renders
 * the same report again in place with some props changed (`theme`).
 * @param {import("@playwright/test").Page} page
 * @param {{ id: string, rows: object[], view: object, theme?: string, height: number, cellClicks?: boolean, exports?: boolean, props?: object }} report
 *   `props`: more props of PivotReport (colorMap, drillDown), as data
 */
export async function mountReport(page, { id, rows, view, theme = "light", height, cellClicks = false, exports = false, props = {} }) {
    await page.evaluate(
        async ({ id, rows, view, theme, height, cellClicks, exports, props }) => {
            const React = await import("react");
            const { createRoot } = await import("react-dom/client");
            const { PivotReport } = await import("pivotkit-react");
            window.__roots ??= {};
            if (!window.__roots[id]) {
                const el = document.createElement("section");
                el.id = id;
                document.body.prepend(el);
                window.__roots[id] = createRoot(el);
            }
            const root = window.__roots[id];
            root.render(null);
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            window.__views = [];
            window.__cellClicks = [];
            window.__exports = [];
            const all = {
                key: JSON.stringify({ view, theme }),
                theme,
                data: rows,
                height,
                defaultView: view,
                onViewChange: (v) => window.__views.push(v),
                ...(cellClicks ? { onCellClick: ({ row, col, count }) => window.__cellClicks.push({ row, col, count }) } : {}),
                ...(exports ? { onExport: (f) => void window.__exports.push({ kind: f.kind, fileName: f.fileName, type: f.blob.type }) } : {}),
                ...props
            };
            window.__rerender = (changes) => root.render(React.createElement(PivotReport, { ...all, ...changes }));
            root.render(React.createElement(PivotReport, all));
        },
        { id, rows, view, theme, height, cellClicks, exports, props }
    );
}

/**
 * The chart of a report mountReport mounted, once it is drawn: the option has a series (of `type`,
 * when given; an area is a line, a donut a pie), the first animation is over and the page has drawn it.
 * @param {import("@playwright/test").Page} page
 * @param {string} id
 * @param {string} [type]
 */
export async function chartOf(page, id, type) {
    const chartEl = page.locator(`#${id}`).getByTestId("pivot-chart");
    await expect(chartEl.locator("canvas").first()).toBeVisible();
    if (type) {
        const drawn = { area: "line", donut: "pie" }[type] ?? type;
        await expect.poll(() => chartEl.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            return getInstanceByDom(el)?.getOption().series?.[0]?.type;
        })).toBe(drawn);
    }
    // slices and bars stand where their layout says
    await settled(chartEl);
    await twoFrames(page);
    return chartEl;
}

/**
 * Mounts a report of ROWS with `chart` (and `view`) over VIEW's, at chartHeight; mount again to change it.
 * `drillDown`: the prop, left out when undefined.
 */
export async function mount(page, chart, { theme = "light", view = {}, rows = ROWS, cellClicks = false, drillDown } = {}) {
    await mountReport(page, { id: "tooltip-report", rows, view: { ...VIEW, ...view, chart }, theme, height: chartHeight(page), cellClicks, props: drillDown === undefined ? {} : { drillDown } });
    return chartOf(page, "tooltip-report", chart.type);
}

/** Waits until the chart has a series and its animation is over. */
export async function settled(chartEl) {
    await expect.poll(() => chartEl.evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        const chart = getInstanceByDom(el);
        return Boolean(chart?.getOption().series?.length) && chart.getZr().animation.isFinished();
    })).toBe(true);
}

/** Runs `at(chart, arg)` in the page with the chart's ECharts instance. */
export const inChart = (chartEl, at, arg) =>
    chartEl.evaluate(async (el, { at, arg }) => {
        const { getInstanceByDom } = await import("echarts/core");
        return new Function("chart", "arg", `return (${at})(chart, arg);`)(getInstanceByDom(el), arg);
    }, { at: at.toString(), arg });

/** A point of the chart (its own pixels) in the page. */
export async function inPage(chartEl, [x, y]) {
    const box = await chartEl.boundingBox();
    return { x: box.x + x, y: box.y + y };
}

/**
 * A point of the chart in the page: `at` runs in the page with the chart's ECharts instance and returns
 * [x, y] in the chart's own pixels (relative to its element).
 */
export const pointOf = async (chartEl, at, arg) => inPage(chartEl, await inChart(chartEl, at, arg));

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
