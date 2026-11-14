// Export → Source data: every row of the data behind the report as a file (the playground turns it on
// with exportData), set apart from the table's exports; and the owner's case end to end: the view and
// the data downloaded from the report, rendered by the command line, give the table on the screen.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, tableRows, test, toolbar } from "./fixtures.js";

const CLI = fileURLToPath(new URL("../../packages/pivotkit-cli/bin/pivotkit.js", import.meta.url));
const run = promisify(execFile);

/** The groups of the open Export menu: each title with the entries' test ids, in order. */
const exportGroups = (page) =>
    page.locator(".pk-popover .pk-section").evaluateAll((groups) =>
        groups.map((g) => ({ title: g.querySelector(".pk-section-title")?.textContent?.trim() ?? "", items: [...g.querySelectorAll("[data-testid^='export-']")].map((e) => e.getAttribute("data-testid")) }))
    );

test.describe("Export → Source data", () => {
    test("a group of its own after the table's exports, each entry explained; on while no field is placed", async ({ page }) => {
        await page.goto("?data=sales&empty");
        await toolbar(page, "export");
        const groups = await exportGroups(page);
        expect(groups.at(-1)).toEqual({ title: "Source data", items: ["export-data-csv", "export-data-json"] });
        await expect(page.getByTestId("export-data-csv")).toHaveText("All rows as CSV (.csv)");
        await expect(page.getByTestId("export-csv")).toHaveText(/Table as CSV \(\.csv\)/);
        // no field placed: the table's exports are off, the rows are there
        await expect(page.getByTestId("export-csv")).toBeDisabled();
        await expect(page.getByTestId("export-data-csv")).toBeEnabled();
        await page.getByTestId("setting-info-exportDataCsv").click();
        await expect(page.locator(".pk-info-pop")).toContainText("before grouping, filters and totals");
    });

    test("German: Quelldaten, Alle Zeilen als CSV", async ({ page }) => {
        await page.goto("?data=sales&lang=de");
        await toolbar(page, "export");
        await expect(page.getByTestId("export-data-csv")).toHaveText("Alle Zeilen als CSV (.csv)");
        await expect(page.getByTestId("export-csv")).toHaveText("Tabelle als CSV (.csv)");
        expect((await exportGroups(page)).at(-1).title).toBe("Quelldaten");
    });

    test("All rows as CSV and as JSON: every row, the fields' own names, values not formatted, the report's filters not applied", async ({ page }) => {
        // the preset filters to the open tickets; the file has every ticket
        await page.goto("?data=tickets&preset=2&rows=2000");
        await toolbar(page, "export");
        const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-data-csv").click()]);
        expect(csv.suggestedFilename()).toBe("pivotkit-tickets-data.csv");
        await expect(page.locator(".pk-toasts")).toContainText("Exported pivotkit-tickets-data.csv");
        const lines = (await readFile(await csv.path(), "utf8")).replace(/^\uFEFF/, "").trimEnd().split("\r\n");
        expect(lines[0]).toBe("Ticket,Team,Priority,Status,Category,Channel,Created,Lead hours,SLA met,Reopened");
        expect(lines).toHaveLength(2001);
        // a time as ISO text, a duration in hours as the number it is, yes/no as true/false
        expect(lines[1]).toMatch(/^INC-100000,[^,]+,P\d [A-Za-z]+,[A-Za-z ]+,[A-Za-z]+,[A-Za-z]+,\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d,(\d+(\.\d)?)?,(true|false)?,(true|false)$/);
        await toolbar(page, "export");
        const [json] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-data-json").click()]);
        expect(json.suggestedFilename()).toBe("pivotkit-tickets-data.json");
        const rows = JSON.parse(await readFile(await json.path(), "utf8"));
        expect(rows).toHaveLength(2000);
        expect(Object.keys(rows[0])).toEqual(["Ticket", "Team", "Priority", "Status", "Category", "Channel", "Created", "Lead hours", "SLA met", "Reopened"]);
        expect(new Set(rows.map((r) => r.Status)).size).toBeGreaterThan(3);
    });

    test("the owner's case: the view and the data downloaded from the report, rendered by the CLI, give the table on the screen", async ({ page, context }) => {
        await page.goto("?data=weather");
        // the snapshot loads as a chunk of its own: the table of the 14 cities first
        await expect.poll(async () => (await tableRows(page)).length).toBe(14);
        const screen = await tableRows(page);
        await toolbar(page, "views");
        const [view] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-view").click()]);
        await toolbar(page, "export");
        const [data] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-data-csv").click()]);
        const dir = fileURLToPath(new URL(".", `file://${await view.path()}`));
        const viewFile = `${await view.path()}`;
        const dataFile = `${await data.path()}.csv`;
        await data.saveAs(dataFile);
        const out = `${dir}weather-report.html`;
        const { stdout } = await run(process.execPath, [CLI, "render", viewFile, "--data", dataFile, "-o", out, "--strict", "--json"]);
        expect(JSON.parse(stdout).ok).toBe(true);
        // the report's table opened as a page: its body rows as the screen shows them
        const report = await context.newPage();
        await report.setContent(await readFile(out, "utf8"));
        const rendered = await report.locator("table tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
        expect(rendered).toEqual(screen);
        await report.close();
    });
});
