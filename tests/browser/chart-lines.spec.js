// A chart's reference lines (#48): an average and a trend per series, a target, drawn on bars, lines and
// areas (ECharts' markLine), named in the tooltip and the text alternative, set in Display -> Reference
// lines. Real pointer input; the positions come from the chart's own layout (convertToPixel).
import { test, expect } from "./fixtures.js";

/**
 * Revenue per month and product. A climbs by 10 a month (10, 20, 30, 40: average 25, trend 10 to 40),
 * B stays near 5 (5, 5, 7, 3: average 5, trend 5.6 to 4.4). Stacked, the months are 15, 25, 37, 43:
 * average 30. A target of 80 is above every bar.
 */
const ROWS = [10, 20, 30, 40].flatMap((a, i) => [
    { Date: `2026-0${i + 1}-15`, Region: i % 2 ? "North" : "South", Product: "A", Revenue: a },
    { Date: `2026-0${i + 1}-15`, Region: i % 2 ? "South" : "North", Product: "B", Revenue: [5, 5, 7, 3][i] }
]);
const VIEW = { derived: [{ name: "Month", field: "Date", by: "yearMonth" }], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], display: "chart" };
const A = 0;
const MARCH = 2;

/** Mounts a report of ROWS at the top of the host page with `chart` over VIEW's; mount again to change it. */
async function mount(page, chart, { theme = "light", view = {}, cellClicks = false, rows = ROWS } = {}) {
    await page.evaluate(
        async ({ rows, view, theme, cellClicks }) => {
            const React = await import("react");
            const { createRoot } = await import("react-dom/client");
            const { PivotReport } = await import("pivotkit-react");
            if (!window.__linesRoot) {
                const el = document.createElement("section");
                el.id = "lines-report";
                document.body.prepend(el);
                window.__linesRoot = createRoot(el);
            }
            window.__linesRoot.render(null);
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            window.__cellClicks = [];
            window.__linesViews = [];
            const onCellClick = cellClicks ? ({ row, col }) => window.__cellClicks.push({ row, col }) : undefined;
            window.__linesRoot.render(React.createElement(PivotReport, { key: JSON.stringify(view.chart), theme, data: rows, height: 560, defaultView: view, onCellClick, onViewChange: (v) => window.__linesViews.push(v) }));
        },
        { rows, view: { ...VIEW, ...view, chart }, theme, cellClicks }
    );
    if (view.display === "table") {
        // the table shown: no chart to wait for
        await expect(page.locator("#lines-report").getByTestId("pivot-table")).toBeVisible();
        return null;
    }
    const chartEl = page.locator("#lines-report").getByTestId("pivot-chart");
    await expect(chartEl.locator("canvas").first()).toBeVisible();
    await expect.poll(() => chartEl.evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        const chart = getInstanceByDom(el);
        return Boolean(chart?.getOption().series?.length) && chart.getZr().animation.isFinished();
    })).toBe(true);
    await page.waitForTimeout(100);
    return chartEl;
}

/**
 * The reference lines ECharts drew, from its display list (a markLine's path is an "ec-line", its label
 * the text of the line's group): each line's ends in the chart's pixels, its stroke and dash, its label
 * ("" where the part has none: a trend is drawn from category to category, labelled at its end) and
 * the label's box in the chart's pixels.
 */
const drawnLines = (chartEl) =>
    chartEl.evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        return getInstanceByDom(el)
            .getZr()
            .storage.getDisplayList(true)
            .filter((e) => e.type === "ec-line")
            .map((e) => {
                const text = e.parent?.getTextContent?.();
                const shown = text && !text.ignore && !text.invisible && text.style.text;
                let box = null;
                if (shown) {
                    text.updateTransform();
                    const r = text.getBoundingRect().clone();
                    if (text.transform) r.applyTransform(text.transform);
                    box = { x: r.x, y: r.y, width: r.width, height: r.height };
                }
                // the words of a label, after the sample of its line's dash ("{s|– –} Average 25")
                const words = shown ? String(text.style.text).replace(/^\{s\|[^}]*\} /, "") : "";
                return { x1: e.shape.x1, y1: e.shape.y1, x2: e.shape.x2, y2: e.shape.y2, stroke: e.style.stroke, dash: e.style.lineDash ?? null, label: words, box };
            });
    });

