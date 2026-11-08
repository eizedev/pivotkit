// The tips above the result: one at a time, dismissible with the keyboard, remembered per report,
// switched off and back in Options, and the ones that act (remove a filter, group a date, save).
// Every test here fails without its feature.
import { chipMenu, chips, drag, expect, tableRows, test, toolbar } from "./fixtures.js";

test("one tip at a time; x dismisses it by keyboard, the next one takes its place and the focus; a reload remembers it", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("field-menu-Product").click();
    await page.getByRole("menuitem", { name: "Add to Values" }).click();
    const tips = page.getByTestId("tips").locator(".pk-tip");
    // the most important one; the next waits
    await expect(tips).toHaveCount(1);
    await expect(tips.nth(0)).toHaveAttribute("data-tip", "textValue");
    await expect(page.getByTestId("tip-cells")).toHaveCount(0);
    // a screen reader hears them through the polite region that is always there
    await expect(page.getByTestId("tips-live")).toHaveAttribute("aria-live", "polite");
    await expect(page.getByTestId("tips-live")).toContainText("Product is text");
    await tips.nth(0).getByRole("button", { name: "Dismiss tip" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("tip-textValue")).toHaveCount(0);
    await expect(page.getByTestId("tip-cells").getByRole("button", { name: "Dismiss tip" })).toBeFocused();
    // the table is not covered: the tips sit above it
    const last = await page.getByTestId("tips").boundingBox();
    const table = await page.getByTestId("pivot-table").boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual(table.y);
    await page.reload();
    await page.getByTestId("field-menu-Product").click();
    await page.getByRole("menuitem", { name: "Add to Values" }).click();
    await expect(page.getByTestId("tip-cells")).toBeVisible();
    await expect(page.getByTestId("tip-textValue")).toHaveCount(0);
});

test("a notice that the result is cut stays: no x, with tips off, and next to a tip on a phone", async ({ page }) => {
    await page.goto("?data=countries&preset=0");
    const top = page.getByTestId("tip-top");
    await expect(top).toContainText("Country shows the top 3 only");
    await expect(top).toHaveAttribute("data-kind", "notice");
    await expect(top.getByRole("button", { name: "Dismiss tip" })).toHaveCount(0);
    await toolbar(page, "options");
    const sw = page.getByTestId("show-tips");
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tip-cells")).toHaveCount(0);
    await expect(top).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=countries&preset=0");
    await expect(top).toBeVisible();
});

test("Options: Show tips off hides every tip, Show dismissed tips again brings them back", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("tip-cells").getByRole("button", { name: "Dismiss tip" }).click();
    await expect(page.getByTestId("tips")).toHaveCount(0);
    await toolbar(page, "options");
    await page.getByTestId("reset-tips").click();
    await expect(page.getByTestId("tip-cells")).toBeVisible();
    const sw = page.getByTestId("show-tips");
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).not.toBeChecked();
    await expect(page.getByTestId("tips")).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(sw).toBeChecked();
    await expect(page.getByTestId("tip-cells")).toBeVisible();
    // the keyboard shortcuts are a level of their own, after Help
    await page.getByTestId("topic-shortcuts").click();
    await expect(page.getByTestId("level-title")).toHaveText("Options › Keyboard shortcuts");
    await expect(page.getByTestId("shortcuts")).toContainText("Undo");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("topic-shortcuts")).toBeFocused();
});

test("a filter that leaves nothing says so and removes the filter", async ({ page }) => {
    await page.goto("?data=sales");
    await chipMenu(page, "Region", "filter");
    await page.getByTestId("select-none").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tip-filterEmpty")).toContainText("Nothing matches the filter");
    await page.getByTestId("tip-action-filterEmpty").click();
    await expect(page.getByTestId("tip-filterEmpty")).toHaveCount(0);
    expect((await tableRows(page)).length).toBeGreaterThan(3);
});

test("a text field in Values is counted, and the tip says so", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("field-menu-Product").click();
    await page.getByRole("menuitem", { name: "Add to Values" }).click();
    await expect(page.getByTestId("tip-textValue")).toHaveText("Product is text, so Values counts its entries. Use a number field for sums.");
});

test("an ungrouped date with many columns: the tip groups it by month", async ({ page }) => {
    await page.goto("?data=tickets&empty");
    await page.getByTestId("field-menu-Team").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await page.getByTestId("field-menu-Created").click();
    await page.getByRole("menuitem", { name: "Add to Columns" }).click();
    await chipMenu(page, "Created by month", "group");
    await page.getByTestId("group-none").click();
    await expect.poll(() => chips(page, "cols")).toEqual(["Created"]);
    const tip = page.getByTestId("tip-dateUngrouped");
    await expect(tip).toContainText("Created makes a row or column for every date");
    await page.getByTestId("tip-action-dateUngrouped").click();
    await expect.poll(() => chips(page, "cols")).toEqual(["Created by month"]);
});

test("after several changes the tip offers to save the view as a template", async ({ page }) => {
    await page.goto("?data=sales");
    for (let i = 0; i < 3; i++) {
        await page.getByTestId("swap").click();
    }
    await page.getByRole("button", { name: "Remove Category" }).click();
    await page.keyboard.press("ControlOrMeta+z");
    await page.getByTestId("swap").click();
    await expect(page.getByTestId("tip-saveTemplate")).toBeVisible();
    await page.getByTestId("tip-action-saveTemplate").click();
    await expect(page.getByTestId("saved-view-name")).toBeVisible();
});

test("after the first drag: Undo and the menus", async ({ page }) => {
    await page.goto("?data=sales&empty");
    await expect(page.getByTestId("tip-menus")).toBeVisible();
    await drag(page, page.locator('.pk-field[data-field="Region"] .pk-handle'), page.locator('[data-zone="rows"]'));
    await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
    await expect(page.getByTestId("tip-afterDrag")).toContainText("Undo takes the last step back");
});

test("web component: tips attribute, its own storage key per element, pivot-tip-dismiss", async ({ page }) => {
    await page.goto("pages/element-fields.html");
    const a = page.locator("#a");
    const b = page.locator("#b");
    await expect(a.getByTestId("tip-cells")).toBeVisible();
    await expect(b.getByTestId("tip-cells")).toBeVisible();
    await a.getByTestId("tip-cells").getByRole("button", { name: "Dismiss tip" }).click();
    await expect(a.getByTestId("tip-cells")).toHaveCount(0);
    await expect(b.getByTestId("tip-cells")).toBeVisible();
    expect(await page.evaluate(() => window.__tipEvents)).toEqual([{ target: "a", id: "cells", dismissed: ["cells"] }]);
    expect(await page.evaluate(() => [localStorage.getItem("pivotkit:tips:fields-a"), localStorage.getItem("pivotkit:tips:fields-b")])).toEqual(['["cells"]', null]);
    // #b allows cells and values only: a text value shows no tip there
    await b.getByTestId("field-menu-Product").click();
    await page.getByRole("menuitem", { name: "Add to Values" }).click();
    await expect(b.getByTestId("tip-textValue")).toHaveCount(0);
    await page.reload();
    await expect(page.locator("#a").getByTestId("tip-cells")).toHaveCount(0);
    await expect(page.locator("#b").getByTestId("tip-cells")).toBeVisible();
});
