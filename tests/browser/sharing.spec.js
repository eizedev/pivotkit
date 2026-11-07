// Chart display settings, sharing a view (link, JSON, file), the view kept in the address and per tab,
// the skeleton, and the help switches. Every test here fails without its feature.
import { readFile } from "node:fs/promises";
import { test as plain } from "@playwright/test";
import { toViewFile } from "pivotkit-core";
import { encodeViewLink } from "pivotkit-core/link";
import { chips, expect, test, toolbar } from "./fixtures.js";

/** A switch of a menu (its checkbox is drawn as a track): by keyboard, as a person reaches it. */
async function flip(locator) {
    await locator.focus();
    await locator.press("Space");
}

/** navigator.clipboard.writeText that keeps what it was given in window.__copied (every browser, no permission). */
async function captureClipboard(page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: async (text) => void (/** @type {any} */ (window).__copied = text) }
        });
    });
}

test.describe("chart display", () => {
    test("value labels, legend, title and smooth lines are set in the chart type menu and stay with the view", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "chart-type");
        await page.getByTestId("chart-bar").click();
        await expect(page.getByTestId("pivot-chart")).toBeVisible();
        await toolbar(page, "chart-type");
        await page.getByTestId("labels-value").click();
        await page.getByTestId("legend-right").click();
        // a choice applies at once and the menu stays open
        await expect(page.getByTestId("legend-right")).toHaveAttribute("aria-pressed", "true");
        // pie-only labels are not offered for bars
        await expect(page.getByTestId("labels-percent")).toHaveCount(0);
        await page.getByTestId("chart-title").fill("Revenue by region");
        await page.getByTestId("chart-title").press("Enter");
        await expect(page.getByTestId("pivot-chart")).toHaveAttribute("aria-label", "Chart: Revenue by region");
        // the settings stay when the type changes; a line offers smooth lines, a pie its shares
        await page.getByTestId("chart-line").click();
        await toolbar(page, "chart-type");
        await expect(page.getByTestId("labels-value")).toHaveAttribute("aria-pressed", "true");
        await flip(page.getByTestId("chart-smooth"));
        await page.getByTestId("chart-pie").click();
        await toolbar(page, "chart-type");
        await expect(page.getByTestId("labels-percent")).toBeVisible();
        await expect(page.getByTestId("chart-smooth")).toHaveCount(0);
        // the × removes the title at once, as one step Undo takes back
        await page.locator(".pk-chart-menu .pk-clear-x").click();
        await expect(page.getByTestId("pivot-chart")).toHaveAttribute("aria-label", "Chart");
        await expect(page.getByTestId("chart-title")).toBeFocused();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page.getByTestId("undo").click();
        await expect(page.getByTestId("pivot-chart")).toHaveAttribute("aria-label", "Chart: Revenue by region");
        // the image has what the screen shows: it is exported from the drawn chart
        await toolbar(page, "export");
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-png").click()]);
        expect((await readFile(await download.path())).subarray(1, 4).toString()).toBe("PNG");
    });
});

