// Export → HTML report, Chart image (.svg) and Print or save as PDF: the files a person downloads, the
// report opened on its own (its policy loads and runs nothing), and the print frame the browser's
// dialog prints, with print() stubbed (a headless browser has no dialog).
import { readFile } from "node:fs/promises";
import { capturePrint, expect, test, toolbar } from "./fixtures.js";

const printed = (page) => page.evaluate(() => /** @type {any} */ (window).__printed ?? null);

test.describe("Export menu: HTML report, SVG and print", () => {
    test("HTML report (.html): the table as shown, the details, a policy first in <head>; it opens on its own", async ({ page, context }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "export");
        await expect(page.getByTestId("export-html")).toHaveText(/HTML report \(\.html\)/);
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-html").click()]);
        expect(download.suggestedFilename()).toBe("pivotkit-tickets.html");
        await expect(page.locator(".pk-toasts")).toContainText("Exported pivotkit-tickets.html");
        const html = await readFile(await download.path(), "utf8");
        expect(html).toMatch(/^<!doctype html>\n<html lang="en-US" dir="ltr">\n<head>\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:/);
        // the table view has no chart in its report
        expect(html).not.toContain("pk-report-chart\"");
        // opened as a page of its own: the table, bold totals, nothing loaded or run
        const report = await context.newPage();
        const problems = [];
        report.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
        await report.setContent(html);
        const grand = report.locator("th", { hasText: /^Grand Total$/ }).first();
        await expect(grand).toBeVisible();
        expect(Number(await grand.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
        await expect(report.locator("tbody tr").last().locator("td").last()).toHaveText("4,000");
        await expect(report.locator(".pk-report-details")).toContainText("Rows");
        expect(problems).toEqual([]);
        await report.close();
    });

    test("Chart image (.svg): off while the table is shown, with the reason; with the chart an SVG that draws", async ({ page, context }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "export");
        await expect(page.getByTestId("export-svg")).toBeDisabled();
        await expect(page.getByTestId("export-svg")).toContainText("Switch to Chart first.");
        await page.keyboard.press("Escape");
        await page.getByTestId("show-chart").click();
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await toolbar(page, "export");
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-svg").click()]);
        expect(download.suggestedFilename()).toBe("pivotkit-tickets.svg");
        const svg = await readFile(await download.path(), "utf8");
        expect(svg).toMatch(/^<svg width="\d+" height="\d+" xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
        expect(svg).not.toMatch(/<script|\son\w+=|\sstyle=/i);
        // the chart's size on the screen, and its categories as text
        const box = await page.getByTestId("pivot-chart").boundingBox();
        expect(Number(/width="(\d+)"/.exec(svg)[1])).toBe(Math.round(box.width));
        // shown as an image, it draws (a broken SVG has no size)
        const viewer = await context.newPage();
        await viewer.setContent(`<img id="i" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`);
        await expect.poll(() => viewer.locator("#i").evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
        await viewer.close();
    });

    test("Print or save as PDF: the report in a sandboxed frame, styles adopted, the chart inline; the frame goes after printing", async ({ page }) => {
        await page.goto("?data=tickets");
        await capturePrint(page);
        await page.getByTestId("show-chart").click();
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await toolbar(page, "export");
        await expect(page.getByTestId("export-print")).toHaveText(/Print or save as PDF…/);
        await page.getByTestId("export-print").click();
        await expect.poll(() => printed(page)).not.toBeNull();
        const p = await printed(page);
        expect(p.sandbox).toBe("allow-same-origin allow-modals");
        expect(p.lang).toBe("en-US");
        expect(p.styleElements).toBe(0);
        expect(p.sheets).toBe(1);
        expect(p.css).toContain("@page");
        expect(p.css).toMatch(/thead \{ display: table-header-group; \}/);
        expect(Number(p.grand)).toBeGreaterThanOrEqual(700);
        expect(p.body).toMatch(/<figure class="pk-report-chart"><svg /);
        expect(p.body).toContain("<table class=\"pk-table\">");
        // nothing was downloaded, nothing said: the dialog is the answer
        await expect(page.locator(".pk-toasts")).not.toContainText("Exported");
    });
});