/** Whether two boxes overlap (by more than a pixel). */
const overlap = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** A value's place on the value axis in the chart's pixels: y, or x on horizontal bars. */
const valueAt = (chartEl, value, horizontal = false) =>
    chartEl.evaluate(async (el, { value, horizontal }) => {
        const { getInstanceByDom } = await import("echarts/core");
        return getInstanceByDom(el).convertToPixel(horizontal ? { xAxisIndex: 0 } : { yAxisIndex: 0 }, value);
    }, { value, horizontal });

/** A point of the chart in the page, from the chart's own layout (run in the page with its instance). */
async function pointOf(chartEl, at, arg) {
    const [x, y] = await chartEl.evaluate(async (el, { at, arg }) => {
        const { getInstanceByDom } = await import("echarts/core");
        return new Function("chart", "arg", `return (${at})(chart, arg);`)(getInstanceByDom(el), arg);
    }, { at: at.toString(), arg });
    const box = await chartEl.boundingBox();
    return { x: box.x + x, y: box.y + y };
}
const barMiddle = (chart, { series, index }) => {
    const l = chart.getModel().getSeriesByIndex(series).getData().getItemLayout(index);
    return [l.x + l.width / 2, l.y + l.height / 2];
};
/** A category's middle at a value of the value axis. */
const atValue = (chart, { index, value }) => chart.convertToPixel({ gridIndex: 0 }, [index, value]);

async function hover(page, { x, y }) {
    await page.mouse.move(x - 6, y + 5);
    await page.mouse.move(x, y, { steps: 3 });
}

/** The visible tooltip, one entry per row ("Average (A) 25"); [] when none shows. */
const tooltipOf = (chartEl) =>
    chartEl.evaluate((el) => {
        const tip = [...el.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
        if (!tip || getComputedStyle(tip).visibility === "hidden" || getComputedStyle(tip).display === "none" || Number(getComputedStyle(tip).opacity) === 0) {
            return [];
        }
        const box = tip.firstElementChild;
        return box ? [...box.children].map((row) => [...(row.children.length ? row.children : [row])].map((c) => c.textContent.trim()).filter(Boolean).join(" ")) : [];
    });

/** A token of the report as the browser resolves it to a colour (rgb()). */
const tokenColor = (page, name) =>
    page.locator("#lines-report .pk-root").evaluate((root, name) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        root.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    }, name);
/** A colour as the browser writes it (rgb()), for comparing ECharts' strokes with the tokens. */
const asRgb = (page, color) =>
    page.evaluate((color) => {
        const probe = document.createElement("span");
        probe.style.color = color;
        document.body.append(probe);
        const out = getComputedStyle(probe).color;
        probe.remove();
        return out;
    }, color);

