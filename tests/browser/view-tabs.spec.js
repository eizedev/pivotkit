// The tabs Table and Chart on top of the result with the settings of the view shown, the toolbar's
// More with Help first, and the section "Fields in the report" with its fold button and Swap (#580).
// Real pointer clicks and keys; both sizes the design was made for.
import { test as plain } from "@playwright/test";
import { expect, test, toolbar } from "./fixtures.js";

/** The test id of the element with the focus, through shadow roots. */
const focused = (page) =>
    page.evaluate(() => {
        const deep = (root) => (root.activeElement?.shadowRoot ? deep(root.activeElement.shadowRoot) : root.activeElement);
        return deep(document)?.getAttribute("data-testid") ?? deep(document)?.tagName ?? null;
    });

test("the tabs: a click shows the view, the settings button follows it; the arrow keys move the focus, Enter shows the tab", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const table = page.getByTestId("show-table");
    const chart = page.getByTestId("show-chart");
    await expect(page.getByRole("tablist", { name: "View" })).toBeVisible();
    await expect(table).toHaveAttribute("role", "tab");
    await expect(table).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("view-settings")).toHaveText(/Table settings/);
    // the result is the tab panel, named by the tab shown
    const panel = page.getByRole("tabpanel");
    await expect(panel).toHaveAccessibleName("Table");
    await chart.click();
    await expect(chart).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
    await expect(page.getByTestId("view-settings")).toHaveText(/Chart settings/);
    await expect(panel).toHaveAccessibleName("Chart");
    // one Tab stop: the tab shown; the right arrow moves the focus only (manual activation)
    await expect(chart).toHaveAttribute("tabindex", "0");
    await expect(table).toHaveAttribute("tabindex", "-1");
    await chart.focus();
    await page.keyboard.press("ArrowRight");
    await expect(table).toBeFocused();
    await expect(chart).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(table).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
    await expect(table).toBeFocused();
    // End, then Space; Tab leaves the tabs for the settings button
    await page.keyboard.press("End");
    await expect(chart).toBeFocused();
    await page.keyboard.press(" ");
    await expect(chart).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("view-settings");
    // the tab shown, clicked again, adds no step to undo
    await page.getByTestId("undo").click();
    await expect(table).toHaveAttribute("aria-selected", "true");
    await table.click();
    await page.getByTestId("undo").click();
    await expect(chart).toHaveAttribute("aria-selected", "true");
});

test("Table settings: the totals, then Expand all and Collapse all, which says what it keeps; Chart settings: the types, Layout folds in the fields' words", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Region and Country in Rows
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    await page.getByTestId("view-settings").click();
    const menu = page.locator(".pk-popover");
    await expect(menu.getByTestId("topic-totals")).toBeVisible();
    await expect(menu.getByTestId("collapse-all")).toContainText("Show Region only");
    // a switch applies and the menu stays open
    const subtotals = menu.getByTestId("total-rowSubtotals");
    await expect(subtotals).toHaveAttribute("aria-checked", "true");
    await subtotals.click();
    await expect(subtotals).toHaveAttribute("aria-checked", "false");
    await subtotals.click();
    const before = await page.locator('[data-testid="pivot-table"] tbody tr').count();
    await menu.getByTestId("collapse-all").click();
    await expect(page.locator(".pk-popover")).toHaveCount(0);
    await expect.poll(() => page.locator('[data-testid="pivot-table"] tbody tr').count()).toBeLessThan(before);
    // the chart: its settings hold the types, then Layout with the groups in words
    await page.getByTestId("show-chart").click();
    await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
    await page.getByTestId("view-settings").click();
    await expect(menu.getByTestId("chart-bar")).toBeVisible();
    await expect(menu.getByRole("group", { name: /^Chart type: / })).toBeVisible();
    await menu.getByTestId("topic-layout").click();
    await expect(menu.getByTestId("level-title")).toHaveText("Chart settings › Layout");
    const each = menu.getByTestId("chart-show-each");
    await expect(each).toHaveText(/Show each Country/);
    await expect(menu.getByTestId("chart-show-only")).toHaveText(/Show Region only/);
    // everything is collapsed already: Show Region only says why it does nothing
    await expect(menu.getByTestId("chart-show-only")).toHaveAttribute("aria-disabled", "true");
    await each.click();
    await expect(page.locator(".pk-popover")).toHaveCount(0);
    await page.getByTestId("view-settings").click();
    await menu.getByTestId("topic-layout").click();
    await expect(menu.getByTestId("chart-show-each")).toHaveAttribute("aria-disabled", "true");
    await expect(menu.getByTestId("chart-show-only")).not.toHaveAttribute("aria-disabled", "true");
    // Escape goes back a level, then closes; the focus goes back to the settings button
    await page.keyboard.press("Escape");
    await expect(menu.getByTestId("topic-layout")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pk-popover")).toHaveCount(0);
    await expect(page.getByTestId("view-settings")).toBeFocused();
});

