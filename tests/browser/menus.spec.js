// What the menus say and do: a filter in words with "Remove filter", the clear × of text fields,
// "Filter…" for a field not placed yet, the sentence on filtering in the Values menu, Expand and
// Collapse all only when they change something, the grip of a field, sort, top N and value conditions by a
// chosen value. Every test fails without its feature.
import { chips, expect, tableRows, test, toolbar } from "./fixtures.js";

/** Filters a field of the Filters zone or an axis to one value through its popover. */
async function onlyValue(page, value) {
    const popover = page.locator(".pk-filter-popover");
    const row = popover.locator(".pk-value", { hasText: value }).first();
    // "Only" shows on hover
    await row.hover();
    await row.locator(".pk-only").click();
    await page.getByTestId("filter-apply").click();
}

test.describe("filters say what they keep", () => {
    test("the chip menu shows the filter in words, with Remove filter right below; the popover has it on top", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("open-filter")).toHaveText("Filter…");
        await expect(page.getByTestId("remove-filter")).toHaveCount(0);
        await page.getByTestId("open-filter").click();
        await expect(page.getByTestId("filter-remove")).toHaveCount(0);
        await onlyValue(page, "West");
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("open-filter")).toHaveText(/^Filter: 1 of \d+$/);
        await expect(page.getByTestId("open-filter")).toHaveClass(/pk-accent/);
        await page.getByTestId("remove-filter").click();
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text')).toHaveCount(0);
        // and from the filter itself
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("open-filter").click();
        await onlyValue(page, "West");
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("open-filter").click();
        await page.getByTestId("filter-remove").click();
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("open-filter")).toHaveText("Filter…");
    });

    test("the × of the text condition removes it at once, and Undo brings it back", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Country").click();
        await page.getByTestId("open-filter").click();
        await page.locator(".pk-condition select").selectOption("contains");
        await page.getByTestId("filter-condition-text").fill("an");
        await page.getByTestId("filter-apply").click();
        await page.getByTestId("chip-menu-Country").click();
        await expect(page.getByTestId("open-filter")).toHaveText("Filter: contains “an”");
        await page.getByTestId("open-filter").click();
        const before = (await tableRows(page)).length;
        await page.locator(".pk-condition .pk-clear-x").click();
        // applied at once, the popover stays open with the focus in the field
        await expect.poll(async () => (await tableRows(page)).length).toBeGreaterThan(before);
        await expect(page.getByTestId("filter-condition-text")).toBeFocused();
        await expect(page.locator(".pk-filter-popover")).toBeVisible();
        await page.keyboard.press("Escape");
        await page.getByTestId("undo").click();
        await page.getByTestId("chip-menu-Country").click();
        await expect(page.getByTestId("open-filter")).toHaveText("Filter: contains “an”");
    });
});

test.describe("clearing text fields", () => {
    test("a value's name: × gives the default name back at once, as one undo step", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        await page.getByTestId("value-name").fill("Money");
        await page.getByTestId("value-name").press("Enter");
        await expect.poll(() => chips(page, "values")).toEqual(["Money"]);
        await page.getByTestId("chip-menu-Money").click();
        await expect(page.getByTestId("value-name")).toHaveValue("Money");
        await page.locator(".pk-chip-menu .pk-clear-x").click();
        await expect.poll(() => chips(page, "values")).toEqual(["Sum of Revenue"]);
        await expect(page.getByTestId("value-name")).toHaveValue("");
        await expect(page.getByTestId("value-name")).toHaveAttribute("placeholder", "Sum of Revenue");
        await expect(page.getByTestId("value-name")).toBeFocused();
        await page.keyboard.press("Escape");
        await page.getByTestId("undo").click();
        await expect.poll(() => chips(page, "values")).toEqual(["Money"]);
    });

    test("the field search: ×, and Escape, empty it and keep the focus there", async ({ page }) => {
        await page.goto("?data=sales");
        const search = page.getByTestId("field-search");
        await search.fill("rev");
        await expect(page.locator(".pk-field")).toHaveCount(1);
        await page.locator(".pk-panel .pk-clear-x").click();
        await expect(search).toHaveValue("");
        await expect(search).toBeFocused();
        await expect(page.locator(".pk-field")).not.toHaveCount(1);
        await search.fill("rev");
        await search.press("Escape");
        await expect(search).toHaveValue("");
        await expect(search).toBeFocused();
        // no text: no ×
        await expect(page.locator(".pk-panel .pk-clear-x")).toHaveCount(0);
    });

    test("Escape in a menu's field empties it first; the next Escape closes the menu", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "templates");
        const name = page.getByTestId("template-name");
        await name.fill("Mine");
        await name.press("Escape");
        await expect(name).toHaveValue("");
        await expect(name).toBeVisible();
        await name.press("Escape");
        await expect(name).toHaveCount(0);
    });
});

