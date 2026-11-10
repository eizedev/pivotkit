// Start over in the toolbar: a menu button after Undo and Redo with Reset and New, each saying what it
// does or, while it does nothing, why; the menu button pattern by keyboard; New's note with Undo.
import { chips, expect, test, toolbar } from "./fixtures.js";

/** The texts of the toolbar's buttons and groups shown, in order (Table | Chart as one). */
const toolbarOrder = (page) =>
    page.locator(".pk-toolbar").evaluate((bar) =>
        [...bar.querySelectorAll(":scope > button, :scope > .pk-toolbar-pair > button, :scope > .pk-segmented")]
            .filter((e) => e.getClientRects().length)
            .map((e) => e.getAttribute("data-testid") ?? e.className)
    );

test("Start over follows Undo and Redo; its menu says what Reset and New do, and why one is off", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto("?data=sales");
    const order = await toolbarOrder(page);
    expect(order.slice(order.indexOf("undo"), order.indexOf("undo") + 3)).toEqual(["undo", "redo", "start-over"]);
    await expect(page.getByTestId("reset")).toHaveCount(0);
    const button = page.getByTestId("start-over");
    await expect(button).toHaveText("Start over");
    await expect(button).toHaveAttribute("aria-haspopup", "menu");
    await button.click();
    const menu = page.getByRole("menu", { name: "Start over" });
    // at the start view: Reset is off with its reason, New says what it does
    await expect(menu.getByRole("menuitem")).toHaveText(["Reset" + "Already at the start view.", "New, empty report" + "No fields. Undo brings it back. Your data stays."]);
    await expect(page.getByTestId("reset")).toBeDisabled();
    await expect(page.getByTestId("new-report")).toBeEnabled();
    // a click on the disabled entry does nothing and keeps the menu open
    const before = await chips(page, "rows");
    const off = await page.getByTestId("reset").boundingBox();
    await page.mouse.click(off.x + off.width / 2, off.y + off.height / 2);
    await expect(menu).toBeVisible();
    expect(await chips(page, "rows")).toEqual(before);
    // New: the empty report, its note with Undo, the focus back on Start over
    await page.getByTestId("new-report").click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
    const note = page.locator(".pk-toasts");
    await expect(note).toContainText("New, empty report");
    // now New is off and says why; Reset says what it does
    await button.click();
    await expect(menu.getByRole("menuitem")).toHaveText(["Reset" + "Back to the start view. Your data stays.", "New, empty report" + "The report is empty already."]);
    await expect(page.getByTestId("new-report")).toBeDisabled();
    await page.keyboard.press("Escape");
    // the note's Undo brings the report back
    await note.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("empty-state")).toHaveCount(0);
    expect(await chips(page, "rows")).toEqual(before);
    // Reset after a change: back to the start view, one step
    await page.getByTestId("show-chart").click();
    await toolbar(page, "reset");
    await expect(note).toContainText("Back to the start view");
    await expect(page.getByTestId("show-table")).toHaveAttribute("aria-pressed", "true");
});

test("no start view: Reset is off with its reason, so the menu never offers New twice", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto("?data=sales&empty");
    await page.getByTestId("field-menu-Region").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
    await page.getByTestId("start-over").click();
    await expect(page.getByTestId("reset")).toBeDisabled();
    await expect(page.getByTestId("reset")).toContainText("The start view is empty: use New, empty report.");
    await expect(page.getByTestId("new-report")).toBeEnabled();
});

test("German: Neu beginnen with Zurücksetzen and Neuer, leerer Bericht", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto("?data=sales&lang=de");
    await page.getByTestId("start-over").click();
    const menu = page.getByRole("menu", { name: "Neu beginnen" });
    await expect(menu.getByRole("menuitem")).toHaveText(["Zurücksetzen" + "Schon in der Startansicht.", "Neuer, leerer Bericht" + "Keine Felder. Rückgängig holt ihn zurück. Deine Daten bleiben."]);
});

test("by keyboard: Enter, Space and the down arrow open it, the arrows move over every entry, Escape returns, Tab moves on", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto("?data=sales");
    const button = page.getByTestId("start-over");
    for (const key of ["Enter", " ", "ArrowDown"]) {
        await button.focus();
        await page.keyboard.press(key);
        // the first entry takes the focus, also while it is off: its reason is heard
        await expect(page.getByTestId("reset")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByTestId("new-report")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByTestId("reset")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu", { name: "Start over" })).toHaveCount(0);
        await expect(button).toBeFocused();
    }
    // Enter on the disabled Reset does nothing
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("reset")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: "Start over" })).toBeVisible();
    await expect(page.getByTestId("empty-state")).toHaveCount(0);
    // Tab leaves the menu: it closes, the focus back on its button
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu", { name: "Start over" })).toHaveCount(0);
    await expect(button).toBeFocused();
    // the next Tab goes on along the toolbar
    await page.keyboard.press("Tab");
    await expect(button).not.toBeFocused();
});

test("in More (a phone): Reset and New are entries of their own, with the same reasons", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales");
    await expect(page.getByTestId("start-over")).toHaveCount(0);
    await page.getByTestId("more").click();
    await expect(page.getByTestId("more-reset")).toBeDisabled();
    await expect(page.getByTestId("more-reset")).toContainText("Already at the start view.");
    await page.getByTestId("more-new-report").click();
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.locator(".pk-toasts")).toContainText("New, empty report");
    await page.getByTestId("more").click();
    await expect(page.getByTestId("more-new-report")).toContainText("The report is empty already.");
    await expect(page.getByTestId("more-reset")).toBeEnabled();
});
