// A view made on a workbook's sheet other than the first (issue #252): it names its sheet, and after
// a reload and the same workbook loaded again (the preview starts on the first sheet) opening it
// reads that sheet of the file again and shows the view on it. Sheets with the same columns keep a
// view of the same name each; a view whose sheet the workbook no longer has says so. A sheet the
// reader has notes on, or without rows, stays in the preview; Cancel, a host's refusal and another
// file dropped meanwhile leave the sheet shown and the view unopened.
//
// The workbooks are pivotkit-xlsx's test generator's SHEET_BOOKS, the same the CLI's tests read.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

test("a draft view the command line made for a workbook's sheet opens in the report on that sheet, as a view of this file", async ({ page }) => {
    // pivotkit describe book.xlsx --suggest --sheet 2025, run as a user runs it
    const dir = mkdtempSync(join(tmpdir(), "pivotkit-draft-"));
    writeFileSync(join(dir, "book.xlsx"), SHEET_BOOKS.sales());
    const cli = fileURLToPath(new URL("../../packages/pivotkit-cli/bin/pivotkit.js", import.meta.url));
    const draft = JSON.parse(execFileSync(process.execPath, [cli, "describe", "book.xlsx", "--suggest", "--sheet", "2025"], { cwd: dir, encoding: "utf8" }));
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await load(page, fileOf("book.xlsx", XLSX, SHEET_BOOKS.sales()));
    await expect(page.getByTestId("source-line")).toHaveText("book.xlsx, sheet “Readme”, only in this browser");
    await toolbar(page, "views");
    await page.getByTestId("load-view").click();
    await page.getByTestId("load-view-text").fill(JSON.stringify(draft));
    await page.getByTestId("load-view-apply").click();
    // no question about other data: the sheet the draft names is read, then the draft shown
    await expect(page.getByTestId("source-line")).toHaveText("book.xlsx, sheet “2025”, only in this browser");
    await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
    await expect.poll(() => chips(page, "cols")).toEqual(["Order date by month"]);
    await expect(page.getByTestId("view-name")).toContainText("Draft: Sum of Units by Region and Order date by month");
    // the same table as the command line renders from the draft: each region's total and the grand total
    const csv = execFileSync(process.execPath, [cli, "render", "-", "--data", "book.xlsx", "-f", "csv"], { cwd: dir, encoding: "utf8", input: JSON.stringify(draft) });
    const totals = csv.trim().split(/\r?\n/).map((line) => line.split(",")).filter((cells) => ["North", "South", "East", "West", "Grand Total"].includes(cells[0])).map((cells) => [cells[0], cells.at(-1)]);
    expect(totals).toHaveLength(5);
    await expect.poll(async () => (await tableRows(page)).filter((r) => totals.some(([name]) => name === r[0])).map((r) => [r[0], r.at(-1)])).toEqual(totals);
});

/**
 * A workbook with a small first sheet and a sheet "Big" of 20,000 rows the reader has no notes on: a
 * read of it that is not stopped loads it by itself, so a test sees it.
 */
function bigBook() {
    const rows = function* () {
        yield ["State", "Hours"];
        for (let i = 0; i < 20_000; i++) yield [["Open", "Closed", "On hold"][i % 3], i % 7];
    };
    return makeXlsx({ sheets: [{ name: "Small", rows: [["Region", "Units"], ["North", 1]] }, { name: "Big", rows }] });
}

/**
 * Runs `act` in the page the moment the dialog shows its progress: pivotkit-xlsx reads on the page, in
 * steps, and a fast browser reads a large sheet before a test could click (a MutationObserver sees the
 * progress in the same task React shows it). `act` is "cancel" or a file to drop onto the report.
 */
async function whenReading(page, act) {
    await page.evaluate((what) => {
        const run = () => {
            if (what === "cancel") {
                document.querySelector('[data-testid="import-cancel"]').click();
                return;
            }
            const dt = new DataTransfer();
            dt.items.add(new File([what.text], what.name, { type: what.type }));
            const target = document.querySelector('[data-testid="pivot-table"]');
            for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        };
        const watch = new MutationObserver(() => {
            if (document.querySelector('[data-testid="import-progress"]')) {
                watch.disconnect();
                window.__acted = true;
                run();
            }
        });
        watch.observe(document.body, { childList: true, subtree: true });
    }, act);
}

/** Opens a view file made on `sheet` of the workbook `file` through Open view file…. */
async function openViewFile(page, name, file, sheet, rows = ["Region"], value = "Units") {
    const view = toViewFile({ version: 2, rows, values: [{ field: value, agg: "sum" }] }, { name, source: { id: `${file}#0123456789abcdef`, name: file, params: { sheet } } });
    await toolbar(page, "views");
    await page.getByTestId("load-view").click();
    await page.getByTestId("load-view-text").fill(JSON.stringify(view));
    await page.getByTestId("load-view-apply").click();
}