test("one field in Rows: both fold choices are off with the reason, in the chart's plain words", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    await page.getByTestId("chip-menu-Country").click();
    await page.getByTestId("menu-remove").click();
    await toolbar(page, "chart-settings");
    const menu = page.locator(".pk-popover");
    await menu.getByTestId("topic-layout").click();
    for (const [id, text] of [["chart-show-each", "Show details"], ["chart-show-only", "Show group totals only"]]) {
        await expect(menu.getByTestId(id)).toContainText(text);
        await expect(menu.getByTestId(id)).toHaveAttribute("aria-disabled", "true");
        await expect(menu.getByTestId(`${id}-reason`)).toHaveText("Needs two or more fields in Rows.");
    }
});

for (const lang of ["en", "de"]) {
    test(`1440 px, ${lang}: every toolbar button in one line, More at the end with Help first`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`?data=sales&lang=${lang}`);
        await page.locator('[data-testid="pivot-table"]').waitFor();
        const bar = page.locator(".pk-toolbar");
        await expect(bar).toHaveAttribute("data-overflow", "0");
        for (const id of ["undo", "redo", "start-over", "views", "export", "more"]) {
            await expect(bar.getByTestId(id)).toBeVisible();
        }
        // More is the toolbar's last button
        expect(await bar.locator("button").last().getAttribute("data-testid")).toBe("more");
        await expect(bar.getByTestId("chart-type")).toHaveCount(0);
        await page.getByTestId("more").click();
        const help = page.getByTestId("more-help");
        await expect(help).toBeFocused();
        await expect(help).toHaveText(new RegExp(lang === "de" ? "Hilfe" : "Help"));
        // nothing moved into More: Help is all it holds
        await expect(page.locator(".pk-popover [data-pk-option]")).toHaveCount(1);
    });
}

test("Help: a level with the tips' switches and the keyboard shortcuts; keys in and out", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const more = page.getByTestId("more");
    await more.focus();
    // the menu button pattern: the down arrow opens it
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("more-help")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("level-title")).toHaveText("More › Help");
    const tips = page.getByTestId("show-tips");
    await expect(tips).toBeFocused();
    await expect(tips).toHaveAttribute("aria-checked", "true");
    // a switch keeps the level open and the focus on it
    await page.keyboard.press("Enter");
    await expect(tips).toHaveAttribute("aria-checked", "false");
    await expect(tips).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByTestId("shortcuts").click();
    await expect(page.getByTestId("level-title")).toHaveText("More › Help › Keyboard shortcuts");
    await expect(page.getByTestId("level-shortcuts").getByTestId("shortcuts")).toContainText("Undo");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shortcuts")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("more-help")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pk-popover")).toHaveCount(0);
    await expect(more).toBeFocused();
});

