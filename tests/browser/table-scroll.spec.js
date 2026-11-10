// A large table scrolls in one box (#112): the server inventory of pages/nav.html, host names in Rows.
import { expect, test } from "./fixtures.js";

test("one scroll container for a large table: the result area never scrolls with it (#112)", async ({ page }) => {
    await page.goto("pages/nav.html?view=wide");
    const wrap = page.locator(".pk-table-wrap");
    await expect(wrap).toBeVisible();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const sizes = await page.evaluate(() => {
        const box = (el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
        return { result: box(document.querySelector("section.pk-result")), wrap: box(document.querySelector(".pk-table-wrap")), empty: document.querySelectorAll(".pk-table .pk-sr").length };
    });
    // the table is larger than its area both ways, with empty cells (their screen reader text)
    expect(sizes.empty).toBeGreaterThan(20);
    expect(sizes.wrap.sh).toBeGreaterThan(sizes.wrap.ch);
    expect(sizes.wrap.sw).toBeGreaterThan(sizes.wrap.cw);
    // only the table's own box scrolls
    expect(sizes.result.sw).toBe(sizes.result.cw);
    expect(sizes.result.sh).toBe(sizes.result.ch);
});
