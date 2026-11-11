// The groups of the toolbar's menus as people see them: each group under a title in the weight of
// Export's titles, a rule between groups (none above the first), and what each group holds, in order.
// Options, Views, the chart type, More, a value's menu; the Views menu holds only what persists.
import { chipMenu, expect, test, toolbar } from "./fixtures.js";

/**
 * The groups of a menu as drawn: each group's title (null without one), whether a rule is drawn
 * above it, whether its title is bold, and the test ids of its own items, in order.
 * @param {import("@playwright/test").Locator} scope
 */
async function groupsOf(scope) {
    return scope.locator(".pk-section").evaluateAll((els) =>
        els.map((el) => {
            const title = el.querySelector(":scope > .pk-section-head .pk-section-title");
            const s = getComputedStyle(el);
            return {
                title: title ? title.textContent : null,
                rule: parseFloat(s.borderTopWidth) >= 1 && s.borderTopStyle !== "none" && s.borderTopColor !== "rgba(0, 0, 0, 0)",
                bold: title ? Number(getComputedStyle(title).fontWeight) >= 600 : null,
                items: [...el.querySelectorAll('[role^="menuitem"]')].filter((i) => i.closest(".pk-section") === el && i.getClientRects().length).map((i) => i.dataset.testid)
            };
        })
    );
}

/** A rule above every group but the first. */
const ruled = (groups) => groups.map((g) => g.rule);

test("Options: Totals, Rows and Help under bold titles, a rule between them", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto("?data=sales");
    await toolbar(page, "options");
    const menu = page.getByRole("menu", { name: "Options" });
    const groups = await groupsOf(menu);
    expect(groups.map((g) => g.title)).toEqual(["Totals", "Rows", "Help"]);
    expect(ruled(groups)).toEqual([false, true, true]);
    expect(groups.every((g) => g.bold)).toBe(true);
    // the groups keep their names for a screen reader
    await expect(menu.getByRole("group", { name: "Totals" })).toBeVisible();
    await expect(menu.getByRole("group", { name: "Help" })).toBeVisible();
});

test("Views: only what persists - This view, Shared views, My views, Share this view - each with a rule", async ({ page }) => {
    await page.goto("?data=tickets");
    await toolbar(page, "views");
    const menu = page.getByRole("menu", { name: "Views" });
    const groups = await groupsOf(menu);
    expect(groups.map((g) => g.title)).toEqual(["This view", "Shared views", "My views", "Share this view"]);
    expect(ruled(groups)).toEqual([false, true, true, true]);
    expect(groups.every((g) => g.bold)).toBe(true);
    expect(groups[0].items).toEqual(["save-as"]);
    // sharing is right there, its entries in the group; a view file is opened, not "loaded"
    expect(groups[3].items).toEqual(["copy-link", "copy-json", "download-view", "load-view"]);
    await expect(menu.getByTestId("load-view")).toHaveText("Open view file…");
    await expect(menu.getByRole("group", { name: "Share this view" }).getByTestId("share-privacy")).toHaveCount(0);
    await expect(menu.getByTestId("share-privacy")).toBeVisible();
    // New is no longer here: it is under Start over
    await expect(menu.getByTestId("new-report")).toHaveCount(0);
    await expect(menu).not.toContainText("New, empty report");
    // Open view file… opens its level; Back goes to its entry
    await menu.getByTestId("load-view").click();
    await expect(page.getByTestId("level-title")).toHaveText("Views › Open view file");
    await expect(page.getByTestId("load-view-text")).toBeFocused();
    await page.getByTestId("level-back").click();
    await expect(page.getByTestId("load-view")).toBeFocused();
});

test("Views in German: the same groups, Ansichtsdatei öffnen…", async ({ page }) => {
    await page.goto("?data=tickets&lang=de");
    await toolbar(page, "views");
    const menu = page.getByRole("menu", { name: "Ansichten" });
    const groups = await groupsOf(menu);
    expect(groups.map((g) => g.title)).toEqual(["Diese Ansicht", "Gemeinsame Ansichten", "Meine Ansichten", "Diese Ansicht teilen"]);
    expect(ruled(groups)).toEqual([false, true, true, true]);
    await expect(menu.getByTestId("load-view")).toHaveText("Ansichtsdatei öffnen…");
});

test("the chart type menu: a rule between Chart type and Display, and between Display's own groups", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1100 });
    await page.goto("?data=sales&preset=1");
    await toolbar(page, "chart-type");
    const menu = page.locator(".pk-chart-menu");
    const groups = await groupsOf(menu);
    expect(groups.map((g) => g.title)).toEqual(["Chart type", "Display"]);
    expect(ruled(groups)).toEqual([false, true]);
    // Display's groups (Value labels, Legend, Title, ...) each under its title, a rule between them
    const sub = await menu.locator(".pk-subsection").evaluateAll((els) =>
        els.map((el) => {
            const s = getComputedStyle(el);
            return { title: el.querySelector(".pk-subtitle")?.textContent.trim() ?? null, rule: parseFloat(s.borderTopWidth) >= 1 && s.borderTopStyle !== "none" };
        })
    );
    expect(sub.slice(0, 3).map((g) => g.title)).toEqual(["Value labels", "Legend", "Title"]);
    expect(sub.map((g) => g.rule)).toEqual(sub.map((_, i) => i > 0));
});

test("More: Start over's two actions, then Layout, Chart type and Options, then Views - rules, no titles", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales");
    await toolbar(page, "more");
    const menu = page.getByRole("menu", { name: "More" });
    const groups = await groupsOf(menu);
    expect(groups.map((g) => g.title)).toEqual([null, null, null]);
    expect(ruled(groups)).toEqual([false, true, true]);
    expect(groups.map((g) => g.items)).toEqual([["more-reset", "more-new-report"], ["more-layout", "more-chart-type", "more-options"], ["more-views"]]);
    // Start over's group keeps its name for a screen reader
    await expect(menu.getByRole("group", { name: "Start over" })).toBeVisible();
});

test("More with the Data button (allowImport): Data in a group of its own between the layout's and Views", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales&import");
    await toolbar(page, "more");
    const menu = page.getByRole("menu", { name: "More" });
    const groups = await groupsOf(menu);
    expect(ruled(groups)).toEqual([false, true, true, true]);
    expect(groups.map((g) => g.items)).toEqual([["more-reset", "more-new-report"], ["more-layout", "more-chart-type", "more-options"], ["more-data"], ["more-views"]]);
    // its entry opens the Data menu in More's place
    await page.getByTestId("more-data").click();
    await expect(page.getByRole("dialog", { name: "Data" }).getByTestId("data-menu")).toBeVisible();
});

test("a value's Summarize by: More statistics under its title, a rule above it", async ({ page }) => {
    await page.goto("?data=sales");
    await chipMenu(page, "Sum of Revenue", "summarize");
    const level = page.getByTestId("level-summarize");
    const groups = await groupsOf(level);
    expect(groups.map((g) => g.title)).toEqual([null, "More statistics"]);
    expect(ruled(groups)).toEqual([false, true]);
    expect(groups[1].bold).toBe(true);
    await expect(level.getByRole("group", { name: "More statistics" })).toBeVisible();
});