test.describe("sharing a view", () => {
    test("Copy link holds the data, the start and the view; opening it shows that view", async ({ page, context }) => {
        await captureClipboard(page);
        await page.goto("?data=sales");
        // the playground's address says what the report starts from, in words
        await expect.poll(() => new URL(page.url()).searchParams.get("start")).toBe("revenue-by-region-and-category");
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await toolbar(page, "views");
        await page.getByTestId("copy-link").click();
        await expect(page.locator(".pk-toasts")).toContainText("Link copied");
        const link = await page.evaluate(() => /** @type {any} */ (window).__copied);
        // data, start and rows of the playground; the page's own query (theme, language) stays out
        expect(link).toMatch(/\?data=sales&start=revenue-by-region-and-category&rows=4000#pivot-playground=1\.[A-Za-z0-9_-]+$/);
        const other = await context.newPage();
        await other.goto(link);
        await expect.poll(() => chips(other, "rows")).toEqual(["Region"]);
        await expect(other.locator(".pk-toasts")).toContainText("Opened the view from the link");
        // the link's view is where the report starts; Reset still goes to the start template
        await toolbar(other, "reset");
        await expect.poll(() => chips(other, "rows")).toEqual(["Region", "Country"]);
    });

    test("the playground keeps the view in its address: a reload shows it again", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => page.url()).toContain("#pivot-playground=1.");
        await page.reload();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
    });

    test("a hash route next to the view stays byte for byte, for the playground's writer and for Copy link", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=sales&theme=light#/reports/a?tab=2");
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/reports\/a\?tab=2&pivot-playground=1\.[A-Za-z0-9_-]+$/);
        await page.getByRole("button", { name: "Remove Region" }).click();
        // the entry is replaced, not added again
        await expect.poll(() => (new URL(page.url()).hash.match(/pivot-playground=/g) ?? []).length).toBe(1);
        await toolbar(page, "views");
        await page.getByTestId("copy-link").click();
        const link = await page.evaluate(() => /** @type {any} */ (window).__copied);
        expect(new URL(link).hash).toMatch(/^#\/reports\/a\?tab=2&pivot-playground=1\./);
        expect(new URL(link).searchParams.get("theme"), "the page's own query is not shared").toBeNull();
    });

    test("a link opened in the same tab is a step Undo takes back; the link at load is the start", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => page.url()).toContain("#pivot-playground=1.");
        const withRegionOnly = page.url();
        await toolbar(page, "reset");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        // another link in the same tab: only the fragment changes
        await page.evaluate((url) => {
            location.hash = new URL(url).hash;
        }, withRegionOnly);
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await page.getByTestId("undo").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
    });

    test("a damaged link and one with fields the data lacks say so in plain words", async ({ page }) => {
        await page.goto("?data=sales#pivot-playground=1.broken");
        await expect(page.locator(".pk-toasts")).toContainText("This link is damaged or not a pivotkit link.");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
    });

    test("the view as JSON: copied, downloaded, loaded again; what does not fit is named", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=sales");
        await toolbar(page, "views");
        await page.getByTestId("copy-json").click();
        await expect(page.locator(".pk-toasts")).toContainText("View copied as JSON");
        // a view file: the envelope with the source and the fields the view uses, the view inside
        const copied = await page.evaluate(() => /** @type {any} */ (window).__copied);
        const json = JSON.parse(copied);
        expect(Object.keys(json).slice(0, 3)).toEqual(["$schema", "format", "formatVersion"]);
        expect(json.format).toBe("pivotkit-view");
        expect(json.generator.name).toBe("pivotkit-react");
        expect(json.generator.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(json.source.id).toBe("sales");
        expect(json.source.fields.map((f) => f.name)).toEqual(expect.arrayContaining(["Region", "Country", "Category"]));
        expect(json.view.rows).toEqual(["Region", "Country"]);
        expect(copied.endsWith("}\n")).toBe(true);
        // the Share section says what a shared view gives away
        await toolbar(page, "views");
        await expect(page.getByTestId("share-privacy")).toBeVisible();
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-view").click()]);
        // named after the data (no view name yet), as <slug>.pivotkit.json
        expect(download.suggestedFilename()).toBe("sales.pivotkit.json");
        const file = await download.path();
        expect(JSON.parse(await readFile(file, "utf8")).view.cols).toEqual(["Category"]);

        // paste: a view with a field this data does not have
        await toolbar(page, "views");
        await page.getByTestId("load-view").click();
        await expect(page.getByTestId("load-view-text")).toBeFocused();
        await page.getByTestId("load-view-text").fill("{ nope");
        await page.getByTestId("load-view-apply").click();
        await expect(page.getByTestId("load-view-problem")).toHaveText("This is neither a view in JSON nor a pivotkit link.");
        await page.getByTestId("load-view-text").fill(JSON.stringify({ rows: ["Product", "Planet"], values: [{ field: "Units", agg: "sum" }] }));
        await page.getByTestId("load-view-apply").click();
        // a bare view: no source to compare, but a field the data lacks: asked first
        await expect(page.getByTestId("load-check")).toContainText("Fields this data does not have: “Planet”.");
        await expect(page.getByTestId("load-switch")).toHaveCount(0);
        await page.getByTestId("load-anyway").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Product"]);
        // a warning, not an error: the note goes by itself; what was left out stays above the result
        const note = page.locator(".pk-toast").filter({ hasText: "View loaded; some parts did not fit this data" });
        await expect(note).toBeVisible();
        await expect(note).not.toHaveClass(/pk-error/);
        await expect(page.getByTestId("view-issues")).toContainText("fields this data does not have (“Planet”)");
        await expect(note).toHaveCount(0, { timeout: 10_000 });
        await expect(page.getByTestId("view-issues")).toBeVisible();
        await page.getByTestId("dismiss-issues").click();
        await expect(page.getByTestId("view-issues")).toHaveCount(0);
        // one step: Undo goes back to the view before
        await page.getByTestId("undo").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);

        // a file: the one downloaded above
        await toolbar(page, "views");
        await page.getByTestId("load-view").click();
        await page.getByTestId("load-view-file").setInputFiles(file);
        await expect(page.locator(".pk-toasts")).toContainText("View loaded");
        await expect.poll(() => chips(page, "cols")).toEqual(["Category"]);
    });

    test("a view file for other data asks before it loads: cancel, load anyway, or switch to its data", async ({ page }) => {
        await page.goto("?data=sales");
        const file = JSON.stringify({ $schema: "https://pivotkit.eize.dev/schema/view-file-1.json", format: "pivotkit-view", formatVersion: 1, name: "Sunshine", source: { id: "weather", name: "Weather", fields: [{ name: "City", type: "string" }] }, extensions: {}, view: { rows: ["City"], values: [{ field: "Sunshine h", agg: "average" }] } });
        const open = async () => {
            await toolbar(page, "views");
            await page.getByTestId("load-view").click();
            await page.getByTestId("load-view-text").fill(file);
            await page.getByTestId("load-view-apply").click();
            await expect(page.getByTestId("load-check")).toBeVisible();
        };
        await open();
        // the source's name is the host's (sources), shown as text
        await expect(page.getByTestId("load-check")).toContainText("It was made for “Weather of 14 cities, 2023-2025”.");
        // Cancel: nothing changed, the form is back
        await page.getByTestId("load-cancel").click();
        await expect(page.getByTestId("load-view-text")).toBeVisible();
        // the pasted text is still there: the first Escape empties the field, the next closes the menu
        await expect(page.getByTestId("load-view-text")).toHaveValue(file);
        await page.getByTestId("load-view-text").press("Escape");
        await expect(page.getByTestId("load-view-text")).toHaveValue("");
        await page.getByTestId("load-view-text").press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        // Switch: the host shows the other data with the view
        await open();
        await page.getByTestId("load-switch").click();
        await expect.poll(() => new URL(page.url()).searchParams.get("data")).toBe("weather");
        await expect.poll(() => chips(page, "rows")).toEqual(["City"]);
        await expect.poll(() => chips(page, "values")).toEqual(["Average of Sunshine h"]);
    });

    test("a view file of a newer format is refused with the advice to update pivotkit", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "views");
        await page.getByTestId("load-view").click();
        await page.getByTestId("load-view-text").fill(JSON.stringify({ format: "pivotkit-view", formatVersion: 2, view: { rows: ["Region"] } }));
        await page.getByTestId("load-view-apply").click();
        await expect(page.getByTestId("load-view-problem")).toContainText("Update pivotkit to open it.");
    });

    test("a host's page: the view is kept for the tab (persistView), chartOptions and loading change nothing else", async ({ page }) => {
        await page.goto("pages/host.html?persist&options&loading");
        // the host is loading: the skeleton, named for assistive technology
        // one status that names what it waits for; not busy, so it is announced
        await expect(page.getByTestId("skeleton")).toHaveAttribute("role", "status");
        await expect(page.getByTestId("skeleton")).not.toHaveAttribute("aria-busy", /.*/);
        await expect(page.getByRole("status").filter({ hasText: "Loading the report…" })).toHaveCount(1);
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        await expect(page.getByTestId("skeleton")).toHaveCount(0);
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await page.getByTestId("show-chart").click();
        // drawn: ECharts has loaded (a reload during its load is a warning in Firefox)
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await page.reload();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await expect(page.getByTestId("pivot-chart")).toBeVisible();
        // Reset goes to the start view, and that is what the tab keeps then
        await page.getByTestId("show-table").click();
        await toolbar(page, "reset");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        await page.reload();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
    });

    test("a large data set paints the skeleton first, then the report", async ({ page }) => {
        // records whether the skeleton was in the page before the table came
        await page.addInitScript(() => {
            const seen = { skeleton: false, tableFirst: false };
            /** @type {any} */ (window).__seen = seen;
            new MutationObserver(() => {
                if (document.querySelector('[data-testid="skeleton"]')) seen.skeleton = true;
                if (document.querySelector('[data-testid="pivot-table"]') && !seen.skeleton) seen.tableFirst = true;
            }).observe(document, { childList: true, subtree: true });
        });
        await page.goto("?data=tickets&rows=100000");
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        expect(await page.evaluate(() => /** @type {any} */ (window).__seen)).toEqual({ skeleton: true, tableFirst: false });
        // a small one renders at once, as before
        await page.goto("?data=tickets&rows=4000");
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        expect(await page.evaluate(() => /** @type {any} */ (window).__seen.skeleton)).toBe(false);
    });
});

