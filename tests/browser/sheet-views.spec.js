// A view made on a workbook's sheet other than the first (issue #252): it names its sheet, and after
// a reload and the same workbook loaded again (the preview starts on the first sheet) opening it
// reads that sheet of the file again and shows the view on it. Sheets with the same columns keep a
// view of the same name each; a view whose sheet the workbook no longer has says so.
//
// The workbooks are pivotkit-xlsx's test generator's SHEET_BOOKS, the same the CLI's tests read.
import { readFile } from "node:fs/promises";
import { toViewFile } from "pivotkit-core";
import { chips, drag, expect, tableRows, test, toolbar } from "./fixtures.js";
import { SHEET_BOOKS, makeXlsx } from "../../packages/pivotkit-xlsx/test/make-xlsx.js";
import { fieldNames, fileOf, pickThroughMenu } from "./import-helpers.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const quarters = fileOf("quarters.xlsx", XLSX, SHEET_BOOKS.quarters());
const months = fileOf("months.xlsx", XLSX, SHEET_BOOKS.months());

/** Loads a file through the Data menu; picks `sheet` in the preview (a native select) when given. */
async function load(page, file, sheet) {
    await pickThroughMenu(page, page, file);
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog.getByTestId("import-apply")).toBeVisible();
    if (sheet) {
        await dialog.getByTestId("import-sheet").selectOption({ label: sheet });
        await expect(dialog.locator("li[data-code='SHEET']")).toContainText(`“${sheet}”`);
    }
    await dialog.getByTestId("import-apply").click();
    await expect(dialog).toHaveCount(0);
}

/** Builds a view of `row` by the sum of `value` and saves it as `name` in the browser store. */
async function saveView(page, row, value, name) {
    await drag(page, page.locator(`.pk-field[data-field="${row}"]`), page.locator('[data-zone="rows"]'));
    await drag(page, page.locator(`.pk-field[data-field="${value}"]`), page.locator('[data-zone="values"]'));
    await expect.poll(() => chips(page, "rows")).toEqual([row]);
    await toolbar(page, "views");
    await page.getByTestId("save-as").click();
    await page.getByTestId("saved-view-name").fill(name);
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText(`View “${name}” saved`);
}

test("sheet 3, a saved view, reload, the same workbook again: opening the view reads sheet 3 and shows it", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await load(page, quarters, "Q3");
    await expect(page.getByTestId("source-line")).toHaveText("quarters.xlsx, sheet “Q3”, only in this browser");
    await saveView(page, "Product", "Revenue", "Q3 products");
    // the stored view names its sheet
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pivotkit:views:playground")));
    expect(stored.find((f) => f.name === "Q3 products").source.params).toEqual({ sheet: "Q3" });

    await page.reload();
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    // the preview starts on the first sheet: loaded as it is
    await load(page, quarters);
    await expect(page.getByTestId("source-line")).toHaveText("quarters.xlsx, sheet “Q1”, only in this browser");
    await expect.poll(() => fieldNames(page)).toEqual(["Region", "Units"]);
    await toolbar(page, "views");
    const entry = page.getByTestId("saved-view-Q3 products");
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText("Sheet “Q3”");
    await entry.click();
    // the sheet is read again from the same file, then the view is shown on it
    await expect(page.getByTestId("source-line")).toHaveText("quarters.xlsx, sheet “Q3”, only in this browser");
    await expect.poll(() => chips(page, "rows")).toEqual(["Product"]);
    // the sums of Q3's rows (the playground shows a revenue also as an amount next to it)
    await expect.poll(async () => (await tableRows(page)).map((r) => r.slice(0, 2))).toEqual([["Alpha", "35"], ["Beta", "70"], ["Grand Total", "105"]]);
    await expect(page.getByTestId("view-name")).toContainText("Q3 products");
    // the view file downloaded from it names the sheet too
    await toolbar(page, "views");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-view").click()]);
    const file = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(file.source).toMatchObject({ name: "quarters.xlsx", params: { sheet: "Q3" } });
    expect(file.source.id).toMatch(/^quarters\.xlsx#[0-9a-f]{16}$/);
});

