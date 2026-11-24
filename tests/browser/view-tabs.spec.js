// The tabs Table and Chart on top of the result with the settings of the view shown, the toolbar's
// More with Help first, and the section "Fields in the report" with its fold button and Swap (#580).
// Real pointer clicks and keys; both sizes the design was made for.
import { test as plain } from "@playwright/test";
import { encodeViewLink } from "pivotkit-core/link";
import { expect, test, toolbar, twoFrames, watchConsole } from "./fixtures.js";

/** The test id of the element with the focus, through shadow roots. */
const focused = (page) =>
    page.evaluate(() => {
        const deep = (root) => (root.activeElement?.shadowRoot ? deep(root.activeElement.shadowRoot) : root.activeElement);
        return deep(document)?.getAttribute("data-testid") ?? deep(document)?.tagName ?? null;
    });

test("the tabs: a click shows the view, the settings button follows it; the arrow keys move the focus over Table, Chart and Both, Enter shows the tab", async ({ page, browserName }) => {
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
    // on a wide report the tabs are Table, Chart and Both (#51); the arrows wrap around
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("show-both")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(table).toBeFocused();
    await expect(chart).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(table).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
    await expect(table).toBeFocused();
    // End, then Space; Tab leaves the tabs for the settings button
    await page.keyboard.press("End");
    await expect(page.getByTestId("show-both")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(chart).toBeFocused();
    await page.keyboard.press(" ");
    await expect(chart).toHaveAttribute("aria-selected", "true");
    // Safari's Tab skips buttons unless the user turns that on
    if (browserName !== "webkit") {
        await page.keyboard.press("Tab");
        expect(await focused(page)).toBe("view-settings");
    }
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

test("a narrow report: Start over and Views below Help in More; Settings, Enlarge, Full screen and Swap show their icon with their name", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    // the icon only, the whole name for a screen reader and as a tooltip (#580 review); where the
    // buttons stand beside the tabs or above them: the tests of #706 below
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

/**
 * What is wrong with the row beside the tabs: a tab or button outside the row, its text cut, two that
 * overlap, or the tab shown off the row's rule. Empty when every one is whole and in its place (#706).
 */
const rowFaults = (page) =>
    page.getByTestId("view-tabs-row").evaluate((row) => {
        const edge = row.getBoundingClientRect();
        const items = [...row.querySelectorAll('[role="tab"], button[data-testid]')].map((el) => ({ id: el.getAttribute("data-testid"), el, box: el.getBoundingClientRect() }));
        const faults = [];
        for (const { id, el, box } of items) {
            // a pixel more: the tab shown's mark reaches over its border
            if (box.left < edge.left - 0.5 || box.right > edge.right + 0.5) {
                faults.push(`${id} outside the row`);
            }
            const text = el.querySelector("span");
            if (el.scrollWidth > el.clientWidth + 1 || (text && text.scrollWidth > text.clientWidth + 1)) {
                faults.push(`${id} cut`);
            }
        }
        items.forEach((a, i) => {
            for (const b of items.slice(i + 1)) {
                const across = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
                const down = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
                if (across > 0.5 && down > 0.5) {
                    faults.push(`${a.id} overlaps ${b.id}`);
                }
            }
        });
        const shown = row.querySelector('[role="tab"][aria-selected="true"]').getBoundingClientRect();
        if (Math.abs(shown.bottom - edge.bottom) > 2) {
            faults.push("the tab shown is off the rule");
        }
        return faults;
    });

/** Opens the sales report in `lang` at `width` and waits until the row beside the tabs has settled. */
const openRow = async (page, lang, width) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`?data=sales&lang=${lang}`);
    await page.locator('[data-testid="pivot-table"]').waitFor();
    // the toolbar and the row lay out over a few frames
    await twoFrames(page);
};

// Reports too small for the tabs and every button on one line, even in the short form: a small phone
// in German, and a medium report whose field list takes room beside the result (#706)
const SMALL = [
    ["de", 320],
    ["de", 700]
];
for (const [lang, width] of SMALL) {
    test(`a report too small for one line (${lang}, ${width} px): every tab and button whole, in the row and apart; the tab shown on the rule; Tab goes tabs, then the buttons (#706)`, async ({ page, browserName }) => {
        await openRow(page, lang, width);
        expect(await rowFaults(page)).toEqual([]);
        // the buttons stand together on a line above the tabs, at the right
        const row = page.getByTestId("view-tabs-row");
        const [tab, edge, settings, last] = await Promise.all([page.getByTestId("show-table").boundingBox(), row.boundingBox(), page.getByTestId("view-settings").boundingBox(), page.getByTestId("full-screen").boundingBox()]);
        expect(settings.y + settings.height).toBeLessThanOrEqual(tab.y + 1);
        expect(Math.abs(last.x + last.width - (edge.x + edge.width))).toBeLessThanOrEqual(1);
        // the Tab order stays the one of a single line; Safari's Tab skips buttons unless the user turns that on
        if (browserName !== "webkit") {
            await page.getByTestId("show-table").focus();
            const order = [];
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press("Tab");
                order.push(await focused(page));
            }
            expect(order).toEqual(["view-settings", "enlarge", "full-screen"]);
        }
    });
}

// Wider reports whose field list leaves no room for the buttons' whole names, but enough for their
// short form: the row stays one line, the table keeps its height (#706)
for (const [lang, width, size] of [["de", 1000, "medium"], ["de", 1100, "wide"]]) {
    test(`a ${size} report without room for the whole names (${lang}, ${width} px): the buttons in their short form beside the tabs, their names kept (#706)`, async ({ page }) => {
        await openRow(page, lang, width);
        await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", size);
        expect(await rowFaults(page)).toEqual([]);
        const settings = page.getByTestId("view-settings");
        // the short form: the icon only, the whole name kept for a screen reader and as a tooltip
        await expect(settings).toHaveText("");
        await expect(settings).toHaveAccessibleName("Tabelleneinstellungen");
        await expect(settings).toHaveAttribute("title", "Tabelleneinstellungen");
        await expect(page.getByTestId("enlarge")).toHaveAttribute("title", "Vergrößern");
        const [tab, box] = await Promise.all([page.getByTestId("show-table").boundingBox(), settings.boundingBox()]);
        expect(box.y + box.height).toBeGreaterThan(tab.y + 1);
        expect(box.x).toBeGreaterThan(tab.x + tab.width);
        // another tab changes what the row holds: measured anew, still whole and short
        await page.getByTestId("show-chart").click();
        await expect(settings).toHaveAccessibleName("Diagrammeinstellungen");
        await expect(settings).toHaveText("");
        await twoFrames(page);
        expect(await rowFaults(page)).toEqual([]);
        await page.getByTestId("show-table").click();
        // the field list folded gives the room back: the whole names again
        await page.getByTestId("collapse-fields").click();
        await expect(settings).toHaveText(/Tabelleneinstellungen/);
        expect(await rowFaults(page)).toEqual([]);
    });
}

test("the tab Both on a wide report with the field list: both settings buttons whole, in the row and apart (#706)", async ({ page }) => {
    await openRow(page, "de", 1100);
    await page.getByTestId("show-both").click();
    await expect(page.getByTestId("chart-settings")).toBeVisible();
    await twoFrames(page);
    expect(await rowFaults(page)).toEqual([]);
});

test.describe("a touch screen, where every button takes 44 px", () => {
    test.use({ hasTouch: true });
    for (const [lang, width] of [["en", 390], ["de", 390], ["en", 360], ["de", 360]]) {
        test(`${width} px, ${lang}: every tab and button whole, in the row and apart (#706)`, async ({ page }) => {
            await openRow(page, lang, width);
            expect(await rowFaults(page)).toEqual([]);
        });
    }
    // an iPhone in German, the language with the longest tab names: still one line
    test("390 px, de: the tabs and the buttons share one line", async ({ page }) => {
        await openRow(page, "de", 390);
        const [tab, settings] = await Promise.all([page.getByTestId("show-table").boundingBox(), page.getByTestId("view-settings").boundingBox()]);
        expect(settings.y + settings.height).toBeGreaterThan(tab.y + 1);
    });
});

// with room, narrow or wide, the buttons stay beside the tabs: a narrow report in English, a wide one in German
// phones in both languages too: the short form fits beside the tabs
for (const [lang, width, size] of [["en", 320, "narrow"], ["de", 360, "narrow"], ["de", 390, "narrow"], ["en", 600, "narrow"], ["de", 1440, "wide"]]) {
    test(`a ${size} report with room (${lang}, ${width} px): the tabs and the buttons share one line, the buttons at the right, at its foot (#706)`, async ({ page }) => {
        await openRow(page, lang, width);
        await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", size);
        expect(await rowFaults(page)).toEqual([]);
        const row = page.getByTestId("view-tabs-row");
        const [tab, edge, settings, last] = await Promise.all([page.getByTestId("show-table").boundingBox(), row.boundingBox(), page.getByTestId("view-settings").boundingBox(), page.getByTestId("full-screen").boundingBox()]);
        // one line: Settings beside the tabs, not above them
        expect(settings.y + settings.height).toBeGreaterThan(tab.y + 1);
        expect(settings.x).toBeGreaterThan(tab.x + tab.width);
        expect(Math.abs(last.x + last.width - (edge.x + edge.width))).toBeLessThanOrEqual(1);
        // at the foot of the line: the buttons' margin (5 px) and the rule (1 px) below them
        expect(edge.y + edge.height - (settings.y + settings.height)).toBeLessThanOrEqual(6.5);
    });
}

test("the section: one row; the fold button names the section and, folded, says what is placed; its i holds the hint; Swap works folded; the keys go fold, i, Swap, the zones", async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const fold = page.getByTestId("layout-summary");
    const sub = page.getByTestId("zones-sub");
    await expect(fold).toHaveAccessibleName("Fields in the report");
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    // open: no summary and no hint line
    await expect(sub).toHaveCount(0);
    await expect(page.locator(".pk-zone-section").getByText("Drag fields into Filters, Columns, Rows and Values, or use Add in each one.")).toBeHidden();
    // the hint is in the section's "i", the zones' own button
    const info = page.getByTestId("zones-info");
    await expect(info).toHaveAccessibleName("About Fields in the report");
    await info.hover();
    await expect(page.locator(".pk-info-pop")).toContainText("Drag fields into Filters, Columns, Rows and Values, or use Add in each one.");
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".pk-zone")).toHaveCount(0);
    const summary = "Rows: Region, Country · Columns: Category · Values: Sum of Revenue";
    await expect(fold).toHaveAccessibleDescription(summary);
    await expect(fold).toHaveAttribute("title", summary);
    await expect(sub).toHaveText(summary);
    expect(await fold.evaluate((el) => getComputedStyle(el).cursor)).toBe("pointer");
    // one row: chevron, heading, i, the summary and Swap share a line
    const row = await page.locator(".pk-section-row").evaluate((el) => {
        const mid = (q) => { const r = el.querySelector(q).getBoundingClientRect(); return Math.round(r.top + r.height / 2); };
        return [mid(".pk-section-heading"), mid('[data-testid="zones-info"]'), mid('[data-testid="zones-sub"]'), mid('[data-testid="swap"]')];
    });
    expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(2);
    // a click on the summary folds and opens too
    await sub.click();
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await fold.click();
    // Swap and the i are beside the fold button, not in it; Swap works folded
    expect(await fold.locator('[data-testid="swap"], [data-testid="zones-info"]').count()).toBe(0);
    // by keyboard (WebKit does not focus a button on a click): the focus stays on Swap
    const swap = page.getByTestId("swap");
    await swap.focus();
    await page.keyboard.press("Enter");
    await expect(fold).toHaveAccessibleDescription("Rows: Category · Columns: Region, Country · Values: Sum of Revenue");
    await expect(swap).toBeFocused();
    // the keys: Enter opens it, the focus stays; Tab goes to the i, Swap, then the first zone's "i"
    await fold.focus();
    await page.keyboard.press("Enter");
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    await expect(fold).toBeFocused();
    await expect(page.locator(".pk-zone")).toHaveCount(4);
    // Safari's Tab skips buttons unless the user turns that on
    if (browserName !== "webkit") {
        for (const id of ["zones-info", "swap", "zone-info-filters"]) {
            await page.keyboard.press("Tab");
            expect(await focused(page)).toBe(id);
        }
    }
    // the open zones sit indented in a tinted panel, below the heading's text
    const box = await page.locator(".pk-zones").evaluate((el) => {
        const zones = el.getBoundingClientRect();
        const heading = el.closest(".pk-zone-section").querySelector(".pk-section-heading").getBoundingClientRect();
        return { indent: Math.round(zones.left - heading.left), tint: getComputedStyle(el).backgroundColor };
    });
    expect(Math.abs(box.indent)).toBeLessThanOrEqual(1);
    expect(box.tint).not.toBe("rgba(0, 0, 0, 0)");
});

