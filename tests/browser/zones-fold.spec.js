// The open zones fold into one line when the report's box is too low for them (#93), also when what
// they need grows after the report has measured its box: another language with longer texts makes the
// zones taller on a phone, more fields in Rows on a desktop, a host's larger font size arriving late,
// while the host's box keeps its height, so no resize of the report tells it. Normal motion, with the tickets data in a box of the host's height.
import { encodeViewLink } from "pivotkit-core/link";
import { expect, test, toolbar } from "./fixtures.js";

/**
 * On a desktop the open shelves of the tickets data need less than a low report's 600 px, so that
 * threshold, not their need, would fold them: the assets data with more fields needs more.
 */
const DESKTOP = `?data=assets&lang=en#pivot-playground=${encodeViewLink({
    rows: ["Source system", "Location"],
    cols: ["Status"],
    values: [{ field: "Cost", agg: "sum" }, { field: "Disk GB", agg: "average" }, { field: "Cost", agg: "average" }]
})}`;

/** The report's layout and its result against the result's least height. */
const state = (page) =>
    page.locator(".pk-root").evaluate((el) => {
        const result = el.querySelector(".pk-result");
        const least = parseFloat(getComputedStyle(result).getPropertyValue("--pk-result-least")) || 0;
        return { layout: el.getAttribute("data-pk-layout") ?? "open", result: Math.round(result.getBoundingClientRect().height), least, height: Math.round(el.getBoundingClientRect().height) };
    });

/** Waits until the layout reads the same twice, apart (the report settles over its first renders). */
async function settled(page) {
    let last = "";
    await expect
        .poll(async () => {
            const now = JSON.stringify(await state(page));
            const same = now === last;
            last = now;
            return same;
        }, { intervals: [250, 250, 250, 500] })
        .toBe(true);
    return JSON.parse(last);
}

/** A page of the playground with another query parameter (before the fragment). */
const withParam = (url, param) => url.replace(/(#|$)/, `&${param}$1`);

/**
 * Opens the data in a box just high enough for its open zones: what they need, measured in a box
 * with room to spare, plus 8 px. By default the tickets data.
 */
async function boxThatFits(page, url = "?data=tickets&lang=en") {
    await page.goto(withParam(url, "height=2000"));
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const tall = await settled(page);
    expect(tall.layout).toBe("open");
    const need = tall.height - (tall.result - tall.least);
    await page.goto(withParam(url, `height=${need + 8}`));
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const fits = await settled(page);
    expect(fits.layout).toBe("open");
    expect(fits.result).toBeGreaterThanOrEqual(fits.least);
    return fits;
}

test("desktop: zones that grow with more fields fold, though the box keeps its height", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const fits = await boxThatFits(page, DESKTOP);
    // four fields added to Rows from the field list's menus: the Rows shelf takes another line of chips
    for (const field of ["Type", "Operating system", "Asset", "Inventory number"]) {
        await page.getByTestId(`field-menu-${field}`).click();
        await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    }
    // the menu closed over the grown section: the pointer resting on it holds the fold (the next test);
    // away from it, the zones fold
    await page.mouse.move(5, 5);
    await expect(page.getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "false");
    const after = await settled(page);
    expect(after.height).toBe(fits.height);
    expect(after.layout).toBe("compact");
    expect(after.result).toBeGreaterThanOrEqual(after.least);
});

test("desktop: fields added and removed while the user works in the zones: the area stays open, and folds once they leave it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const fits = await boxThatFits(page, DESKTOP);
    const fold = page.getByTestId("layout-summary");
    // four fields added to Rows with its + Add: the pointer on the section or its menus, the focus on
    // each new chip in the section; then one removed by its x
    for (const field of ["Type", "Operating system", "Asset", "Inventory number"]) {
        await page.getByTestId("add-field-rows").click();
        await page.locator(".pk-add-menu").getByTestId(`add-pick-${field}`).click();
        await expect(page.getByTestId(`chip-menu-${field}`)).toBeFocused();
    }
    await page.getByRole("button", { name: "Remove Asset" }).click();
    // the zones need more than the box now, but the user is still in them: they stay open
    await page.waitForTimeout(600);
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    expect((await state(page)).height).toBe(fits.height);
    // the user leaves the area (the pointer away, the focus on the tabs): it folds, as it does not fit
    await page.mouse.move(5, 5);
    await page.getByTestId("show-table").focus();
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    const after = await settled(page);
    expect(after.height).toBe(fits.height);
    expect(after.layout).toBe("compact");
});

