// The Angular example (examples/angular): <pivot-report> in a standalone Angular component, data and the
// start view bound as properties, pivot-view-change bound with (pivot-view-change).
import { test, expect, tableRows } from "../../../tests/browser/fixtures.js";

test("Angular: the report shows the bound rows, a menu change reaches the app, the page's styles stay outside", async ({ page }) => {
    await page.goto("/");
    const report = page.locator("pivot-report");

    // [data] and [defaultView] arrived as properties: the tickets counted per team
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    expect(await tableRows(page)).toEqual([
        ["Billing", "2"],
        ["Network", "3"],
        ["Support", "1"],
        ["Grand Total", "6"]
    ]);
    await expect(page.getByTestId("app-view")).toHaveText("Rows: Team; columns: none");

    // a field's menu adds Priority to Columns: the element emits pivot-view-change and the
    // component's handler shows the new view
    await report.locator('.pk-field[data-field="Priority"] .pk-handle').click();
    await report.getByRole("menuitem", { name: "Add to Columns" }).click();
    await expect(page.getByTestId("app-view")).toHaveText("Rows: Team; columns: Priority");
    expect(await tableRows(page)).toEqual([
        ["Billing", "1", "1", "2"],
        ["Network", "2", "1", "3"],
        ["Support", "", "1", "1"],
        ["Grand Total", "3", "3", "6"]
    ]);

    // the page's stylesheet colours its own table cells and none of the report's
    const red = "rgb(200, 0, 0)";
    await expect(page.locator(".page-table td")).toHaveCSS("color", red);
    const cells = await report.locator('[data-testid="pivot-table"] td').evaluateAll((tds) => tds.map((td) => getComputedStyle(td).color));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.filter((c) => c === red)).toEqual([]);
    const fonts = await report.locator('[data-testid="pivot-table"] td').evaluateAll((tds) => [...new Set(tds.map((td) => getComputedStyle(td).fontFamily))]);
    expect(fonts.join()).not.toContain("Courier New");
});
