// Menus, sheets and popups above a host page's fixed layout (#111): next to a navigation drawer with a
// z-index of 1200 and an app bar of 1201 (pages/nav-shell.js), a bottom sheet at 800 px shows whole,
// as does an "About" popup and the Export menu, for pivotkit-react and the web component; a popover
// on a wide report still opens under its button and takes the report's tokens. Without the Popover
// API the layer's z-index is --pk-layer-z.
import { expect, openZones, test, toolbar } from "./fixtures.js";
import { NAV_PAGES, hitAt, labelsOnTop, reportOf, settled } from "./host-nav.js";

test.describe("menus and sheets above a fixed host navigation (#111)", () => {
    for (const [name, url] of NAV_PAGES) {
        test(`${name} at 800 px: a chip menu's sheet, the Export menu and an "About" popup are above the navigation`, async ({ page }) => {
            await page.setViewportSize({ width: 800, height: 800 });
            await page.goto(url);
            const report = reportOf(page);
            await openZones(page);
            // the navigation covers the left 250 px of the window, where a sheet starts
            const drawer = await page.getByTestId("host-drawer").boundingBox();
            expect(drawer.width).toBe(250);

            await report.getByTestId("chip-menu-Environment").click();
            const sheet = report.locator(".pk-popover.pk-sheet");
            await expect(sheet).toBeVisible();
            await settled(sheet);
            const box = await sheet.boundingBox();
            expect(box.x).toBe(0);
            expect((await hitAt(page, 40, box.y + 30))?.inPopover).toBe(true);
            // every label of the sheet shows, the ones left of 250 px too (Sort, Filter, Top items, Move to, Remove)
            const labels = await labelsOnTop(page, sheet);
            expect(labels.filter((l) => l.on !== "popover")).toEqual([]);
            expect(labels.map((l) => l.text).join(" ")).toContain("Remove");
            // the scrim covers the host's layout too: a press on the navigation closes the sheet, it opens nothing there
            expect((await hitAt(page, 100, 120))?.inScrim).toBe(true);
            await page.keyboard.press("Escape");
            await expect(sheet).toHaveCount(0);
            await expect(report.getByTestId("chip-menu-Environment")).toBeFocused();

            await toolbar(page, "export");
            const exportSheet = report.locator(".pk-popover.pk-sheet");
            await expect(exportSheet).toBeVisible();
            expect((await labelsOnTop(page, exportSheet)).filter((l) => l.on !== "popover")).toEqual([]);
            await page.keyboard.press("Escape");
            await expect(exportSheet).toHaveCount(0);

            await report.getByTestId("zone-info-filters").click();
            const about = report.locator(".pk-info-pop");
            await expect(about).toBeVisible();
            await expect(about).toHaveAttribute("aria-label", "About Filters");
            await settled(about);
            const aboutBox = await about.boundingBox();
            expect((await hitAt(page, aboutBox.x + 20, aboutBox.y + aboutBox.height / 2))?.inPopover).toBe(true);
            expect((await labelsOnTop(page, about)).filter((l) => l.on !== "popover")).toEqual([]);
            // a sheet like every other: as wide as the window, not a 320 px box at its left
            expect(aboutBox.x).toBe(0);
            expect(Math.abs(aboutBox.width - (await page.evaluate(() => document.documentElement.clientWidth)))).toBeLessThan(1);
        });

        test(`${name} at 1280 px: a chip menu opens under its chip, above the app bar's stacking`, async ({ page }) => {
            await page.goto(url);
            const report = reportOf(page);
            await openZones(page);
            const chip = report.getByTestId("chip-menu-Environment");
            // the zones open with an animation: the chip at its own place before it is clicked (a
            // popover is placed when it opens; it does not follow an anchor that moves afterwards)
            await settled(report.locator(".pk-root"));
            await chip.click();
            const menu = report.locator(".pk-popover.pk-chip-menu");
            await expect(menu).toBeVisible();
            await expect(menu).not.toHaveClass(/pk-sheet/);
            await settled(menu);
            // placed against the window as before: below its button, its left edge at the button's
            const a = await chip.boundingBox();
            const m = await menu.boundingBox();
            expect(Math.abs(m.y - (a.y + a.height + 6))).toBeLessThan(1.5);
            expect(Math.abs(m.x - a.x)).toBeLessThan(1.5);
            expect((await labelsOnTop(page, menu)).filter((l) => l.on !== "popover")).toEqual([]);
            // the theme's tokens reach it: the raised surface of the report, not the browser's canvas
            const colours = await menu.evaluate((el) => {
                const probe = document.createElement("span");
                probe.style.color = "var(--pk-surface-raised)";
                el.append(probe);
                const want = getComputedStyle(probe).color;
                probe.remove();
                return { bg: getComputedStyle(el).backgroundColor, want };
            });
            expect(colours.bg).toBe(colours.want);
        });
    }

    test("without the Popover API, --pk-layer-z lifts the layer above the host's navigation", async ({ page }) => {
        await page.addInitScript(() => {
            for (const key of ["showPopover", "hidePopover", "togglePopover", "popover"]) {
                delete HTMLElement.prototype[key];
            }
        });
        await page.setViewportSize({ width: 800, height: 800 });
        await page.goto("pages/nav.html");
        await openZones(page);
        await page.getByTestId("chip-menu-Environment").click();
        const sheet = page.locator(".pk-popover.pk-sheet");
        await expect(sheet).toBeVisible();
        await settled(sheet);
        expect(await sheet.evaluate((el) => el.hasAttribute("popover"))).toBe(false);
        const box = await sheet.boundingBox();
        // the default layer stays under a navigation at z-index 1200 (the documented limit)
        expect((await hitAt(page, 40, box.y + 30))?.where).toContain("host-drawer");
        await page.addStyleTag({ content: ".pk-root { --pk-layer-z: 1300; }" });
        expect((await hitAt(page, 40, box.y + 30))?.inPopover).toBe(true);
    });
});
