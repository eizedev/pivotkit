// What the menus say and do: a filter in words with Clear picks, the clear × of text fields,
// the field list's Add to Filters, which opens the field's filter, the sentence on filtering in the Values menu, Expand and
// Collapse all only when they change something, the grip of a field, sort, top N and value conditions by a
// chosen value. Every test fails without its feature.
import { decodeViewLink, encodeViewLink } from "pivotkit-core/link";
import { chipMenu, chips, expect, openLevel, openRules, openSaveAs, tableRows, test, toolbar } from "./fixtures.js";

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
    test("the Filter row says what the filter keeps; the Filter level applies at once and removes it, in Filters too", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Region");
        const menu = page.locator(".pk-chip-menu");
        // nothing set: "All", no dot
        await expect(menu.getByTestId("topic-state-filter")).toHaveText("All");
        await expect(menu.getByTestId("topic-filter")).toHaveAccessibleName("Filter, All");
        await openLevel(menu, "filter");
        // nothing to clear or remove yet; the rules are folded while the field has none
        await expect(menu.getByTestId("filter-clear-picks")).toBeDisabled();
        await expect(menu.getByTestId("filter-remove-rules")).toBeDisabled();
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "false");
        const row = menu.locator(".pk-value", { hasText: "West" });
        // "Only" shows on hover; it applies at once, the level stays open
        await row.hover();
        await row.locator(".pk-only").click();
        const badge = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text');
        await expect(badge).toHaveText(/^1 of \d+$/);
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(/^1 of \d+ items shown$/);
        await expect(menu.getByTestId("filter-summary-why")).toHaveText(/^\d+ left out by your picks$/);
        await expect(menu.getByTestId("section-picks")).toContainText(/1 of \d+ picked/);
        // back on the first level: the row says it, with its dot and in words
        await menu.getByTestId("level-back").click();
        await expect(menu.getByTestId("topic-filter")).toBeFocused();
        await expect(menu.getByTestId("topic-state-filter")).toHaveText(/^● 1 of \d+$/);
        await expect(menu.getByTestId("topic-filter")).toHaveAccessibleName(/^Filter, 1 of \d+, changed$/);
        // the title reads as a control, the state muted
        const [title, state] = await menu.getByTestId("topic-filter").evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.querySelector(".pk-topic-state")).color]);
        expect(title).not.toBe(state);
        // Clear picks in the level
        await openLevel(menu, "filter");
        await menu.getByTestId("filter-clear-picks").click();
        await expect(badge).toHaveCount(0);
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(/^All \d+ items shown$/);
        await expect(menu.getByTestId("filter-summary-why")).toHaveText("Every item is picked, no rules.");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        // a field in Filters opens the same menu: its Filter level clears the picks
        await page.getByTestId("field-menu-Product").click();
        await page.getByTestId("field-filter-Product").click();
        await onlyValue(page, await page.locator(".pk-filter-popover .pk-value-label").first().textContent());
        await chipMenu(page, "Product", "filter");
        await menu.getByTestId("filter-clear-picks").click();
        await expect(page.locator('[data-zone="filters"] .pk-badge-text')).toHaveCount(0);
    });

    test("a rule on the names applies a moment after the typing; its × removes it at once, and Undo brings it back", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Country", "filter");
        const menu = page.locator(".pk-chip-menu");
        const before = (await tableRows(page)).length;
        await openRules(menu);
        // no rule yet: a button adds one, the focus goes to its comparison
        await expect(menu.getByTestId("rule")).toHaveCount(0);
        await menu.getByTestId("rule-add-name").click();
        await expect(menu.getByTestId("filter-condition-op")).toBeFocused();
        await expect(menu.getByTestId("filter-condition-op")).toHaveValue("contains");
        await menu.getByTestId("filter-condition-text").fill("an");
        await expect.poll(async () => (await tableRows(page)).length).toBeLessThan(before);
        await menu.getByTestId("level-back").click();
        await expect(menu.getByTestId("topic-state-filter")).toHaveText("● contains “an”");
        // the chip says the same words, in its badge, its tooltip and its name
        const ruleBadge = page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"] [data-testid="rule-badge"]');
        await expect(ruleBadge).toHaveText("contains “an”");
        await expect(page.getByTestId("chip-menu-Country")).toHaveAttribute("title", "Country, contains “an”");
        await expect(page.getByTestId("chip-menu-Country")).toHaveAccessibleName("Country, contains “an”");
        await openLevel(menu, "filter");
        // the summary says how many items the rule keeps; the rules are open with it, the others in the list's folded tail
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(/^\d+ of \d+ items shown$/);
        await expect(menu.getByTestId("filter-summary-why")).toHaveText(/^\d+ left out by the rule$/);
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByTestId("rule-result")).toHaveText(/^Keeps \d+ of \d+ items$/);
        await expect(menu.getByTestId("filter-condition-text")).toHaveValue("an");
        const filtered = (await tableRows(page)).length;
        await menu.getByTestId("rule-remove").click();
        // applied at once, the level stays open; the last rule gone, the rules fold and their header takes the focus
        await expect.poll(async () => (await tableRows(page)).length).toBeGreaterThan(filtered);
        await expect(menu.getByTestId("rule")).toHaveCount(0);
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "false");
        await expect(menu.getByTestId("section-rules")).toBeFocused();
        // Escape: one level back, then the menu closes
        await page.keyboard.press("Escape");
        await expect(menu.getByTestId("topic-filter")).toBeFocused();
        await page.keyboard.press("Escape");
        await page.getByTestId("undo").click();
        await chipMenu(page, "Country");
        await expect(page.locator(".pk-chip-menu").getByTestId("topic-state-filter")).toHaveText("● contains “an”");
    });
});

