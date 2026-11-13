// Export → Copy table and Copy data as JSON, and the drill-down panel: Enlarge and Reduce, its
// export menu (Copy, Copy as JSON, Download CSV, Download Excel), the note on a cut list.
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { chipMenu, expect, test, toolbar } from "./fixtures.js";

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
    // the panel's table is built by the menus' code (drill-table.js): a click before it is here is not lost
    test("a value clicked before the menus have loaded opens its rows once they are here", async ({ page }) => {
        let release = () => {};
        const held = new Promise((resolve) => (release = resolve));
        await page.route(/\/chunks\/menus-[^/]+\.js$/, async (route) => {
            await held;
            await route.continue();
        });
        // the report asks for the menus right after its first render; Firefox holds the load event
        // until that request is answered, so wait for the document only
        await page.goto("?data=tickets", { waitUntil: "domcontentloaded" });
        const cell = page.locator('[data-testid="pivot-table"] td.pk-clickable').first();
        await cell.click();
        const panel = page.getByTestId("drill-panel");
        await expect(panel).toHaveCount(0);
        release();
        await expect(panel).toBeVisible();
        await expect(panel.locator(".pk-drill-path")).not.toBeEmpty();
        await expect(panel.getByTestId("drill-count")).toContainText(/\d/);
        await expect(panel.locator("tbody tr").first()).toBeVisible();
        await expect(panel.getByRole("button", { name: "Close" })).toBeFocused();
    });
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

test.describe("what a copy says, and the Export menu's groups", () => {
    test("a copy from the drill-down is said on top of the panel, in plain words", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=tickets");
        await page.locator('[data-testid="pivot-table"] td.pk-clickable').first().click();
        await page.getByTestId("drill-panel").getByTestId("drill-export").click();
        await page.getByTestId("drill-copy").click();
        const toast = page.locator(".pk-toast").last();
        await expect(toast).toContainText("tab-separated, pastes into Excel or Google Sheets as columns");
        // seen, not hidden behind the open panel
        const shown = await toast.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return hit === el || el.contains(hit);
        });
        expect(shown).toBe(true);
    });

    test("Download and Copy are titled groups that do not fold; the i says what Copy table gives", async ({ page }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "export");
        await page.getByTestId("setting-info-copyTable").focus();
        await expect(page.locator(".pk-info-pop")).toContainText("tab-separated, pastes into Excel or Google Sheets as columns");
        await expect(page.getByRole("group", { name: "Download" })).toBeVisible();
        await expect(page.getByRole("group", { name: "Copy" })).toBeVisible();
        // nothing folds: no title is a button
        await expect(page.locator(".pk-popover button.pk-section-title, .pk-popover [data-section]")).toHaveCount(0);
        await expect(page.getByTestId("export-xlsx")).toBeVisible();
    });
});

// #212: a colour scale in the theme's colours (Highlight, Colour scale, no colours of the view's own)
// goes into the workbook in the colours the report resolves from its tokens, low end first, so a
// corporate theme carries over; a dark report exports the light theme's colours (a workbook is
// light with black text)
test.describe("Excel export: a colour scale in the theme's colours", () => {
    /** The colour scale's colours in the downloaded workbook, as #rrggbb, low to high. */
    async function exportedScale(page) {
        await page.keyboard.press("Escape");
        await toolbar(page, "export");
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-xlsx").click()]);
        const sheet = strFromU8(unzipSync(await readFile(await download.path()))["xl/worksheets/sheet1.xml"]);
        const scale = sheet.match(/<colorScale>(.*?)<\/colorScale>/)[1];
        // the first colour belongs to the lowest value
        expect(scale.startsWith('<cfvo type="min"/>')).toBe(true);
        return [...scale.matchAll(/<color rgb="FF([0-9A-F]{6})"\/>/g)].map((m) => `#${m[1].toLowerCase()}`);
    }

    /** The colour scale's tokens as the report resolves them. */
    const tokens = (page) =>
        page.locator(".pk-root").evaluate((root) => {
            const style = getComputedStyle(root);
            return ["--pk-scale-low", "--pk-scale-high"].map((n) => style.getPropertyValue(n).trim().toLowerCase());
        });

    /** The background of the table's cells with the lowest and the highest value. */
    const ends = (page) =>
        page.locator('[data-testid="pivot-table"] tbody td.pk-has-scale').evaluateAll((cells) => {
            const num = (td) => Number(td.textContent.replace(/[^\d.-]/g, ""));
            const sorted = [...cells].sort((a, b) => num(a) - num(b));
            const bg = (td) => getComputedStyle(td).backgroundColor;
            return { low: bg(sorted[0]), high: bg(sorted.at(-1)) };
        });

    async function scaleRevenue(page) {
        await chipMenu(page, "Sum of Revenue");
        await page.locator(".pk-chip-menu").getByTestId("cond-colorScale").click();
        await expect(page.locator(".pk-td.pk-has-scale").first()).toBeVisible();
    }

    test("light: the workbook gets the report's resolved scale colours, light for low, strong for high", async ({ page }) => {
        await page.goto("?data=sales&theme=light");
        await scaleRevenue(page);
        const [low, high] = await tokens(page);
        expect(await exportedScale(page)).toEqual([low, high]);
        // the theme's heat colours: light blue for low, strong blue for high, never Excel's red for low
        expect([low, high]).toEqual(["#eaf1fb", "#2a78d6"]);
        // the report draws the lowest value lighter than the highest
        const { low: lowBg, high: highBg } = await ends(page);
        const light = (rgb) => rgb.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
        expect(light(lowBg)).toBeGreaterThan(light(highBg));
    });

    test("a corporate theme's tokens carry over into the workbook", async ({ page }) => {
        await page.goto("?data=sales&theme=light");
        await page.addStyleTag({ content: ".pk-root { --pk-heat-low: #fff5e6; --pk-heat-high: #b34700; }" });
        await scaleRevenue(page);
        expect(await exportedScale(page)).toEqual(["#fff5e6", "#b34700"]);
        // a host that sets the scale's own tokens, a middle colour too, gets those
        await page.addStyleTag({ content: ".pk-root { --pk-scale-low: rgb(0, 0, 255); --pk-scale-mid: white; --pk-scale-high: #c00; }" });
        expect(await exportedScale(page)).toEqual(["#0000ff", "#ffffff", "#cc0000"]);
        // data bars in the theme's colour: the report's --pk-chart-1
        await page.addStyleTag({ content: ".pk-root { --pk-chart-1: #6b2fa0; }" });
        await chipMenu(page, "Sum of Revenue");
        await page.locator(".pk-chip-menu").getByTestId("cond-dataBar").click();
        await expect(page.locator(".pk-td.pk-has-bar").first()).toBeVisible();
        await page.keyboard.press("Escape");
        await toolbar(page, "export");
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-xlsx").click()]);
        const sheet = strFromU8(unzipSync(await readFile(await download.path()))["xl/worksheets/sheet1.xml"]);
        expect(sheet).toMatch(/<dataBar>.*<color rgb="FF6B2FA0"\/><\/dataBar>/);
    });

    test("dark: the workbook gets the light theme's colours, readable with Excel's black text", async ({ page }) => {
        await page.goto("?data=sales&theme=dark");
        await scaleRevenue(page);
        expect(await exportedScale(page)).toEqual(["#eaf1fb", "#2a78d6"]);
    });
});
