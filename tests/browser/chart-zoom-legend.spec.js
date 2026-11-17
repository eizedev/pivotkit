// The chart's zoom slider, legend toggle and 100 % stacks (#36), with real pointer input. The positions
// come from the chart's own layout (getItemLayout, the legend's and the slider's elements), not from
// fixed fractions.
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
/** 40 countries with long names: a phone's chart cannot write each one. */
const COUNTRIES = Array.from({ length: 40 }, (_, i) => ({ Country: `Country number ${String(i + 1).padStart(2, "0")}`, Units: 10 + ((i * 7) % 13) }));
const COUNTRY_VIEW = { rows: ["Country"], cols: [], values: [{ field: "Units", agg: "sum" }], display: "chart" };

/** Mounts a report at the top of the host page; mount again to change it. */
async function mount(page, chart, { view = VIEW, rows = ROWS, theme = "light" } = {}) {
    await page.evaluate(
        async ({ rows, view, theme }) => {
            const React = await import("react");
            const { createRoot } = await import("react-dom/client");
            const { PivotReport } = await import("pivotkit-react");
            if (!window.__zoomRoot) {
                const el = document.createElement("section");
                el.id = "zoom-report";
                document.body.prepend(el);
                window.__zoomRoot = createRoot(el);
            }
            window.__zoomRoot.render(null);
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            window.__zoomViews = [];
            window.__zoomRoot.render(React.createElement(PivotReport, { key: JSON.stringify(view), theme, data: rows, height: 560, defaultView: view, onViewChange: (v) => window.__zoomViews.push(v) }));
        },
        { rows, view: { ...view, chart }, theme }
    );
    const chartEl = page.locator("#zoom-report").getByTestId("pivot-chart");
    await expect(chartEl.locator("canvas").first()).toBeVisible();
    await settled(chartEl);
    return chartEl;
}

/** Waits until ECharts has drawn and its animation is over. */
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

/** A point of the chart (its own pixels) in the page. */
async function inPage(chartEl, [x, y]) {
    const box = await chartEl.boundingBox();
    return { x: box.x + x, y: box.y + y };
}

/** The middle of a legend entry's text, from the legend's own drawing. */
const legendEntry = (chart, name) => {
    const view = chart.getViewOfComponentModel(chart.getModel().getComponent("legend"));
    let found = null;
    view.group.traverse((el) => {
        if (!found && el.type === "text" && el.style?.text === name) {
            const r = el.getBoundingRect();
            const [x, y] = el.transformCoordToGlobal(r.x + r.width / 2, r.y + r.height / 2);
            found = [x, y];
        }
    });
    return found;
};
/** The middle of a bar or a stacked segment. */
const barMiddle = (chart, { series, index }) => {
    const l = chart.getModel().getSeriesByIndex(series).getData().getItemLayout(index);
    return [l.x + l.width / 2, l.y + l.height / 2];
};
/** The height of a bar or segment, px. */
const barHeight = (chart, { series, index }) => Math.abs(chart.getModel().getSeriesByIndex(series).getData().getItemLayout(index).height);
/** Which series the legend shows. */
const selected = (chart) => chart.getModel().getComponent("legend").option.selected ?? {};
/** The slider's window (first and last category shown) and where its moving bar sits. */
const sliderOf = (chart) => {
    const zoom = chart.getModel().getComponent("dataZoom");
    if (!zoom) return null;
    const [start, end] = zoom.getValueRange();
    const view = chart.getViewOfComponentModel(zoom);
    const r = view._displayables?.filler?.getBoundingRect();
    const [x, y] = view._displayables.filler.transformCoordToGlobal(r.x + r.width / 2, r.y + r.height / 2);
    return { start, end, filler: [x, y], width: r.width };
};

/** The middle of the slider's end handle (`which` 0: start, 1: end), and the slider's thickness. */
const sliderHandle = (chart, which) => {
    const zoom = chart.getModel().getComponent("dataZoom");
    const view = chart.getViewOfComponentModel(zoom);
    const handle = view._displayables.handles[which];
    const r = handle.getBoundingRect();
    const [x, y] = handle.transformCoordToGlobal(r.x + r.width / 2, r.y + r.height / 2);
    return { at: [x, y], size: zoom.option.height };
};

/** The tooltip shown, one entry per line ([] when none shows). */
const tooltipOf = (chartEl) =>
    chartEl.evaluate((el) => {
        const tip = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
        if (!tip || getComputedStyle(tip).visibility === "hidden" || getComputedStyle(tip).display === "none" || Number(getComputedStyle(tip).opacity) === 0) {
            return [];
        }
        const box = tip.firstElementChild;
        return box ? [...box.children].map((row) => [...(row.children.length ? row.children : [row])].map((c) => c.textContent.trim()).filter(Boolean).join(" ")) : [];
    });

/** Opens the chart type menu: its button, or its entry in "More" on a narrow report. */
async function chartMenu(report) {
    const own = report.getByTestId("chart-type");
    if (await own.isVisible()) {
        await own.click();
    } else {
        await report.getByTestId("more").click();
        await report.getByTestId("more-chart-type").click();
    }
    await expect(report.locator(".pk-popover")).toBeVisible();
}

