// A menu opened from something that can be dragged (a chip, a field of the field list) is no handle
// of that drag: pressing the mouse or a finger inside the menu and moving it - to select text, to
// open a native select, a click that jitters - never picks up the chip or the field. The weather
// data set with its start view ("How warm is each city, month by month?"): its chip menu on Columns
// covers the Values zone, so the pointer is over that zone while it is inside the menu. What is
// checked is what the user sees: the chips stay in their zones, the table and the chips' filter
// marks stay as they were, and no dragged chip follows the pointer.
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, chips, expect, openMoreFilters, openZones, tableRows, test, toolbar } from "./fixtures.js";

const MONTH = "Date by month of year";
const MEAN = "Average of Mean °C";
const ZONES = ["filters", "cols", "rows", "values"];

/** The weather start view, or a view of its own (in the address, as a link would carry it). */
async function open(page, view) {
    await page.goto(view ? `?data=weather&empty#pivot-playground=${encodeViewLink(view)}` : "?data=weather&preset=0");
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
    await openZones(page);
}

/** What the user sees of the view: the chips of every zone with their marks, and the table. */
async function seen(page) {
    const zones = {};
    for (const zone of ZONES) {
        zones[zone] = await chips(page, zone);
    }
    const marks = await page.locator(".pk-zone .pk-chip").evaluateAll((els) => els.map((e) => e.querySelector(".pk-chip-label")?.textContent ?? ""));
    return { zones, marks, table: await tableRows(page) };
}

