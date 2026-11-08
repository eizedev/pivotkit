// Every popover fits the window: a filter opened from a field low in the field list keeps Apply in view
// and clickable, and the menus of the chips and the toolbar stay inside a 1280 x 720 window.
import { test, expect, toolbar } from "./fixtures.js";

/** The box of the open popover against the window: inside, with the margin of place.js. */
async function insideWindow(page, selector = ".pk-popover") {
    const pop = page.locator(selector).last();
    await expect(pop).toBeVisible();
    // placed after a frame (popover.jsx), and an animation of its own
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const box = await pop.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: innerHeight };
    });
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.height);
}

for (const height of [970, 720, 480]) {
    test(`a filter opened from the last field of the list keeps Apply in view at 1280 x ${height}`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height });
        await page.goto("?data=tickets&rows=100000");
        await page.locator('[data-testid="pivot-table"]').waitFor();
        const field = await page.locator(".pk-field-list .pk-field").last().getAttribute("data-field");
        await page.getByTestId(`field-menu-${field}`).click();
        await page.getByTestId(`field-filter-${field}`).click();
        const apply = page.getByTestId("filter-apply");
        await expect(apply).toBeVisible();
        await insideWindow(page, ".pk-filter-popover");
        const box = await apply.boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        // clickable: nothing covers it, and a click applies (the popover closes)
        const hit = await apply.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const at = (el.getRootNode()).elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return el === at || el.contains(at);
        });
        expect(hit).toBe(true);
        await apply.click();
        await expect(page.locator(".pk-filter-popover")).toHaveCount(0);
    });
}

test("chip menus, the value filter, Views and Options stay inside a 1280 x 720 window", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("?data=tickets&rows=100000");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    // a window this low folds the zones into one line: open them
    if (!(await page.getByTestId("chip-menu-Team").isVisible())) {
        await toolbar(page, "layout");
    }
    for (const chip of ["Team", "Priority"]) {
        await page.getByTestId(`chip-menu-${chip}`).click();
        await insideWindow(page);
        await page.keyboard.press("Escape");
    }
    // the Filter level, the longest: its value condition at the end is reached by scrolling inside it
    await page.getByTestId("chip-menu-Team").click();
    await page.getByTestId("topic-filter").click();
    await insideWindow(page);
    await page.getByTestId("filter-more").click();
    await insideWindow(page);
    await page.getByTestId("value-filter-op").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("value-filter-op")).toBeInViewport();
    await insideWindow(page);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    for (const menu of ["views", "options", "export"]) {
        await toolbar(page, menu);
        await insideWindow(page);
        await page.keyboard.press("Escape");
    }
});

/**
 * The layout box of the "i" popover of a value's Show as, every frame for `ms` after it is shown
 * (placed: no longer hidden). The box without transforms: the pop-in animation scales it, the place
 * and the size do not change. With `rect`, the box on screen (transforms included) instead.
 */
async function infoBoxes(page, { ms = 700, rect = false } = {}) {
    await page.getByTestId("chip-menu-Sum of Revenue").click();
    await page.getByTestId("topic-showAs").click();
    await page.getByTestId("setting-info-showAs").click();
    return page.evaluate(
        ({ ms, rect }) =>
            new Promise((done) => {
                const boxes = [];
                let start = null;
                const frame = () => {
                    const el = document.querySelector(".pk-info-pop");
                    if (el && getComputedStyle(el).visibility !== "hidden") {
                        start ??= performance.now();
                        const r = el.getBoundingClientRect();
                        boxes.push(rect ? [r.left, r.top, r.width, r.height].map(Math.round).join() : [el.style.left, el.style.top, el.offsetWidth, el.offsetHeight].join());
                    }
                    // at least `ms` and at least 12 frames: a slow engine (WebKit in CI) draws fewer frames in the same time
                    if (start !== null && performance.now() - start > ms && boxes.length >= 12) {
                        done(boxes);
                    } else {
                        requestAnimationFrame(frame);
                    }
                };
                frame();
            }),
        { ms, rect }
    );
}

test.describe("an i's popover appears at its final size and place", () => {
    test("it does not narrow frame by frame where the fixed containing block ends before the window (a scroll bar, a transformed host)", async ({ page }) => {
        await page.goto("?data=sales");
        await page.locator('[data-testid="pivot-table"]').waitFor();
        // the page's box contains the report's fixed popovers and ends 160 px before the window's edge
        await page.addStyleTag({ content: "body { transform: translateZ(0); margin-right: 160px; }" });
        const boxes = await infoBoxes(page);
        expect(boxes.length).toBeGreaterThanOrEqual(12);
        expect(new Set(boxes)).toEqual(new Set([boxes[0]]));
    });

    test("with reduced motion nothing moves: the first frame shown is the last", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("?data=sales");
        await page.locator('[data-testid="pivot-table"]').waitFor();
        const boxes = await infoBoxes(page, { rect: true });
        expect(boxes.length).toBeGreaterThanOrEqual(12);
        expect(new Set(boxes)).toEqual(new Set([boxes[0]]));
    });
});