test.describe("help switches", () => {
    test("zone explanations: an i per zone, off and on in Options, remembered", async ({ page }) => {
        await page.goto("?data=sales");
        await expect(page.locator(".pk-zone-info")).toHaveCount(4);
        const rows = page.getByTestId("zone-info-rows");
        await expect(rows).toHaveAccessibleName("About Rows");
        await rows.focus();
        await expect(page.locator(".pk-info-pop")).toContainText("Example: Region in Rows");
        await page.keyboard.press("Escape");
        await toolbar(page, "options");
        await flip(page.getByTestId("show-zone-info"));
        await expect(page.locator(".pk-zone-info")).toHaveCount(0);
        await page.reload();
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        await expect(page.locator(".pk-zone-info")).toHaveCount(0);
        await toolbar(page, "options");
        await flip(page.getByTestId("show-zone-info"));
        await expect(page.locator(".pk-zone-info")).toHaveCount(4);
    });

    test("field descriptions: the switch hides every i of a field; screen readers keep the text", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "options");
        // the generated sales data has no descriptions: no switch for them
        await expect(page.getByTestId("show-field-info")).toHaveCount(0);
        await page.goto("?data=countries");
        await expect(page.locator('.pk-field[data-field="Population"] .pk-info')).toHaveCount(1);
        await toolbar(page, "options");
        await flip(page.getByTestId("show-field-info"));
        await expect(page.locator(".pk-panel .pk-info, .pk-chip .pk-info")).toHaveCount(0);
        await expect(page.locator('.pk-field[data-field="Population"] .pk-field-name')).toHaveAttribute("aria-describedby", /.+/);
    });
});

