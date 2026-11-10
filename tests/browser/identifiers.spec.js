// An identifier field (#113): a number field named ID, with one six-digit integer per row, is counted
// when it is added as a value (Sum stays a choice) and shows its items without grouping separators on
// Rows and in the drill-down, in English and German (pages/nav.html).
import { chips, expect, openLevel, openZones, test } from "./fixtures.js";

test.describe("identifier fields (#113)", () => {
    for (const lang of ["en", "de"]) {
        test(`an ID field is counted when added as a value and shows without separators (${lang})`, async ({ page }) => {
            await page.goto(`pages/nav.html?view=none&lang=${lang}`);
            await openZones(page);
            const count = lang === "de" ? "Anzahl von ID" : "Count of ID";
            await page.locator('.pk-field[data-field="ID"] .pk-field-name').click();
            await expect.poll(() => chips(page, "values")).toEqual([count]);
            // other number fields are summed as before
            await page.locator('.pk-field[data-field="Memory GB"] .pk-field-name').click();
            await expect.poll(() => chips(page, "values")).toEqual([count, lang === "de" ? "Summe von Memory GB" : "Sum of Memory GB"]);
            // ID on Rows: its items as they are, 109400 and not 109,400 / 109.400
            await page.getByTestId("field-menu-ID").click();
            await page.getByRole("menuitem", { name: lang === "de" ? "Zu Zeilen hinzufügen" : "Add to Rows" }).click();
            await expect.poll(() => chips(page, "rows")).toEqual(["ID"]);
            const labels = await page.locator(".pk-table tbody th.pk-rowHeader .pk-th-text").evaluateAll((els) => els.slice(0, 5).map((e) => e.textContent));
            expect(labels).toEqual(["109400", "109401", "109402", "109403", "109404"]);
            // the drill-down shows the ID as it is
            await page.locator(".pk-table tbody td.pk-clickable").first().click();
            const drill = page.getByTestId("drill-panel");
            await expect(drill).toBeVisible();
            const head = await drill.locator(".pk-drill-table thead th").allTextContents();
            const col = head.findIndex((h) => h.trim() === "ID");
            expect(col).toBeGreaterThanOrEqual(0);
            await expect(drill.locator(".pk-drill-table tbody tr").first().locator("td").nth(col)).toHaveText("109400");
            // Sum is still a choice of the value's menu
            await page.keyboard.press("Escape");
            await page.getByTestId(`chip-menu-${count}`).click();
            await openLevel(page.locator(".pk-chip-menu"), "summarize");
            await expect(page.locator(".pk-chip-menu").getByRole("menuitemradio", { name: lang === "de" ? "Summe" : "Sum", exact: true })).toBeVisible();
        });
    }
});
