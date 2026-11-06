import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { chips, drag, expect, tableRows, test, toolbar } from "./fixtures.js";

test.describe("building a report", () => {
    test("the empty state explains the first steps; fields are added by drag and by menu", async ({ page }) => {
        await page.goto("?empty");
        await expect(page.getByTestId("empty-state")).toBeVisible();
        await expect(page.locator(".pk-steps li")).toHaveCount(3);

        await drag(page, page.locator('.pk-field[data-field="Team"]'), page.locator('[data-zone="rows"]'));
        await expect.poll(() => chips(page, "rows")).toEqual(["Team"]);

        await page.getByTestId("field-menu-Priority").click();
        await page.getByRole("menuitem", { name: "Add to Columns" }).click();
        await expect.poll(() => chips(page, "cols")).toEqual(["Priority"]);

        // a click on a number field adds it to Values, with the host's defaults (fieldDefaults: average)
        await page.locator('.pk-field[data-field="Lead hours"] .pk-field-name').click();
        await expect.poll(() => chips(page, "values")).toEqual(["Average of Lead hours"]);
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        // the chip is the feedback of an add: no note
        await expect(page.locator(".pk-toast")).toHaveCount(0);
    });

    test("chips reorder by drag and by keyboard, and leave by x, by drag to the field list and by menu", async ({ page }) => {
        await page.goto("?data=sales");
        expect(await chips(page, "rows")).toEqual(["Region", "Country"]);

        await drag(page, page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"]'), page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"]'), { toPosition: { x: 8, y: 12 } });
        await expect.poll(() => chips(page, "rows")).toEqual(["Country", "Region"]);

        // keyboard: pick up with space, move with an arrow key, drop with space
        const handle = page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"] .pk-handle');
        await handle.focus();
        await page.keyboard.press("Space");
        await expect(handle).toHaveAttribute("aria-pressed", "true");
        // picked up: over its own place
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Country is over Rows, position 1 of 2.");
        // dnd-kit listens for the arrow keys from the next task on
        await page.waitForTimeout(100);
        await page.keyboard.press("ArrowRight");
        // the move is measured on an animation frame; drop once the live region announces the target
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Country is over Rows, position 2 of 2.");
        await page.keyboard.press("Space");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);

        await drag(page, page.locator('[data-zone="cols"] .pk-chip[data-chip="Category"]'), page.locator(".pk-panel"));
        await expect.poll(() => chips(page, "cols")).toEqual([]);
        await expect(page.locator(".pk-toasts")).toContainText("Category removed");

        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        // the toast offers Undo
        await page.locator(".pk-toast", { hasText: "Country removed" }).locator(".pk-toast-action").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);

        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("move-cols").click();
        await expect.poll(() => chips(page, "cols")).toEqual(["Region"]);
    });

    test("a column header of the table drags into a zone", async ({ page }) => {
        await page.goto("?data=sales");
        const header = page.locator('[data-testid="pivot-table"] thead th[data-kind="corner"]', { hasText: "Category" });
        await drag(page, header, page.locator('[data-zone="filters"]'));
        await expect.poll(() => chips(page, "filters")).toEqual(["Category"]);
        await expect.poll(() => chips(page, "cols")).toEqual([]);
    });

    test("undo, redo and reset, with buttons and shortcuts", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await page.getByTestId("undo").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        await expect(page.locator(".pk-toasts")).toContainText("Undone: Country removed");
        await toolbar(page, "redo");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await page.locator(".pk-status").click();
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await toolbar(page, "reset");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        await expect(page.getByTestId("undo")).toBeEnabled();
    });

    test("value menu: common aggregators first, statistics folded, show as renames the value, a colour scale", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        const menu = page.locator(".pk-chip-menu");
        for (const agg of ["sum", "count", "average", "min", "max"]) await expect(menu.getByTestId(`agg-${agg}`)).toBeVisible();
        await expect(menu.getByTestId("agg-stdev")).toBeHidden();
        await menu.getByText("More statistics").click();
        await expect(menu.getByTestId("agg-stdev")).toHaveText("Standard deviation (sample)");
        // Remove stays reachable at the foot however long the menu is
        await expect(menu.getByTestId("menu-remove")).toBeInViewport();
        await menu.getByTestId("showas-percentOfGrandTotal").click();
        await expect.poll(() => chips(page, "values")).toEqual(["% of grand total of Revenue"]);
        await expect(page.locator('[data-testid="pivot-table"] thead')).toContainText("% of grand total of Revenue");
        expect((await tableRows(page)).at(-1).at(-1)).toBe("100.0%");
        await page.getByTestId("chip-menu-% of grand total of Revenue").click();
        await page.getByTestId("cond-colorScale").click();
        await expect(page.locator(".pk-td.pk-has-scale").first()).toBeVisible();
    });

    test("a date is grouped by its span when it is placed; the chip keeps the date icon; months read Jan 2025", async ({ page }) => {
        await page.goto("?empty");
        await page.getByTestId("field-menu-Created").click();
        await page.getByRole("menuitem", { name: "Add to Rows" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Created (Month)"]);
        await expect(page.locator('[data-zone="rows"] .pk-chip .pk-type')).toHaveClass(/pk-type-date/);
        const labels = (await tableRows(page)).map((r) => r[0]);
        expect(labels[0]).toMatch(/^[A-Z][a-z]{2} 20\d\d$/);
        await page.getByTestId("chip-menu-Created (Month)").click();
        await page.getByTestId("group-year").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Created (Year)"]);
        expect((await tableRows(page)).map((r) => r[0])).toEqual(["2025", "2026", "Grand Total"]);
        await page.getByTestId("chip-menu-Created (Year)").click();
        await page.getByTestId("group-none").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Created"]);
    });
});