test.describe("a field that is not placed", () => {
    test("Filter… in the field list filters it at once; it lands in Filters and keeps the filter on Rows", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("field-menu-Product").click();
        await page.getByTestId("field-filter-Product").click();
        await expect(page.locator(".pk-filter-popover")).toBeVisible();
        // Cancel changes nothing
        await page.locator(".pk-filter-popover").getByRole("button", { name: "Cancel" }).click();
        expect(await chips(page, "filters")).toEqual([]);
        await page.getByTestId("field-menu-Product").click();
        await page.getByTestId("field-filter-Product").click();
        const first = await page.locator(".pk-filter-popover .pk-value-label").first().textContent();
        await onlyValue(page, first);
        await expect.poll(() => chips(page, "filters")).toEqual(["Product"]);
        await expect(page.locator('[data-zone="filters"] .pk-badge-text')).toHaveText(/^1 of \d+$/);
        // moved to Rows, it keeps the filter: one product row per region
        await page.getByRole("button", { name: /^Product, filtered/ }).click();
        await page.locator(".pk-filter-popover").getByRole("button", { name: "Cancel" }).click();
        await page.getByTestId("field-menu-Product").click();
        await expect(page.getByTestId("field-filter-Product")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await page.locator('.pk-field[data-field="Product"] .pk-field-name').click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country", "Product"]);
        await page.getByTestId("chip-menu-Product").click();
        await expect(page.getByTestId("open-filter")).toHaveText(/^Filter: 1 of \d+$/);
    });

    test("the grip says it is dragged, and a click on it opens the field's menu", async ({ page }) => {
        await page.goto("?data=sales");
        const grip = page.locator('.pk-field[data-field="Product"] .pk-handle');
        await expect(grip).toHaveAttribute("title", "Drag into a zone");
        await grip.click();
        await expect(page.getByRole("menuitem", { name: "Add to Columns" })).toBeVisible();
        await expect(page.getByTestId("field-filter-Product")).toBeVisible();
    });
});

test.describe("menus explain themselves", () => {
    test("the Values menu says where filtering happens", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        await expect(page.getByTestId("values-filter-hint")).toContainText("move a field to Filters");
    });

    test("Expand all and Collapse all: enabled only when they change something, with why not, and a status", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "options");
        await expect(page.getByTestId("expand-all")).toBeDisabled();
        await expect(page.getByTestId("expand-all")).toContainText("Nothing is collapsed.");
        await page.getByTestId("collapse-all").click();
        await expect(page.locator(".pk-toasts")).toContainText(/\d+ groups collapsed/);
        await toolbar(page, "options");
        await expect(page.getByTestId("collapse-all")).toBeDisabled();
        await expect(page.getByTestId("collapse-all")).toContainText("Every group is collapsed already.");
        await page.getByTestId("expand-all").click();
        await expect(page.locator(".pk-toasts")).toContainText(/\d+ groups expanded/);
        // one field in Rows: nothing to collapse
        await page.getByRole("button", { name: "Remove Country" }).click();
        await toolbar(page, "options");
        await expect(page.getByTestId("collapse-all")).toContainText("Needs two or more fields in Rows.");
    });
});

