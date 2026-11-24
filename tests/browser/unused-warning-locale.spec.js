// The report's language and number format where a locale is unusual: the warning about unused fields
// counts in the view's or the host's locale (an invalid one falls back to en-US), and a locale the
// browser has no data for shows the report in en-US and says so.
import { test, expect } from "./fixtures.js";

for (const [hostLocale, viewLocale, expectedLocale] of [["ar-EG", undefined, "ar-EG"], ["de-DE", "fa-IR", "fa-IR"], ["invalid_locale", undefined, "en-US"]]) {
    test(`unused warning counts retain locale ${expectedLocale} after work limit`, async ({ page }) => {
        await page.goto("pages/element-views.html");
        const host = page.locator("#views");
        await expect(host.locator(".pk-root")).toBeVisible();
        await host.evaluate((el, {hostLocale, viewLocale}) => {
            el.locale = hostLocale;
            el.limits = {work:1};
            el.data = [{Date:"2024-01-01",Amount:1},{Date:"2025-01-01",Amount:2}];
            el.defaultView = {rows:["Date", "Missing"], values:[{field:"Amount",agg:"sum"}], ...(viewLocale ? {formatting:{locale:viewLocale}} : {})};
        }, {hostLocale, viewLocale});
        await expect(host.getByRole("alert")).toBeVisible();
        await expect(host.getByTestId("unused-title")).toContainText(new Intl.NumberFormat(expectedLocale).format(1));
    });
}

test("a locale prop the browser has no data for: the report shows in en-US and says so (#552)", async ({ page }) => {
    await page.goto("pages/host.html");
    await page.evaluate(async () => {
        const React = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { PivotReport } = await import("pivotkit-react");
        const el = document.createElement("section");
        el.id = "unknown-locale";
        document.body.prepend(el);
        const view = { rows: ["Region"], values: [{ field: "Revenue", agg: "sum", format: "number:1" }] };
        createRoot(el).render(React.createElement(PivotReport, { locale: "xx-XX", data: [{ Region: "North", Revenue: 1234.5 }], defaultView: view, height: 420 }));
    });
    const report = page.locator("#unknown-locale");
    // the numbers as en-US writes them, whatever the machine's locale
    await expect(report.getByTestId("pivot-table")).toContainText("1,234.5");
    await expect(report.getByTestId("pivot-table")).not.toContainText("1.234,5");
    // a warning names the locale and what is used instead
    await expect(report).toContainText("the language “xx-XX” is unknown");
});
