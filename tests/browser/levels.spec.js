// The menus in levels, by keyboard and as a screen reader hears them: the first level an ARIA menu
// (one Tab stop, arrow keys, type-ahead, Enter or the right arrow into a level), a level back with
// Escape or the left arrow to the row it came from, Escape on the first level closes the menu and the
// focus goes back to its button, Tab closes it and moves on; levels with form controls are groups
// with a heading; the search finds a choice in any level. Every test fails without its feature.
import { chipMenu, chips, expect, openLevel, tableRows, test, toolbar } from "./fixtures.js";

/** The data-testid of the focused element, inside a shadow root too. */
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute("data-testid"));

test.describe("a field's menu by keyboard", () => {
    test("arrow keys, type-ahead, a level by the right arrow, back by Escape and the left arrow, Escape closes, Tab moves on", async ({ page }) => {
        await page.goto("?data=sales");
        const chip = page.getByTestId("chip-menu-Region");
        await chip.focus();
        await page.keyboard.press("Enter");
        const menu = page.locator(".pk-chip-menu");
        // the first item takes the focus; one Tab stop for the whole menu
        await expect(menu.getByTestId("sort-label-asc")).toBeFocused();
        expect(await menu.locator('[role="menu"] [tabindex="0"]').count()).toBe(1);
        // left and right inside the choices side by side, down to the next row
        await page.keyboard.press("ArrowRight");
        await expect(menu.getByTestId("sort-label-desc")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(menu.getByTestId("sort-value-desc-0")).toBeFocused();
        await page.keyboard.press("End");
        await expect(menu.getByTestId("menu-remove")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(menu.getByTestId("sort-label-asc")).toBeFocused();
        // type-ahead: the first letter of a row
        await page.keyboard.press("t");
        await expect(menu.getByTestId("topic-top")).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect(menu.getByTestId("level-title")).toHaveText("Region › Top items");
        await expect(menu.getByTestId("top-off")).toBeFocused();
        // a radio applies at once, by keyboard too
        await page.keyboard.press("ArrowDown");
        await expect(menu.getByTestId("top-3")).toBeChecked();
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] [data-testid="top-badge"]')).toHaveText("Top 3");
        // Escape: one level back, the focus on the row it came from, which says what is set now
        await page.keyboard.press("Escape");
        await expect(menu.getByTestId("topic-top")).toBeFocused();
        await expect(menu.getByTestId("topic-top")).toHaveAccessibleName("Top items, Top 3 by Sum of Revenue, changed");
        // Enter opens a level too; the left arrow goes back outside a text field
        await page.keyboard.press("ArrowUp");
        await expect(menu.getByTestId("topic-filter")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(menu.getByTestId("filter-search")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(menu.getByTestId("select-all")).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await expect(menu.getByTestId("topic-filter")).toBeFocused();
        // Escape on the first level closes the menu, the focus back on the chip
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(chip).toBeFocused();
        // Tab closes the menu and moves on from its button
        await page.keyboard.press("Enter");
        await expect(menu.getByTestId("sort-label-asc")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(menu).toHaveCount(0);
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-chip-x')).toBeFocused();
    });

    test("a date's Group level: one column, its hints in 14 px or more, under the two headings; a choice applies and closes", async ({ page }) => {
        await page.goto("?empty");
        await page.getByTestId("field-menu-Created").click();
        await page.getByRole("menuitem", { name: "Add to Rows" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Created by month"]);
        await chipMenu(page, "Created by month");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("topic-state-group")).toHaveText("● Month");
        await openLevel(menu, "group");
        await expect(menu.getByTestId("level-title")).toHaveText("Created by month › Group");
        await expect(menu.getByText("Along the time line")).toBeVisible();
        await expect(menu.getByText("Same period every year")).toBeVisible();
        // the unit in use takes the focus
        await expect(menu.getByTestId("group-yearMonth")).toBeFocused();
        // one column: the items one below the other, each hint on its right
        const [a, b] = await Promise.all(["group-year", "group-yearQuarter"].map((id) => menu.getByTestId(id).boundingBox()));
        expect(a.x).toBe(b.x);
        expect(b.y).toBeGreaterThan(a.y);
        const hint = menu.getByTestId("group-quarter").locator(".pk-item-hint");
        await expect(hint).toHaveText("Q1 of every year");
        expect(parseFloat(await hint.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
        await menu.getByTestId("group-quarter").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Created by quarter of year"]);
    });
});

test.describe("screen readers", () => {
    test("the first level is a menu of rows that say their state; a level of choices is a menu, a level with a form a group with its heading", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Region");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByRole("menu", { name: "Region" })).toMatchAriaSnapshot(`
          - menu "Region":
            - group "Sort":
              - menuitemradio "A to Z" [checked=false]
              - menuitemradio "Z to A" [checked=false]
            - group "Sort by value":
              - menuitemradio "Largest Sum of Revenue first" [checked]
              - menuitemradio "Smallest Sum of Revenue first" [checked=false]
            - menuitem "Filter, All"
            - menuitem "Top items, Off"
            - menuitem "Move to"
            - separator
            - menuitem "Remove field"
        `);
        await expect(menu.getByTestId("topic-filter")).toHaveAttribute("aria-haspopup", "dialog");
        await expect(menu.getByTestId("topic-move")).toHaveAttribute("aria-haspopup", "menu");
        await openLevel(menu, "move");
        await expect(menu.getByRole("menu", { name: "Region › Move to" })).toBeVisible();
        await menu.getByTestId("level-back").click();
        await openLevel(menu, "filter");
        await expect(menu.getByRole("heading", { name: "Region › Filter" })).toBeVisible();
        await expect(menu.getByRole("group", { name: "Region › Filter" })).toBeVisible();
        await expect(menu.getByTestId("level-back")).toHaveAccessibleName("Back to the menu of Region");
        // the result line is a status: what the list keeps is said as it changes
        await expect(menu.getByRole("status")).toHaveText("5 of 5 items picked");
    });

    test("Options is a menu: the totals and help as switches (menuitemcheckbox), off with the reason, the shortcuts a level", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "options");
        const menu = page.getByRole("menu", { name: "Options" });
        await expect(menu.getByRole("group", { name: "Totals" })).toMatchAriaSnapshot(`
          - group "Totals":
            - menuitemcheckbox "Grand total row" [checked]
            - menuitemcheckbox "Grand total column" [checked]
            - menuitemcheckbox "Row subtotals" [checked]
            - menuitemcheckbox /Column subtotals/ [checked] [disabled]
        `);
        // a switch applies at once and the menu stays open with the focus on it
        const row = page.getByTestId("total-rowSubtotals");
        await row.focus();
        await page.keyboard.press("Enter");
        await expect(row).toHaveAttribute("aria-checked", "false");
        await expect(row).toBeFocused();
        await expect.poll(async () => (await tableRows(page)).some((r) => r[0].endsWith(" Total") && r[0] !== "Grand Total")).toBe(false);
        // an item that would change nothing keeps the focus in the arrow keys' path and says why
        await page.keyboard.press("ArrowDown");
        await expect(page.getByTestId("total-colSubtotals")).toBeFocused();
        await expect(page.getByTestId("total-colSubtotals")).toHaveAccessibleDescription(/Needs two or more fields in Columns/);
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("total-colSubtotals")).toHaveAttribute("aria-checked", "true");
        // its explanation is read with the item
        await expect(page.getByTestId("total-grandTotalRow")).toHaveAccessibleDescription("A last row with the total of every column.");
    });
});

test.describe("the search of a menu", () => {
    test("finds a choice in any level with its path; Enter runs a hit the arrow keys reached; nothing found says so", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Sum of Revenue");
        const menu = page.locator(".pk-chip-menu");
        const search = menu.getByTestId("menu-search");
        await expect(search).toHaveAccessibleName("Search in the menu of Sum of Revenue");
        await search.fill("perc");
        const hits = menu.getByTestId("menu-search-hits");
        await expect(hits.getByRole("menuitemradio").first()).toContainText("Percent");
        await expect(hits).toContainText("Number format");
        // Enter in the field runs nothing
        await search.press("Enter");
        await expect(page.locator('[data-testid="pivot-table"] tbody td').first()).not.toContainText("%");
        await search.press("ArrowDown");
        expect(await focused(page)).toMatch(/^hit-/);
        const first = await focused(page);
        await page.keyboard.press("Enter");
        // it ran: the search is empty again, the focus in it, the first level shows the new state
        await expect(search).toHaveValue("");
        await expect(search).toBeFocused();
        expect(first).toBe("hit-format-percent");
        await expect(menu.getByTestId("topic-state-format")).toHaveText("● Percent");
        await expect(page.locator('[data-testid="pivot-table"] tbody td').first()).toContainText("%");
        // a panel is a hit that opens its level
        await search.fill("name");
        await search.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(menu.getByTestId("level-title")).toHaveText("Sum of Revenue › Name");
        await page.keyboard.press("Escape");
        await search.fill("qwxz");
        await expect(menu.getByTestId("menu-search-nothing")).toHaveText("Nothing found. Try another word, or clear the search.");
        // Escape empties the search first; the next closes the menu
        await search.press("Escape");
        await expect(search).toHaveValue("");
        await expect(menu.getByTestId("topic-summarize")).toBeVisible();
    });
});

test.describe("the Views menu in levels", () => {
    test("a flat list to scan; Save as… and Share open levels; an entry's Delete is reached by the arrow keys and asks in a level", async ({ page }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "views");
        const menu = page.getByRole("menu", { name: "Views" });
        await expect(menu).toMatchAriaSnapshot(`
          - menu "Views":
            - group "This view":
              - menuitem "Save current view…"
              - menuitem /New, empty report/
            - group "Shared views":
              - menuitem "Tickets per team and priority"
              - menuitem "Median lead time by month"
              - menuitem "Open work per team (chart)"
            - group "My views"
            - menuitem "Share"
        `);
        // no fold anywhere: every group is there at once
        await expect(page.locator(".pk-popover button.pk-section-title")).toHaveCount(0);
        // Save as… by keyboard: its level with the name field, saved with Enter
        await expect(page.getByTestId("save-as")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("level-title")).toHaveText("Views › Save current view");
        await expect(page.getByTestId("saved-view-name")).toBeFocused();
        await page.keyboard.type("Mine");
        await page.keyboard.press("Enter");
        await expect(page.locator(".pk-toasts")).toContainText("View “Mine” saved");
        await toolbar(page, "views");
        // the entry, then its Publish and its Delete, by the arrow keys
        await page.getByTestId("saved-view-Mine").focus();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByTestId("publish-view-Mine")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByTestId("delete-view-Mine")).toBeFocused();
        await expect(page.getByTestId("delete-view-Mine")).toHaveAccessibleName("Delete Mine");
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("level-title")).toHaveText("Views › Delete");
        await expect(page.getByTestId("confirm-delete")).toBeFocused();
        // Escape: back to the entry, nothing deleted
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("saved-view-Mine")).toBeFocused();
        // Share: its level, the privacy note under its entries
        await page.keyboard.press("End");
        await expect(page.getByTestId("topic-share")).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByTestId("level-title")).toHaveText("Views › Share");
        await expect(page.getByTestId("share-privacy")).toBeVisible();
        await page.getByTestId("load-view").click();
        await expect(page.getByTestId("level-title")).toHaveText("Views › Load view");
        await expect(page.getByTestId("load-view-text")).toBeFocused();
        // Back from Load view goes to Share, on its entry
        await page.getByTestId("level-back").click();
        await expect(page.getByTestId("load-view")).toBeFocused();
    });
});