test.describe("reference lines", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("pages/host.html");
    });

    for (const theme of ["light", "dark"]) {
        test(`bars, ${theme}: an average per series in its colour, a target in --pk-chart-reference, labelled; the axis reaches the target`, async ({ page }) => {
            const chartEl = await mount(page, { type: "bar", referenceLines: { average: true, trend: false, target: 80 } }, { theme });
            const lines = await drawnLines(chartEl);
            const [y25, y5, y80] = [await valueAt(chartEl, 25), await valueAt(chartEl, 5), await valueAt(chartEl, 80)];
            const at = (y) => lines.find((l) => Math.abs(l.y1 - y) < 1 && Math.abs(l.y2 - y) < 1 && l.x2 - l.x1 > 100);
            expect(at(y25)?.label).toBe("Average 25");
            expect(at(y5)?.label).toBe("Average 5");
            expect(at(y80)?.label).toBe("Target 80");
            expect([at(y25).dash, at(y80).dash]).toEqual(["dashed", "solid"]);
            // the colours: A's and B's series tokens, the target the reference token
            expect(await asRgb(page, at(y25).stroke)).toBe(await tokenColor(page, "--pk-chart-1"));
            expect(await asRgb(page, at(y5).stroke)).toBe(await tokenColor(page, "--pk-chart-2"));
            expect(await asRgb(page, at(y80).stroke)).toBe(await tokenColor(page, "--pk-chart-reference"));
            // the target is inside the plot, though every bar is lower
            const top = await chartEl.evaluate(async (el) => {
                const { getInstanceByDom } = await import("echarts/core");
                return getInstanceByDom(el).getModel().getComponent("grid").coordinateSystem.getRect().y;
            });
            expect(y80).toBeGreaterThanOrEqual(top);
            // the text alternative names them
            await expect(page.locator("#lines-report").getByTestId("chart-summary")).toContainText("Reference lines: Average (A) 25; Average (B) 5; Target 80.");
        });
    }

    test("the tooltip names the lines at the category: the bar's own and the target; between bars every line", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", referenceLines: { average: true, trend: true, target: 80 } });
        await hover(page, await pointOf(chartEl, barMiddle, { series: A, index: MARCH }));
        await expect.poll(async () => (await tooltipOf(chartEl)).slice(1)).toEqual(["A 30", "Average (A) 25", "Trend (A) 30", "Target 80"]);
        // the gap above March's bars: every series and every line, the trends at March
        await hover(page, await pointOf(chartEl, atValue, { index: MARCH, value: 60 }));
        await expect.poll(async () => (await tooltipOf(chartEl)).slice(1)).toEqual(["A 30", "B 7", "Average (A) 25", "Average (B) 5", "Trend (A) 30", "Trend (B) 4.8", "Target 80"]);
    });

    test("a stack: the lines of its total; a stack of averages none, and the menu says why", async ({ page }) => {
        let chartEl = await mount(page, { type: "bar", stacked: true, referenceLines: { average: true, trend: false, target: null } });
        const y30 = await valueAt(chartEl, 30);
        const lines = await drawnLines(chartEl);
        expect(lines.map((l) => l.label)).toEqual(["Average 30"]);
        expect(Math.abs(lines[0].y1 - y30)).toBeLessThan(1);
        chartEl = await mount(page, { type: "bar", stacked: true, referenceLines: { average: true, trend: true, target: 20 } }, { view: { values: [{ field: "Revenue", agg: "average" }] } });
        expect(await drawnLines(chartEl)).toEqual([]);
        await expect(page.locator("#lines-report").getByTestId("chart-summary")).not.toContainText("Reference lines");
        const report = page.locator("#lines-report");
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("lines-note")).toHaveText("These lines need a total. Switch to Bars, not stacked, to draw them.");
        await expect(report.getByTestId("line-average")).toHaveCount(0);
        await expect(report.getByTestId("chart-target")).toHaveCount(0);
    });

    test("a click on a line opens no rows: the lines are no element to point at", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", referenceLines: { average: false, trend: false, target: 80 } }, { cellClicks: true });
        // March, high above its bars, right on the target line
        const p = await pointOf(chartEl, atValue, { index: MARCH, value: 80 });
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.__cellClicks)).toEqual([]);
        await expect(page.getByTestId("drill-panel")).toHaveCount(0);
        // a bar still opens its rows
        const bar = await pointOf(chartEl, barMiddle, { series: A, index: MARCH });
        await page.mouse.click(bar.x, bar.y);
        await expect.poll(() => page.evaluate(() => window.__cellClicks.length)).toBe(1);
    });

    test("lines: a dotted trend per series from its first to its last point, labelled at its end", async ({ page }) => {
        const chartEl = await mount(page, { type: "line", referenceLines: { average: false, trend: true, target: null } });
        const lines = await drawnLines(chartEl);
        const at = await chartEl.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            const chart = getInstanceByDom(el);
            return [10, 20, 30, 40].map((v, i) => chart.convertToPixel({ gridIndex: 0 }, [i, v]));
        });
        // A's trend is 10, 20, 30, 40: three parts from point to point, on A's points
        const near = (a, b) => Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1;
        const a = [0, 1, 2].map((i) => lines.find((l) => near([l.x1, l.y1], at[i]) && near([l.x2, l.y2], at[i + 1])));
        expect(a.every(Boolean), JSON.stringify(lines)).toBe(true);
        expect(a.map((l) => [l.dash, l.label])).toEqual([["dotted", ""], ["dotted", ""], ["dotted", "Trend"]]);
        expect(lines.filter((l) => l.label)).toHaveLength(2);
    });

    test("horizontal bars: the target stands on the value axis, past the longest bar", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar", horizontal: true, referenceLines: { average: false, trend: false, target: 80 } });
        const x80 = await valueAt(chartEl, 80, true);
        const lines = await drawnLines(chartEl);
        const target = lines.find((l) => Math.abs(l.x1 - x80) < 1 && Math.abs(l.x2 - x80) < 1);
        expect(target?.label).toBe("Target 80");
        expect(Math.abs(target.y2 - target.y1)).toBeGreaterThan(100);
        const right = await chartEl.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            const r = getInstanceByDom(el).getModel().getComponent("grid").coordinateSystem.getRect();
            return r.x + r.width;
        });
        expect(x80).toBeLessThanOrEqual(right);
    });

    test("Display -> Reference lines: Average and Trend by a click, a target typed; a pie offers none, regions no trend", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" });
        const report = page.locator("#lines-report");
        await report.getByTestId("chart-type").click();
        await expect(report.getByText("Reference lines", { exact: true })).toBeVisible();
        // the switch's own text, clicked as a person does
        await report.locator(".pk-switch", { has: page.getByTestId("line-average") }).click();
        await expect.poll(() => page.evaluate(() => window.__linesViews.at(-1)?.chart.referenceLines)).toEqual({ average: true, trend: false, target: null });
        await report.locator(".pk-switch", { has: page.getByTestId("line-trend") }).click();
        const target = report.getByTestId("chart-target");
        await target.click();
        await page.keyboard.type("80");
        await page.keyboard.press("Enter");
        await expect.poll(() => page.evaluate(() => window.__linesViews.at(-1)?.chart.referenceLines)).toEqual({ average: true, trend: true, target: 80 });
        await expect.poll(async () => (await drawnLines(chartEl)).map((l) => l.label).filter(Boolean).sort()).toEqual(["Average 25", "Average 5", "Target 80", "Trend", "Trend"]);
        // a text that is no number is not applied
        await target.fill("lots");
        await expect(report.locator(".pk-inline-form", { has: page.getByTestId("chart-target") }).getByRole("button", { name: "Apply" })).toBeDisabled();
        await expect(target).toHaveAttribute("aria-invalid", "true");
        // the × takes the target off
        await target.fill("80");
        await report.locator(".pk-inline-form", { has: page.getByTestId("chart-target") }).getByRole("button", { name: "Clear" }).click();
        await expect.poll(() => page.evaluate(() => window.__linesViews.at(-1)?.chart.referenceLines.target)).toBe(null);
        // a pie has no value axis: no lines offered
        await report.getByTestId("chart-pie").click();
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("line-average")).toHaveCount(0);
        await page.keyboard.press("Escape");
        // regions have no order of their own: an average, no trend
        await mount(page, { type: "bar" }, { view: { rows: ["Region"] } });
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("line-average")).toHaveCount(1);
        await expect(report.getByTestId("line-trend")).toHaveCount(0);
        await expect(report.getByTestId("lines-note")).toContainText("A trend needs dates on Rows");
    });

    for (const width of [1440, 390]) {
        test(`at ${width} px no label covers another, with lines close together and far apart`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            // A's average 25 and a target of 26, B's average 5 and both trends: five labels, two close
            for (const chart of [{ type: "line" }, { type: "bar" }, { type: "bar", stacked: true }]) {
                const chartEl = await mount(page, { ...chart, referenceLines: { average: true, trend: true, target: 26 } });
                const boxes = (await drawnLines(chartEl)).filter((l) => l.box);
                expect(boxes.length, JSON.stringify(chart)).toBeGreaterThanOrEqual(chart.stacked ? 3 : 5);
                for (let i = 0; i < boxes.length; i++) {
                    for (let j = i + 1; j < boxes.length; j++) {
                        expect(overlap(boxes[i].box, boxes[j].box), `${JSON.stringify(chart)}: "${boxes[i].label}" and "${boxes[j].label}" overlap`).toBe(false);
                    }
                }
                // the labels are inside the chart, and a narrow one names the lines only
                const size = await chartEl.boundingBox();
                for (const l of boxes) {
                    expect(l.box.x + l.box.width, l.label).toBeLessThanOrEqual(size.width + 1);
                    expect(l.box.x, l.label).toBeGreaterThanOrEqual(-1);
                }
                if (width < 480) {
                    expect(boxes.every((l) => !/\d/.test(l.label)), boxes.map((l) => l.label).join(", ")).toBe(true);
                } else {
                    expect(boxes.map((l) => l.label)).toContain("Target 26");
                }
            }
        });
    }

    test("a stack with a part below zero: no average or trend of its total, and the menu says why", async ({ page }) => {
        const rows = ROWS.map((r) => (r.Product === "B" && r.Date === "2026-03-15" ? { ...r, Revenue: -5 } : r));
        const chartEl = await mount(page, { type: "bar", stacked: true, referenceLines: { average: true, trend: true, target: 30 } }, { rows });
        expect((await drawnLines(chartEl)).map((l) => l.label).filter(Boolean)).toEqual(["Target 30"]);
        const report = page.locator("#lines-report");
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("lines-note")).toContainText("below zero");
        await expect(report.getByTestId("line-average")).toHaveCount(0);
        await expect(report.getByTestId("chart-target")).toHaveCount(1);
    });

    test("a value in percent: the target field reads 25% and says so", async ({ page }) => {
        await mount(page, { type: "bar" }, { view: { cols: [], values: [{ field: "Revenue", agg: "sum", showAs: { type: "percentOfGrandTotal" } }] } });
        const report = page.locator("#lines-report");
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("target-hint")).toHaveText("A percentage: type 25% or 0.25.");
        await report.getByTestId("chart-target").click();
        await page.keyboard.type("30%");
        await page.keyboard.press("Enter");
        await expect.poll(() => page.evaluate(() => window.__linesViews.at(-1)?.chart.referenceLines.target)).toBe(0.3);
    });

    test("each label sits at its own line at 1440 px: within a line of text, the closer one moved just below", async ({ page }) => {
        const chartEl = await mount(page, { type: "line", referenceLines: { average: true, trend: false, target: 26 } });
        const lines = await drawnLines(chartEl);
        for (const l of lines.filter((x) => x.box)) {
            const middle = l.box.y + l.box.height / 2;
            expect(Math.abs(middle - l.y2), `${l.label}: ${middle} vs ${l.y2}`).toBeLessThanOrEqual(l.box.height * 1.6);
        }
    });

    test("with the table shown the chart menu opens, offers the view's lines and asks for the chart", async ({ page }) => {
        const report = page.locator("#lines-report");
        await mount(page, { type: "bar", stacked: true, referenceLines: { average: true, trend: false, target: null } }, { view: { display: "table" } });
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("lines-note")).toHaveText("Show the chart to see which lines it can draw.");
        await expect(report.getByTestId("line-average")).toHaveCount(1);
        await expect(report.getByTestId("line-trend")).toHaveCount(1);
        // a stack of averages: the view alone says no line
        await page.keyboard.press("Escape");
        await mount(page, { type: "bar", stacked: true }, { view: { display: "table", values: [{ field: "Revenue", agg: "average" }] } });
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("line-average")).toHaveCount(0);
        await expect(report.getByTestId("lines-note")).toHaveText("Show the chart to see which lines it can draw.");
        await expect(report.locator(".pk-root")).toHaveCount(1);
    });

    test("a chart without values, and the menu before the chart has drawn: the menu opens and asks for the chart", async ({ page }) => {
        const report = page.locator("#lines-report");
        await page.evaluate(async ({ rows, view }) => {
            const React = await import("react");
            const { createRoot } = await import("react-dom/client");
            const { PivotReport } = await import("pivotkit-react");
            const el = document.createElement("section");
            el.id = "lines-report";
            document.body.prepend(el);
            createRoot(el).render(React.createElement(PivotReport, { data: rows, height: 560, defaultView: view }));
        }, { rows: ROWS, view: { ...VIEW, values: [], display: "chart", chart: { type: "bar" } } });
        // at once, before ECharts has loaded and drawn
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("lines-note")).toHaveText("Show the chart to see which lines it can draw.");
        await expect(report.getByTestId("line-average")).toHaveCount(1);
    });

    test("the menu follows the chart: a stack of averages says why, the same view as bars offers every line", async ({ page }) => {
        const report = page.locator("#lines-report");
        await mount(page, { type: "bar", stacked: true }, { view: { values: [{ field: "Revenue", agg: "average" }] } });
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("lines-note")).toHaveText("These lines need a total. Switch to Bars, not stacked, to draw them.");
        await report.getByTestId("chart-bar").click();
        await expect.poll(() => page.evaluate(() => window.__linesViews.at(-1)?.chart.stacked)).toBe(false);
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("line-average")).toHaveCount(1);
        await expect(report.getByText("These lines need a total. Switch to Bars, not stacked, to draw them.")).toHaveCount(0);
    });

    test("a target kept from before over values in different units can be removed", async ({ page }) => {
        const report = page.locator("#lines-report");
        await mount(page, { type: "bar", referenceLines: { average: false, trend: false, target: 30 } }, { view: { cols: [], values: [{ field: "Revenue", agg: "sum" }, { agg: "count" }] } });
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("lines-note")).toContainText("different units");
        await expect(report.getByTestId("chart-target")).toHaveCount(0);
        await report.getByTestId("target-remove").click();
        await expect.poll(() => page.evaluate(() => window.__linesViews.at(-1)?.chart.referenceLines.target)).toBe(null);
    });

    test("a bare number above 1 for a share gets a soft warning tied to the field; percent100 has its own hint", async ({ page }) => {
        const report = page.locator("#lines-report");
        await mount(page, { type: "bar" }, { view: { cols: [], values: [{ field: "Revenue", agg: "sum", showAs: { type: "percentOfGrandTotal" } }] } });
        await report.getByTestId("chart-type").click();
        const field = report.getByTestId("chart-target");
        await field.click();
        await page.keyboard.type("25");
        await expect(report.getByTestId("target-warning")).toHaveText("25 is 2,500%. Type 25% for 25%.");
        const warning = await report.getByTestId("target-warning").getAttribute("id");
        expect((await field.getAttribute("aria-describedby")).split(" ")).toContain(warning);
        await page.keyboard.type("%");
        await expect(report.getByTestId("target-warning")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await mount(page, { type: "bar" }, { view: { cols: [], values: [{ field: "Revenue", agg: "sum", format: "percent100" }] } });
        await report.getByTestId("chart-type").click();
        await expect(report.getByTestId("target-hint")).toHaveText("A percentage: type 25 or 25%.");
        await report.getByTestId("chart-target").click();
        await page.keyboard.type("25");
        await expect(report.getByTestId("target-warning")).toHaveCount(0);
    });
});

