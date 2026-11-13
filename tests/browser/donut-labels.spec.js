import { test, expect } from "./fixtures.js";

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
    for (const [mode, label] of [["value", "Berlin: 15.00"], ["percent", "Berlin: 42.9%"], ["both", "Berlin: 15.00 (42.9%)"]]) {
        await page.evaluate((mode) => window.__donutLabels(mode), mode);
        await expect.poll(() => chart.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            return getInstanceByDom(el).getOption().series[0].label.formatter({ name: "Berlin", value: 15, percent: 100 * 15 / 35 });
        })).toBe(label);
        if (width > 390) await expect.poll(texts).toContain(label);
        // On phones ECharts truncates the names, but still draws both slice labels.
        await expect.poll(async () => (await texts()).length).toBe(5);
    }
    await chart.screenshot({ path: testInfo.outputPath(`donut-${theme}-${width}.png`) });
    await page.evaluate(() => window.__donutLabels("off"));
    await expect.poll(async () => (await texts()).length).toBe(3);
});
