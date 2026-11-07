// The findings of the UI and UX review before 0.1.0: the chart type the data suggests, one tip at a
// time, the toolbar by priority, the phone's More sheet and row labels, pies of many slices, the
// filter by field type, the field list as one stop for the keyboard, the help switches, the names of
// date groupings, the status notes in view, long field names and touch targets. Every test here fails
// without its change.
import { toViewFile } from "pivotkit-core";
import { encodeViewLink } from "pivotkit-core/link";
import { chips, expect, test } from "./fixtures.js";

/** The playground's address of a view (its link parameter). */
const withView = (query, view) => `?${query}#pivot-playground=${encodeViewLink(toViewFile(view, {}, { link: true }))}`;
const BY_MONTH = { name: "Month by month", field: "Month", by: "yearMonth" };

test.describe("the chart type the data suggests", () => {
    test("no type chosen: dates on Columns draw lines with the months along the axis; the table keeps its layout", async ({ page }) => {
        await page.goto(withView("data=sales", { rows: ["Region"], cols: ["Month by month"], derived: [BY_MONTH], values: [{ field: "Revenue", agg: "sum" }], display: "chart" }));
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await expect(page.getByTestId("chart-summary")).toContainText(/^Lines: Sum of Revenue by Month by month\./);
        await expect(page.getByTestId("chart-type")).toHaveText("Automatic");
        await expect(page.getByTestId("tips").locator('[data-tip^="chart"]')).toHaveCount(0);
        // the view is not changed: Region stays on Rows
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await page.getByTestId("show-table").click();
        await expect(page.locator(".pk-table thead")).toContainText("Jan 2025");
    });

    test("a type the user chose stays, with a one-click suggestion that draws lines over time", async ({ page }) => {
        await page.goto(withView("data=sales", { rows: ["Region"], cols: ["Month by month"], derived: [BY_MONTH], values: [{ field: "Revenue", agg: "sum" }], display: "chart", chart: { type: "bar" } }));
        await expect(page.getByTestId("chart-summary")).toContainText(/^Bars: /);
        const tip = page.getByTestId("tip-chartOverTime");
        await expect(tip).toContainText("Month by month is a date: lines show how the values change over time.");
        await tip.getByRole("button", { name: "Show as lines over time" }).click();
        await expect(page.getByTestId("chart-summary")).toContainText(/^Lines: Sum of Revenue by Month by month\./);
        await expect(page.getByTestId("chart-type")).toHaveAccessibleName("Chart type: Automatic");
        await expect(page.getByTestId("tip-chartOverTime")).toHaveCount(0);
        // one step Undo takes back
        await page.getByTestId("undo").click();
        await expect(page.getByTestId("chart-summary")).toContainText(/^Bars: /);
    });
});

test("a pie of many slices suggests bars; a pie with columns says it adds them up", async ({ page }) => {
    const top = (count) => ({ rows: ["Country"], values: [{ field: "Population", agg: "sum" }], filters: [{ field: "Country", type: "top", count, by: { field: "Population", agg: "sum" } }], display: "chart", chart: { type: "donut" } });
    await page.goto(withView("data=countries", top(12)));
    const tip = page.getByTestId("tip-pieSlices");
    await expect(tip).toContainText("A pie works for up to about 7 parts; this one has 12.");
    await tip.getByRole("button", { name: "Switch to Bars" }).click();
    await expect(page.getByTestId("chart-summary")).toContainText(/^Bars: /);
    await page.goto(withView("data=sales", { rows: ["Region"], cols: ["Channel"], values: [{ field: "Revenue", agg: "sum" }], display: "chart", chart: { type: "pie" } }));
    await expect(page.getByTestId("tip-pieColumns")).toContainText("adds up the columns (Channel)");
});

