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
