// Keyboard, focus and screen reader behaviour (WCAG 2.2 AA): every test here fails without its fix.
import { chipMenu, chips, expect, tableRows, test, toolbar } from "./fixtures.js";

test.describe("keyboard and focus", () => {
    test("collapse and expand from the keyboard keep the focus on the toggle", async ({ page }) => {
        await page.goto("?data=sales");
        const toggle = page.getByRole("button", { name: "Collapse Central" });
        await toggle.focus();
        const before = (await tableRows(page)).length;
        await page.keyboard.press("Enter");
        await expect.poll(async () => (await tableRows(page)).length).toBeLessThan(before);
        await expect(page.getByRole("button", { name: "Expand Central" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("button", { name: "Collapse Central" })).toBeFocused();
    });

    test("after a chip is removed the focus goes to its neighbour, then to the zone", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByRole("button", { name: "Remove Region" }).click();
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"] .pk-chip-label')).toBeFocused();
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect(page.locator('[data-zone="rows"]')).toBeFocused();
        // removing from the chip's menu does the same
        await page.getByTestId("chip-menu-Category").click();
        await page.getByTestId("menu-remove").click();
        await expect(page.locator('[data-zone="cols"]')).toBeFocused();
    });

    test("with reduced motion a chip menu, a field's menu and a toolbar menu take the focus when they open", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("?data=sales");
        await page.locator('[data-testid="pivot-table"]').waitFor();
        const inMenu = () => page.evaluate(() => Boolean(document.activeElement?.closest(".pk-popover")));
        for (const id of ["chip-menu-Region", "chip-menu-Sum of Revenue", "field-menu-Units", "export"]) {
            await page.getByTestId(id).focus();
            await page.keyboard.press("Enter");
            await expect(page.locator(".pk-popover")).toBeVisible();
            await expect.poll(inMenu, { message: id }).toBe(true);
            await page.keyboard.press("Escape");
            await expect(page.getByTestId(id)).toBeFocused();
        }
    });

    test("a field from the field list moves into a zone with the keyboard, with its position announced", async ({ page }) => {
        await page.goto("?data=sales");
        const handle = page.locator('.pk-field[data-field="Channel"] .pk-handle');
        await handle.focus();
        await page.keyboard.press("Space");
        // it starts in the field list, which is no zone
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Channel is not over a zone.");
        // dnd-kit listens for the arrow keys from the next task on
        await page.waitForTimeout(100);
        await page.keyboard.press("ArrowRight");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Channel is over Rows, at the end.");
        await page.keyboard.press("ArrowLeft");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Channel is over Rows, position 2 of 3.");
        await page.keyboard.press("ArrowUp");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Channel is over Columns, at the end.");
        await page.keyboard.press("Space");
        await expect.poll(() => chips(page, "cols")).toEqual(["Category", "Channel"]);
        // a chip goes up from Rows to Columns and on to Filters
        const region = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-handle');
        await region.focus();
        await page.keyboard.press("Space");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Region is over Rows, position 1 of 2.");
        // dnd-kit listens for the arrow keys from the next task on
        await page.waitForTimeout(100);
        await page.keyboard.press("ArrowUp");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Region is over Columns, at the end.");
        await page.keyboard.press("ArrowUp");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Region is over Filters, at the end.");
        await page.keyboard.press("Space");
        await expect.poll(() => chips(page, "filters")).toEqual(["Region"]);
    });

    test("the drill-down keeps the focus inside and closes with Escape from anywhere", async ({ page }) => {
        await page.goto("?data=tickets");
        const cell = page.locator('[data-testid="pivot-table"] td.pk-clickable').first();
        await cell.click();
        const panel = page.getByTestId("drill-panel");
        await expect(panel.getByRole("button", { name: "Close" })).toBeFocused();
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press("Tab");
            expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        }
        await page.keyboard.press("Shift+Tab");
        expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        // Escape works even when the focus is on the page outside the report
        await page.evaluate(() => document.body.focus());
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
    });

    test("a menu closes with Tab, a popover when the focus leaves it, both with Escape from outside", async ({ page, browserName }) => {
        await page.goto("?data=sales");
        // a field's menu in the field list is a menu: Tab leaves it
        await page.getByTestId("field-menu-Region").click();
        await expect(page.locator(".pk-popover [data-pk-option]").first()).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await expect(page.getByTestId("field-menu-Region")).toBeFocused();
        // Export is a dialog (Tab reaches the "i" of each format): Escape closes it
        await page.getByTestId("export").click();
        await expect(page.getByTestId("export-xlsx")).toBeFocused();
        if (browserName === "webkit") {
            // Safari's Tab skips buttons unless the user turns that on: the "i" is focused directly
            await page.getByTestId("setting-info-exportXlsx").focus();
        } else {
            await page.keyboard.press("Tab");
        }
        await expect(page.getByTestId("setting-info-exportXlsx")).toBeFocused();
        // the first Escape closes the explanation the focus opened, the next the dialog
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-info-pop")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await expect(page.getByTestId("export")).toBeFocused();
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.locator(".pk-popover")).toHaveCount(1);
        // once the menu has taken the focus (a frame after it opens), the focus leaving it closes it
        await expect(page.locator(".pk-popover [data-pk-option]").first()).toBeFocused();
        await page.getByTestId("swap").focus();
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await toolbar(page, "options");
        await expect(page.locator(".pk-popover")).toHaveCount(1);
        await page.evaluate(() => document.body.focus());
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
    });

    test("narrow: the field drawer is a dialog that takes the focus and closes with Escape", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("?data=sales");
        await page.getByTestId("show-fields").click();
        const drawer = page.getByRole("dialog", { name: "Field list" });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole("searchbox")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-panel")).toBeHidden();
        await expect(page.getByTestId("show-fields")).toBeFocused();
    });
});

