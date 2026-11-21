// Sorting by one column from the table (#70): a month's header sorts the cities by that month, the
// column field's name in the corner sorts the months, every sortable header shows a faint arrow at
// rest, and the arrows widen nothing.
import { encodeViewLink } from "pivotkit-core/link";
import { expect, test } from "./fixtures.js";

/** Revenue by region and channel: the regions in Rows, the channels in Columns. */
const VIEW = { rows: ["Region"], cols: ["Channel"], values: [{ field: "Revenue", agg: "sum" }] };
const rowNames = (page) => page.locator(".pk-table tbody th.pk-rowHeader").allTextContents();
/** The values of one column of the body, by its header's text, as numbers in the rows' order. */
const columnValues = (page, name) =>
    page.locator(".pk-table").evaluate((table, text) => {
        const header = [...table.querySelectorAll("thead th")].find((th) => th.textContent.trim() === text);
        const index = [...header.parentElement.children].reduce((n, th) => (th === header ? n : n + (th.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING ? Number(th.colSpan || 1) : 0)), 0);
        return [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children]).filter((cells) => cells[0].matches("th.pk-rowHeader") && !cells[0].closest("tr").className.includes("pk-grand")).map((cells) => Number(cells[index].textContent.replace(/[^\d.-]/g, "")));
    }, name);

test("a column's header sorts the rows by that column: largest first, smallest first, back; the chip says which", async ({ page }) => {
    await page.goto(`?data=sales&lang=en&empty#pivot-playground=${encodeViewLink(VIEW)}`);
    await expect(page.locator(".pk-table")).toBeVisible();
    const before = await rowNames(page);
    const online = page.locator(".pk-table thead th", { hasText: /^Online$/ }).locator(".pk-th-sort");
    await expect(online).toHaveAttribute("title", "Sort by Sum of Revenue in Online: largest first");
    await online.click();
    await expect(page.locator(".pk-table thead th", { hasText: /^Online$/ })).toHaveAttribute("aria-sort", "descending");
    const desc = await columnValues(page, "Online");
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    await expect(page.getByTestId("sort-status")).toContainText("Largest Sum of Revenue in Online first");
    await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-chip-label')).toHaveAttribute("title", /sorted Largest Sum of Revenue in Online first/);
    await online.click();
    const asc = await columnValues(page, "Online");
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    await online.click();
    expect(await rowNames(page)).toEqual(before);
});

test("the column field's name sorts the columns Z to A and back; resting arrows widen no header", async ({ page }) => {
    await page.goto(`?data=sales&lang=en&empty#pivot-playground=${encodeViewLink(VIEW)}`);
    await expect(page.locator(".pk-table")).toBeVisible();
    const columns = () => page.locator(".pk-table thead tr").first().locator("th.pk-colHeader").allTextContents();
    const first = await columns();
    const corner = page.locator(".pk-table thead th.pk-corner", { hasText: "Channel" }).locator(".pk-th-sort");
    // every sortable header shows its arrow at rest, faint
    const arrows = await page.locator(".pk-table thead .pk-th-arrow").evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
    expect(arrows.length).toBeGreaterThan(3);
    expect(arrows.every((o) => o > 0 && o < 1)).toBe(true);
    // a column's arrow and the corner's take no room of their own: as wide as their text
    const widths = await page.locator(".pk-table thead .pk-th-sort-aside").evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width, e.querySelector(".pk-th-text").getBoundingClientRect().width]));
    expect(widths.every(([button, text]) => Math.abs(button - text) < 1)).toBe(true);
    // the corner stays one line
    const cornerHeight = await page.locator(".pk-table thead th.pk-corner", { hasText: "Channel" }).evaluate((th) => th.querySelector(".pk-th-text").getBoundingClientRect().height / parseFloat(getComputedStyle(th).lineHeight));
    expect(cornerHeight).toBeLessThan(1.5);
    await corner.click();
    expect(await columns()).toEqual([...first].reverse().filter((c) => c !== "Grand Total").concat(first.includes("Grand Total") ? ["Grand Total"] : []));
    await corner.click();
    expect(await columns()).toEqual(first);
});