test.describe("sort, top N and value conditions by a chosen value", () => {
    /** Region in Rows, Units and Revenue in Values; the body rows without the grand total, as [region, units, revenue]. */
    async function twoValues(page) {
        await page.goto("?data=sales&empty");
        for (const field of ["Region", "Units", "Revenue"]) {
            await page.locator(`.pk-field[data-field="${field}"] .pk-field-name`).click();
        }
        await expect.poll(() => chips(page, "values")).toEqual(["Sum of Units", "Sum of Revenue"]);
    }
    const number = (text) => Number(text.replace(/[^\d.-]/g, ""));
    async function regionRows(page) {
        return (await tableRows(page)).filter((r) => r[0] !== "Grand Total").map((r) => [r[0], number(r[1]), number(r[2])]);
    }

    test("the sort menu offers every value; Top N ranks by the value chosen", async ({ page }) => {
        await twoValues(page);
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("sort-value-desc-0")).toHaveText("Largest Sum of Units first");
        await expect(page.getByTestId("sort-value-desc-1")).toHaveText("Largest Sum of Revenue first");
        await expect(page.getByTestId("sort-value-asc-1")).toHaveText("Smallest Sum of Revenue first");
        await page.getByTestId("sort-value-asc-1").click();
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName("Region, sorted Smallest Sum of Revenue first");
        const rows = await regionRows(page);
        const revenues = rows.map((r) => r[2]);
        expect(revenues).toEqual([...revenues].sort((a, b) => a - b));
        // the menu marks the value it sorts by
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("sort-value-asc-1")).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByTestId("sort-value-asc-0")).toHaveAttribute("aria-pressed", "false");
        // bottom 1 by revenue keeps the region with the least revenue
        await expect(page.getByTestId("top-by")).toHaveValue("0");
        await page.getByRole("button", { name: "Bottom", exact: true }).click();
        await page.getByTestId("top-count").fill("1");
        await page.getByTestId("top-by").selectOption({ label: "Sum of Revenue" });
        await page.getByRole("button", { name: "Apply" }).first().click();
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0])).toEqual([rows[0][0]]);
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("top-by")).toHaveValue("1");
    });

    test("a value condition: set in the chip menu, shown on the chip, edited and cleared", async ({ page }) => {
        await twoValues(page);
        const rows = await regionRows(page);
        const least = [...rows].sort((a, b) => a[2] - b[2])[0];
        const limit = Math.floor(least[2]) + 1;
        const shown = limit.toLocaleString("en-US");
        await page.getByTestId("chip-menu-Region").click();
        await page.getByText("Value filter…").click();
        await page.getByTestId("value-filter-by").selectOption({ label: "Sum of Revenue" });
        await expect(page.getByTestId("value-filter-op")).toHaveValue(">");
        await expect(page.getByTestId("value-filter-apply")).toBeDisabled();
        await page.getByTestId("value-filter-number").fill(String(limit));
        await page.getByTestId("value-filter-apply").click();
        const badge = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] [data-testid="condition-badge"]');
        await expect(badge).toHaveText(`Sum of Revenue > ${shown}`);
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0]).sort()).toEqual(rows.map((r) => r[0]).filter((r) => r !== least[0]).sort());
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName(`Region, Sum of Revenue > ${shown}`);
        // the menu says it in words and opens the form with it
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("open-filter")).toHaveText(`Filter: Sum of Revenue > ${shown}`);
        await expect(page.getByTestId("value-filter-number")).toHaveValue(String(limit));
        await page.getByTestId("value-filter-op").selectOption("<");
        await page.getByTestId("value-filter-apply").click();
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0])).toEqual([least[0]]);
        await expect(badge).toHaveText(`Sum of Revenue < ${shown}`);
        // between takes two numbers
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("value-filter-op").selectOption("between");
        await expect(page.getByTestId("value-filter-apply")).toBeDisabled();
        await page.getByTestId("value-filter-number2").fill("0");
        await page.getByTestId("value-filter-apply").click();
        await expect(badge).toHaveText(`Sum of Revenue between ${shown} and 0`);
        // Clear takes it away; Undo brings it back
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("value-filter-clear").click();
        await expect(badge).toHaveCount(0);
        await expect.poll(async () => (await regionRows(page)).length).toBe(rows.length);
        await page.getByTestId("undo").click();
        await expect(badge).toHaveText(`Sum of Revenue between ${shown} and 0`);
        // Remove filter takes it too
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("remove-filter").click();
        await expect(badge).toHaveCount(0);
    });

    test("the value condition in German", async ({ page }) => {
        await page.goto("?data=sales&empty&lang=de");
        for (const field of ["Region", "Revenue"]) {
            await page.locator(`.pk-field[data-field="${field}"] .pk-field-name`).click();
        }
        await page.getByTestId("chip-menu-Region").click();
        await page.getByText("Wertfilter…").click();
        await page.getByTestId("value-filter-op").selectOption({ label: "größer oder gleich" });
        await page.getByTestId("value-filter-number").fill("1000.5");
        await page.getByTestId("value-filter-apply").click();
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] [data-testid="condition-badge"]')).toHaveText("Summe von Revenue ≥ 1.000,5");
    });
});