test("sheets with the same columns: a view of the same name on each sheet is kept apart and opens on its own sheet", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await load(page, months, "Mar");
    await saveView(page, "Region", "Units", "By region");
    await load(page, months, "Jan");
    await toolbar(page, "views");
    await page.getByTestId("save-as").click();
    await page.getByTestId("saved-view-name").fill("By region");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.locator(".pk-toasts")).toContainText("View “By region” saved");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pivotkit:views:playground")));
    expect(stored.filter((f) => f.name === "By region").map((f) => f.source.params.sheet).sort()).toEqual(["Jan", "Mar"]);

    await page.reload();
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await load(page, months);
    await expect(page.getByTestId("source-line")).toHaveText("months.xlsx, sheet “Jan”, only in this browser");
    await toolbar(page, "views");
    const entries = page.getByTestId("saved-view-By region");
    await expect(entries).toHaveCount(2);
    await expect(entries).toContainText(["Sheet “Mar”", "Sheet “Jan”"]);
    await entries.filter({ hasText: "Sheet “Mar”" }).click();
    await expect(page.getByTestId("source-line")).toHaveText("months.xlsx, sheet “Mar”, only in this browser");
    await expect.poll(async () => (await tableRows(page)).sort()).toEqual([["East", "300"], ["Grand Total", "400"], ["North", "100"]]);
    // reading the sheet was a data step: Undo shows the sheet before it again (the view is the same)
    await page.getByTestId("undo").click();
    await expect(page.getByTestId("source-line")).toHaveText("months.xlsx, sheet “Jan”, only in this browser");
    await expect.poll(async () => (await tableRows(page)).sort()).toEqual([["Grand Total", "3"], ["North", "1"], ["South", "2"]]);
});

test("a view whose sheet the workbook no longer has says so in plain words and keeps the sheet shown", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await load(page, quarters, "Q3");
    await saveView(page, "Product", "Revenue", "Q3 products");
    // a newer quarters.xlsx without the sheet Q3
    const older = fileOf("quarters.xlsx", XLSX, makeXlsx({ sheets: [{ name: "Q1", rows: [["Region", "Units"], ["North", 1]] }, { name: "Q2", rows: [["Team", "Hours"], ["Network", 3]] }] }));
    await load(page, older);
    await toolbar(page, "views");
    await page.getByTestId("saved-view-Q3 products").click();
    await expect(page.locator(".pk-toasts")).toContainText("“Q3 products” was made for the sheet “Q3”, which quarters.xlsx does not have.");
    await expect(page.getByTestId("source-line")).toHaveText("quarters.xlsx, sheet “Q1”, only in this browser");
});

test("Open view file… with a view file made on another sheet of the workbook shown: that sheet is read, then the view", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await load(page, quarters);
    await expect(page.getByTestId("source-line")).toHaveText("quarters.xlsx, sheet “Q1”, only in this browser");
    const file = toViewFile({ version: 2, rows: ["Product"], values: [{ field: "Revenue", agg: "sum" }] }, { name: "From a colleague", source: { id: "quarters.xlsx#0123456789abcdef", name: "quarters.xlsx", params: { sheet: "Q3" } } });
    await toolbar(page, "views");
    await page.getByTestId("load-view").click();
    await page.getByTestId("load-view-text").fill(JSON.stringify(file));
    await page.getByTestId("load-view-apply").click();
    await expect(page.getByTestId("source-line")).toHaveText("quarters.xlsx, sheet “Q3”, only in this browser");
    await expect.poll(() => chips(page, "rows")).toEqual(["Product"]);
    await expect.poll(async () => (await tableRows(page)).map((r) => r.slice(0, 2))).toEqual([["Alpha", "35"], ["Beta", "70"], ["Grand Total", "105"]]);
});
