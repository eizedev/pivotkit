// The report on a phone (390 and 360 px, touch), as a person first sees it: the table's headers wrap
// between words, never inside one ("Categor" over "y", "Populatio" over "n"), in English and German.
import { expect, test } from "./fixtures.js";

test.use({ hasTouch: true, isMobile: true });

/** The words of the table's headers that break across two lines. */
const brokenWords = (page) =>
    page.locator(".pk-table thead").evaluate((head) => {
        const out = [];
        for (const label of head.querySelectorAll(".pk-th-text")) {
            const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                for (const m of node.data.matchAll(/\S+/g)) {
                    const range = document.createRange();
                    range.setStart(node, m.index);
                    range.setEnd(node, m.index + m[0].length);
                    const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
                    if (tops.size > 1) out.push(m[0]);
                }
            }
        }
        return out;
    });

const CASES = ["sales", "countries"].flatMap((data) => [390, 360].flatMap((width) => ["en", "de"].map((lang) => ({ data, width, lang }))));

for (const { data, width, lang } of CASES) {
    test(`${data}, ${width} px, ${lang}: the table's headers break between words only`, async ({ page, browserName }) => {
        test.skip(browserName === "firefox", "Firefox has no mobile emulation");
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`?data=${data}&lang=${lang}`);
        await expect(page.locator(".pk-table")).toBeVisible();
        await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", "narrow");
        expect(await brokenWords(page)).toEqual([]);
    });
}