test.describe("clearing text fields", () => {
    test("a value's name: Enter applies it, Escape gives it back, × gives the default name back at once, as one undo step", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Sum of Revenue", "name");
        const menu = page.locator(".pk-chip-menu");
        const name = menu.getByTestId("value-name");
        await expect(name).toBeFocused();
        await name.fill("Money");
        await name.press("Enter");
        await expect.poll(() => chips(page, "values")).toEqual(["Money"]);
        // Enter goes back to the first level, the row says the new name
        await expect(menu.getByTestId("topic-name")).toBeFocused();
        await expect(menu.getByTestId("topic-state-name")).toHaveText("● Money");
        await openLevel(menu, "name");
        await expect(name).toHaveValue("Money");
        // Escape gives back what applies, without a change
        await name.fill("Other");
        await name.press("Escape");
        await expect(name).toHaveValue("Money");
        await expect.poll(() => chips(page, "values")).toEqual(["Money"]);
        await menu.locator(".pk-clear-x").click();
        await expect.poll(() => chips(page, "values")).toEqual(["Sum of Revenue"]);
        await expect(name).toHaveValue("");
        await expect(name).toHaveAttribute("placeholder", "Sum of Revenue");
        await expect(name).toBeFocused();
        await page.keyboard.press("Escape");
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

    test("Escape in a menu's field empties it first; the next Escape goes back a level, then closes the menu", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "views");
        await openSaveAs(page);
        const name = page.getByTestId("saved-view-name");
        await expect(name).toBeFocused();
        await name.fill("Mine");
        await name.press("Escape");
        await expect(name).toHaveValue("");
        await expect(name).toBeVisible();
        await name.press("Escape");
        await expect(name).toHaveCount(0);
        await expect(page.getByTestId("save-as")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
    });
});

