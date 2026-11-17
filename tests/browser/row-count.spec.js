// The line under the result counts the rows the report is made of (#108): "15,344 rows" with nothing
// filtered, "5,110 of 15,344 rows" when a filter leaves rows out (German "14.248 von 15.344 Zeilen"),
// on the real weather data set (2023 to 2025). The expected numbers are computed here from the snapshot
// with plain JavaScript. The browser's clock stands in 2026, so "Last 2 years" keeps 2025 in any year
// the test runs.
import { readFileSync } from "node:fs";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, test } from "./fixtures.js";
import { unpack } from "../../examples/playground/data/sources.js";

const weather = unpack(JSON.parse(readFileSync(new URL("../../examples/playground/data/weather.json", import.meta.url), "utf8")));
const TODAY = new Date("2026-06-15T12:00:00Z");
const thisYear = TODAY.getUTCFullYear();
const YEAR = "Date by year";
// Last 2 years: this year and the one before
const lastTwo = weather.filter((r) => Number(r.Date.slice(0, 4)) >= thisYear - 1).length;
const view = { derived: [{ name: YEAR, field: "Date", by: "year" }], rows: ["City"], cols: [YEAR], values: [{ agg: "count" }] };

/** The playground on the weather data with a view (the one above by default), in a language. */
async function open(page, lang = "en", shown = view) {
    await page.goto(`?data=weather&empty&lang=${lang}#pivot-playground=${encodeViewLink(shown)}`);
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
}

test("the row count says how many of the data's rows a filter keeps, and only then", async ({ page }) => {
    const all = weather.length.toLocaleString("en-US");
    await page.clock.setFixedTime(TODAY);
    await open(page);
    await expect(page.getByTestId("row-count")).toHaveText(`${all} rows`);
    await chipMenu(page, YEAR, "filter");
    const menu = page.locator(".pk-chip-menu");
    await menu.getByTestId("quick-last").check();
    expect(lastTwo).toBeGreaterThan(0);
    await expect(page.getByTestId("row-count")).toHaveText(`${lastTwo.toLocaleString("en-US")} of ${all} rows`);
    // the Filter level's summary counts the same rows
    await expect(menu.locator(".pk-filter-summary")).toContainText(`${lastTwo.toLocaleString("en-US")} of ${all} rows`);
    // All again: nothing left out, the count as before
    await menu.getByTestId("quick-all").check();
    await expect(page.getByTestId("row-count")).toHaveText(`${all} rows`);
});

test("German, on a phone: the count on one line under the result", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // every city but Berlin, as a link carries the filter
    await open(page, "de", { ...view, filters: [{ field: "City", type: "in", items: ["Berlin"], not: true }] });
    const all = weather.length.toLocaleString("de-DE");
    const kept = weather.filter((r) => r.City !== "Berlin").length.toLocaleString("de-DE");
    const count = page.getByTestId("row-count");
    await expect(count).toHaveText(`${kept} von ${all} Zeilen`);
    // one line: not wrapped, inside the report's width
    const box = await count.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const root = el.closest(".pk-root").getBoundingClientRect();
        return { height: r.height, line: parseFloat(getComputedStyle(el).fontSize) * 1.6, right: r.right, rootRight: root.right };
    });
    expect(box.height).toBeLessThan(box.line);
    expect(box.right).toBeLessThanOrEqual(box.rootRight);
});
