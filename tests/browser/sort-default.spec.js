// Default order in a field's menu (#917): from a sort by a value, by one column or a custom order it
// brings back the order of a new view, the header shows no sort arrow, and Undo brings the sort back.
import { encodeViewLink } from "pivotkit-core/link";
import { expect, test, textOf } from "./fixtures.js";

/** Revenue by region and channel: the regions in Rows, the channels in Columns. */
const VIEW = { rows: ["Region"], cols: ["Channel"], values: [{ field: "Revenue", agg: "sum" }] };
const rowNames = (page) => page.locator(".pk-table tbody th.pk-rowHeader").allTextContents();
const sortedHeaders = (page) => page.locator(".pk-table thead th[aria-sort]");

/** Opens the field's menu and picks Default order; the menu says it is the default then. */
async function defaultOrder(page, field) {
    await page.getByTestId(`chip-menu-${field}`).click();
    const menu = page.locator(".pk-chip-menu");
    const choice = menu.getByTestId("sort-default");
    await expect(choice).toHaveText(textOf("sortDefault"));
    await expect(choice).not.toHaveAttribute("aria-disabled");
    await choice.click();
    await expect(choice).toHaveAttribute("aria-disabled", "true");
    await expect(menu.getByTestId("sort-default-reason")).toHaveText(textOf("sortIsDefault"));
    await page.keyboard.press("Escape");
}

test("from a sort by a value or by one column: the order of a new view, no arrow on any header; Undo sorts again", async ({ page }) => {
    await page.goto(`?data=sales&lang=en&empty#pivot-playground=${encodeViewLink(VIEW)}`);
    await expect(page.locator(".pk-table")).toBeVisible();
    const start = await rowNames(page);
    const online = page.locator(".pk-table thead th", { hasText: /^Online$/ });
    // by one column from its header, then by the whole row from the field's menu
    const sorts = [
        () => online.locator(".pk-th-sort").click(),
        async () => {
            await page.getByTestId("chip-menu-Region").click();
            await page.locator(".pk-chip-menu").getByTestId("sort-value-asc-0").click();
            await page.keyboard.press("Escape");
        }
    ];
    for (const sort of sorts) {
        await sort();
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName(/^Region, sorted /);
        const sorted = await rowNames(page);
        expect(sorted).not.toEqual(start);
        await defaultOrder(page, "Region");
        await expect.poll(() => rowNames(page)).toEqual(start);
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName("Region");
        await expect(sortedHeaders(page)).toHaveCount(0);
        await expect(page.locator(".pk-table thead .pk-th-sort.pk-sorted")).toHaveCount(0);
        await page.getByTestId("undo").click();
        await expect.poll(() => rowNames(page)).toEqual(sorted);
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName(/^Region, sorted /);
        await page.getByTestId("undo").click();
        await expect.poll(() => rowNames(page)).toEqual(start);
    }
    // the column's header showed its arrow while it sorted
    await sorts[0]();
    await expect(online).toHaveAttribute("aria-sort", "descending");
});

test("a field in the host's own order: Default order brings that order back, not A to Z", async ({ page }) => {
    await page.goto("?data=weather&empty");
    await page.locator('.pk-field[data-field="Season"] .pk-field-name').click();
    const header = page.getByRole("columnheader", { name: "Season" });
    await expect(header).toHaveAttribute("aria-sort", "other");
    const start = await rowNames(page);
    await header.getByRole("button", { name: "Season" }).click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await defaultOrder(page, "Season");
    await expect.poll(() => rowNames(page)).toEqual(start);
    await expect(header).toHaveAttribute("aria-sort", "other");
});