/** Waits until the slider has moved and stays where the drag left it (ECharts follows a drag in throttled steps). */
async function stillAfterDrag(page, chartEl) {
    await expect.poll(async () => {
        const a = (await inChart(chartEl, sliderOf)).start;
        await page.evaluate(() => new Promise((done) => setTimeout(done, 150)));
        const b = (await inChart(chartEl, sliderOf)).start;
        return a > 0 && a === b;
    }).toBe(true);
}

const lastView = (page) => page.evaluate(() => window.__zoomViews.at(-1)?.chart);

test.describe("the chart's legend, zoom slider and 100 % stacks (#36)", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("pages/host.html");
    });

    test("a click on a legend entry hides its series: kept in the view, said to a screen reader, kept on a redraw, undone with Undo", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" });
        const report = page.locator("#zoom-report");
        const at = await inPage(chartEl, await inChart(chartEl, legendEntry, "Services"));
        await page.mouse.click(at.x, at.y);
        await expect.poll(() => lastView(page).then((c) => c?.hidden)).toEqual(["Services"]);
        await expect(report.locator(".pk-toasts")).toContainText("Services hidden");
        await settled(chartEl);
        expect(await inChart(chartEl, selected)).toEqual({ Services: false });
        // a redraw (a narrower window) keeps it hidden
        await page.setViewportSize({ width: 1000, height: 900 });
        await settled(chartEl);
        expect(await inChart(chartEl, selected)).toEqual({ Services: false });
        // the Display settings list it unchecked; a click there shows it again
        await chartMenu(report);
        const list = report.getByTestId("chart-series-list");
        await expect(list.getByRole("checkbox", { name: "Services" })).not.toBeChecked();
        await expect(list.getByRole("checkbox", { name: "Hardware" })).toBeChecked();
        await list.getByRole("checkbox", { name: "Services" }).click();
        await expect.poll(() => lastView(page).then((c) => c?.hidden)).toEqual([]);
        await list.getByRole("checkbox", { name: "Software" }).click();
        await expect.poll(() => lastView(page).then((c) => c?.hidden)).toEqual(["Software"]);
        await page.keyboard.press("Escape");
        await settled(chartEl);
        expect(await inChart(chartEl, selected)).toEqual({ Software: false });
        // Undo brings Software back
        await report.getByTestId("undo").click();
        await expect.poll(() => lastView(page).then((c) => c?.hidden)).toEqual([]);
    });

    test("a pie's slices hide and show from the legend too", async ({ page }) => {
        const chartEl = await mount(page, { type: "pie" });
        const at = await inPage(chartEl, await inChart(chartEl, legendEntry, "North"));
        await page.mouse.click(at.x, at.y);
        await expect.poll(() => lastView(page).then((c) => c?.hidden)).toEqual(["North"]);
        await expect(page.locator("#zoom-report .pk-toasts")).toContainText("North hidden");
        await page.mouse.click(at.x, at.y);
        await expect.poll(() => lastView(page).then((c) => c?.hidden)).toEqual([]);
        await expect(page.locator("#zoom-report .pk-toasts")).toContainText("North shown");
    });

    test("Display, Stacked to 100 %: every stack fills the axis; a segment's tooltip has its value, its share and the stack's total", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", stacked: true });
        const report = page.locator("#zoom-report");
        // East (52) and North (60) differ in height before
        const before = await Promise.all([0, 1].map((index) => inChart(chartEl, (chart, index) => [0, 1, 2].reduce((h, series) => h + Math.abs(chart.getModel().getSeriesByIndex(series).getData().getItemLayout(index).height || 0), 0), index)));
        expect(Math.abs(before[0] - before[1])).toBeGreaterThan(5);
        await chartMenu(report);
        // a click on the switch's words, as a hand does
        await report.locator(".pk-switch").filter({ hasText: "Stacked to 100 %" }).click();
        await expect.poll(() => lastView(page).then((c) => c?.stackPercent)).toBe(true);
        await page.keyboard.press("Escape");
        await settled(chartEl);
        const after = await Promise.all([0, 1].map((index) => inChart(chartEl, (chart, index) => [0, 1, 2].reduce((h, series) => h + Math.abs(chart.getModel().getSeriesByIndex(series).getData().getItemLayout(index).height || 0), 0), index)));
        expect(Math.abs(after[0] - after[1])).toBeLessThan(1.5);
        // North's hardware: 20 of 60
        const middle = await inPage(chartEl, await inChart(chartEl, barMiddle, { series: 0, index: 1 }));
        await page.mouse.move(middle.x - 6, middle.y + 5);
        await page.mouse.move(middle.x, middle.y, { steps: 3 });
        await expect.poll(() => tooltipOf(chartEl)).toEqual(["North", "Hardware 20 33.3%", "Total 60"]);
        // Software hidden: North's hardware is 20 of 30, two thirds of the axis
        const legend = await inPage(chartEl, await inChart(chartEl, legendEntry, "Software"));
        await page.mouse.click(legend.x, legend.y);
        await expect.poll(() => lastView(page).then((c) => c?.hidden)).toEqual(["Software"]);
        await settled(chartEl);
        const plot = await inChart(chartEl, (chart) => Math.abs(chart.convertToPixel({ yAxisIndex: 0 }, 0) - chart.convertToPixel({ yAxisIndex: 0 }, 100)));
        expect(Math.abs((await inChart(chartEl, barHeight, { series: 0, index: 1 })) / plot - 2 / 3)).toBeLessThan(0.01);
    });

    test("a phone's chart of 40 countries gets a zoom slider; dragging it moves the window, which a redraw keeps; Off draws them all", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const chartEl = await mount(page, { type: "bar" }, { view: COUNTRY_VIEW, rows: COUNTRIES });
        const report = page.locator("#zoom-report");
        const first = await inChart(chartEl, sliderOf);
        expect(first.start).toBe(0);
        expect(first.end).toBeLessThan(39);
        // the window's labels are all written: no "one label in every n" note
        await expect(report.getByTestId("axis-note")).toHaveCount(0);
        // drag the slider's moving bar to the right with the mouse
        const from = await inPage(chartEl, first.filler);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x + 80, from.y, { steps: 8 });
        await page.mouse.up();
        await stillAfterDrag(page, chartEl);
        const moved = await inChart(chartEl, sliderOf);
        // the window keeps its size while it moves
        expect(moved.end - moved.start).toBe(first.end - first.start);
        await chartMenu(report);
        await report.getByTestId("zoom-off").click();
        await expect.poll(() => lastView(page).then((c) => c?.zoom)).toBe("off");
        await page.keyboard.press("Escape");
        await settled(chartEl);
        expect(await inChart(chartEl, sliderOf)).toBe(null);
        await expect(report.getByTestId("axis-note")).toBeVisible();
    });

    test("the zoom window stays while the chart is drawn again for a new size", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const chartEl = await mount(page, { type: "bar" }, { view: COUNTRY_VIEW, rows: COUNTRIES });
        const first = await inChart(chartEl, sliderOf);
        const from = await inPage(chartEl, first.filler);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x + 80, from.y, { steps: 8 });
        await page.mouse.up();
        await stillAfterDrag(page, chartEl);
        const moved = await inChart(chartEl, sliderOf);
        await page.setViewportSize({ width: 400, height: 844 });
        await settled(chartEl);
        await expect.poll(async () => (await inChart(chartEl, sliderOf)).start).toBe(moved.start);
    });

    test("an end of the slider widens the window to every category; the axis lays its names out again", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const chartEl = await mount(page, { type: "bar" }, { view: COUNTRY_VIEW, rows: COUNTRIES });
        const report = page.locator("#zoom-report");
        const first = await inChart(chartEl, sliderOf);
        expect(first.end).toBeLessThan(39);
        await expect(report.getByTestId("axis-note")).toHaveCount(0);
        // drag the end handle to the slider's far end
        const { at } = await inChart(chartEl, sliderHandle, 1);
        const from = await inPage(chartEl, at);
        const box = await chartEl.boundingBox();
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width - 2, from.y, { steps: 10 });
        await page.mouse.up();
        await expect.poll(async () => (await inChart(chartEl, sliderOf)).end).toBe(39);
        // all 40 names do not fit: drawn again, the axis writes every n-th and says so
        await expect(report.getByTestId("axis-note")).toBeVisible();
        expect((await inChart(chartEl, sliderOf)).start).toBe(first.start);
    });

    test("Stacked to 100 % is offered for sums and counts only", async ({ page }) => {
        await mount(page, { type: "bar", stacked: true }, { view: { ...VIEW, values: [{ field: "Revenue", agg: "average" }] } });
        const report = page.locator("#zoom-report");
        await chartMenu(report);
        await expect(report.getByTestId("zoom-auto")).toBeVisible();
        await expect(report.getByTestId("chart-stack-percent")).toHaveCount(0);
    });
});

// A finger on a phone: the slider is as thick as --pk-target-touch and moves with a touch drag. Chromium
// only: it alone sends touch events by its protocol (CDP), the input a finger gives
test.describe("the zoom slider on a touch screen (#36)", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("a touch drag moves the window; the slider takes the touch target size", async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", "touch input by CDP is Chromium's");
        await page.goto("pages/host.html");
        const chartEl = await mount(page, { type: "bar" }, { view: COUNTRY_VIEW, rows: COUNTRIES });
        const token = await page.locator("#zoom-report .pk-root").evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--pk-target-touch")));
        expect(token).toBeGreaterThan(24);
        const first = await inChart(chartEl, sliderOf);
        expect((await inChart(chartEl, sliderHandle, 0)).size).toBe(token);
        const from = await inPage(chartEl, first.filler);
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: from.y }] });
        await touch("touchStart", from.x);
        for (let i = 1; i <= 8; i++) await touch("touchMove", from.x + i * 10);
        await touch("touchEnd");
        await expect.poll(async () => (await inChart(chartEl, sliderOf)).start).toBeGreaterThan(0);
    });
});