test("phone: zones that no longer fit after a change of language fold, though the box keeps its height", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fits = await boxThatFits(page);
    // German: longer texts, taller zones, the same box
    await page.getByTestId("pg-lang").selectOption("de");
    await expect(page.getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "false");
    const after = await settled(page);
    expect(after.height).toBe(fits.height);
    expect(after.layout).toBe("compact");
    expect(after.result).toBeGreaterThanOrEqual(after.least);
});

test("phone: zones that grow with a host's larger font size fold, though no render and no resize of the report says so", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fits = await boxThatFits(page);
    // the host's stylesheet arrives late with a larger text token: the zones grow, the report renders nothing
    await page.addStyleTag({ content: ".pk-root { --pk-font-size: 18px; }" });
    await expect(page.getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "false");
    const after = await settled(page);
    expect(after.height).toBe(fits.height);
    expect(after.layout).toBe("compact");
    expect(after.result).toBeGreaterThanOrEqual(after.least);
});

test("desktop: zones folded by a tall warning open again once the warning folds and they fit", async ({ page }) => {
    // the open zones with their heading fit, a tall warning leaves them no room (a window of 800 px:
    // in one of 900 px the open shelves keep their room beside the warning)
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto("?data=sales");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    expect((await settled(page)).layout).toBe("open");
    // a view with parts the data cannot use: its warning above the result leaves the zones no room
    await toolbar(page, "views");
    await page.getByTestId("load-view").click();
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum", label: "Quakes", conditional: { type: "colorScale", colors: ["red"] } }], chart: { legend: "left" } };
    await page.getByTestId("load-view-text").fill(JSON.stringify(view));
    await page.getByTestId("load-view-apply").click();
    const warning = page.getByTestId("view-issues");
    await expect(warning.getByTestId("unused-item").first()).toBeVisible();
    await expect(page.getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "false");
    // the warning folded by its title: the zones fit again and open, and stay open
    await warning.getByTestId("unused-title").click();
    await expect(page.locator('[data-zone="rows"]')).toBeVisible();
    const after = await settled(page);
    expect(after.layout).toBe("open");
    expect(after.result).toBeGreaterThanOrEqual(after.least);
    // nothing flips: the layout stays open over a second
    for (let i = 0; i < 5; i++) {
        // a look every 250 ms
        await page.waitForTimeout(250);
        expect((await state(page)).layout).toBe("open");
    }
});

test("zones folded on a medium-wide window open again when the window gets wide and they fit", async ({ page }) => {
    // what the open zones need on a wide window, in a box just high enough for them there
    await page.setViewportSize({ width: 1440, height: 900 });
    const wide = await boxThatFits(page, DESKTOP);
    // a medium-wide window stacks more of the zones: they need more than that box, so they fold
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(page.getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "false");
    expect((await settled(page)).layout).toBe("compact");
    // wide again: the zones open, measured again for this width, and stay open
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('[data-zone="rows"]')).toBeVisible();
    const after = await settled(page);
    expect(after.height).toBe(wide.height);
    expect(after.layout).toBe("open");
    expect(after.result).toBeGreaterThanOrEqual(after.least);
});

// the case the issue names: these zones need more than 820 px; already folded before the fix, kept as a guard
test("phone: the tickets data in a box of 820 px starts with its zones folded (they need more)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=tickets&height=820");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const s = await settled(page);
    expect(s.layout).toBe("compact");
    expect(s.result).toBeGreaterThanOrEqual(s.least);
});
