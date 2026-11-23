// The playground's "How do I…?" help (examples/playground/src/help.jsx, its content in
// help-topics.js): it opens only from its button, every question rings a place that exists in the
// live report at desktop and phone width, "Show me" hands the step to the visitor, and Escape or the
// close button give the focus back to the button. tests/playground-help.test.js checks the docs links.
import { expect, test, twoFrames } from "./fixtures.js";
import { HELP_TOPICS } from "../../examples/playground/src/help-topics.js";

const PHONE = { width: 390, height: 844 };

/** The playground as the docs site embeds it, with its data loaded and its toolbar settled. */
async function open(page, query = "") {
    await page.goto(`?data=weather${query}`);
    await expect(page.getByTestId("pivot-table")).toBeVisible();
    await expect(page.getByTestId("skeleton")).toHaveCount(0);
    await twoFrames(page);
}

/** The box of the first visible element the selectors find, in their order (help.jsx's rule). */
function firstVisibleBox(page, selectors) {
    return page.evaluate((list) => {
        for (const selector of list) {
            for (const el of document.querySelectorAll(selector)) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return { selector, top: r.top, left: r.left, width: r.width, height: r.height };
            }
        }
        return null;
    }, selectors);
}

const dialog = (page) => page.getByTestId("pg-help-dialog");

test("the help never opens by itself", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("pg-help")).toHaveText("How do I…?");
    await expect(dialog(page)).not.toBeVisible();
});

test("the button opens the questions with the focus on the first one", async ({ page }) => {
    await open(page);
    await page.getByTestId("pg-help").click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAccessibleName("How do I…?");
    await expect(page.getByTestId(`pg-help-${HELP_TOPICS[0].id}`)).toBeFocused();
    await expect(dialog(page).getByRole("listitem")).toHaveCount(HELP_TOPICS.length);
});

for (const [size, viewport] of [["desktop", null], ["phone", PHONE]]) {
    test.describe(`each question rings its place (${size})`, () => {
        if (viewport) test.use({ viewport });
        for (const topic of HELP_TOPICS) {
            test(topic.question.en, async ({ page }) => {
                await open(page);
                await page.getByTestId("pg-help").click();
                await page.getByTestId(`pg-help-${topic.id}`).click();
                await expect(dialog(page).getByRole("heading", { name: topic.question.en })).toBeFocused();
                await expect(page.getByTestId("pg-help-text")).toHaveText(topic.text.en);
                const box = await firstVisibleBox(page, topic.targets);
                expect(box, `a visible place for ${topic.targets.join(" or ")}`).not.toBeNull();
                // on a desktop the place itself shows, not a fallback for a narrow report: a primary
                // selector that no longer finds anything fails here, even while a fallback would
                if (!viewport) expect(box.selector).toBe(topic.targets[0]);
                await expect(page.getByTestId("pg-help-note")).toHaveCount(box.selector === topic.targets[0] ? 0 : 1);
                // the card is above the ring's shade: the point in its middle is the card's own
                const card_ = await page.getByTestId("pg-help-card").boundingBox();
                expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="pg-help-card"]')), { x: card_.x + card_.width / 2, y: card_.y + 8 })).toBe(true);
                // the ring sits around that place (4 px outside it)
                const ring = await page.getByTestId("pg-help-ring").boundingBox();
                expect(Math.abs(ring.x + 4 - box.left)).toBeLessThan(2);
                expect(Math.abs(ring.y + 4 - box.top)).toBeLessThan(2);
                expect(Math.abs(ring.width - 8 - box.width)).toBeLessThan(2);
                const [page_, anchor] = topic.docs.split("#");
                await expect(page.getByTestId("pg-help-docs")).toHaveAttribute("href", new RegExp(`/${page_.replace(/\.md$/, "/")}#${anchor}$`));
                await expect(page.getByTestId("pg-help-docs")).toHaveAttribute("target", "_blank");
                // the card stays in the window, and the page does not scroll sideways
                const card = await page.getByTestId("pg-help-card").boundingBox();
                const width = page.viewportSize().width;
                expect(card.x).toBeGreaterThanOrEqual(0);
                expect(card.x + card.width).toBeLessThanOrEqual(width);
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            });
        }
    });
}

test("Escape and the close button give the focus back to the button", async ({ page }) => {
    await open(page);
    await page.getByTestId("pg-help").click();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toBeVisible();
    await expect(page.getByTestId("pg-help")).toBeFocused();

    await page.getByTestId("pg-help").click();
    await page.getByTestId("pg-help-chart").click();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).not.toBeVisible();
    await expect(page.getByTestId("pg-help")).toBeFocused();

    await page.getByTestId("pg-help").click();
    await page.getByTestId("pg-help-filter").click();
    await page.getByTestId("pg-help-close").click();
    await expect(dialog(page)).not.toBeVisible();
    await expect(page.getByTestId("pg-help")).toBeFocused();
});

test("the focus stays in the dialog", async ({ page }) => {
    await open(page);
    await page.getByTestId("pg-help").click();
    await page.getByTestId("pg-help-export").click();
    for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog[open]")))).toBe(true);
    }
});

test("Show me hands the step to the visitor, Escape ends it", async ({ page }) => {
    await open(page);
    await page.getByTestId("pg-help").click();
    await page.getByTestId("pg-help-chart").click();
    await page.getByTestId("pg-help-show").click();
    await expect(dialog(page)).not.toBeVisible();
    await expect(page.getByTestId("show-chart")).toBeFocused();
    await expect(page.getByTestId("pg-help-ring")).toBeVisible();
    // the visitor's own step: Enter on the focused tab shows the chart and the ring goes
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("pivot-chart")).toBeVisible();
    await expect(page.getByTestId("pg-help-ring")).toHaveCount(0);

    await page.getByTestId("pg-help").click();
    await page.getByTestId("pg-help-export").click();
    await page.getByTestId("pg-help-show").click();
    await expect(page.getByTestId("export")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pg-help-ring")).toHaveCount(0);
    await expect(page.getByTestId("pg-help")).toBeFocused();
});

test("the help speaks the playground's language", async ({ page }) => {
    await open(page);
    await page.getByTestId("pg-lang").selectOption("de");
    await expect(page.getByTestId("pg-help")).toHaveText("Wie geht …?");
    await page.getByTestId("pg-help").click();
    await page.getByTestId("pg-help-filter").click();
    await expect(dialog(page).getByRole("heading", { name: "Wie filtere ich?" })).toBeVisible();
    await expect(page.getByTestId("pg-help-text")).toHaveText(HELP_TOPICS.find((t) => t.id === "filter").text.de);
});

test("a feature the page switched off rings nothing and says so", async ({ page }) => {
    await open(page, "&import=off");
    await page.getByTestId("pg-help").click();
    await page.getByTestId("pg-help-load-data").click();
    await expect(page.getByTestId("pg-help-ring")).toHaveCount(0);
    await expect(page.getByTestId("pg-help-show")).toHaveCount(0);
    await expect(page.getByTestId("pg-help-note")).toHaveText("This page has switched it off.");
    await expect(page.getByTestId("pg-help-docs")).toBeVisible();
});