test.describe("names, roles and sizes", () => {
    test("Table | Chart are toggle buttons; the table has a name and a described hint", async ({ page }) => {
        await page.goto("?data=sales");
        await expect(page.getByRole("radio")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
        const table = page.getByRole("table", { name: "Pivot table" });
        await expect(table).toBeVisible();
        const hint = await table.getAttribute("aria-describedby");
        await expect(page.locator(`[id="${hint}"]`)).toContainText("press Enter");
        // an empty corner is no header without a name
        expect(await page.locator('[data-testid="pivot-table"] thead th').evaluateAll((ths) => ths.filter((th) => !th.textContent.trim()).length)).toBe(0);
    });

    test("where a field is and what is set on a chip is in its accessible name", async ({ page }) => {
        await page.goto("?data=sales");
        await expect(page.locator('.pk-field[data-field="Region"] .pk-field-name')).toHaveAccessibleName("Region, in Rows");
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName("Region, sorted Largest Sum of Revenue first");
        await chipMenu(page, "Region", "filter");
        const total = await page.locator(".pk-value").count();
        // applied at once: the chip's name says it while the level is still open
        await page.locator(".pk-value", { hasText: "West" }).locator("input").uncheck();
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName(new RegExp(`^Region, filtered ${total - 1} of ${total}, sorted`));
    });

    test("a field in the list describes what a click on it does from where it is", async ({ page }) => {
        await page.goto("?data=tickets");
        const field = (name) => page.locator(`.pk-field[data-field="${name}"] .pk-field-name`);
        await expect(field("Priority")).toHaveAccessibleName("Priority, in Columns");
        await expect(field("Priority")).toHaveAccessibleDescription("Move to Rows");
        await expect(field("Status")).toHaveAccessibleDescription("Add to Rows");
        await expect(field("Lead hours")).toHaveAccessibleDescription("Add to Values");
        await field("Priority").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Team", "Priority"]);
        await expect.poll(() => chips(page, "cols")).toEqual([]);
        // on Rows now: a click changes nothing, and nothing is described
        await expect(field("Priority")).toHaveAccessibleName("Priority, in Rows");
        await expect(field("Priority")).toHaveAccessibleDescription("");
        await field("Priority").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Team", "Priority"]);
        // the click is not lost in silence: the status line says why nothing moved
        await expect(page.locator(".pk-toasts")).toContainText("Priority is already in Rows");
    });

    test("Enter on a number in Values adds no second value; its menu does, as Add to Values again", async ({ page }) => {
        await page.goto("?data=tickets");
        const field = page.locator('.pk-field[data-field="Lead hours"] .pk-field-name');
        await field.focus();
        await page.keyboard.press("Enter");
        await expect.poll(() => chips(page, "values")).toEqual(["Count of Ticket", "Average of Lead hours"]);
        await expect(field).toHaveAccessibleName("Lead hours, in Values");
        await expect(field).toHaveAccessibleDescription("");
        // pressed again and again: nothing piles up, the status line says where the field is
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await expect(page.locator(".pk-toasts")).toContainText("Lead hours is already in Values");
        expect(await chips(page, "values")).toEqual(["Count of Ticket", "Average of Lead hours"]);
        await expect(field).toBeFocused();
        // a second value of the same field is a choice of its own, in the field's menu
        await page.getByTestId("field-menu-Lead hours").click();
        await expect(page.getByRole("menuitem", { name: "Add to Values", exact: true })).toHaveCount(0);
        await page.getByRole("menuitem", { name: "Add to Values again" }).click();
        await expect.poll(() => chips(page, "values")).toEqual(["Count of Ticket", "Average of Lead hours", "Average of Lead hours"]);
    });

    test("every control is at least 24 by 24 px (WCAG 2.5.8), wide and narrow", async ({ page }) => {
        // measured at rest: the chips scale in when they appear
        await page.emulateMedia({ reducedMotion: "reduce" });
        for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto("?data=sales");
            await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", width < 640 ? "narrow" : "wide");
            // measured once the layout of this width has settled
            const small = () => page.locator(".pk-root :is(button, [role=button], .pk-handle, input[type=search])").evaluateAll((els) =>
                els
                    .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
                    .map((e) => ({ name: e.getAttribute("aria-label") || e.textContent.trim() || e.className, box: e.getBoundingClientRect() }))
                    .filter(({ box }) => box.width > 0 && (box.width < 23.5 || box.height < 23.5))
                    .map(({ name, box }) => `${name}: ${Math.round(box.width)}x${Math.round(box.height)}`)
            );
            await expect.poll(small, { message: `at ${width} px` }).toEqual([]);
        }
    });

    test("the chart has a text alternative with its numbers", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("show-chart").click();
        const chart = page.getByRole("img", { name: "Chart" });
        await expect(chart).toBeVisible();
        const id = await chart.getAttribute("aria-describedby");
        const text = await page.locator(`[id="${id}"]`).textContent();
        expect(text).toMatch(/^Bars: Sum of Revenue by Region \/ Country\. \d+ categories, 3 series\. Highest €[\d,.]+ at .+; lowest €[\d,.]+ at .+\. Switch to Table to read every value\.$/);
    });
});

test.describe("notes", () => {
    test("no note for an add; Undone names the step; notes sit in view, under the table when its end is on screen; a note stays while hovered", async ({ page }) => {
        await page.goto("?data=sales");
        await page.locator('.pk-field[data-field="Channel"] .pk-field-name').click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country", "Channel"]);
        await expect(page.locator(".pk-toast")).toHaveCount(0);
        await page.keyboard.press("ControlOrMeta+z");
        const toast = page.locator(".pk-toast");
        await expect(toast).toHaveText(/Undone: Channel added to Rows/);
        // in view, at the bottom edge of what is on screen of the report; with the report's end on
        // screen, under the table
        await expect(toast).toBeInViewport({ ratio: 1 });
        await page.locator(".pk-status").scrollIntoViewIfNeeded();
        await expect.poll(async () => {
            const table = await page.getByTestId("pivot-table").boundingBox();
            return (await toast.boundingBox()).y - (table.y + table.height);
        }).toBeGreaterThanOrEqual(0);
        await toast.hover();
        await page.waitForTimeout(6800);
        await expect(toast).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(toast).toHaveCount(0, { timeout: 9000 });
    });
});