test.describe("the field list's menu", () => {
    test("Add to Filters opens the field's filter: Cancel places nothing, Apply places it with the choice, and it keeps the filter on Rows", async ({ page }) => {
        await page.goto("?data=sales");
        const addToFilters = page.getByRole("menuitem", { name: "Add to Filters" });
        await page.getByTestId("field-menu-Product").click();
        // one entry: no second one that also filters (#157)
        await expect(page.getByRole("menuitem", { name: /^Filter/ })).toHaveCount(0);
        await addToFilters.click();
        await expect(page.locator(".pk-filter-popover h3")).toHaveText("Filter Product");
        // Cancel changes nothing
        await page.locator(".pk-filter-popover").getByRole("button", { name: "Cancel" }).click();
        await expect(page.locator(".pk-filter-popover")).toHaveCount(0);
        expect(await chips(page, "filters")).toEqual([]);
        await page.getByTestId("field-menu-Product").click();
        await addToFilters.click();
        const first = await page.locator(".pk-filter-popover .pk-value-label").first().textContent();
        await onlyValue(page, first);
        await expect.poll(() => chips(page, "filters")).toEqual(["Product"]);
        await expect(page.locator('[data-zone="filters"] .pk-badge-text')).toHaveText(/^1 of \d+$/);
        // moved to Rows, it keeps the filter: one product row per region
        await page.locator('.pk-field[data-field="Product"] .pk-field-name').click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country", "Product"]);
        await chipMenu(page, "Product");
        await expect(page.locator(".pk-chip-menu").getByTestId("topic-state-filter")).toHaveText(/^● 1 of \d+$/);
    });

    test("Add to Filters of a field on Rows opens its filter there: Cancel keeps it on Rows, Apply moves it with the choice", async ({ page }) => {
        await page.goto("?data=sales");
        const addToFilters = page.getByRole("menuitem", { name: "Add to Filters" });
        await page.getByTestId("field-menu-Region").click();
        await addToFilters.click();
        await expect(page.locator(".pk-filter-popover h3")).toHaveText("Filter Region");
        await page.locator(".pk-filter-popover").getByRole("button", { name: "Cancel" }).click();
        expect(await chips(page, "rows")).toEqual(["Region", "Country"]);
        expect(await chips(page, "filters")).toEqual([]);
        await page.getByTestId("field-menu-Region").click();
        await addToFilters.click();
        await onlyValue(page, await page.locator(".pk-filter-popover .pk-value-label").first().textContent());
        await expect.poll(() => chips(page, "filters")).toEqual(["Region"]);
        expect(await chips(page, "rows")).toEqual(["Country"]);
        await expect(page.locator('[data-zone="filters"] .pk-badge-text')).toHaveText(/^1 of \d+$/);
        // in Filters already: the entry opens its filter with the choice made, and Cancel keeps it
        await page.getByTestId("field-menu-Region").click();
        await addToFilters.click();
        await expect(page.locator(".pk-filter-popover").getByText(/^1 selected$/)).toBeVisible();
        await page.locator(".pk-filter-popover").getByRole("button", { name: "Cancel" }).click();
        expect(await chips(page, "filters")).toEqual(["Region"]);
        await expect(page.locator('[data-zone="filters"] .pk-badge-text')).toHaveText(/^1 of \d+$/);
    });

    test("the grip says it is dragged, and a click on it opens the field's menu", async ({ page }) => {
        await page.goto("?data=sales");
        const grip = page.locator('.pk-field[data-field="Product"] .pk-handle');
        await expect(grip).toHaveAttribute("title", "Drag into a zone");
        await grip.click();
        await expect(page.getByRole("menuitem", { name: "Add to Columns" })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Add to Filters" })).toBeVisible();
    });
});

test.describe("menus explain themselves", () => {
    test("the Values menu says where filtering happens, behind its i", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        // a head row of its own: the value's name and its i
        await expect(page.locator(".pk-chip-menu").getByTestId("menu-head")).toHaveText("Sum of Revenue");
        const info = page.locator(".pk-chip-menu").getByTestId("menu-info");
        await expect(info).toHaveAccessibleName("About Sum of Revenue");
        await expect(info).toHaveAccessibleDescription(/move a field to Filters/);
        await info.click();
        await expect(page.locator(".pk-info-pop")).toContainText("move a field to Filters");
        // without a description and with the explanations off, no i
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await toolbar(page, "options");
        await page.getByTestId("show-explanations").focus();
        await page.getByTestId("show-explanations").press("Space");
        await expect(page.getByTestId("show-explanations")).not.toBeChecked();
        await page.keyboard.press("Escape");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        await expect(page.getByTestId("topic-summarize")).toBeVisible();
        // the name stays as the menu's head; with nothing to explain it has no i
        await expect(page.locator(".pk-chip-menu").getByTestId("menu-head")).toHaveText("Sum of Revenue");
        await expect(page.locator(".pk-chip-menu").getByTestId("menu-info")).toHaveCount(0);
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

// Options' totals that would change nothing, with their reasons: texts that load with the menus, in the report's language
test("a total that would change nothing is off and says why, in English and in German", async ({ page }) => {
    await page.goto("?data=sales");
    await toolbar(page, "options");
    await expect(page.getByTestId("total-colSubtotals")).toBeDisabled();
    await expect(page.getByTestId("total-colSubtotals-reason")).toHaveText("Needs two or more fields in Columns.");
    await page.goto("?data=sales&lang=de");
    await toolbar(page, "options");
    await expect(page.getByTestId("total-colSubtotals-reason")).toHaveText("Braucht zwei oder mehr Felder in Spalten.");
    await expect(page.getByText("Teilergebnisse der Spalten")).toBeVisible();
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

    test("the sort level offers every value; Top N ranks by the value chosen", async ({ page }) => {
        await twoValues(page);
        await chipMenu(page, "Region");
        const menu = page.locator(".pk-chip-menu");
        // two values: their sorts are a level of their own
        await openLevel(menu, "sortValue");
        await expect(menu.getByTestId("level-title")).toHaveText("Region › Sort by value");
        await expect(menu.getByTestId("sort-value-desc-0")).toHaveText("Largest Sum of Units first");
        await expect(menu.getByTestId("sort-value-desc-1")).toHaveText("Largest Sum of Revenue first");
        await expect(menu.getByTestId("sort-value-asc-1")).toHaveText("Smallest Sum of Revenue first");
        await menu.getByTestId("sort-value-asc-1").click();
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName("Region, sorted Smallest Sum of Revenue first");
        const rows = await regionRows(page);
        const revenues = rows.map((r) => r[2]);
        expect(revenues).toEqual([...revenues].sort((a, b) => a - b));
        // back on the first level, the row names the sort; the level marks the value it sorts by
        await expect(menu.getByTestId("topic-sortValue")).toBeFocused();
        await expect(menu.getByTestId("topic-state-sortValue")).toHaveText("● Smallest Sum of Revenue first");
        await expect(menu.getByTestId("sort-label-asc")).toHaveAttribute("aria-checked", "false");
        await openLevel(menu, "sortValue");
        await expect(menu.getByTestId("sort-value-asc-1")).toHaveAttribute("aria-checked", "true");
        await expect(menu.getByTestId("sort-value-asc-0")).toHaveAttribute("aria-checked", "false");
        // the checked choice takes the focus in a level
        await expect(menu.getByTestId("sort-value-asc-1")).toBeFocused();
        await page.keyboard.press("Escape");
        // bottom 1 by revenue keeps the region with the least revenue
        await openLevel(menu, "top");
        await expect(menu.getByTestId("top-off")).toBeChecked();
        await expect(menu.getByTestId("top-by")).toHaveValue("0");
        await menu.getByTestId("top-by").selectOption({ label: "Sum of Revenue" });
        await menu.getByTestId("top-own").check();
        await menu.getByTestId("top-bottom").click();
        await menu.getByTestId("top-count").fill("1");
        await menu.getByTestId("top-count").press("Enter");
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0])).toEqual([rows[0][0]]);
        await menu.getByTestId("level-back").click();
        await expect(menu.getByTestId("topic-state-top")).toHaveText("● Bottom 1 by Sum of Revenue");
        await openLevel(menu, "top");
        await expect(menu.getByTestId("top-by")).toHaveValue("1");
        await expect(menu.getByTestId("top-own")).toBeChecked();
        // a quick choice: Top 3, at once
        await menu.getByTestId("top-3").check();
        await expect.poll(async () => (await regionRows(page)).length).toBe(3);
        await menu.getByTestId("top-off").check();
        await expect.poll(async () => (await regionRows(page)).length).toBe(rows.length);
    });

    test("a value condition: a sentence in the Filter level, applied as it is typed, shown on the chip, changed and taken off", async ({ page }) => {
        await twoValues(page);
        const rows = await regionRows(page);
        const least = [...rows].sort((a, b) => a[2] - b[2])[0];
        const limit = Math.floor(least[2]) + 1;
        const shown = limit.toLocaleString("en-US");
        await chipMenu(page, "Region", "filter");
        const menu = page.locator(".pk-chip-menu");
        // a rule on the total: a sentence of the value, its comparison and a number
        await openRules(menu);
        await menu.getByTestId("rule-add-total").click();
        await expect(menu.getByTestId("rules")).toContainText("Keep the items for which all of these are true:");
        await expect(menu.getByTestId("value-filter-op")).toBeFocused();
        await menu.getByTestId("value-filter-by").selectOption({ label: "Sum of Revenue" });
        await expect(menu.getByTestId("value-filter-op")).toHaveValue(">");
        // text that is no number says what is wrong, and nothing applies
        await menu.getByTestId("value-filter-number").fill("1000,5");
        await expect(menu.getByTestId("value-filter-number-problem")).toHaveText("Enter a number, such as 1,234.5.");
        await expect(menu.getByTestId("value-filter-number")).toHaveAttribute("aria-invalid", "true");
        await expect(menu.getByTestId("value-filter-number")).toHaveAttribute("aria-describedby", /.+/);
        await menu.getByTestId("value-filter-number").fill(String(limit));
        await expect(menu.getByTestId("value-filter-number-problem")).toHaveCount(0);
        const badge = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] [data-testid="condition-badge"]');
        await expect(badge).toHaveText(`Sum of Revenue > ${shown}`);
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0]).sort()).toEqual(rows.map((r) => r[0]).filter((r) => r !== least[0]).sort());
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName(`Region, Sum of Revenue > ${shown}`);
        // the comparison applies at once
        await menu.getByTestId("value-filter-op").selectOption("<");
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0])).toEqual([least[0]]);
        await expect(badge).toHaveText(`Sum of Revenue < ${shown}`);
        // between waits for its second number; the smaller number first, as the engine compares
        await menu.getByTestId("value-filter-op").selectOption("between");
        await expect(badge).toHaveText(`Sum of Revenue < ${shown}`);
        await menu.getByTestId("value-filter-number2").fill("0");
        await expect(badge).toHaveText(`Sum of Revenue between 0 and ${shown}`);
        // Escape in a number gives back what applies; Escape again goes back a level
        await menu.getByTestId("value-filter-number2").fill("5");
        await menu.getByTestId("value-filter-number2").press("Escape");
        await expect(menu.getByTestId("value-filter-number2")).toHaveValue("0");
        await expect(badge).toHaveText(`Sum of Revenue between 0 and ${shown}`);
        await menu.getByTestId("value-filter-number2").press("Escape");
        await expect(menu.getByTestId("topic-filter")).toBeFocused();
        await expect(menu.getByTestId("topic-state-filter")).toHaveText(`● Sum of Revenue between 0 and ${shown}`);
        // with values chosen too: both in the row; the rule's × takes only the rule off
        await openLevel(menu, "filter");
        // the items are folded while the field has a rule
        await menu.getByTestId("section-picks").click();
        const row = menu.locator(".pk-value", { hasText: least[0] });
        await row.hover();
        await row.locator(".pk-only").click();
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(/^1 of \d+ items shown$/);
        await expect(menu.getByTestId("filter-summary-why")).toHaveText(/^\d+ left out by your picks$/);
        await menu.getByTestId("rule-remove").click();
        await expect(badge).toHaveCount(0);
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text')).toHaveText(/^1 of \d+$/);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page.getByTestId("undo").click();
        await expect(badge).toHaveText(`Sum of Revenue between 0 and ${shown}`);
        // Clear picks and Remove the rules: each takes its own
        await chipMenu(page, "Region", "filter");
        await menu.getByTestId("filter-remove-rules").click();
        await expect(badge).toHaveCount(0);
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text')).toHaveText(/^1 of \d+$/);
        await menu.getByTestId("filter-clear-picks").click();
        await expect(badge).toHaveCount(0);
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text')).toHaveCount(0);
    });

    test("the menus follow a change of the language at runtime", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Region");
        await expect(page.getByTestId("topic-top")).toContainText("Top items");
        await page.keyboard.press("Escape");
        await page.getByTestId("pg-lang").selectOption("de");
        await expect(page.locator(".pk-root")).toHaveAttribute("lang", "de");
        await chipMenu(page, "Region");
        await expect(page.getByTestId("topic-top")).toContainText("Oberste Einträge");
        await expect(page.getByTestId("topic-state-top")).toHaveText("Aus");
    });

    test("the value condition in German", async ({ page }) => {
        await page.goto("?data=sales&empty&lang=de");
        for (const field of ["Region", "Revenue"]) {
            await page.locator(`.pk-field[data-field="${field}"] .pk-field-name`).click();
        }
        await chipMenu(page, "Region", "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("level-title")).toHaveText("Region › Filter");
        await openRules(menu);
        await menu.getByTestId("rule-add-total").click();
        await expect(menu.getByTestId("rules")).toContainText("Einträge behalten, für die alles zutrifft:");
        await menu.getByTestId("value-filter-op").selectOption({ label: "mindestens" });
        // typed as Germans write it, key by key
        await menu.getByTestId("value-filter-number").pressSequentially("1.000,5");
        const badge = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] [data-testid="condition-badge"]');
        await expect(badge).toHaveText("Summe von Revenue ≥ 1.000,5");
        // the level shows it back in German; a plain point number reads too, an English grouping does not
        await menu.getByTestId("level-back").click();
        await openLevel(menu, "filter");
        await openRules(menu);
        await expect(menu.getByTestId("value-filter-number")).toHaveValue("1000,5");
        await menu.getByTestId("value-filter-number").fill("1,000.5");
        await expect(menu.getByTestId("value-filter-number-problem")).toHaveText("Eine Zahl eingeben, etwa 1.234,5.");
        await menu.getByTestId("value-filter-number").fill("2500.25");
        await expect(badge).toHaveText("Summe von Revenue ≥ 2.500,25");
        // Top N says what a count must be
        await menu.getByTestId("level-back").click();
        await openLevel(menu, "top");
        await menu.getByTestId("top-own").check();
        await menu.getByTestId("top-count").fill("0");
        await expect(menu.getByTestId("top-count-problem")).toHaveText("Eine ganze Zahl ab 1 eingeben.");
    });

    test("editing the value condition keeps a second one, and a measure no longer shown stays chosen", async ({ page }) => {
        const view = {
            rows: ["Region"],
            values: [{ field: "Units", agg: "sum" }],
            filters: [
                { field: "Region", type: "value", op: ">", value: 1, by: { field: "Revenue", agg: "sum" } },
                { field: "Region", type: "value", op: "<", value: 1e12, by: { field: "Units", agg: "sum" } }
            ]
        };
        await page.goto(`?data=sales&empty#pivot-playground=${encodeViewLink(view)}`);
        await chipMenu(page, "Region", "filter");
        const menu = page.locator(".pk-chip-menu");
        // Revenue is no value of the view any more: it is still the chosen measure; each rule a row
        await openRules(menu);
        await expect(menu.getByTestId("rule")).toHaveCount(2);
        await expect(menu.getByTestId("value-filter-by").first()).toHaveValue("1");
        await expect(menu.getByTestId("value-filter-by").first().locator("option:checked")).toHaveText("Sum of Revenue");
        await menu.getByTestId("value-filter-number").first().fill("2");
        // the playground writes the view into its address on every change
        const conditions = async () => {
            const text = new URL(page.url()).hash.match(/pivot-playground=([^&]+)/)?.[1] ?? "";
            // the link carries a view file's link profile: the view is inside it
            const shown = /** @type {any} */ (decodeViewLink(text).view)?.view;
            return (shown?.filters ?? []).filter((f) => f.type === "value").map((f) => [f.by.field, f.op, f.value]);
        };
        await expect.poll(conditions).toEqual([["Revenue", ">", 2], ["Units", "<", 1e12]]);
    });
});

