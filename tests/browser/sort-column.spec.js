// Sorting by one column from the table (#70): a month's header sorts the cities by that month, the
// column field's name in the corner sorts the months, a header's arrow shows at rest only once its
// sort is chosen (on the others on hover and focus, #920), and the arrows widen nothing.
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

test("the column field's name sorts the columns Z to A and back; its arrow shows at rest once it sorts", async ({ page }) => {
    await page.goto(`?data=sales&lang=en&empty#pivot-playground=${encodeViewLink(VIEW)}`);
    await expect(page.locator(".pk-table")).toBeVisible();
    const columns = () => page.locator(".pk-table thead tr").first().locator("th.pk-colHeader").allTextContents();
    const first = await columns();
    const corner = page.locator(".pk-table thead th.pk-corner", { hasText: "Channel" }).locator(".pk-th-sort");
    // no sort chosen: no arrow at rest (#920)
    const arrows = await page.locator(".pk-table thead .pk-th-arrow").evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
    expect(arrows.length).toBeGreaterThan(3);
    expect(arrows.every((o) => o === 0)).toBe(true);
    await corner.click();
    // the sorted header's arrow stays at rest, away from the pointer
    await page.mouse.move(0, 0);
    await expect(corner.locator(".pk-th-arrow")).toHaveCSS("opacity", "1");
    expect(await columns()).toEqual([...first].reverse().filter((c) => c !== "Grand Total").concat(first.includes("Grand Total") ? ["Grand Total"] : []));
    await corner.click();
    expect(await columns()).toEqual(first);
});

for (const width of [1440, 390]) {
    test(`twelve months with resting arrows: no header wider, the corner no taller than without arrows (${width} px)`, async ({ page }) => {
        // the weather report: cities in Rows, months in Columns, a long column field's name in the corner
        await page.setViewportSize({ width, height: 900 });
        await page.goto("?data=weather&lang=en");
        await expect(page.locator(".pk-table thead .pk-th-arrow").first()).toBeVisible();
        const measure = () =>
            page.locator(".pk-table thead").evaluate((head) => ({
                widths: [...head.querySelectorAll("th")].map((th) => Math.round(th.getBoundingClientRect().width)),
                corner: Math.round(head.querySelector("th.pk-corner").getBoundingClientRect().height)
            }));
        const shown = await measure();
        expect(await page.locator(".pk-table thead .pk-th-arrow").count()).toBeGreaterThanOrEqual(12);
        await page.addStyleTag({ content: ".pk-th-arrow { display: none !important; }" });
        expect(await measure()).toEqual(shown);
    });
}

test("with column subtotals, a column is named by its group, not by its subtotal's header", async ({ page }) => {
    const view = { rows: ["Region"], cols: ["Category", "Channel"], values: [{ field: "Revenue", agg: "sum" }, { field: "Units", agg: "sum" }], totals: { colSubtotals: true } };
    await page.goto(`?data=sales&lang=en&empty#pivot-playground=${encodeViewLink(view)}`);
    await expect(page.locator(".pk-table")).toBeVisible();
    const titles = await page.locator(".pk-table thead tr:last-child th.pk-colHeader .pk-th-sort").evaluateAll((els) => els.map((e) => e.title));
    // a channel under a category: "Hardware › Online"; the category's subtotal: "Hardware"
    expect(titles.some((t) => / in [^›:]+ › [^:]+: largest first$/.test(t))).toBe(true);
    expect(titles.filter((t) => / in [^›:]+: largest first$/.test(t)).length).toBeGreaterThan(0);
    expect(titles.some((t) => /Total/.test(t.replace(/^Sort by /, "")))).toBe(false);
});
