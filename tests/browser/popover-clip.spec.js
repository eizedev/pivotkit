// A popover is never cut off by the report's box. Safari clips a fixed popover to an ancestor that
// clips its content (overflow: clip or hidden), whatever the window has room for; the popovers are
// placed against the window, so no ancestor of their layer may clip. The layout inside the report
// clips instead. Checked for the filter from the field list, a chip menu, the Views and Export menus,
// in a report lower than the window with the field low in its list.
import { expect, test, toolbar } from "./fixtures.js";

/** The ancestors of the popover (up to the document, across a shadow root) that clip their content. */
const clippingAncestors = (locator) =>
    locator.evaluate((el) => {
        const out = [];
        for (let n = el.parentNode; n; n = n instanceof ShadowRoot ? n.host : n.parentNode) {
            if (n instanceof Element && ["clip", "hidden", "auto", "scroll"].includes(getComputedStyle(n).overflowY)) {
                out.push(n.className || n.localName);
            }
        }
        return out;
    });

/** Whether the element's centre is what the window shows there. */
const onTop = (locator) =>
    locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = /** @type {Document | ShadowRoot} */ (el.getRootNode()).elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.bottom <= window.innerHeight && (hit === el || el.contains(hit));
    });

test.describe("popovers outside the report's clip", () => {
    test("the filter of a field low in the list, in a report lower than the window: Apply is shown", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto("?data=tickets&height=480");
        const last = page.locator(".pk-field").last();
        await last.scrollIntoViewIfNeeded();
        const name = await last.getAttribute("data-field");
        await page.getByTestId(`field-menu-${name}`).click();
        await page.getByTestId(`field-filter-${name}`).click();
        const apply = page.getByTestId("filter-apply");
        await expect(apply).toBeVisible();
        // the popover reaches below the report's box: nothing may cut it there
        const report = await page.locator(".pk-root").boundingBox();
        expect((await apply.boundingBox()).y).toBeGreaterThan(report.y + report.height);
        expect(await clippingAncestors(page.locator(".pk-popover"))).toEqual([]);
        expect(await onTop(apply)).toBe(true);
    });

    test("a chip menu, Views and Export: no clipping ancestor", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Region").click();
        expect(await clippingAncestors(page.locator(".pk-popover"))).toEqual([]);
        await page.keyboard.press("Escape");
        for (const id of ["views", "export"]) {
            await toolbar(page, id);
            await expect(page.locator(".pk-popover")).toHaveCount(1);
            expect(await clippingAncestors(page.locator(".pk-popover"))).toEqual([]);
            await page.keyboard.press("Escape");
        }
    });

    test("the web component: no clipping ancestor inside the shadow root", async ({ page }) => {
        await page.goto("pages/element-two.html");
        const sales = page.locator("#sales");
        await sales.getByTestId("export").click();
        expect(await clippingAncestors(sales.locator(".pk-popover"))).toEqual([]);
    });
});

/**
 * Whether the whole box of the element is inside the window and what the window shows there: its
 * centre and points just inside its four corners (a menu drawn over it would hide one of them).
 */
const wholeOnTop = (locator) =>
    locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const inside = r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
        const root = /** @type {Document | ShadowRoot} */ (el.getRootNode());
        const points = [
            [r.left + r.width / 2, r.top + r.height / 2],
            [r.left + 4, r.top + 4],
            [r.right - 4, r.top + 4],
            [r.left + 4, r.bottom - 4],
            [r.right - 4, r.bottom - 4]
        ];
        const hidden = points.filter(([x, y]) => {
            const hit = root.elementFromPoint(x, y);
            return !(hit === el || el.contains(hit));
        });
        return { inside, hidden: hidden.map((p) => p.map(Math.round).join(",")) };
    });

// #213: an explanation shown on hover of an "i" inside a menu belongs to that menu's layer: drawn
// above the menu (a menu in the browser's top layer covered it) and kept inside the window
test.describe("an i inside a menu: its explanation above the menu, in the window", () => {
    for (const [menu, info] of [
        ["export", "setting-info-copyTable"],
        ["options", "setting-info-rowSubtotals"]
    ]) {
        test(`${menu}: hovering ${info} at the report's right edge`, async ({ page }) => {
            await page.goto("?data=tickets");
            await toolbar(page, menu);
            const button = page.getByTestId(info);
            await button.hover();
            const tip = page.locator(".pk-info-pop");
            await expect(tip).toBeVisible();
            // the pointer has really moved onto the i: the tip is a hover tip, not a dialog
            await expect(tip).toHaveAttribute("role", "tooltip");
            await expect.poll(() => wholeOnTop(tip)).toEqual({ inside: true, hidden: [] });
            // the pointer moving onto the tip keeps it open (its link must be reachable)
            const box = await tip.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
            await page.waitForTimeout(400);
            await expect(tip).toBeVisible();
        });
    }

    test("the web component, light and dark: Export's Copy table i above the menu", async ({ page }) => {
        await page.goto("pages/element-two.html");
        for (const id of ["sales", "tickets"]) {
            const report = page.locator(`#${id}`);
            await report.scrollIntoViewIfNeeded();
            await report.getByTestId("export").click();
            await report.getByTestId("setting-info-copyTable").hover();
            const tip = report.locator(".pk-info-pop");
            await expect(tip).toBeVisible();
            await expect.poll(() => wholeOnTop(tip)).toEqual({ inside: true, hidden: [] });
            await page.keyboard.press("Escape");
            await page.mouse.move(0, 0);
        }
    });
});