test("under a strict Content-Security-Policy the lines draw and the tooltip names them, without a violation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("pages/element-csp.html");
    const el = page.locator("#strict");
    await expect(el.locator(".pk-root")).toBeVisible();
    await page.evaluate(({ rows, view }) => {
        const r = document.getElementById("strict");
        r.data = rows;
        r.defaultView = view;
    }, { rows: ROWS, view: { ...VIEW, chart: { type: "bar", referenceLines: { average: true, trend: false, target: 80 } } } });
    const chartEl = el.getByTestId("pivot-chart");
    await expect(chartEl.locator("canvas").first()).toBeVisible();
    await expect(el.getByTestId("chart-summary")).toContainText("Target 80");
    // every row of every tooltip ECharts writes, kept as it is written: the sweep may end where none shows
    await chartEl.evaluate((node) => {
        const seen = new Set();
        new MutationObserver(() => {
            const tip = [...node.children].find((c) => c.tagName === "DIV" && !c.querySelector("canvas"));
            for (const row of tip?.firstElementChild?.children ?? []) {
                seen.add([...(row.children.length ? row.children : [row])].map((c) => c.textContent.trim()).filter(Boolean).join(" "));
            }
        }).observe(node, { childList: true, subtree: true, characterData: true });
        window.__lineRows = seen;
    });
    // the pointer sweeps along the plot's middle, a move every 24 px, until a tooltip has named the target
    const box = await chartEl.boundingBox();
    await expect.poll(async () => {
        for (let x = box.x + 60; x < box.x + box.width - 40; x += 24) {
            await page.mouse.move(x, box.y + box.height * 0.5);
        }
        return page.evaluate(() => [...window.__lineRows]);
    }).toContain("Target 80");
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
});