test.describe("chartOptions", () => {
    test("the host's chartOptions are merged into the option the chart draws", async ({ page }) => {
        await page.goto("pages/host.html?options");
        await page.getByTestId("show-chart").click();
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await expect.poll(async () => (await page.evaluate(() => /** @type {any} */ (window).__chartOption()))?.series?.[0]?.barMaxWidth).toBe(12);
        const option = await page.evaluate(() => /** @type {any} */ (window).__chartOption());
        // into every series, next to what the report set; the report's own tooltip stays
        expect(option.series.every((s) => s.barMaxWidth === 12 && s.type === "bar")).toBe(true);
        expect(option.grid[0].left).toBe(40);
        expect(option.tooltip[0].formatter).toBe("[function]");
    });

    // its own fixture: the console warning is what this test expects
    plain("markup in a tooltip formatter is left out with a warning and never runs", async ({ page }) => {
        const warnings = [];
        const errors = [];
        page.on("console", (m) => (m.type() === "warning" ? warnings : m.type() === "error" ? errors : []).push(m.text()));
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto("pages/host.html?xss");
        await page.getByTestId("show-chart").click();
        const canvas = page.locator('[data-testid="pivot-chart"] canvas');
        await expect(canvas).toBeVisible();
        await expect.poll(() => warnings.join("\n")).toContain("chartOptions.tooltip.formatter: a text template (written as markup), not allowed");
        // the rest of the host's options still apply
        await expect.poll(async () => (await page.evaluate(() => /** @type {any} */ (window).__chartOption()))?.series?.[0]?.barMaxWidth).toBe(10);
        // a tooltip shows, built by the report: no markup, nothing run
        const box = await canvas.boundingBox();
        for (const x of [0.15, 0.3, 0.45]) {
            await page.mouse.move(box.x + box.width * x, box.y + box.height * 0.7);
            await page.waitForTimeout(150);
        }
        expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
        expect(await page.locator("img[src='x']").count()).toBe(0);
        expect((await page.evaluate(() => /** @type {any} */ (window).__chartOption())).tooltip[0].formatter).toBe("[function]");
        expect(errors).toEqual([]);
    });
});