test("a narrow report: the same single row, the summary cut with “…”, Swap an icon at its end", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const fold = page.getByTestId("layout-summary");
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    const sub = await page.getByTestId("zones-sub").evaluate((el) => ({ lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)), cut: el.scrollWidth > el.clientWidth, overflow: getComputedStyle(el).textOverflow }));
    expect(sub).toEqual({ lines: 1, cut: true, overflow: "ellipsis" });
    // the whole summary stays the button's description and title
    await expect(fold).toHaveAttribute("title", "Rows: Region, Country · Columns: Category · Values: Sum of Revenue");
    const [f, s, row] = await Promise.all([fold.boundingBox(), page.getByTestId("swap").boundingBox(), page.locator(".pk-section-row").boundingBox()]);
    expect(s.x).toBeGreaterThan(f.x + f.width - 1);
    expect(s.x + s.width).toBeLessThanOrEqual(row.x + row.width + 0.5);
    // one row high
    expect(row.height).toBeLessThanOrEqual(36);
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
    // nothing else: no error, no other warning
    const problems = watchConsole(page, { ignore: [/zones "sideways" is neither "open" nor "folded"/] });
    await page.goto("pages/element-two.html");
    await page.locator("#tickets").getByTestId("layout-summary").waitFor();
    await page.evaluate(() => document.getElementById("tickets").setAttribute("zones", "sideways"));
    await expect.poll(() => warnings.join("\n")).toContain('zones "sideways" is neither "open" nor "folded"');
    expect(warnings.length).toBe(1);
    expect(problems).toEqual([]);
});