test.describe("filter, table and chart", () => {
    test("the filter popover lists values with counts and filters the report", async ({ page }) => {
        await page.goto("?data=sales");
        await expect(page.getByTestId("row-count")).toHaveText("4,000 rows");
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("open-filter").click();
        const west = page.locator(".pk-value", { hasText: "West" });
        const count = Number((await west.locator(".pk-count").textContent()).replace(/,/g, ""));
        expect(count).toBeGreaterThan(0);
        await west.locator("input").uncheck();
        await page.getByTestId("filter-apply").click();
        await expect(page.getByTestId("row-count")).toHaveText(`${(4000 - count).toLocaleString("en-US")} rows`);
        expect((await tableRows(page)).some((r) => r[0] === "West")).toBe(false);
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-chip-badge').first()).toBeVisible();
    });

    test("groups collapse and expand; totals switch off", async ({ page }) => {
        await page.goto("?data=sales");
        const before = (await tableRows(page)).length;
        await page.getByRole("button", { name: "Collapse Central" }).click();
        await expect.poll(async () => (await tableRows(page)).length).toBe(before - 3);
        await page.getByRole("button", { name: "Expand Central" }).click();
        await expect.poll(async () => (await tableRows(page)).length).toBe(before);
        await toolbar(page, "options");
        await page.getByText("Row subtotals").click();
        await expect.poll(async () => (await tableRows(page)).some((r) => r[0].endsWith(" Total") && r[0] !== "Grand Total")).toBe(false);
    });

    test("a click on a value opens its rows and calls onCellClick; Enter works from the keyboard", async ({ page }) => {
        await page.goto("?data=tickets");
        const cell = page.locator('[data-testid="pivot-table"] td.pk-clickable').first();
        const value = Number((await cell.textContent()).replace(/,/g, ""));
        await cell.click();
        await expect(page.getByTestId("drill-panel")).toBeVisible();
        await expect(page.getByTestId("drill-count")).toHaveText(`${value} rows`);
        await expect(page.locator(".pk-drill-table tbody tr")).toHaveCount(value);
        await expect(page.getByTestId("pg-last-click")).toContainText(`${value} rows`);
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("drill-panel")).toBeHidden();
        await expect(cell).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("drill-panel")).toBeVisible();
    });

    test("table and chart, chart types, and the PNG export", async ({ page }) => {
        await page.goto("?data=tickets");
        await page.getByTestId("show-chart").click();
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await expect(page.getByTestId("chart-type")).toHaveText(/Chart type: Bars/);
        await page.getByTestId("chart-type").click();
        await page.getByTestId("chart-pie").click();
        await expect(page.getByTestId("show-chart")).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByTestId("chart-type")).toHaveText(/Chart type: Pie/);
        // the canvas has a text alternative
        await expect(page.getByTestId("chart-summary")).toContainText("Pie: Count of Ticket by Team.");
        await page.getByTestId("export").click();
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-png").click()]);
        expect(download.suggestedFilename()).toBe("pivotkit-tickets.png");
        const png = await readFile(await download.path());
        expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
        await page.getByTestId("show-table").click();
        await expect(page.getByTestId("pivot-table")).toBeVisible();
    });

    test("XLSX and CSV exports download valid files with the table's numbers", async ({ page }) => {
        await page.goto("?data=tickets");
        await page.getByTestId("export").click();
        const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-xlsx").click()]);
        expect(xlsx.suggestedFilename()).toBe("pivotkit-tickets.xlsx");
        const files = unzipSync(new Uint8Array(await readFile(await xlsx.path())));
        expect(Object.keys(files)).toContain("xl/worksheets/sheet1.xml");
        const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
        expect(sheet).toContain("Grand Total");
        expect(sheet).toContain("<v>4000</v>");

        await page.getByTestId("export").click();
        const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
        const text = (await readFile(await csv.path(), "utf8")).replace(/^\uFEFF/, "");
        const lines = text.trim().split(/\r?\n/);
        expect(lines.at(-1)).toMatch(/^Grand Total,.*,4000$/);
        await expect(page.locator(".pk-toasts")).toContainText("Exported pivotkit-tickets.csv");
    });

    test("templates: save, load, and delete only what the host allows, after asking", async ({ page }) => {
        await page.goto("?data=tickets");
        await page.getByRole("button", { name: "Remove Priority" }).click();
        await toolbar(page, "templates");
        await page.getByTestId("template-name").fill("Teams only");
        await page.getByRole("button", { name: "Save", exact: true }).click();
        // "saved" comes when the host's promise is kept
        await expect(page.locator(".pk-toasts")).toContainText("Template “Teams only” saved");
        await toolbar(page, "templates");
        // a preset of the host has no delete button
        await expect(page.getByRole("button", { name: "Delete Open work per team (chart)" })).toHaveCount(0);
        await page.getByTestId("template-Open work per team (chart)").click();
        await expect(page.getByTestId("show-chart")).toHaveAttribute("aria-pressed", "true");
        await toolbar(page, "templates");
        await page.getByTestId("template-Teams only").click();
        await expect.poll(() => chips(page, "cols")).toEqual([]);
        await toolbar(page, "templates");
        await page.getByRole("button", { name: "Delete Teams only" }).click();
        // asked in place, no window.confirm (a dialog would fail the test through the console check)
        await expect(page.getByText("Delete “Teams only”?")).toBeVisible();
        await page.getByTestId("confirm-delete").click();
        await expect(page.getByTestId("template-Teams only")).toHaveCount(0);
        await expect(page.locator(".pk-toasts")).toContainText("Template “Teams only” deleted");
    });
});