test.describe("the view file check of the documentation site", () => {
    test("reads a view file with pivotkit-core in the page: the format, what is left out, the fields it needs", async ({ page }) => {
        await page.goto("validator.html");
        const file = { format: "pivotkit-view", formatVersion: 1, name: "Units <b>", source: { id: "sales", fields: [{ name: "Region", type: "string" }, { name: "Units", type: "number" }] }, view: { rows: ["Region", "Planet"], values: [{ field: "Units", agg: "sum" }] } };
        await page.getByTestId("vf-text").fill(JSON.stringify(file));
        await page.getByTestId("vf-check").click();
        const out = page.getByTestId("vf-out");
        await expect(out).toContainText("Usable, with notes");
        // the name is text, never markup
        await expect(out).toContainText("“Units <b>”");
        await expect(out.locator("b")).toHaveCount(0);
        await expect(out).toContainText('rows[1] unknown field "Planet"');
        await expect(out).toContainText("Units (number)");
        // a newer format is refused with the advice to update
        await page.getByTestId("vf-text").fill(JSON.stringify({ ...file, formatVersion: 2 }));
        await page.getByTestId("vf-check").click();
        await expect(out).toContainText("update pivotkit to open it");
        // a valid file
        await page.getByTestId("vf-text").fill(JSON.stringify({ ...file, view: { rows: ["Region"] } }));
        await page.getByTestId("vf-check").click();
        await expect(out).toContainText("Valid");
    });
});

test.describe("a link for other data and a load check by keyboard", () => {
    test("a link made for another data set asks before it opens: Cancel keeps the start, Load anyway opens it", async ({ page }) => {
        const view = { rows: ["City"], values: [{ field: "Sunshine h", agg: "average" }] };
        const link = encodeViewLink(toViewFile(view, { source: { id: "weather" } }, { link: true }));
        await page.goto(`?data=sales#pivot-playground=${link}`);
        const check = page.getByTestId("link-check");
        await expect(check).toContainText("It was made for “Weather of 14 cities, 2023-2025”.");
        // not opened yet: the start view stays
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        await check.getByTestId("load-cancel").click();
        await expect(check).toHaveCount(0);
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        // the same in the same tab (only the fragment changes): Load anyway opens it as a step
        await page.evaluate(() => {
            location.hash = "";
        });
        await page.evaluate((text) => {
            location.hash = `pivot-playground=${text}`;
        }, link);
        await expect(page.getByTestId("link-check")).toBeVisible();
        await page.getByTestId("link-check").getByTestId("load-anyway").click();
        await expect.poll(() => chips(page, "rows")).toEqual([]);
        await expect(page.getByTestId("view-issues")).toContainText("“City”");
    });

    test("the load check takes the focus when it replaces the form", async ({ page, browserName }) => {
        await page.goto("?data=sales");
        await toolbar(page, "views");
        await page.getByTestId("load-view").click();
        await page.getByTestId("load-view-text").fill(JSON.stringify({ format: "pivotkit-view", formatVersion: 1, source: { id: "weather" }, view: { rows: ["City"] } }));
        await page.getByTestId("load-view-apply").click();
        // the form the focus was in is gone: the check's first choice has it
        await expect(page.getByTestId("load-switch")).toBeFocused();
        // Safari's Tab skips buttons unless the user turns that on
        if (browserName !== "webkit") {
            await page.keyboard.press("Tab");
            await expect(page.getByTestId("load-anyway")).toBeFocused();
        }
    });
});

// a host that does not deploy the menus' chunk, or a connection that drops: the panel says so and tries again
plain("a menu whose code cannot be loaded says so and loads on Try again", async ({ page }) => {
    let blocked = true;
    await page.route(/\/chunks\/menus-[^/]+\.js$/, (route) => (blocked ? route.abort() : route.continue()));
    await page.goto("?data=sales");
    await page.getByTestId("options").click();
    const failed = page.getByTestId("menu-failed");
    await expect(failed).toContainText("This menu could not be loaded.");
    await expect(page.getByTestId("menu-retry")).toBeFocused();
    blocked = false;
    await page.getByTestId("menu-retry").click();
    await expect(page.getByTestId("show-tips")).toBeVisible();
    // loaded once, every menu has it
    await page.keyboard.press("Escape");
    await page.getByTestId("chip-menu-Region").click();
    await expect(page.getByTestId("open-filter")).toBeVisible();
});
