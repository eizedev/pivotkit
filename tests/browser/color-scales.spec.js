// Highlight › Colour scale › Colours (#95): the theme's blue scale first, then blue to orange, blue to
// red, red to green, each with its colours as a strip. A pick colours the cells with the scale and
// writes the view's own colours; the theme's colours take them away again.
import { chipMenu, expect, test } from "./fixtures.js";

/** The background colours of the table's smallest and largest value. */
const ends = (page) =>
    page.locator(".pk-table tbody").evaluate(async (body) => {
        // a cell's colour fades to the next: judge it where it ends
        await Promise.all(document.getAnimations().filter((a) => a.playState === "running").map((a) => a.finished.catch(() => {})));
        const cells = [...body.querySelectorAll("td.pk-has-scale")].filter((td) => td.textContent.trim());
        const value = (td) => Number(td.textContent.replace(/[^\d.-]/g, ""));
        const sorted = cells.sort((a, b) => value(a) - value(b));
        return [getComputedStyle(sorted[0]).backgroundColor, getComputedStyle(sorted[sorted.length - 1]).backgroundColor];
    });

for (const [lang, t] of [
    ["en", { colours: "Colours", theme: "Light to dark blue", orange: "Low blue, high orange", red: "Low red, high green" }],
    ["de", { colours: "Farben", theme: "Hellblau bis Dunkelblau", orange: "Niedrig blau, hoch orange", red: "Niedrig rot, hoch grün" }]
]) {
    test(`${lang}: a value's colour scale takes other colours from the menu, and the theme's back`, async ({ page }) => {
        await page.goto(`?data=sales&lang=${lang}`);
        await expect(page.locator(".pk-table")).toBeVisible();
        await chipMenu(page, lang === "de" ? "Summe von Revenue" : "Sum of Revenue");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("topic-scaleColors")).toHaveCount(0);
        await menu.getByTestId("cond-colorScale").click();
        await expect(menu.getByTestId("topic-scaleColors")).toContainText(t.colours);
        await expect(menu.getByTestId("topic-scaleColors")).toContainText(t.theme);
        const before = await ends(page);
        await menu.getByTestId("topic-scaleColors").click();
        // the theme's first, each with a strip of its colours; red and green with a word of warning
        await expect(menu.locator('[data-pk-item^="scale-"]')).toHaveCount(4);
        await expect(menu.locator('[data-pk-item^="scale-"] .pk-scale-swatch')).toHaveCount(4);
        await expect(menu.locator('[data-pk-item="scale-redGreen"]')).toContainText(t.red);
        await menu.locator('[data-pk-item="scale-blueOrange"]').click();
        await expect(menu.getByTestId("topic-scaleColors")).toContainText(t.orange);
        // the highest value turns orange: more red than blue
        await expect.poll(async () => (await ends(page))[1]).not.toBe(before[1]);
        // rgb(…) or color(srgb …) as the engine writes a mixed colour: red above blue either way
        const high = (await ends(page))[1].replace(/^[^(]*\((srgb )?/, "").match(/[\d.]+/g).map(Number);
        expect(high[0]).toBeGreaterThan(high[2]);
        // the theme's colours again: as before
        await menu.getByTestId("topic-scaleColors").click();
        await menu.locator('[data-pk-item="scale-theme"]').click();
        await expect.poll(() => ends(page)).toEqual(before);
    });
}
