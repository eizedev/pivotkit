// The Angular example (examples/angular): <pivot-report> in a standalone Angular component, data and the
// start view bound as properties, pivot-view-change bound with (pivot-view-change), and a file loaded
// with allow-import in the element's import worker, which the app's build copies as an asset.
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

test("Angular: allow-import reads a picked CSV file in the element's import worker, without a console error", async ({ page }) => {
    await page.goto("/");
    const report = page.locator("pivot-report");
    await expect(report.getByTestId("pivot-table")).toBeVisible();
    // the Data menu's Load data… and the browser's file chooser, as a person picks a file
    const own = report.getByTestId("data");
    if (await own.count()) await own.click();
    else {
        await report.getByTestId("more").click();
        await report.getByTestId("more-data").click();
    }
    await expect(report.getByTestId("data-menu")).toBeVisible();
    // the worker the element starts is a file of the app's own origin, there as JavaScript (without it
    // the report reads on the page, but Firefox and WebKit log the failed worker as a console error,
    // and Chromium says nothing)
    const script = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/import-worker.js"));
    const chooser = page.waitForEvent("filechooser");
    await report.getByTestId("load-file").click();
    await (await chooser).setFiles({ name: "hours.csv", mimeType: "text/csv", buffer: Buffer.from("Team;Hours\nBilling;1,5\nNetwork;2\nNetwork;4\n") });
    const response = await script;
    expect(new URL(response.url()).pathname).toBe("/import-worker.js");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^text\/javascript/);
    await expect(report.getByTestId("import-meta")).toHaveText(/3 rows · 2 columns/);
    await report.getByTestId("import-apply").click();
    await expect.poll(() => report.locator(".pk-field-list [data-field]").evaluateAll((els) => els.map((e) => e.getAttribute("data-field")))).toEqual(["Team", "Hours"]);
});
