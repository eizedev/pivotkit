// Sorting by a click on a table header (#55): a value's name sorts the innermost row field by it
// (largest first, smallest first, off), a row field's name toggles A to Z and Z to A; aria-sort, the
// arrow, the keyboard, Undo, and the same in the web component.
import { test, expect, chips, drag, tableRows } from "./fixtures.js";

/** Region in Rows, Units in Values. */
async function regionUnits(page) {
    await page.goto("?data=sales&empty");
    for (const field of ["Region", "Units"]) {
        await page.locator(`.pk-field[data-field="${field}"] .pk-field-name`).click();
    }
    await expect.poll(() => chips(page, "values")).toEqual(["Sum of Units"]);
}

const number = (text) => Number(text.replace(/[^\d.-]/g, ""));
/** The body rows without the grand total, as [region, units]. */
async function regionRows(page) {
    return (await tableRows(page)).filter((r) => r[0] !== "Grand Total").map((r) => [r[0], number(r[1])]);
}
const units = async (page) => (await regionRows(page)).map((r) => r[1]);
const names = async (page) => (await regionRows(page)).map((r) => r[0]);
const ascending = (list) => [...list].sort((a, b) => a - b);
const az = (list) => [...list].sort((a, b) => a.localeCompare(b));

test.describe("sorting by a click on a header", () => {
    test("a value's name: largest first, smallest first, off; aria-sort, the arrow and what a screen reader hears", async ({ page }) => {
        await regionUnits(page);
        const header = page.getByRole("columnheader", { name: "Sum of Units" });
        const button = header.getByRole("button", { name: "Sum of Units" });
        const start = await names(page);
        expect(start).toEqual(az(start));
        await expect(header).not.toHaveAttribute("aria-sort");
        await expect(button).toHaveAttribute("title", "Sort Region: Largest Sum of Units first");

        await button.click();
        await expect(header).toHaveAttribute("aria-sort", "descending");
        await expect.poll(() => units(page)).toEqual(ascending(await units(page)).reverse());
        await expect(button).toHaveClass(/pk-sorted/);
        await expect(button.locator(".pk-th-arrow")).toHaveCSS("opacity", "1");
        await expect(page.getByTestId("sort-status")).toHaveText("Region sorted: Largest Sum of Units first");
        // the same sort entry the chip menu writes: its name says so
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName("Region, sorted Largest Sum of Units first");
        await expect(button).toHaveAttribute("title", "Sort Region: Smallest Sum of Units first");

        await button.click();
        await expect(header).toHaveAttribute("aria-sort", "ascending");
        await expect.poll(() => units(page)).toEqual(ascending(await units(page)));
        await expect(page.getByTestId("sort-status")).toHaveText("Region sorted: Smallest Sum of Units first");

        await button.click();
        await expect(header).not.toHaveAttribute("aria-sort");
        await expect.poll(() => names(page)).toEqual(start);
        await expect(page.getByTestId("sort-status")).toHaveText("Region sorted: A to Z");
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName("Region");
    });

    test("a row field's name toggles Z to A and A to Z; each click is a step Undo takes back", async ({ page }) => {
        await regionUnits(page);
        const header = page.getByRole("columnheader", { name: "Region" });
        const button = header.getByRole("button", { name: "Region" });
        const start = await names(page);
        // A to Z is the default, not a chosen sort: no aria-sort (one header at a time), the arrow only on hover and focus
        await expect(header).not.toHaveAttribute("aria-sort");
        await expect(button).not.toHaveClass(/pk-sorted/);
        await button.click();
        await expect(header).toHaveAttribute("aria-sort", "descending");
        await expect.poll(() => names(page)).toEqual([...start].reverse());
        await expect(page.getByTestId("sort-status")).toHaveText("Region sorted: Z to A");
        await button.click();
        await expect(header).not.toHaveAttribute("aria-sort");
        await expect.poll(() => names(page)).toEqual(start);
        await expect(page.getByTestId("sort-status")).toHaveText("Region sorted: A to Z");

        await page.getByTestId("undo").click();
        await expect(header).toHaveAttribute("aria-sort", "descending");
        await expect.poll(() => names(page)).toEqual([...start].reverse());
        await expect(page.getByText("Undone: sort of Region")).toBeVisible();
        await page.getByTestId("undo").click();
        await expect(header).not.toHaveAttribute("aria-sort");
        await expect.poll(() => names(page)).toEqual(start);
    });

    test("a sorted value's name and the default A to Z: only the chosen sort has aria-sort", async ({ page }) => {
        await regionUnits(page);
        await page.getByRole("columnheader", { name: "Sum of Units" }).getByRole("button").click();
        await expect(page.locator('[data-testid="pivot-table"] thead th[aria-sort]')).toHaveCount(1);
        await expect(page.getByRole("columnheader", { name: "Sum of Units" })).toHaveAttribute("aria-sort", "descending");
    });

    test("a header with its button still drags into a zone, and the drag does not sort", async ({ page }) => {
        await regionUnits(page);
        const header = page.locator('[data-testid="pivot-table"] thead th[data-kind="corner"]', { hasText: "Region" });
        await drag(page, header, page.locator('[data-zone="cols"]'));
        await expect.poll(() => chips(page, "cols")).toEqual(["Region"]);
        await expect.poll(() => chips(page, "rows")).toEqual([]);
        await expect(page.getByTestId("sort-status")).toHaveText("");
    });

    test("Enter and Space on the focused header sort; the focus stays on it", async ({ page }) => {
        await regionUnits(page);
        const header = page.getByRole("columnheader", { name: "Sum of Units" });
        const button = header.getByRole("button", { name: "Sum of Units" });
        await button.focus();
        await expect(button.locator(".pk-th-arrow")).not.toHaveCSS("opacity", "0");
        await page.keyboard.press("Enter");
        await expect(header).toHaveAttribute("aria-sort", "descending");
        await expect(button).toBeFocused();
        await page.keyboard.press("Space");
        await expect(header).toHaveAttribute("aria-sort", "ascending");
        await expect(button).toBeFocused();
        // Ctrl+Z takes the sort back
        await page.keyboard.press("ControlOrMeta+z");
        await expect(header).toHaveAttribute("aria-sort", "descending");
    });

    test("with a column field only the grand total's value names sort; the text is the target, not the cell", async ({ page }) => {
        // the start view: Region and Country in Rows, Category in Columns; a second value
        await page.goto("?data=sales");
        await page.locator('.pk-field[data-field="Units"] .pk-field-name').click();
        await expect.poll(() => chips(page, "values")).toEqual(["Sum of Revenue", "Sum of Units"]);
        const table = page.getByTestId("pivot-table");
        // the two row fields' names and the grand total's two value names, not each category's
        await expect(table.locator("thead .pk-th-sort")).toHaveCount(4);
        await expect(table.locator("thead tr:last-child th.pk-colHeader.pk-grand .pk-th-sort")).toHaveCount(2);
        await expect(table.locator("thead tr:last-child th.pk-colHeader:not(.pk-grand) .pk-th-sort")).toHaveCount(0);
        // the button is no wider than its text and arrow: the cell's edges stay free (a future resize handle)
        const total = table.locator("thead tr:last-child th.pk-colHeader.pk-grand").first();
        const [cell, button] = await Promise.all([total.boundingBox(), total.locator(".pk-th-sort").boundingBox()]);
        expect(button.width).toBeLessThan(cell.width);
    });
});