// a saved view read another sheet without its preview, so the reader's notes on it were never shown (#274)
test("a sheet the reader has notes on is not loaded by itself: the preview shows the notes, Load data opens the view", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const book = makeXlsx({ sheets: [{ name: "Plain", rows: [["Region", "Units"], ["North", 1]] }, { name: "Messy", rows: [["Region", null, "Units"], ["North", "x", 4], ["South", "y", 6]] }] });
    await load(page, fileOf("notes.xlsx", XLSX, book));
    await openViewFile(page, "Messy units", "notes.xlsx", "Messy");
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog.getByTestId("import-notes")).toContainText("Column 2 has no name; it is named “Column 2”.");
    await expect(dialog.getByTestId("import-apply")).toBeFocused();
    // nothing is loaded yet
    await expect(page.getByTestId("source-line")).toHaveText("notes.xlsx, sheet “Plain”, only in this browser");
    await dialog.getByTestId("import-apply").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("source-line")).toHaveText("notes.xlsx, sheet “Messy”, only in this browser");
    await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
    await expect.poll(async () => (await tableRows(page)).sort()).toEqual([["Grand Total", "10"], ["North", "4"], ["South", "6"]]);
    await expect(page.getByTestId("view-name")).toContainText("Messy units");
});

// follow-ups of #254 (#277): Cancel, a host's refusal, another file and an empty sheet while a view reads its sheet
test("Cancel while the sheet of a view is read leaves the sheet and the view shown, and says nothing", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const book = bigBook();
    await load(page, fileOf("big.xlsx", XLSX, book));
    await whenReading(page, "cancel");
    await openViewFile(page, "Big by state", "big.xlsx", "Big", ["State"], "Hours");
    const dialog = page.getByTestId("import-dialog");
    await expect.poll(() => page.evaluate(() => window.__acted)).toBe(true);
    await expect(dialog).toHaveCount(0);
    // the read was stopped: the sheet never loads afterwards (it would by itself)
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId("source-line")).toHaveText("big.xlsx, sheet “Small”, only in this browser");
    await expect.poll(() => fieldNames(page)).toEqual(["Region", "Units"]);
    await expect(page.getByTestId("view-name")).toHaveCount(0);
    await expect(page.locator(".pk-toasts")).not.toContainText("was not opened");
});

test("another file dropped while the sheet of a view is read: its preview takes over, and the view is not opened on it", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const book = bigBook();
    await load(page, fileOf("big.xlsx", XLSX, book));
    await whenReading(page, fileOf("teams.csv", "text/csv", "Team,Hours\nNetwork,3\nServer,4\n"));
    await openViewFile(page, "Big by state", "big.xlsx", "Big", ["State"], "Hours");
    await expect.poll(() => page.evaluate(() => window.__acted)).toBe(true);
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toContainText("Load teams.csv");
    await dialog.getByTestId("import-apply").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("source-line")).toHaveText("teams.csv, only in this browser");
    await expect.poll(() => fieldNames(page)).toEqual(["Team", "Hours"]);
    // the read of the sheet was stopped: it never loads over the file (it would by itself), and the
    // view stays unopened
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("source-line")).toHaveText("teams.csv, only in this browser");
    await expect.poll(() => chips(page, "rows")).toEqual([]);
    await expect(page.getByTestId("view-name")).toHaveCount(0);
});

test("a sheet without rows: the preview says so and Load data stays off; Cancel leaves the sheet shown", async ({ page }) => {
    await page.goto("?data=sales&import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    const book = makeXlsx({ sheets: [{ name: "Data", rows: [["Region", "Units"], ["North", 1]] }, { name: "Empty", rows: [["Region", "Units"]] }] });
    await load(page, fileOf("empty.xlsx", XLSX, book));
    await openViewFile(page, "Empty units", "empty.xlsx", "Empty");
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog.getByTestId("import-empty")).toBeVisible();
    await expect(dialog.getByTestId("import-apply")).toBeDisabled();
    await dialog.getByTestId("import-cancel").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("source-line")).toHaveText("empty.xlsx, sheet “Data”, only in this browser");
    await expect(page.getByTestId("view-name")).toHaveCount(0);
    await expect(page.locator(".pk-toasts")).not.toContainText("was not opened");
});

test("a host that refuses the sheet of a view (onDataLoad returns false): the sheet shown stays, the view is not opened, a note says so", async ({ page }) => {
    await page.goto("pages/host.html?import");
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await load(page, quarters);
    await expect(page.getByTestId("source-line")).toHaveText("quarters.xlsx, sheet “Q1”, only in this browser");
    await page.evaluate(() => (window.__refuseSheet = "Q3"));
    await openViewFile(page, "From a colleague", "quarters.xlsx", "Q3", ["Product"], "Revenue");
    await expect(page.locator(".pk-toasts")).toContainText("“From a colleague” was not opened: the sheet “Q3” was not loaded.");
    await expect(page.getByTestId("import-dialog")).toHaveCount(0);
    await expect(page.getByTestId("source-line")).toHaveText("quarters.xlsx, sheet “Q1”, only in this browser");
    await expect.poll(() => fieldNames(page)).toEqual(["Region", "Units"]);
    const loads = await page.evaluate(() => window.__loads.map((l) => [l.cause, l.sheet]));
    expect(loads).toEqual([["load", "Q1"], ["load", "Q3"]]);
});
