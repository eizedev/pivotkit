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
            // and the pointer leaving both closes it, the menu stays
            await page.mouse.move(box.x - 40, box.y + box.height + 120, { steps: 5 });
            await expect(tip).toHaveCount(0);
            await expect(page.locator(".pk-popover").first()).toBeVisible();
        });
    }

    // the tip is placed a few pixels off its i: the pointer on its way from the i to the tip passes
    // that gap. Resting there longer than the leave delay (a slow machine's pointer steps: about
    // 280 ms each in CI's WebKit on Linux) closed the tip before the pointer reached it
    for (const [menu, info] of [
        ["export", "setting-info-copyTable"],
        ["options", "setting-info-rowSubtotals"]
    ]) {
        test(`${menu}: the pointer resting between ${info} and its tip keeps the tip`, async ({ page }) => {
            await page.goto("?data=tickets");
            await toolbar(page, menu);
            const button = page.getByTestId(info);
            await button.hover();
            const tip = page.locator(".pk-info-pop");
            await expect(tip).toBeVisible();
            const b = await button.boundingBox();
            const t = await tip.boundingBox();
            const below = t.y >= b.y + b.height;
            const gap = below ? [b.y + b.height, t.y] : [t.y + t.height, b.y];
            expect(gap[1] - gap[0], "a gap between the i and its tip").toBeGreaterThan(1);
            // in the gap, at the i's centre line: neither on the i nor on the tip
            await page.mouse.move(b.x + b.width / 2, (gap[0] + gap[1]) / 2);
            await page.waitForTimeout(800);
            await expect(tip).toBeVisible();
            // on from there onto the tip: it stays
            await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 3 });
            await page.waitForTimeout(400);
            await expect(tip).toBeVisible();
            // the gap is no place that keeps the tip for good: leaving through it closes it
            await page.mouse.move(b.x + b.width / 2, (gap[0] + gap[1]) / 2);
            // to the start of the i's own row in the menu (its switch), not onto another i
            const menuBox = await page.locator(".pk-popover").first().boundingBox();
            expect(menuBox.x + 12, "the row's start, left of the i").toBeLessThan(b.x);
            await page.mouse.move(menuBox.x + 12, b.y + b.height / 2, { steps: 3 });
            await expect(tip).toHaveCount(0);
            await expect(page.locator(".pk-popover").first()).toBeVisible();
        });
    }

    // the way CI's WebKit on Linux moves the pointer: a straight line from the i to the tip's centre in
    // steps about 280 ms apart. Next to the window's edge the tip is moved left, so the first steps run
    // beside the i through its row, on neither the i nor the tip. At 1600 px Options opens from its own
    // toolbar button, not from More: where CI's narrower fonts put it at 1280 px, its tip reaching out
    // of the menu on the right
    for (const [width, menu, info] of [1280, 1600].flatMap((w) => [
        [w, "export", "setting-info-copyTable"],
        [w, "options", "setting-info-rowSubtotals"]
    ])) {
        test(`${menu} at ${width} px: the pointer moving slowly from ${info} onto its tip keeps the tip`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto("?data=tickets");
            await toolbar(page, menu);
            const button = page.getByTestId(info);
            await button.hover();
            const tip = page.locator(".pk-info-pop");
            await expect(tip).toBeVisible();
            // the tip has its final place (it grows in from its anchor)
            await expect.poll(() => wholeOnTop(tip)).toEqual({ inside: true, hidden: [] });
            const b = await button.boundingBox();
            const t = await tip.boundingBox();
            const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
            const to = { x: t.x + t.width / 2, y: t.y + t.height / 2 };
            for (let i = 1; i <= 5; i++) {
                await page.mouse.move(from.x + ((to.x - from.x) * i) / 5, from.y + ((to.y - from.y) * i) / 5);
                await page.waitForTimeout(300);
                await expect(tip, `after step ${i} of 5`).toBeVisible();
            }
            // still the hover tip, whole and on top
            await expect(tip).toHaveAttribute("role", "tooltip");
            await expect.poll(() => wholeOnTop(tip)).toEqual({ inside: true, hidden: [] });
        });
    }

    test("options: a pointer that came to rest beside the i, on the way to its tip, closes the tip after a while", async ({ page }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "options");
        const button = page.getByTestId("setting-info-rowSubtotals");
        await button.hover();
        const tip = page.locator(".pk-info-pop");
        await expect.poll(() => wholeOnTop(tip)).toEqual({ inside: true, hidden: [] });
        const b = await button.boundingBox();
        const t = await tip.boundingBox();
        // a fifth of the way from the i's centre to the tip's: beside the i, on neither
        const at = { x: b.x + b.width / 2 + (t.x + t.width / 2 - b.x - b.width / 2) / 5, y: b.y + b.height / 2 + (t.y + t.height / 2 - b.y - b.height / 2) / 5 };
        const where = await page.evaluate(({ x, y }) => {
            const hit = document.elementFromPoint(x, y);
            return hit?.closest(".pk-info-pop") ? "tip" : hit?.closest(".pk-info") ? "i" : "neither";
        }, at);
        expect(where).toBe("neither");
        await page.mouse.move(at.x, at.y);
        await page.waitForTimeout(800);
        await expect(tip).toBeVisible();
        // resting there is no way anywhere: it closes within about two seconds, the menu stays
        await expect(tip).toHaveCount(0, { timeout: 3000 });
        await expect(page.locator(".pk-popover").first()).toBeVisible();
    });

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
