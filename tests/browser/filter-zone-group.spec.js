// A date in the Filters zone is grouped from its chip's menu (#100): Group offers the units, a unit
// puts the grouping in the date's place among the Filters, and its Filter level then lists those
// units' items (years, months), English and German.
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, test } from "./fixtures.js";

/** The sales data with Month and Product in Filters, Region in Rows. */
const VIEW = { rows: ["Region"], filters: [{ field: "Product", type: "in", items: [], not: true }, { field: "Month", type: "in", items: [], not: true }], values: [{ field: "Revenue", agg: "sum" }] };
const filterChips = (page) => page.locator('[data-zone="filters"] .pk-chip').evaluateAll((els) => els.map((e) => e.getAttribute("data-chip")));

for (const [lang, t] of [
    ["en", { group: "Group", year: "Year", grouped: "Month by year" }],
    ["de", { group: "Gruppieren", year: "Jahr", grouped: "Month nach Jahr" }]
]) {
    test(`${lang}: a date in Filters is grouped from its menu and keeps its place`, async ({ page }) => {
        await page.goto(`?data=sales&lang=${lang}&empty#pivot-playground=${encodeViewLink(VIEW)}`);
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        expect(await filterChips(page)).toEqual(["Product", "Month"]);
        await chipMenu(page, "Month");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("topic-group")).toContainText(t.group);
        await menu.getByTestId("topic-group").click();
        await menu.getByRole("menuitemradio", { name: new RegExp(`^${t.year}\\b`) }).click();
        // the menu closes: the grouping is another chip, in the date's place
        await expect(page.locator(".pk-chip-menu")).toHaveCount(0);
        expect(await filterChips(page)).toEqual(["Product", t.grouped]);
        // its Filter level lists the years
        await chipMenu(page, t.grouped, "filter");
        await expect(page.locator(".pk-chip-menu .pk-values")).toContainText("2025");
    });
}
