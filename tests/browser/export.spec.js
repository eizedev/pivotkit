// Export → Copy table and Copy data as JSON, and the drill-down panel: Enlarge and Reduce, its
// export menu (Copy, Copy as JSON, Download CSV, Download Excel), the note on a cut list.
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { expect, test, toolbar } from "./fixtures.js";

/**
 * navigator.clipboard.writeText that keeps what it was given in window.__copied (every browser, no
 * permission), and in window.__inClick whether it was called while the click was being dispatched:
 * Safari refuses a write after an await, so the copy must happen in the click itself.
 */
async function captureClipboard(page) {
    await page.addInitScript(() => {
        const w = /** @type {any} */ (window);
        w.__clicking = false;
        document.addEventListener("click", () => (w.__clicking = true), true);
        // the last listener of the click's way back up: after the report's own
        window.addEventListener("click", () => (w.__clicking = false));
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
                writeText: async (text) => {
                    w.__copied = text;
                    w.__inClick = w.__clicking;
                }
            }
        });
    });
}

const inClick = (page) => page.evaluate(() => /** @type {any} */ (window).__inClick);

const copied = (page) => page.evaluate(() => /** @type {any} */ (window).__copied ?? null);

test.describe("Export menu: copies", () => {
    test("Copy table puts the table as shown on the clipboard, tab-separated, with headers and totals", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=tickets");
        await toolbar(page, "export");
        await page.getByTestId("export-copy-table").click();
        await expect(page.locator(".pk-toasts")).toContainText("Table copied");
        expect(await inClick(page)).toBe(true);
        const lines = (await copied(page)).trimEnd().split("\r\n");
        expect(lines[0].split("\t")).toContain("P1 Critical");
        expect(lines.at(-1)).toMatch(/^Grand Total\t.*\t4,000$/);
    });

    test("Copy data as JSON copies the numbers with their labels, not the view", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=tickets");
        await toolbar(page, "export");
        await page.getByTestId("export-copy-json").click();
        await expect(page.locator(".pk-toasts")).toContainText("Data copied as JSON");
        const json = JSON.parse(await copied(page));
        expect(json.rowHeaders).toEqual(["Team"]);
        expect(json.columns.at(-1)).toMatchObject({ total: 2 });
        expect(json.rows.at(-1)).toMatchObject({ labels: ["Grand Total"], total: 2 });
        expect(json.rows.at(-1).values.at(-1)).toBe(4000);
        expect(json).not.toHaveProperty("format");
    });

    test("a page that does not allow copying gets a note, not a silent failure", async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("NotAllowedError")) } });
            document.execCommand = () => false;
        });
        await page.goto("?data=tickets");
        await toolbar(page, "export");
        await page.getByTestId("export-copy-table").click();
        await expect(page.locator(".pk-toasts")).toContainText("This page does not allow copying. Download a file instead.");
    });
});

