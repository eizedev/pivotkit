// What exportData lets out (#259, #263): off (the default), neither Source data nor the drill-down's
// exports and copies; with { columns }, both hold only those columns, in that order. The drill-down
// panel itself still shows its rows. A host page (tests/browser/pages/host.jsx) with 2,000 sales rows.
import { readFile } from "node:fs/promises";
import { captureClipboard, copied, expect, test, toolbar } from "./fixtures.js";

/** Opens the drill-down of the table's first value. */
async function openDrill(page) {
    await page.locator('[data-testid="pivot-table"] td.pk-clickable').first().click();
    const panel = page.getByTestId("drill-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".pk-drill-table tbody tr").first()).toBeVisible();
    return panel;
}
const csvLines = async (download) => (await readFile(await download.path(), "utf8")).replace(/^\uFEFF/, "").trimEnd().split("\r\n");

test("exportData off (the default): no Source data, and the drill-down shows its rows without exports", async ({ page }) => {
    await page.goto("pages/host.html");
    await expect(page.locator(".pk-root")).toBeVisible();
    await toolbar(page, "export");
    await expect(page.getByTestId("export-csv")).toBeVisible();
    await expect(page.getByTestId("export-data-csv")).toHaveCount(0);
    await page.keyboard.press("Escape");
    const panel = await openDrill(page);
    await expect(panel.getByTestId("drill-export")).toHaveCount(0);
});

test("exportData with columns: Source data and the drill-down's exports hold those columns only, in that order", async ({ page }) => {
    await captureClipboard(page);
    // a name in another case and one the data lacks: matched as the core's exporters match, the unknown left out
    await page.goto("pages/host.html?exportcolumns=Revenue,region,Nope");
    await expect(page.locator(".pk-root")).toBeVisible();
    await toolbar(page, "export");
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-data-csv").click()]);
    const lines = await csvLines(csv);
    expect(lines[0]).toBe("Revenue,Region");
    expect(lines).toHaveLength(2001);
    await toolbar(page, "export");
    const [json] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-data-json").click()]);
    const rows = JSON.parse(await readFile(await json.path(), "utf8"));
    expect(rows).toHaveLength(2000);
    expect(Object.keys(rows[0])).toEqual(["Revenue", "Region"]);

    const panel = await openDrill(page);
    // the panel shows every column
    expect(await panel.locator(".pk-drill-table thead th").count()).toBeGreaterThan(2);
    await panel.getByTestId("drill-export").click();
    const [drillCsv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("drill-csv").click()]);
    const drillLines = await csvLines(drillCsv);
    expect(drillLines[0]).toBe("Revenue,Region");
    await panel.getByTestId("drill-export").click();
    await page.getByTestId("drill-copy").click();
    expect((await copied(page)).split("\r\n")[0].split("\t")).toEqual(["Revenue", "Region"]);
    await panel.getByTestId("drill-export").click();
    await page.getByTestId("drill-json").click();
    expect(Object.keys(JSON.parse(await copied(page))[0])).toEqual(["Revenue", "Region"]);
});