test("the open zones with their heading need room: a desktop report a little lower than they need starts folded, one a little higher open", async ({ page }) => {
    // many fields, so the open shelves need more than the low report's 600 px: their need decides
    const many = encodeViewLink({
        rows: ["Source system", "Operating system", "Location", "Type"],
        cols: ["Status"],
        values: [{ field: "Cost", agg: "sum" }, { field: "Disk GB", agg: "average" }, { field: "Cost", agg: "average" }]
    });
    const at = (height) => `?data=assets&lang=en&height=${height}#pivot-playground=${many}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    // what the open zones with their heading need: the report's height less the result's room above its least
    await page.goto(at(2000));
    await page.locator('[data-testid="pivot-table"]').waitFor();
    await expect(page.getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "true");
    const need = await page.locator(".pk-root").evaluate((el) => {
        const result = el.querySelector(".pk-result");
        const least = parseFloat(getComputedStyle(result).getPropertyValue("--pk-result-least")) || 0;
        return Math.ceil(el.getBoundingClientRect().height - (result.getBoundingClientRect().height - least));
    });
    expect(need - 24).toBeGreaterThanOrEqual(600);
    for (const [height, expanded] of [[need - 24, "false"], [need + 24, "true"]]) {
        await page.goto(at(height));
        await page.locator('[data-testid="pivot-table"]').waitFor();
        await expect(page.getByTestId("layout-summary"), `${height} px`).toHaveAttribute("aria-expanded", expanded);
    }
});

// its own fixture: the console warning is what this test expects
plain("labels the report no longer shows are ignored, with one warning that names what replaces them", async ({ page }) => {
    const warnings = [];
    page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
    // nothing else: no error, no other warning
    const problems = watchConsole(page, { ignore: [/labels\.(layout|options) is no longer shown and is ignored/] });
    await page.goto("pages/element-two.html");
    const report = page.locator("#sales");
    await report.getByTestId("layout-summary").waitFor();
    await page.evaluate(() => {
        document.getElementById("sales").labels = { layout: "Felder", options: "Optionen" };
    });
    await expect.poll(() => warnings.join("\n")).toContain("labels.layout is no longer shown and is ignored; set labels.zonesTitle instead");
    await expect.poll(() => warnings.join("\n")).toContain("labels.options is no longer shown and is ignored; set labels.tableSettings instead");
    // the report shows its own texts
    await expect(report.getByTestId("layout-summary")).toHaveAccessibleName("Fields in the report");
    // the same labels again: no second warning
    await page.evaluate(() => {
        document.getElementById("sales").labels = { layout: "Felder", options: "Optionen" };
    });
    // no second warning, also a moment later
    await page.waitForTimeout(300);
    expect(warnings.filter((w) => w.includes("labels.layout"))).toHaveLength(1);
    expect(problems).toEqual([]);
});

test("Chart settings at 1440 x 900: Layout is reached by End and shows in the window, also when the menu scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Region and Country in Rows, as lines: Layout has a switch and the groups
    await page.goto("?data=sales&lang=en");
    await page.getByTestId("show-chart").click();
    await page.getByTestId("view-settings").click();
    await page.getByTestId("chart-line").click();
    await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
    const settings = page.getByTestId("view-settings");
    await settings.focus();
    await page.keyboard.press("Enter");
    const menu = page.locator(".pk-chart-menu");
    await expect(menu.getByTestId("topic-valueLabels")).toBeVisible();
    // the menu fits the window, or scrolls inside it
    const fits = await menu.evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight + 1);
    expect(fits).toBe(true);
    await menu.getByTestId("topic-valueLabels").focus();
    await page.keyboard.press("End");
    const layout = menu.getByTestId("topic-layout");
    await expect(layout).toBeFocused();
    // whole but for a fraction of a pixel at the edge of the menu's scrolling list
    await expect(layout).toBeInViewport({ ratio: 0.95 });
    // its row says how the groups show
    await expect(layout).toContainText("Each Country");
    await page.keyboard.press("Enter");
    await expect(menu.getByTestId("chart-show-each")).toBeVisible();
});

test("forced colours (Windows high contrast): the tab shown has a frame, the other none; the fold button has one", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "forced colours are emulated in Chromium only");
    await page.emulateMedia({ forcedColors: "active" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const frame = (id) => page.getByTestId(id).evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: parseFloat(s.borderTopWidth), style: s.borderTopStyle, color: s.borderTopColor, canvas: s.backgroundColor };
    });
    const shown = await frame("show-table");
    expect([shown.width, shown.style]).toEqual([2, "solid"]);
    // the tab not shown: its border in the background's colour, so no frame shows
    const other = await frame("show-chart");
    expect(other.width).toBeLessThan(2);
    const fold = await frame("layout-summary");
    expect([fold.width, fold.style]).toEqual([1, "solid"]);
});