test("the web component sorts by a click on a header too", async ({ page }) => {
    await page.goto("pages/element-two.html");
    const sales = page.locator("#sales");
    // the start view: Region, then Country in Rows; a value's name sorts the innermost (Country)
    const header = sales.getByRole("columnheader", { name: "Sum of Revenue" });
    await header.getByRole("button", { name: "Sum of Revenue" }).click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await expect
        .poll(() => page.evaluate(() => window.__events.filter((e) => e.type === "pivot-view-change" && e.target === "sales").at(-1)?.detail.view.sort))
        .toContainEqual({ field: "Country", by: "value", order: "desc", value: { field: "Revenue", agg: "sum" } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect(header).not.toHaveAttribute("aria-sort");
});

test("a host that controls the view: the header's sort goes through onViewChange and stays over the host's renders", async ({ page }) => {
    await page.goto("pages/host.html");
    const header = page.getByRole("columnheader", { name: "Sum of Revenue" });
    await header.getByRole("button", { name: "Sum of Revenue" }).click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
    // the page renders again every 200 ms with the view it got from onViewChange
    const before = Number(await page.getByTestId("host-renders").textContent());
    await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(before + 4);
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await header.getByRole("button", { name: "Sum of Revenue" }).click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await page.getByTestId("undo").click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
});
