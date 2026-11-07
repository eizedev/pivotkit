// The field list collapsed to a rail on a wide report: the « button, the rail's "Fields" and search
// buttons, the choice remembered with the tips, a chip dropped on the rail, Enlarge, the phone's
// drawer, and the host's fieldList (field-list on the element).
import { chips, drag, expect, test } from "./fixtures.js";

test("« collapses the field list to a rail and the rail opens it again; the focus stays on the button in its place", async ({ page }) => {
    await page.goto("?data=sales");
    const collapse = page.getByTestId("collapse-fields");
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(collapse).toHaveAccessibleName("Collapse the field list");
    await collapse.focus();
    await page.keyboard.press("Enter");
    const rail = page.getByTestId("field-rail");
    await expect(rail).toBeVisible();
    await expect(page.getByTestId("field-list")).toHaveCount(0);
    const expand = page.getByTestId("expand-fields");
    await expect(expand).toBeFocused();
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    expect((await rail.boundingBox()).width).toBeLessThanOrEqual(48);
    // remembered with the tips under the storageKey: a reload keeps it
    await page.reload();
    await expect(page.getByTestId("field-rail")).toBeVisible();
    await page.getByTestId("expand-fields").click();
    await expect(page.getByTestId("field-list")).toBeVisible();
    await expect(page.getByTestId("collapse-fields")).toBeFocused();
    await page.reload();
    await expect(page.getByTestId("field-list")).toBeVisible();
});

test("the rail's search button opens the list with the focus in the search field", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("collapse-fields").click();
    const search = page.getByTestId("rail-search");
    await expect(search).toHaveAccessibleName("Search fields");
    await search.click();
    await expect(page.getByTestId("field-search")).toBeFocused();
    await page.keyboard.type("coun");
    await expect(page.locator('.pk-field[data-field="Country"]')).toBeVisible();
});

test("a chip dragged onto the rail leaves the report, as on the open list", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("collapse-fields").click();
    expect(await chips(page, "rows")).toEqual(["Region", "Country"]);
    await drag(page, page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"]'), page.getByTestId("field-rail"));
    await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
});

test("Enlarge hides the rail too; a phone keeps its drawer without «", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("collapse-fields").click();
    await page.getByTestId("enlarge").click();
    await expect(page.getByTestId("field-rail")).toBeHidden();
    await page.getByTestId("enlarge").click();
    await expect(page.getByTestId("field-rail")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("field-rail")).toHaveCount(0);
    await expect(page.getByTestId("collapse-fields")).toHaveCount(0);
});

test("in German; the host's field-list decides over the stored choice, the user can still open it", async ({ page }) => {
    await page.goto("pages/element-two.html");
    const tickets = page.locator("#tickets");
    await expect(tickets.getByTestId("collapse-fields")).toHaveAccessibleName("Feldliste einklappen");
    await page.evaluate(() => document.getElementById("tickets").setAttribute("field-list", "collapsed"));
    await expect(tickets.getByTestId("field-rail")).toBeVisible();
    await expect(tickets.getByTestId("expand-fields")).toHaveAccessibleName("Feldliste anzeigen");
    await expect(page.locator("#sales").getByTestId("field-list")).toBeVisible();
    await tickets.getByTestId("expand-fields").click();
    await expect(tickets.getByTestId("field-list")).toBeVisible();
    // not stored: the host's value is the start again on the next load
    expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
});
