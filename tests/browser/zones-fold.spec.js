// The open zones fold into one line when the report's box is too low for them (#93), also when what
// they need grows after the report has measured its box: another language with longer texts makes the
// zones taller on a phone, more fields in Rows on a desktop, a host's larger font size arriving late,
// while the host's box keeps its height, so no resize of the report tells it. Normal motion, with the tickets data in a box of the host's height.
import { expect, test } from "./fixtures.js";

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

/**
 * Opens the tickets data in a box just high enough for its open zones: what they need, measured in a
 * box with room to spare, plus 8 px.
 */
async function boxThatFits(page) {
    await page.goto("?data=tickets&lang=en&height=2000");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const tall = await settled(page);
    expect(tall.layout).toBe("open");
    const need = tall.height - (tall.result - tall.least);
    await page.goto(`?data=tickets&lang=en&height=${need + 8}`);
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const fits = await settled(page);
    expect(fits.layout).toBe("open");
    expect(fits.result).toBeGreaterThanOrEqual(fits.least);
    return fits;
}

test("desktop: zones that grow with more fields fold, though the box keeps its height", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const fits = await boxThatFits(page);
    // four fields added to Rows from the field list's menus: the Rows zone takes a second line of chips
    for (const field of ["Status", "Category", "Channel", "SLA met"]) {
        await page.getByTestId(`field-menu-${field}`).click();
        await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    }
    await expect(page.getByTestId("layout-summary")).toBeVisible();
    const after = await settled(page);
    expect(after.height).toBe(fits.height);
    expect(after.layout).toBe("compact");
    expect(after.result).toBeGreaterThanOrEqual(after.least);
});

test("phone: zones that no longer fit after a change of language fold, though the box keeps its height", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const fits = await boxThatFits(page);
    // German: longer texts, taller zones, the same box
    await page.getByTestId("pg-lang").selectOption("de");
    await expect(page.getByTestId("layout-summary")).toBeVisible();
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
    await expect(page.getByTestId("layout-summary")).toBeVisible();
    const after = await settled(page);
    expect(after.height).toBe(fits.height);
    expect(after.layout).toBe("compact");
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
