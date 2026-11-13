// The totals as people see them: labels in Rows without values (no empty column, no totals without a
// number, the toggles that still fold), the column subtotals off by default with their tip, title
// and edge, and the Options switches that change nothing (disabled, no tick). Issues #155 and #156;
// every test here fails without its fix.
import { toViewFile } from "pivotkit-core";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, chips, expect, tableRows, test, toolbar } from "./fixtures.js";

/** Adds a field to a zone through its menu in the field list, as a person does without dragging. */
async function addTo(page, field, zone) {
    await page.getByTestId(`field-menu-${field}`).click();
    await page.getByRole("menuitem", { name: `Add to ${zone}` }).click();
}

/** The texts of the table's header cells, row by row. */
const headerTexts = (page) => page.locator('[data-testid="pivot-table"] thead tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));

test("text fields in Rows without values: the labels alone, no empty column, no total rows; a toggle still folds a group", async ({ page }) => {
    await page.goto("?data=sales&empty");
    await addTo(page, "Region", "Rows");
    await addTo(page, "Country", "Rows");
    await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
    const table = page.getByTestId("pivot-table");
    await expect(table).toBeVisible();
    // two label columns and nothing after them (#155)
    expect(await headerTexts(page)).toEqual([["Region", "Country"]]);
    const rows = await tableRows(page);
    // a region's first row carries its label (merged down), the others the country only
    expect(rows.every((r) => r.length <= 2)).toBe(true);
    expect(rows[0]).toHaveLength(2);
    // no subtotal row and no grand total row: they would have no number (#156)
    expect(rows.some((r) => r.some((t) => /Total/.test(t)))).toBe(false);
    expect(rows.length).toBe(15);
    // a group keeps its toggle: a click folds it into one line
    await page.getByRole("button", { name: "Collapse Central" }).click();
    await expect.poll(async () => (await tableRows(page)).length).toBe(13);
    expect((await tableRows(page)).find((r) => r[0] === "Central")).toEqual(["Central"]);
    // Options: every total needs a value here, so its switch is disabled and shows no tick
    await toolbar(page, "options");
    for (const key of ["grandTotalRow", "rowSubtotals"]) {
        const sw = page.getByTestId(`total-${key}`);
        await expect(sw).toBeDisabled();
        await expect(sw).toHaveAttribute("aria-checked", "false");
        await expect(page.getByTestId(`total-${key}-reason`)).toHaveText("Needs a field in Values.");
    }
});

test("labels without a value column take the report's width on a phone: a team's name stays whole", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const link = encodeViewLink(toViewFile({ rows: ["Team", "Priority"] }, {}, { link: true }));
    await page.goto(`?data=tickets&empty#pivot-playground=${link}`);
    const label = page.locator('[data-testid="pivot-table"] tbody th .pk-th-text', { hasText: "Applications" });
    await expect(label).toBeVisible();
    const lines = await label.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines).toBe(1);
    // nothing scrolls sideways
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("column subtotals are off by default; switched on, a tip and the header's title say what they add up, and the tip hides them", async ({ page }) => {
    await page.goto("?empty");
    await addTo(page, "Team", "Rows");
    await addTo(page, "Priority", "Columns");
    await addTo(page, "Status", "Columns");
    await addTo(page, "Ticket", "Values");
    await expect.poll(() => chips(page, "values")).toEqual(["Count of Ticket"]);
    const header = page.locator('[data-testid="pivot-table"] thead th');
    await expect(header.filter({ hasText: "Grand Total" })).toHaveCount(1);
    // off by default: no "P1 Critical Total" next to the statuses
    await expect(header.filter({ hasText: /^P\d \w+ Total$/ })).toHaveCount(0);
    await expect(page.getByTestId("tip-colSubtotals")).toHaveCount(0);

    await toolbar(page, "options");
    const sw = page.getByTestId("total-colSubtotals");
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    const critical = header.filter({ hasText: "P1 Critical Total" });
    await expect(critical).toHaveCount(1);
    const text = "A Total column adds up the columns of the group before it; it is not an item of its own.";
    await expect(critical).toHaveAttribute("title", text);
    // an edge sets the subtotal column apart from its group's last column, in the header and the body
    const edge = (locator) => locator.evaluate((el) => getComputedStyle(el).borderLeftWidth);
    expect(await edge(critical)).toBe("1px");
    expect(await edge(header.filter({ hasText: /^P1 Critical$/ }))).toBe("0px");
    const index = await critical.evaluate((th) => {
        // the body column under the header: its first column counted over the merged cells before it
        let col = 0;
        for (const c of th.parentElement.children) {
            if (c === th) {
                return col;
            }
            col += c.colSpan;
        }
        return -1;
    });
    const firstRow = page.locator('[data-testid="pivot-table"] tbody tr[data-r="0"] > *');
    expect(await edge(firstRow.nth(index))).toBe("1px");
    expect(await edge(firstRow.nth(index - 1))).toBe("0px");

    const tip = page.getByTestId("tip-colSubtotals");
    await expect(tip).toContainText(text);
    await tip.getByRole("button", { name: "Hide column subtotals" }).click();
    await expect(critical).toHaveCount(0);
    await expect(header.filter({ hasText: "Grand Total" })).toHaveCount(1);
    await expect(page.getByTestId("tip-colSubtotals")).toHaveCount(0);
});

test("a group with one item has no subtotal row; its toggle stays", async ({ page }) => {
    await page.goto("?data=sales");
    expect(await chips(page, "rows")).toEqual(["Region", "Country"]);
    expect((await tableRows(page)).some((r) => r[0] === "North Total")).toBe(true);
    // a filter leaves one country in North: a "North Total" would only repeat Norway
    await chipMenu(page, "Country", "filter");
    for (const country of ["Sweden", "Denmark"]) {
        await page.locator(".pk-value", { hasText: country }).locator("input").uncheck();
    }
    await expect.poll(async () => (await tableRows(page)).some((r) => r[0] === "North Total")).toBe(false);
    const rows = await tableRows(page);
    expect(rows.find((r) => r[0] === "North").slice(0, 2)).toEqual(["North", "Norway"]);
    expect(rows.some((r) => r[0] === "Central Total")).toBe(true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Collapse North" })).toBeVisible();
});