test.describe("menus in levels", () => {
    test("Highlight keeps a value's own colours: its checked choice changes nothing, None and back brings them back, Undo too", async ({ page }) => {
        // the weather start: a colour scale from blue to red of the view's own
        await page.goto("?data=weather&preset=0");
        const colours = () => page.locator('[data-testid="pivot-table"] tbody tr[data-r]').first().locator("td").evaluateAll((tds) => tds.map((td) => getComputedStyle(td).backgroundColor).join(" "));
        await expect.poll(colours).toContain("rgb(");
        const own = await colours();
        const value = page.getByTestId("chip-menu-Average of Mean °C");
        const menu = page.locator(".pk-chip-menu");
        await value.click();
        await expect(menu.getByTestId("cond-colorScale")).toHaveAttribute("aria-checked", "true");
        await menu.getByTestId("cond-colorScale").click();
        await expect(page.getByTestId("undo")).toBeDisabled();
        expect(await colours()).toBe(own);
        await menu.getByTestId("cond-none").click();
        await expect.poll(colours).not.toBe(own);
        await menu.getByTestId("cond-dataBar").click();
        await menu.getByTestId("cond-colorScale").click();
        await expect.poll(colours).toBe(own);
        await page.keyboard.press("Escape");
        // Undo walks back through data bars and None, Redo brings the own colours again
        await page.getByTestId("undo").click();
        await page.getByTestId("undo").click();
        await page.getByTestId("undo").click();
        await expect.poll(colours).toBe(own);
        await expect(page.getByTestId("undo")).toBeDisabled();
    });

    test("a value's first level says what each topic holds; a level opens in place, titled with the value; the rare choices under a heading", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Sum of Revenue");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("topic-state-summarize")).toHaveText("Sum");
        await expect(menu.getByTestId("topic-state-showAs")).toHaveText("The value itself");
        // the start view's format (currency:EUR) reads as its name, marked: it is not Automatic
        await expect(menu.getByTestId("topic-state-format")).toHaveText("● Currency");
        // the dot is said in words: "changed"
        await expect(menu.getByTestId("topic-format")).toHaveAccessibleName("Number format, Currency, changed");
        await expect(menu.getByTestId("topic-showAs")).toHaveAccessibleName("Show as, The value itself");
        // no section folds any more
        await expect(menu.locator("[data-section]")).toHaveCount(0);
        await openLevel(menu, "format");
        await expect(menu.getByTestId("level-title")).toHaveText("Sum of Revenue › Number format");
        await expect(menu.getByTestId("format-percent")).toContainText("25.6%");
        // the rare formats under their heading, not behind a fold
        await expect(menu.getByText("More formats")).toBeVisible();
        await expect(menu.getByTestId("format-bytes")).toBeVisible();
        // a choice applies at once and goes back with the focus on its row
        await menu.getByTestId("format-percent").click();
        await expect(menu.getByTestId("topic-format")).toBeFocused();
        await expect(menu.getByTestId("topic-state-format")).toHaveText("● Percent");
        // Highlight: three choices side by side on the first level
        await expect(menu.getByTestId("cond-none")).toHaveAttribute("aria-checked", "true");
        await menu.getByTestId("cond-dataBar").click();
        await expect(menu.getByTestId("cond-dataBar")).toHaveAttribute("aria-checked", "true");
        await expect(menu.getByTestId("cond-dataBar")).toBeFocused();
        // the choices side by side say a change in words too
        await expect(menu.getByRole("group", { name: "Highlight, changed" })).toBeVisible();
        await expect(page.locator(".pk-has-bar").first()).toBeVisible();
    });

    test("no menu folds any more: no title is a fold, Options has no Reset menu sections, a stored fold is dropped", async ({ page }) => {
        // a fold stored before (with the tips, under the playground's storageKey) is left out on the next write
        await page.addInitScript(() => {
            if (!sessionStorage.getItem("seeded")) {
                sessionStorage.setItem("seeded", "1");
                localStorage.setItem("pivotkit:tips:playground", JSON.stringify(["closed:share", "open:format"]));
            }
        });
        await page.goto("?data=sales");
        await chipMenu(page, "Region");
        await expect(page.locator(".pk-chip-menu [data-section]")).toHaveCount(0);
        await page.keyboard.press("Escape");
        for (const menu of ["options", "views", "export", "chart-type"]) {
            await toolbar(page, menu);
            // no title is a button that folds
            await expect(page.locator(".pk-popover [data-section], .pk-popover button.pk-section-title")).toHaveCount(0);
            await page.keyboard.press("Escape");
        }
        await toolbar(page, "options");
        await expect(page.getByTestId("reset-sections")).toHaveCount(0);
        await page.keyboard.press("Escape");
        // the chart type's Display settings are a titled group, shown at once
        await toolbar(page, "chart-type");
        await expect(page.getByRole("group", { name: "Display" })).toBeVisible();
        await page.keyboard.press("Escape");
        // Show tips off writes the list: the stored folds are not in it
        await toolbar(page, "options");
        await page.getByTestId("show-tips").click();
        await expect.poll(() => page.evaluate(() => localStorage.getItem("pivotkit:tips:playground"))).toBe(JSON.stringify(["*"]));
    });

    test("the wheel over a menu never scrolls the table or the page behind it", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 520 });
        await page.goto("?data=countries&height=1200");
        await toolbar(page, "options");
        const menu = page.locator(".pk-popover");
        await expect(menu).toBeVisible();
        const before = await page.evaluate(() => window.scrollY);
        const box = await menu.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        // far past the end of the menu's own scroll
        for (let i = 0; i < 6; i++) {
            await page.mouse.wheel(0, 600);
        }
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.scrollY)).toBe(before);
        await expect(menu).toBeVisible();
    });

    test("an i explains a setting; Show explanations hides them all; a switch that changes nothing says why", async ({ page }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "options");
        // one row field, one column field: subtotals would change nothing
        await expect(page.getByTestId("total-rowSubtotals")).toBeDisabled();
        await expect(page.getByTestId("total-rowSubtotals-reason")).toHaveText("Needs two or more fields in Rows.");
        await expect(page.getByTestId("total-colSubtotals-reason")).toHaveText("Needs two or more fields in Columns.");
        await expect(page.getByTestId("total-grandTotalRow")).toBeEnabled();
        await expect(page.getByTestId("total-grandTotalRow-reason")).toHaveCount(0);
        // the i next to a menu's item shows its text to the pointer; a screen reader reads the text
        // with the item (the arrow keys stay on the items)
        const info = page.getByTestId("setting-info-rowSubtotals");
        await expect(page.getByTestId("total-rowSubtotals")).toHaveAccessibleDescription(/a total row under each group/);
        await info.hover();
        await expect(page.locator(".pk-info-pop")).toContainText("a total row under each group");
        // Show explanations off: no i anywhere, the reason stays (it is state)
        const show = page.getByTestId("show-explanations");
        await show.focus();
        await show.press("Space");
        await expect(page.locator('[data-testid^="setting-info-"]')).toHaveCount(0);
        await expect(page.getByTestId("total-rowSubtotals-reason")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await page.getByTestId("export").click();
        await expect(page.getByTestId("setting-info-exportXlsx")).toHaveCount(0);
        await page.keyboard.press("Escape");
        // back on: the export formats explain themselves with an i, one line each
        await toolbar(page, "options");
        // the menu has taken the focus (from More it opens a frame later), so it does not take it back
        await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".pk-popover")))).toBe(true);
        await page.getByTestId("show-explanations").focus();
        await page.getByTestId("show-explanations").press("Space");
        await expect(page.getByTestId("show-explanations")).toBeChecked();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await page.getByTestId("export").click();
        await expect(page.getByTestId("setting-info-exportCsv")).toBeVisible();
        await expect(page.getByTestId("export-csv")).toHaveText("CSV file (.csv)");
        // the image needs the chart: disabled, with the reason
        await expect(page.getByTestId("export-png")).toBeDisabled();
        await expect(page.getByTestId("export-png")).toContainText("Switch to Chart first.");
    });
});
