// The names in the field list wrap between words only (#114): next to a fixed navigation (pages/nav.html)
// at desktop widths, a word too long for its line is cut with "…", never broken, and the whole name is
// its tooltip.
import { expect, test } from "./fixtures.js";

test.describe("field names in the field list (#114)", () => {
    for (const width of [1024, 1280, 1440]) {
        test(`at ${width} px next to the navigation: names wrap between words only; a word too long is cut with "…"`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto("pages/nav.html");
            // Environment is in Rows: its badge takes room from its name
            await expect(page.locator('.pk-field[data-field="Environment"].pk-placed')).toHaveCount(1);
            await expect(page.locator(".pk-field-title")).toHaveCount(10);
            const names = await page.locator(".pk-field-title").evaluateAll((els) =>
                els.map((el) => {
                    const button = el.closest(".pk-field-name").getBoundingClientRect();
                    const words = [];
                    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                        for (const m of node.data.matchAll(/\S+/g)) {
                            const range = document.createRange();
                            range.setStart(node, m.index);
                            range.setEnd(node, m.index + m[0].length);
                            const rects = [...range.getClientRects()].filter((r) => r.width > 0);
                            const holder = node.parentElement;
                            const style = getComputedStyle(holder);
                            const hr = holder.getBoundingClientRect();
                            words.push({
                                word: m[0],
                                // the lines it takes (a word cut with "…" may be two boxes on one line)
                                lines: new Set(rects.map((r) => Math.round(r.top))).size,
                                // what of the word shows: its box within the name, or cut with an ellipsis
                                inside: rects.every((r) => r.right <= button.right + 0.5),
                                cut: style.textOverflow === "ellipsis" && holder.scrollWidth > holder.clientWidth && hr.right <= button.right + 0.5
                            });
                        }
                    }
                    return { name: el.textContent, title: el.closest("[title]")?.getAttribute("title"), words };
                })
            );
            for (const { name, title, words } of names) {
                expect(title, name).toBe(name);
                for (const w of words) {
                    expect(w.lines, `"${w.word}" of "${name}" on one line`).toBe(1);
                    expect(w.inside || w.cut, `"${w.word}" of "${name}" shown whole or cut with an ellipsis`).toBe(true);
                }
            }
            // the names of the issue are whole words here
            expect(names.map((n) => n.name)).toEqual(expect.arrayContaining(["Environment", "Manufacturer", "Date Commissioned"]));
        });
    }
});

test.describe("a field name of up to 16 characters fits the field list on a desktop", () => {
    for (const width of [1280, 1440, 1920]) {
        test(`at ${width} px next to the navigation, with zone marks: no word of a name is cut`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto("pages/nav.html?view=placed");
            // in zones, so each shows its zone mark beside its name
            for (const f of ["Environment", "Manufacturer", "Responsibilities"]) {
                await expect(page.locator(`.pk-field[data-field="${f}"].pk-placed`)).toHaveCount(1);
            }
            const cut = await page.locator(".pk-field .pk-word").evaluateAll((els) => els.filter((w) => w.textContent.length <= 16 && w.scrollWidth > w.clientWidth).map((w) => w.textContent));
            expect(cut).toEqual([]);
        });
    }
});
