// A name of the report's own for a field in Rows, Columns or Filters (#158): Name in its chip menu;
// the chip, the table's header, the chart, the exports and the link show it; the field list shows both
// names and finds the field by either; the × gives the field its name back; Undo takes it back.
import { readFile } from "node:fs/promises";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, test } from "./fixtures.js";

const VIEW = { rows: ["Region"], cols: ["Channel"], filters: [{ field: "Category", type: "in", items: [], not: true }], values: [{ field: "Revenue", agg: "sum" }] };
const open = (page, view = VIEW) => page.goto(`?data=sales&lang=en&empty#pivot-playground=${encodeViewLink(view)}`);

test("Name renames a field in Rows: chip, header, field list and link; × and Undo give the name back", async ({ page }) => {
    await open(page);
    await expect(page.locator(".pk-table")).toBeVisible();
    await chipMenu(page, "Region", "name");
    const input = page.getByTestId("field-name");
    await expect(input).toHaveAttribute("placeholder", "Region");
    await input.fill("Sales area");
    await input.press("Enter");
    await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Sales area"]')).toBeVisible();
    await expect(page.locator(".pk-table thead th.pk-corner", { hasText: "Sales area" })).toBeVisible();
    // the field list: the report's name, the data's under it; a search finds it by either
    const row = page.locator('.pk-field[data-field="Region"]');
    await expect(row.locator(".pk-field-title")).toHaveText("Sales area");
    await expect(row.locator(".pk-field-source")).toHaveText("Region");
    await page.getByTestId("field-search").fill("sales ar");
    await expect(row).toBeVisible();
    await page.getByTestId("field-search").fill("regio");
    await expect(row).toBeVisible();
    await page.getByTestId("field-search").fill("");
    // the link keeps it
    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe("");
    await page.reload();
    await expect(page.locator(".pk-table thead th.pk-corner", { hasText: "Sales area" })).toBeVisible();
    // × gives the field its name back at once
    await chipMenu(page, "Sales area", "name");
    await page.locator(".pk-chip-menu").getByRole("button", { name: "Use the field's name" }).click();
    await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"]')).toBeVisible();
    await page.keyboard.press("Escape");
    // Undo brings the name back
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Sales area"]')).toBeVisible();
});

test("a field in Columns and one in Filters take a name too; the CSV names them", async ({ page }) => {
    await open(page);
    await expect(page.locator(".pk-table")).toBeVisible();
    await chipMenu(page, "Channel", "name");
    await page.getByTestId("field-name").fill("Sold through");
    await page.getByTestId("field-name").press("Enter");
    await expect(page.locator('[data-zone="cols"] .pk-chip[data-chip="Sold through"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await chipMenu(page, "Category", "name");
    await page.getByTestId("field-name").fill("Product line");
    await page.getByTestId("field-name").press("Enter");
    await expect(page.locator('[data-zone="filters"] .pk-chip[data-chip="Product line"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pk-table thead th.pk-corner", { hasText: "Sold through" })).toBeVisible();
    await page.getByTestId("export").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    const text = await readFile(await download.path(), "utf8");
    expect(text).toContain("Sold through");
    expect(text).not.toContain("Channel");
});
