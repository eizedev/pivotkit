// pivotkit-xlsx in the browser, as a page without a bundler loads it (dist/), under a strict
// Content-Security-Policy without blob: workers: a person picks a workbook with the file input.
import { test, expect } from "./fixtures.js";
import { makeXlsx, ticketRows, TICKET_COLUMNS } from "../../packages/pivotkit-xlsx/test/make-xlsx.js";

async function pick(page, name, bytes) {
    await page.locator("#file").setInputFiles({ name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(bytes) });
    await expect(page.locator("#result[data-done]")).toBeAttached({ timeout: 30_000 });
    return JSON.parse(await page.locator("#result").textContent());
}

test("a workbook with a sheet of several megabytes is read without a worker and without a CSP violation", async ({ page }) => {
    await page.goto("pages/xlsx.html");
    // 5,000 rows: the sheet unpacks to several megabytes, where fflate's own unzip would start a blob: worker
    const bytes = makeXlsx({ sheets: [{ name: "Hidden", hidden: true, rows: [["x"]] }, { name: "Tickets", rows: () => ticketRows(5_000), usedRangeTo: 200_000, emptyCells: 2 }] });
    const result = await pick(page, "tickets.xlsx", bytes);
    expect(result.error).toBeUndefined();
    expect(result.violations).toEqual([]);
    expect(result.rows).toBe(5_000);
    expect(result.columns).toEqual(TICKET_COLUMNS);
    expect(result.types.slice(0, 4)).toEqual(["number", "string", "date", "date"]);
    expect(result.first[0]).toBe(27_000);
    expect(result.notes).toContain('Read sheet "Tickets" of 2 sheets.');
    expect(result.notes).toContain("The sheet's used range reaches row 200,000; values end at row 5,003, the empty rows below were skipped.");
});

test("a workbook with macros is refused with what to do, nothing parsed", async ({ page }) => {
    await page.goto("pages/xlsx.html");
    const result = await pick(page, "budget.xlsx", makeXlsx({ sheets: [{ name: "S", rows: [["A"], [1]] }], macros: true }));
    expect(result.reason).toBe("MACROS");
    expect(result.error).toBe('"budget.xlsx": the workbook holds macros (vbaProject.bin); save it as an Excel workbook (.xlsx) without macros, or as CSV.');
    expect(result.violations).toEqual([]);
});