/** The centre of an element. */
async function centre(locator) {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** The centre of a zone's empty part (right of its chips), where a drop lands in that zone. */
async function inZone(page, zone, at = { x: 0.5, y: 0.6 }) {
    const b = await page.locator(`[data-zone="${zone}"]`).boundingBox();
    return { x: b.x + b.width * at.x, y: b.y + b.height * at.y };
}

/**
 * A real mouse sequence: down at `from`, moves through `points` in small steps, up. Returns how many
 * dragged chips (the drag overlay) were on the page after each move.
 */
async function press(page, from, points) {
    const overlays = [];
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (const p of points) {
        await page.mouse.move(p.x, p.y, { steps: 8 });
        overlays.push(await page.locator(".pk-overlay").count());
    }
    await page.mouse.up();
    // dnd-kit swallows clicks for 50 ms after a drag; a drop would be done by now
    await page.waitForTimeout(150);
    return overlays;
}

/** Opens the Filter level of the Month chip on Columns and leaves out January (a filter to lose). */
async function monthFilterWithPick(page) {
    await chipMenu(page, MONTH, "filter");
    const menu = page.locator(".pk-chip-menu");
    await menu.locator(".pk-value", { hasText: "Jan" }).getByRole("checkbox").click();
    await expect(menu.getByTestId("filter-result")).toContainText("11 of 12");
    await expect(page.locator('[data-zone="cols"] .pk-chip-label')).not.toHaveText(MONTH);
    return menu;
}

test.describe("a press inside a chip's menu never drags the chip", () => {
    // A native select's list opens on the press and takes the release (Firefox and WebKit here; in
    // Playwright's Chromium the list takes the whole pointer, so there it shows nothing either way):
    // once the list is closed, the mouse moves with no button down.
    for (const variant of ["pressed and moved", "pressed, its list closed, then moved"]) {
        test(`the native select of a rule: ${variant} over Values`, async ({ page }) => {
            await open(page);
            const menu = await monthFilterWithPick(page);
            await openMoreFilters(menu);
            await menu.getByTestId("rule-add-item").click();
            const select = menu.getByTestId("rule-item-op");
            await expect(select).toBeVisible();
            const before = await seen(page);
            const from = await centre(select);
            const overlays = [];
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            if (variant !== "pressed and moved") {
                await page.keyboard.press("Escape");
            }
            for (const p of [{ x: from.x + 10, y: from.y + 10 }, await inZone(page, "values", { x: 0.05, y: 0.6 })]) {
                await page.mouse.move(p.x, p.y, { steps: 8 });
                overlays.push(await page.locator(".pk-overlay").count());
            }
            await page.mouse.up();
            await page.waitForTimeout(150);
            expect(overlays, "no dragged chip follows the pointer").toEqual([0, 0]);
            expect((await seen(page)).zones).toEqual(before.zones);
            expect(await chips(page, "cols")).toEqual([MONTH]);
            // the filter is still there (the menu may have closed with Escape)
            await page.keyboard.press("Escape");
            await page.keyboard.press("Escape");
            await expect(page.locator(".pk-chip-menu")).toHaveCount(0);
            expect(await seen(page)).toEqual(before);
        });
    }

    test("Clear picks clicked with a small jitter while the pointer is over Values: only the picks go", async ({ page }) => {
        await open(page);
        const menu = await monthFilterWithPick(page);
        const clear = menu.getByTestId("filter-clear-picks");
        const from = await centre(clear);
        // the button lies over the Values zone: the press is over that zone as well
        const values = await page.locator('[data-zone="values"]').boundingBox();
        expect(from.x > values.x && from.x < values.x + values.width && from.y > values.y && from.y < values.y + values.height, "Clear picks covers the Values zone").toBe(true);
        const overlays = await press(page, from, [{ x: from.x + 4, y: from.y + 2 }, { x: from.x + 8, y: from.y + 3 }]);
        expect(overlays, "no dragged chip follows the pointer").toEqual([0, 0]);
        // the click did what it says: every month is back, the chip stays on Columns with no filter mark
        await expect(menu.getByTestId("filter-result")).toContainText("12 of 12");
        expect(await chips(page, "cols")).toEqual([MONTH]);
        expect(await chips(page, "values")).toEqual([MEAN]);
        await expect(page.locator('[data-zone="cols"] .pk-chip-label')).toHaveText(MONTH);
    });

    test("Clear picks pressed and the mouse moved off over Values: nothing changes", async ({ page }) => {
        await open(page);
        const menu = await monthFilterWithPick(page);
        const before = await seen(page);
        const from = await centre(menu.getByTestId("filter-clear-picks"));
        const overlays = await press(page, from, [{ x: from.x + 12, y: from.y + 12 }, await inZone(page, "values", { x: 0.05, y: 0.6 })]);
        expect(overlays, "no dragged chip follows the pointer").toEqual([0, 0]);
        expect(await seen(page)).toEqual(before);
    });

    test("text at the top of the Filter level selected with the mouse: selected, nothing moves", async ({ page }) => {
        await open(page);
        const menu = await monthFilterWithPick(page);
        const before = await seen(page);
        const text = await menu.getByTestId("filter-result").boundingBox();
        const from = { x: text.x + 2, y: text.y + text.height / 2 };
        // along the line of text (it is selected then, ready to copy), on over the Values zone
        const overlays = [];
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(text.x + text.width - 2, from.y, { steps: 8 });
        overlays.push(await page.locator(".pk-overlay").count());
        expect(await page.evaluate(() => String(window.getSelection()))).toContain("of 12");
        const over = await inZone(page, "values", { x: 0.05, y: 0.6 });
        await page.mouse.move(over.x, over.y, { steps: 8 });
        overlays.push(await page.locator(".pk-overlay").count());
        await page.mouse.up();
        await page.waitForTimeout(150);
        expect(overlays, "no dragged chip follows the pointer").toEqual([0, 0]);
        expect(await seen(page)).toEqual(before);
    });

    test("the value chip's menu: text pressed and the mouse moved over Columns and Rows", async ({ page }) => {
        await open(page);
        await chipMenu(page, MEAN, "format");
        const menu = page.locator(".pk-chip-menu");
        const before = await seen(page);
        const title = await menu.getByTestId("level-title").boundingBox();
        const from = { x: title.x + 4, y: title.y + title.height / 2 };
        const overlays = await press(page, from, [{ x: from.x + 20, y: from.y + 6 }, await inZone(page, "cols", { x: 0.7, y: 0.5 }), await inZone(page, "rows", { x: 0.7, y: 0.5 })]);
        expect(overlays, "no dragged chip follows the pointer").toEqual([0, 0, 0]);
        expect(await seen(page)).toEqual(before);
    });

    test("the Filters zone chip's menu: text pressed and the mouse moved over Rows", async ({ page }) => {
        await open(page, {
            rows: ["City"],
            cols: [MONTH],
            derived: [{ name: MONTH, field: "Date", by: "month" }],
            values: [{ field: "Mean °C", agg: "average", format: "number:1" }],
            filters: [{ field: "Season", type: "exclude", items: ["Winter"] }]
        });
        await chipMenu(page, "Season", "filter");
        const menu = page.locator(".pk-chip-menu");
        const before = await seen(page);
        const text = await menu.getByTestId("filter-result").boundingBox();
        const from = { x: text.x + 2, y: text.y + text.height / 2 };
        const overlays = await press(page, from, [{ x: text.x + text.width - 2, y: from.y }, await inZone(page, "rows", { x: 0.7, y: 0.5 })]);
        expect(overlays, "no dragged chip follows the pointer").toEqual([0, 0]);
        expect(await seen(page)).toEqual(before);
        expect(await chips(page, "filters")).toEqual(["Season"]);
    });
});

test.describe("a press inside another menu drags nothing", () => {
    test("a field's menu in the field list: pressed and moved over Rows adds nothing", async ({ page }) => {
        await open(page);
        await page.getByTestId("field-menu-Season").click();
        const menu = page.locator(".pk-popover");
        await expect(menu).toBeVisible();
        const before = await seen(page);
        const option = await menu.locator("[data-pk-option]").first().boundingBox();
        const from = { x: option.x + 6, y: option.y + option.height / 2 };
        const overlays = await press(page, from, [{ x: from.x + 20, y: from.y + 10 }, await inZone(page, "rows", { x: 0.7, y: 0.5 })]);
        expect(overlays, "no dragged field follows the pointer").toEqual([0, 0]);
        expect(await seen(page)).toEqual(before);
    });

    for (const id of ["options", "views"]) {
        test(`the ${id} menu: text pressed and moved over Columns and Values`, async ({ page }) => {
            await open(page);
            await toolbar(page, id);
            const menu = page.locator(".pk-popover");
            const before = await seen(page);
            const box = await menu.boundingBox();
            const from = { x: box.x + 12, y: box.y + 14 };
            const overlays = await press(page, from, [{ x: from.x + 20, y: from.y + 8 }, await inZone(page, "cols", { x: 0.1, y: 0.5 }), await inZone(page, "values", { x: 0.1, y: 0.5 })]);
            expect(overlays, "nothing follows the pointer").toEqual([0, 0, 0]);
            expect(await seen(page)).toEqual(before);
        });
    }

    test("touch: a long press inside the Month chip's menu, then a swipe over Values", async ({ page, browserName }) => {
        // touch events through the DevTools protocol, which only Chromium has here
        test.skip(browserName !== "chromium", "touch sequence through CDP");
        await open(page);
        const menu = await monthFilterWithPick(page);
        const before = await seen(page);
        const from = await centre(menu.getByTestId("filter-result"));
        const to = await inZone(page, "values", { x: 0.05, y: 0.6 });
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
        await touch("touchStart", from);
        // longer than the touch sensor's delay, so a drag would start
        await page.waitForTimeout(300);
        const overlays = [];
        for (let i = 1; i <= 10; i++) {
            await touch("touchMove", { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 });
            overlays.push(await page.locator(".pk-overlay").count());
        }
        await touch("touchEnd");
        await page.waitForTimeout(150);
        expect(overlays, "no dragged chip follows the finger").toEqual(overlays.map(() => 0));
        expect(await seen(page)).toEqual(before);
    });
});

test.describe("dragging still works", () => {
    test("the Month chip by its handle, after its menu was used, moves to Rows", async ({ page }) => {
        await open(page);
        await monthFilterWithPick(page);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-chip-menu")).toHaveCount(0);
        const handle = page.locator(`[data-zone="cols"] .pk-chip[data-chip="${MONTH}"] .pk-handle`);
        const overlays = await press(page, await centre(handle), [{ x: (await centre(handle)).x + 12, y: (await centre(handle)).y + 12 }, await inZone(page, "rows", { x: 0.8, y: 0.5 })]);
        expect(overlays.at(-1), "the dragged chip follows the pointer").toBe(1);
        expect(await chips(page, "rows")).toEqual(["City", MONTH]);
        expect(await chips(page, "cols")).toEqual([]);
    });

    test("a field from the field list onto Rows", async ({ page }) => {
        await open(page);
        const field = page.locator('.pk-field[data-field="Season"]');
        const from = await centre(field.locator(".pk-handle"));
        const overlays = await press(page, from, [{ x: from.x + 12, y: from.y + 12 }, await inZone(page, "rows", { x: 0.8, y: 0.5 })]);
        expect(overlays.at(-1), "the dragged field follows the pointer").toBe(1);
        expect(await chips(page, "rows")).toEqual(["City", "Season"]);
    });
});