test("a narrow report: Start over and Views below Help in More; the settings, Enlarge, Full screen and Swap show their icon with their name", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    for (const [id, name] of [["view-settings", "Table settings"], ["enlarge", "Enlarge"], ["swap", "Swap rows and columns"]]) {
        await expect(page.getByTestId(id)).toHaveAccessibleName(name);
        await expect(page.getByTestId(id)).toHaveAttribute("title", name);
        // the icon only: no text takes room
        expect(await page.getByTestId(id).evaluate((el) => [...el.querySelectorAll(".pk-btn-text")].filter((t) => t.getBoundingClientRect().width > 1).length)).toBe(0);
    }
    await page.getByTestId("more").click();
    const items = await page.locator(".pk-popover [data-pk-option]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(items[0]).toBe("more-help");
    expect(items).toEqual(expect.arrayContaining(["more-reset", "more-new-report", "more-views"]));
    // Views from More opens its panel
    await page.getByTestId("more-views").click();
    await expect(page.locator(".pk-popover").getByTestId("save-as")).toBeVisible();
});

test("the section: the fold button names the section and says what is placed; Swap works folded; the keys go fold, Swap, the zones", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const fold = page.getByTestId("layout-summary");
    await expect(fold).toHaveAccessibleName("Fields in the report");
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await expect(fold).toHaveAccessibleDescription("Drag fields into Filters, Columns, Rows and Values.");
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".pk-zone")).toHaveCount(0);
    await expect(fold).toHaveAccessibleDescription("Rows: Region, Country · Columns: Category · Values: Sum of Revenue");
    expect(await fold.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
    // Swap is beside the fold button, not in it, and works folded
    expect(await fold.locator('[data-testid="swap"]').count()).toBe(0);
    const swap = page.getByTestId("swap");
    await swap.click();
    await expect(fold).toHaveAccessibleDescription("Rows: Category · Columns: Region, Country · Values: Sum of Revenue");
    await expect(swap).toBeFocused();
    // the keys: Enter opens it, the focus stays; Tab goes to Swap, then the first zone's "i"
    await fold.focus();
    await page.keyboard.press("Enter");
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await expect(fold).toBeFocused();
    await expect(page.locator(".pk-zone")).toHaveCount(4);
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("swap");
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("zone-info-filters");
    // the open zones sit indented in a tinted panel, below the heading's text
    const box = await page.locator(".pk-zones").evaluate((el) => {
        const zones = el.getBoundingClientRect();
        const heading = el.closest(".pk-zone-section").querySelector(".pk-section-heading").getBoundingClientRect();
        return { indent: Math.round(zones.left - heading.left), tint: getComputedStyle(el).backgroundColor };
    });
    expect(Math.abs(box.indent)).toBeLessThanOrEqual(1);
    expect(box.tint).not.toBe("rgba(0, 0, 0, 0)");
});

test("a narrow report: the folded summary may take two lines, Swap stays at the row's end", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const fold = page.getByTestId("layout-summary");
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    const lines = await page.getByTestId("zones-sub").evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || "20")));
    expect(lines).toBe(2);
    const [f, s] = await Promise.all([fold.boundingBox(), page.getByTestId("swap").boundingBox()]);
    expect(s.x).toBeGreaterThan(f.x + f.width - 1);
});

test("the host's zones start state: folded or open over the report's height; the user's click wins until the start state changes", async ({ page }) => {
    await page.goto("pages/element-two.html");
    const report = page.locator("#tickets");
    const fold = report.getByTestId("layout-summary");
    await fold.waitFor();
    await report.evaluate((el) => el.setAttribute("zones", "folded"));
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await report.evaluate((el) => el.setAttribute("zones", "open"));
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await report.evaluate((el) => el.setAttribute("zones", "folded"));
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    // the property is the attribute
    expect(await report.evaluate((el) => el.zones)).toBe("folded");
});

// its own fixture: the console warning is what this test expects
plain("a zones value the report does not know is ignored with one console warning", async ({ page }) => {
    const warnings = [];
    page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
    await page.goto("pages/element-two.html");
    await page.locator("#tickets").getByTestId("layout-summary").waitFor();
    await page.evaluate(() => document.getElementById("tickets").setAttribute("zones", "sideways"));
    await expect.poll(() => warnings.join("\n")).toContain('zones "sideways" is neither "open" nor "folded"');
    expect(warnings.length).toBe(1);
});