test.describe("theme, language and layout", () => {
    test("theme follows html[data-theme] and the system setting", async ({ page }) => {
        await page.emulateMedia({ colorScheme: "dark" });
        await page.goto("?data=sales");
        const root = page.locator(".pk-root");
        await expect(root).toHaveAttribute("data-pk-theme", "dark");
        await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
        await expect(root).toHaveAttribute("data-pk-theme", "light");
        expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
        await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
        await expect(root).toHaveAttribute("data-pk-theme", "dark");
        expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(22, 24, 29)");
    });

    test("German labels and number format, and the report's language", async ({ page }) => {
        await page.goto("?data=tickets&lang=de");
        await expect(page.locator(".pk-root")).toHaveAttribute("lang", "de");
        await expect(page.locator('[data-zone="rows"] .pk-zone-title')).toHaveText("Zeilen");
        await expect(page.getByTestId("row-count")).toHaveText("4.000 Zeilen");
        expect((await tableRows(page)).at(-1)[0]).toBe("Gesamtergebnis");
    });

    test("text is at least 14 px", async ({ page }) => {
        await page.goto("?data=sales");
        const sizes = await page.locator(".pk-root :is(.pk-field-name, .pk-chip-label, .pk-td, .pk-btn, .pk-hint, .pk-zone-hint, .pk-zone-title, .pk-th, .pk-note, .pk-status, .pk-swap, .pk-badge-text)").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
    });

    test("wide: field list beside the zones, no scrolling of the page sideways", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("?data=sales");
        await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", "wide");
        const panel = await page.locator(".pk-panel").boundingBox();
        const zones = await page.locator(".pk-zones").boundingBox();
        expect(panel.x + panel.width).toBeLessThanOrEqual(zones.x);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test("narrow: the field list is a drawer, zones stack, only the table scrolls sideways", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("?data=sales");
        await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", "narrow");
        await expect(page.locator(".pk-panel")).toBeHidden();
        const boxes = await page.locator(".pk-zone").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
        expect(new Set(boxes.map(Math.round)).size).toBe(1);
        await page.getByTestId("show-fields").click();
        await expect(page.locator(".pk-panel")).toBeVisible();
        await page.locator('.pk-field[data-field="Channel"] .pk-field-name').click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country", "Channel"]);
        await expect(page.locator(".pk-panel")).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const wrap = page.getByTestId("pivot-table");
        expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    });
});

test("100,000 rows: the table body is virtualized and scrolls", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("?data=tickets&rows=100000&empty");
    await page.getByTestId("field-menu-Ticket").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await page.locator('.pk-field[data-field="Lead hours"] .pk-field-name').click();
    const wrap = page.getByTestId("pivot-table");
    await expect(wrap.locator("tbody tr[data-r]").first()).toBeVisible();
    expect(await wrap.locator("tbody tr[data-r]").count()).toBeLessThan(200);
    await wrap.evaluate((el) => { el.scrollTop = el.scrollHeight / 2; });
    await expect(wrap.locator('tbody tr[data-r="50000"]')).toBeAttached();
    const timings = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("measure").filter((e) => e.name.startsWith("pivotkit:")).map((e) => [e.name, Math.round(e.duration)])));
    test.info().annotations.push({ type: "timings", description: JSON.stringify(timings) });
});
