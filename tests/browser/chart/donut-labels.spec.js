// A donut's outside labels (#151): whole at the first draw and after the value labels change to the
// value, its share or both, in both themes, at a desktop's and a phone's width; gone once they are off.
import { test, expect } from "../fixtures.js";

for (const theme of ["light", "dark"]) for (const width of [1280, 390]) test(`outside donut labels at first draw and after value changes: ${theme}, ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("pages/host.html");
    await page.evaluate(async (theme) => {
        const React = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { PivotReport } = await import("pivotkit-react");
        const el = document.createElement("section");
        el.id = "donut-diagnostic";
        document.body.append(el);
        const root = createRoot(el);
        window.__donutLabels = (valueLabels) => root.render(React.createElement(PivotReport, {
            theme,
            data: [{ City: "Berlin", Quarter: "Q1", Temperature: 10 }, { City: "Berlin", Quarter: "Q2", Temperature: 20 }, { City: "Munich", Quarter: "Q1", Temperature: 15 }, { City: "Munich", Quarter: "Q2", Temperature: 25 }],
            height: 640,
            view: { rows: ["City"], cols: ["Quarter"], values: [{ field: "Temperature", agg: "average" }], display: "chart", chart: { type: "donut", labelPosition: "outside", valueLabels } }
        }));
        window.__donutLabels("auto");
    }, theme);
    const chart = page.locator("#donut-diagnostic").getByTestId("pivot-chart");
    await expect(chart.locator("canvas")).toBeVisible();
    const texts = () => chart.evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        return getInstanceByDom(el).getZr().storage.getDisplayList().filter((x) => x.type === "tspan").map((x) => x.style.text);
    });
    // Legend texts are separate: a default outside label adds a second name per slice.
    await expect.poll(async () => (await texts()).filter((t) => t === "Berlin").length).toBe(2);
    for (const [mode, label, munich] of [["value", "Berlin: 15.00", "Munich: 20.00"], ["percent", "Berlin: 42.9%", "Munich: 57.1%"], ["both", "Berlin: 15.00 (42.9%)", "Munich: 20.00 (57.1%)"]]) {
        await page.evaluate((mode) => window.__donutLabels(mode), mode);
        // until the new view is drawn, the chart can still hold the one before (no formatter for the
        // default labels): null, and the poll asks again, instead of a TypeError that ends it. On a
        // phone the label breaks into lines at its spaces (#229): the same words.
        await expect.poll(() => chart.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            const formatter = getInstanceByDom(el)?.getOption().series?.[0]?.label?.formatter;
            return typeof formatter === "function" ? formatter({ name: "Berlin", value: 15, percent: 100 * 15 / 35 }).replace(/\n/g, " ") : null;
        })).toBe(label);
        // both slice labels are drawn whole, on lines on a phone
        await expect.poll(async () => (await texts()).join(" ")).toContain(label);
        await expect.poll(async () => (await texts()).join(" ")).toContain(munich);
        if (width > 390) await expect.poll(async () => (await texts()).length).toBe(5);
    }
    await chart.screenshot({ path: testInfo.outputPath(`donut-${theme}-${width}.png`) });
    await page.evaluate(() => window.__donutLabels("off"));
    await expect.poll(async () => (await texts()).length).toBe(3);
});
