// A large table scrolls in one box (#112), and its row label column keeps its width while it scrolls
// (#110): the server inventory of pages/nav.html, host names in Rows.
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

test("the row label column keeps its width while the table scrolls, its long labels cut with the whole text as tooltip (#110)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("pages/nav.html?view=hosts&rows=10000");
    const wrap = page.locator(".pk-table-wrap");
    await expect(page.locator(".pk-table.pk-virtual")).toHaveCount(1);
    const widths = [];
    for (const top of [0, 2000, 20000, 60000, 200000]) {
        await wrap.evaluate((el, t) => {
            el.scrollTop = t;
        }, top);
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        widths.push(
            await page.evaluate(() => {
                const corner = document.querySelector(".pk-table thead tr:last-child th").getBoundingClientRect().width;
                const body = document.querySelector(".pk-table tbody tr[data-r] th.pk-rowHeader").getBoundingClientRect().width;
                return { corner, body };
            })
        );
    }
    for (const w of widths) {
        expect(Math.abs(w.corner - widths[0].corner), JSON.stringify(widths)).toBeLessThan(0.5);
        expect(Math.abs(w.body - widths[0].body), JSON.stringify(widths)).toBeLessThan(0.5);
    }
    // wide enough for the long host names, never wider than about 28em
    const em = await page.locator(".pk-table").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(widths[0].corner).toBeGreaterThan(14 * em);
    expect(widths[0].corner).toBeLessThanOrEqual(29.8 * em);
    // a label cut with "…" has its whole text as its tooltip
    const cut = await page.locator(".pk-table tbody th.pk-rowHeader").evaluateAll((ths) =>
        ths
            .map((th) => ({ th, text: th.querySelector(".pk-th-text") }))
            .filter(({ text }) => text.scrollWidth > text.clientWidth)
            .map(({ th, text }) => ({ title: th.getAttribute("title"), text: text.textContent, overflow: getComputedStyle(text).textOverflow }))
    );
    for (const c of cut) {
        expect(c.title).toBe(c.text);
        expect(c.overflow).toBe("ellipsis");
    }
});
