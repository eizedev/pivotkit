// A menu cut by a low window says that it goes on: while more of a menu's list lies below its edge,
// the list is marked and its last line fades out; scrolled to its end, the mark goes. Chart
// settings in a window 700 px high is the case a person met: Value labels and Legend sat below the
// edge with nothing to say so.
import { expect, test } from "./fixtures.js";

test("a long menu in a low window marks that more follows below, and not once it is scrolled to its end", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto("?data=sales");
    await page.getByTestId("show-chart").click();
    await page.getByTestId("view-settings").click();
    const list = page.locator(".pk-level-first");
    await expect(list).toBeVisible();
    // the list scrolls: more than it shows
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);
    await expect(list).toHaveAttribute("data-pk-more", "");
    // its last line fades out
    expect(await list.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage)).toContain("gradient");
    await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(list).not.toHaveAttribute("data-pk-more");
    // back up: the mark is there again
    await list.evaluate((el) => el.scrollTo({ top: 0 }));
    await expect(list).toHaveAttribute("data-pk-more", "");
});

test("a menu that shows all of its list has no mark", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto("?data=sales");
    await page.getByTestId("show-chart").click();
    await page.getByTestId("view-settings").click();
    const list = page.locator(".pk-level-first");
    await expect(list).toBeVisible();
    expect(await list.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await expect(list).not.toHaveAttribute("data-pk-more");
});