test.describe("drill-down panel", () => {
    test("Enlarge fills the report, Escape brings it back with the focus kept, then closes", async ({ page }) => {
        await page.goto("?data=tickets");
        await page.locator('[data-testid="pivot-table"] td.pk-clickable').first().click();
        const panel = page.getByTestId("drill-panel");
        await expect(panel).toBeVisible();
        const root = await page.locator(".pk-root").boundingBox();
        const small = await panel.boundingBox();
        expect(small.width).toBeLessThan(root.width * 0.8);
        const enlarge = page.getByTestId("drill-enlarge");
        await expect(enlarge).toHaveText("Enlarge");
        // by keyboard (Safari does not focus a clicked button)
        await enlarge.focus();
        await page.keyboard.press("Enter");
        await expect(enlarge).toHaveAttribute("data-pk-on", "");
        await expect(enlarge).not.toHaveAttribute("aria-pressed");
        await expect(enlarge).toHaveText("Reduce");
        // the report's inner width (inside its border)
        const inner = await page.locator(".pk-root").evaluate((el) => el.clientWidth);
        await expect.poll(async () => Math.round((await panel.boundingBox()).width)).toBe(inner);
        await expect(enlarge).toBeFocused();
        // Escape: back to its size first, the panel stays open and the focus with the button
        await page.keyboard.press("Escape");
        await expect(enlarge).not.toHaveAttribute("data-pk-on");
        await expect(panel).toBeVisible();
        await expect(enlarge).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
        // not part of the view: a new panel opens at its size
        await page.locator('[data-testid="pivot-table"] td.pk-clickable').first().click();
        await expect(page.getByTestId("drill-enlarge")).toHaveText("Enlarge");
    });

    test("a long text wraps inside its column instead of widening it", async ({ page }) => {
        await page.goto("?data=earthquakes");
        await page.locator('[data-testid="pivot-table"] td.pk-clickable').first().click();
        const panel = page.getByTestId("drill-panel");
        await expect(panel).toBeVisible();
        const widths = await panel.locator(".pk-drill-text").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
        expect(widths.length).toBeGreaterThan(0);
        const em = await panel.locator(".pk-drill-table").evaluate((t) => parseFloat(getComputedStyle(t).fontSize));
        for (const w of widths) expect(w).toBeLessThanOrEqual(22 * em + 1);
    });

    test("Export: Copy, Copy as JSON, Download CSV and Excel, named after the cell", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=tickets");
        const cell = page.locator('[data-testid="pivot-table"] td.pk-clickable').first();
        const count = Number((await cell.textContent()).replace(/,/g, ""));
        await cell.click();
        const panel = page.getByTestId("drill-panel");
        await panel.getByTestId("drill-export").click();
        await page.getByTestId("drill-copy").click();
        await expect(page.locator(".pk-toasts")).toContainText(`Copied ${count} rows`);
        expect(await inClick(page)).toBe(true);
        const lines = (await copied(page)).trimEnd().split("\r\n");
        expect(lines).toHaveLength(count + 1);
        expect(lines[0].split("\t")).toContain("Ticket");
        // the menu closed and the focus went back to its button, inside the panel
        await expect(panel.getByTestId("drill-export")).toBeFocused();

        await panel.getByTestId("drill-export").click();
        await page.getByTestId("drill-json").click();
        const rows = JSON.parse(await copied(page));
        expect(rows).toHaveLength(count);
        expect(Object.keys(rows[0])).toContain("Ticket");

        await panel.getByTestId("drill-export").click();
        const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("drill-csv").click()]);
        // the cell's path: "Service Desk – P1 Critical.csv" (WebKit on Linux reports spaces as "_")
        expect(csv.suggestedFilename()).toMatch(/^Service[ _]Desk[ _]–[ _]P1[ _]Critical\.csv$/);
        const text = (await readFile(await csv.path(), "utf8")).replace(/^\uFEFF/, "");
        expect(text.trimEnd().split("\r\n")).toHaveLength(count + 1);

        await panel.getByTestId("drill-export").click();
        const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("drill-xlsx").click()]);
        expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
        const files = unzipSync(new Uint8Array(await readFile(await xlsx.path())));
        expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain('state="frozen"');
        await expect(page.locator(".pk-toasts")).toContainText(`(${count} rows)`);
    });

    test("with more rows than the panel shows, every export holds those and says so", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=tickets");
        // the grand total: all 4,000 tickets, the panel shows the first 1,000
        await page.locator('[data-testid="pivot-table"] td.pk-clickable').last().click();
        const panel = page.getByTestId("drill-panel");
        await expect(page.getByTestId("drill-count")).toHaveText("Showing the first 1,000 of 4,000 rows");
        await panel.getByTestId("drill-export").click();
        await expect(page.getByTestId("drill-export-note")).toHaveText("Holds the first 1,000 of 4,000 rows, as shown here.");
        await page.getByTestId("drill-copy").click();
        await expect(page.locator(".pk-toasts")).toContainText("Copied 1,000 of 4,000 rows");
        expect((await copied(page)).trimEnd().split("\r\n")).toHaveLength(1001);
    });

    test("German: the menu, the note and the toasts", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=tickets&lang=de");
        await page.locator('[data-testid="pivot-table"] td.pk-clickable').last().click();
        const panel = page.getByTestId("drill-panel");
        await expect(panel.getByTestId("drill-enlarge")).toHaveText("Vergrößern");
        await panel.getByTestId("drill-export").click();
        await expect(page.getByTestId("drill-json")).toHaveText("Als JSON kopieren");
        await page.getByTestId("drill-json").click();
        await expect(page.locator(".pk-toasts")).toContainText("1.000 von 4.000 Zeilen als JSON kopiert");
    });
});
