// A phone (390 px, touch): every control of the report takes a tap 44 px across (WCAG 2.5.5), in the
// states a person reaches: the report, the zones open, a field's menu, More, the field list and the
// chart. A control is big enough when a tap 21 px from its middle, up, down, left and right, still
// lands on it: its own box, or a hit area over it. A row's fold chevron takes 44 px across and its
// row's height, so it never takes a tap meant for the next row. The field list's rows have their own test
// (review.spec.js): they keep their desktop rows with hit areas inside them.
import { expect, test } from "./fixtures.js";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

/** The controls a tap misses 21 px from their middle, with their test id or name and size. */
const missed = (page) =>
    page.evaluate(async () => {
        // a chip pops in, a menu fades in: judge them at their size
        const ends = document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity);
        await Promise.all(ends.map((a) => a.finished.catch(() => {})));
        const out = [];
        const controls = document.querySelectorAll(":is(.pk-root, .pk-layer) :is(button, [role=tab], [role^=menuitem], a[href], input:not([type=hidden]), select, summary)");
        for (const el of controls) {
            const box = el.getBoundingClientRect();
            if (!box.width || !box.height || el.closest(".pk-field") || getComputedStyle(el).visibility === "hidden") {
                continue;
            }
            const x = box.left + box.width / 2;
            const y = box.top + box.height / 2;
            // a control cut by its scrolling list or the window is judged where it shows
            if (y - 21 < 0 || y + 21 > innerHeight || x - 21 < 0 || x + 21 > innerWidth) {
                continue;
            }
            // a control hidden under another part (a closed drawer) takes no tap at all
            if (!el.contains(document.elementFromPoint(x, y))) {
                continue;
            }
            const owns = ([px, py]) => {
                const hit = document.elementFromPoint(px, py);
                // a text field's frame (its search row) focuses it
                return hit && (el.contains(hit) || hit.contains(el) && hit.matches(".pk-search, label"));
            };
            // a row's fold chevron: 44 px wide from its left (the table's edge is there), as high as its row
            const row = el.matches(".pk-toggle") ? el.closest("tr").getBoundingClientRect() : null;
            const points = row ? [[box.left + 1, y], [box.left + 43, y], [x, row.top + 2], [x, row.bottom - 2]] : [[x, y - 21], [x, y + 21], [x - 21, y], [x + 21, y]];
            if (!points.every(owns)) {
                const where = points.filter((p) => !owns(p)).map(([px, py]) => document.elementFromPoint(px, py)?.className ?? "none");
                out.push(`${el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 24)} ${Math.round(box.width)}x${Math.round(box.height)} (${where.join(", ")})`);
            }
        }
        return [...new Set(out)];
    });

test("every control of the report takes a 44 px tap on a phone", async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "Firefox has no mobile emulation");
    await page.goto("?data=sales");
    await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", "narrow");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await expect(page.locator(".pk-table")).toBeVisible();
    expect(await missed(page), "the report").toEqual([]);
    await page.getByTestId("layout-summary").click();
    await expect(page.locator('[data-testid^="chip-menu-"]').first()).toBeVisible();
    expect(await missed(page), "the zones open").toEqual([]);
    await page.locator('[data-testid^="chip-menu-"]').first().click();
    await expect(page.locator(".pk-chip-menu")).toBeVisible();
    expect(await missed(page), "a field's menu").toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByTestId("more").click();
    await expect(page.locator(".pk-popover").first()).toBeVisible();
    expect(await missed(page), "More").toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByTestId("show-fields").click();
    await expect(page.locator(".pk-field").first()).toBeVisible();
    expect(await missed(page), "the field list").toEqual([]);
    await page.keyboard.press("Escape");
    // the zones folded again, so the tabs are in the window
    await page.getByTestId("layout-summary").click();
    await page.getByTestId("show-chart").click();
    await expect(page.locator(".pk-chart canvas").first()).toBeVisible();
    expect(await missed(page), "the chart").toEqual([]);
});