test("the toolbar shows the same buttons at the same width in English and German, Undo next to Redo", async ({ page }) => {
    for (const width of [1100, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        const shown = {};
        for (const lang of ["en", "de"]) {
            await page.goto(`?data=sales&lang=${lang}`);
            await expect(page.getByTestId("undo")).toBeVisible();
            shown[lang] = await page.locator(".pk-toolbar [data-testid]").evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.getAttribute("data-testid")));
            const [undo, redo] = await Promise.all(["undo", "redo"].map((id) => page.getByTestId(id).boundingBox()));
            expect(Math.abs(undo.y - redo.y), `${lang} ${width}: Undo and Redo in one line`).toBeLessThan(2);
        }
        expect(shown.de, `at ${width} px`).toEqual(shown.en);
    }
});

test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("More is a sheet at the bottom of the window: every entry is reachable", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("more").click();
        const sheet = page.locator(".pk-popover.pk-sheet");
        await expect(sheet).toBeVisible();
        // after its slide-in: its bottom is the window's
        await expect.poll(async () => { const box = await sheet.boundingBox(); return Math.round(box.y + box.height); }).toBeLessThanOrEqual(845);
        const views = page.getByTestId("more-views");
        await views.scrollIntoViewIfNeeded();
        const v = await views.boundingBox();
        expect(v.y + v.height).toBeLessThanOrEqual(844 + 1);
        await views.click();
        await expect(page.getByTestId("copy-json")).toBeVisible();
    });

    test("row labels break between words, never inside one, and a value stays in view", async ({ page }) => {
        await page.goto("?data=sales");
        const central = page.locator(".pk-table tbody th.pk-rowHeader .pk-th-text").filter({ hasText: /^Central$/ }).first();
        await expect(central).toBeVisible();
        // one line: the word is not cut in two
        expect((await central.boundingBox()).height).toBeLessThan(26);
        const visible = await page.evaluate(() => {
            const wrap = document.querySelector(".pk-table-wrap").getBoundingClientRect();
            return [...document.querySelectorAll(".pk-table tbody td")].filter((td) => td.textContent !== "" && td.getBoundingClientRect().right <= wrap.right + 0.5).length;
        });
        expect(visible).toBeGreaterThan(0);
    });
});

test("the filter of a date has no text condition; text has one, a number one on its label", async ({ page }) => {
    await page.goto("?data=sales");
    for (const [field, legend] of [["Month", null], ["Channel", "Text condition"], ["Units", "Condition on the label"]]) {
        await page.getByTestId(`field-menu-${field}`).click();
        await page.getByTestId(`field-filter-${field}`).click();
        await expect(page.getByTestId("filter-search")).toBeVisible();
        if (legend) {
            await expect(page.locator(".pk-condition legend")).toHaveText(legend);
        } else {
            await expect(page.locator(".pk-condition")).toHaveCount(0);
        }
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-filter")).toHaveCount(0);
    }
});

test.describe("the field list for the keyboard", () => {
    test("one stop of the Tab order; arrow keys between fields and their controls, Shift+F10 opens the menu", async ({ page, browserName }) => {
        test.skip(browserName === "webkit", "Safari's Tab skips buttons unless the user turns that on");
        await page.goto("?data=sales");
        await page.getByTestId("field-search").focus();
        await page.keyboard.press("Tab");
        const name = (field) => page.locator(`.pk-field[data-field="${field}"] .pk-field-name`);
        await expect(name("Region")).toBeFocused();
        // the next Tab leaves the list: one stop for all fields
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".pk-field-list")))).toBe(false);
        await page.keyboard.press("Shift+Tab");
        await expect(name("Region")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await expect(name("Product")).toBeFocused();
        await page.keyboard.press("End");
        await expect(name("Discount")).toBeFocused();
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await expect(page.getByTestId("field-menu-Region")).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        await expect(page.locator('.pk-field[data-field="Region"] .pk-handle')).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Shift+F10");
        await expect(page.getByRole("menu", { name: "Options for Region" })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Add to Rows" })).toBeVisible();
        await page.keyboard.press("Escape");
        // Tab back into the list returns to the field last in focus
        await page.getByTestId("field-search").focus();
        await page.keyboard.press("Tab");
        await expect(page.getByTestId("field-menu-Region")).toBeFocused();
        // Enter on a name adds the field to its zone
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Enter");
        await expect.poll(() => chips(page, "rows")).toContain("Country");
    });

    test("a link before the field list skips to the toolbar", async ({ page, browserName }) => {
        test.skip(browserName === "webkit", "Safari's Tab skips buttons unless the user turns that on");
        await page.goto("?data=sales");
        await page.locator(".pk-root").focus();
        await page.keyboard.press("Tab");
        const skip = page.getByTestId("skip-to-toolbar");
        await expect(skip).toBeFocused();
        await expect(skip).toBeInViewport();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("show-table")).toBeFocused();
    });
});

test("a date grouping is named in words: Month by month, Month nach Monat", async ({ page }) => {
    for (const [lang, name] of [["en", "Month by month"], ["de", "Month nach Monat"]]) {
        await page.goto(`?data=sales&empty&lang=${lang}`);
        await page.getByTestId("field-menu-Month").click();
        await page.locator(".pk-popover [data-pk-option]").nth(1).click();
        await expect.poll(() => chips(page, "cols")).toEqual([name]);
    }
});

test("after a save the Views menu stays open with Copy link one click away, and the save tip goes", async ({ page }) => {
    await page.goto("?data=tickets");
    // five changes make the tip to save; the tips before it in the queue are dismissed
    for (let i = 0; i < 5; i++) await page.getByTestId("swap").click();
    for (let i = 0; i < 6 && !(await page.getByTestId("tip-saveTemplate").count()); i++) {
        await page.getByTestId("tips").locator(".pk-tip-x").first().click();
    }
    await expect(page.getByTestId("tip-saveTemplate")).toBeVisible();
    await page.getByTestId("tip-action-saveTemplate").click();
    await page.getByTestId("saved-view-name").fill("Mine");
    await page.getByTestId("saved-view-name").press("Enter");
    await expect(page.getByTestId("saved-view-Mine")).toBeVisible();
    await expect(page.getByTestId("copy-link")).toBeVisible();
    await expect(page.getByTestId("saved-view-name")).toBeFocused();
    await expect(page.getByTestId("saved-view-name")).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tip-saveTemplate")).toHaveCount(0);
});

test("a status note shows at the bottom of the window when the report reaches past it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("?data=sales&height=1400");
    await page.getByTestId("swap").click();
    await page.getByTestId("undo").click();
    const note = page.locator(".pk-toast").first();
    await expect(note).toContainText("Undone");
    await expect(note).toBeInViewport({ ratio: 1 });
    // the report's own end is far below
    expect((await page.locator(".pk-status").boundingBox()).y).toBeGreaterThan(600);
});

test("a long field name takes two lines and has the whole name as its title", async ({ page }) => {
    await page.goto("?data=endoflife");
    const label = page.locator('.pk-field[data-field="Active support until"] .pk-field-title');
    await expect(label).toHaveAttribute("title", "Active support until");
    const fits = await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1);
    expect(fits).toBe(true);
});

test.describe("touch", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 820, height: 1180 } });

    test("on a touch screen the small controls are at least 44 px", async ({ page, browserName }) => {
        test.skip(browserName === "firefox", "Firefox has no mobile emulation");
        await page.goto("?data=countries");
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
        await expect(page.locator(".pk-chip-x").first()).toBeVisible();
        const small = () => page.locator(".pk-root :is(.pk-chip-x, .pk-info, .pk-field-menu, .pk-handle, .pk-tip-x)").evaluateAll((els) =>
            els.filter((e) => e.getClientRects().length).map((e) => [e.className, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]).filter(([, w, h]) => w < 44 || h < 44)
        );
        await expect.poll(small).toEqual([]);
    });
});
