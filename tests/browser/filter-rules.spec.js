// The Filter level's quick choices and rules on the real data set "endoflife" (Released: the day a
// release cycle came out): Last 2 years, a year compared ("from 2022"), a rule on the total, the same
// level in Filters, the keys, the search and German. The expected numbers are computed here from the
// snapshot with plain JavaScript, relative to today as the browser sees it (the data is in UTC).
import { readFileSync } from "node:fs";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, openLevel, openMoreFilters, tableRows, test } from "./fixtures.js";
import { unpack } from "../../examples/playground/data/sources.js";

const eol = unpack(JSON.parse(readFileSync(new URL("../../examples/playground/data/endoflife.json", import.meta.url), "utf8")));
const yearOf = (x) => Number(x.Released.slice(0, 4));
const thisYear = new Date().getUTCFullYear();
const YEAR = "Released by year";
/** Release cycles per year of release, as the table writes the counts. */
const perYear = Object.entries(Object.groupBy(eol.filter((x) => x.Released), (x) => yearOf(x))).map(([y, list]) => [Number(y), list.length]);
const rowsOf = (keep) => perYear.filter(([y, n]) => keep(y, n)).map(([y, n]) => [String(y), n.toLocaleString("en-US")]);

/** The playground with a view of its own (the view goes into the address as a link would). */
async function openView(page, view, lang = "en") {
    await page.goto(`?data=endoflife&empty&lang=${lang}#pivot-playground=${encodeViewLink(view)}`);
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
}

const byYear = (more = {}) => ({ derived: [{ name: YEAR, field: "Released", by: "year" }], rows: [YEAR], values: [{ agg: "count" }], ...more });
/** The year rows of the table (without the grand total) as [year, count]. */
const yearRows = async (page) => (await tableRows(page)).filter((r) => /^\d{4}$/.test(r[0])).map((r) => [r[0], r[1]]);
/** The years the table shows. */
const years = async (page) => (await yearRows(page)).map((r) => r[0]);
const yearsOf = (keep) => rowsOf(keep).map((r) => r[0]);
const badge = (page, zone, chip, id = "rule-badge") => page.locator(`[data-zone="${zone}"] .pk-chip[data-chip="${chip}"] [data-testid="${id}"]`);

test.describe("the Filter level of a date field", () => {
    test("Last 2 years: a quick choice that keeps this year and the one before, said on the chip with its years", async ({ page }) => {
        await openView(page, byYear());
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        // in this order: the quick choices (All checked and focused), the list, the folded rules
        await expect(menu.getByTestId("quick-all")).toBeChecked();
        await expect(menu.getByTestId("quick-all")).toBeFocused();
        await expect(menu.getByTestId("quick-thisYear")).toHaveAccessibleName("This year");
        // a year grouping has no "Last N months"
        await expect(menu.getByTestId("quick-months")).toHaveCount(0);
        await expect(menu.getByTestId("filter-more")).toHaveAttribute("aria-expanded", "false");
        // the count first, then its choice: applied a moment after the typing stops
        await menu.getByTestId("quick-years-count").fill("2");
        const range = `${thisYear - 1}–${thisYear}`;
        await expect(menu.getByTestId("quick-years")).toBeChecked();
        await expect(menu.getByTestId("quick-choices")).toContainText(range);
        await expect.poll(() => yearRows(page)).toEqual(rowsOf((y) => y >= thisYear - 1));
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 2 years (${range})`);
        await expect(menu.getByTestId("filter-result")).toHaveText(new RegExp(`plus last 2 years \\(${range}\\)$`));
        // the first level says the same words; All takes it off
        await menu.getByTestId("level-back").click();
        await expect(menu.getByTestId("topic-state-filter")).toHaveText(`● last 2 years (${range})`);
        await openLevel(menu, "filter");
        await menu.getByTestId("quick-all").check();
        await expect(badge(page, "rows", YEAR)).toHaveCount(0);
        await expect.poll(async () => (await yearRows(page)).length).toBe(perYear.length);
    });

    test("rules: the year compared (from 2022) and its total (Count of rows > 20), both applied together; × takes one off", async ({ page }) => {
        await openView(page, byYear({ values: [] }));
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        await openMoreFilters(menu);
        await menu.getByTestId("rule-add-item").click();
        // "is from" first; the year is one of the grouping's items
        await expect(menu.getByTestId("rule-item-op")).toBeFocused();
        await expect(menu.getByTestId("rule-item-op").locator("option:checked")).toHaveText("is from");
        await menu.getByTestId("rule-item-value").selectOption({ label: "2022" });
        await expect.poll(() => years(page)).toEqual(yearsOf((y) => y >= 2022));
        await expect(badge(page, "rows", YEAR)).toHaveText("from 2022");
        // a custom rule: the quick choices say so
        await expect(menu.getByTestId("quick-custom")).toBeChecked();
        // with nothing in Values the total is the count of rows, named in full
        await menu.getByTestId("rule-add-total").click();
        await expect(menu.getByTestId("value-filter-by")).toHaveText("Count of rows");
        await menu.getByTestId("value-filter-number").fill("20");
        await expect.poll(() => years(page)).toEqual(yearsOf((y, n) => y >= 2022 && n > 20));
        await expect(badge(page, "rows", YEAR, "condition-badge")).toHaveText("Count of rows > 20");
        await expect(menu.getByTestId("rule")).toHaveCount(2);
        await expect(menu.getByTestId("rule").nth(1)).toContainText("and");
        // between and its second year
        await menu.getByTestId("rule-item-op").selectOption("between");
        await menu.getByTestId("rule-item-value2").selectOption({ label: "2024" });
        await expect(badge(page, "rows", YEAR)).toHaveText("2022 to 2024");
        await expect.poll(() => years(page)).toEqual(yearsOf((y, n) => y >= 2022 && y <= 2024 && n > 20));
        // the first rule's × takes it alone off
        await menu.getByTestId("rule-remove").first().click();
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(badge(page, "rows", YEAR)).toHaveCount(0);
        await expect.poll(() => years(page)).toEqual(yearsOf((_y, n) => n > 20));
        // "in the last N years" is a rule too: the quick choice shows it
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-op").last().selectOption("last");
        await expect(menu.getByTestId("quick-years")).toBeChecked();
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 5 years (${thisYear - 4}–${thisYear})`);
    });

    test("a field in Filters gets the same Filter level, and filters the whole report", async ({ page }) => {
        await openView(page, { rows: ["Category"], values: [{ field: "Cycle", agg: "count" }], filters: [{ field: "Released", type: "exclude", items: [] }] });
        await page.getByTestId("chip-menu-Released").click();
        const menu = page.locator(".pk-chip-menu");
        // Filter, then Move to; no sort, grouping or Top items
        await expect(menu.getByTestId("topic-state-filter")).toHaveText("All");
        await expect(menu.getByTestId("topic-sort")).toHaveCount(0);
        await openLevel(menu, "filter");
        // an ungrouped date has the months too
        await menu.getByTestId("quick-months").check();
        await expect(badge(page, "filters", "Released")).toHaveText(/^last 12 months \(/);
        await menu.getByTestId("quick-years-count").fill("2");
        const kept = eol.filter((x) => x.Released && yearOf(x) >= thisYear - 1).length;
        await expect.poll(async () => (await tableRows(page)).find((r) => r[0] === "Grand Total")?.[1]).toBe(kept.toLocaleString("en-US"));
        await expect(page.getByTestId("chip-menu-Released")).toHaveAccessibleName(`Released, last 2 years (${thisYear - 1}–${thisYear})`);
    });

    test("by keys alone: the menu, the Filter level, the quick choices with the arrow keys", async ({ page }) => {
        await openView(page, byYear());
        await page.getByTestId(`chip-menu-${YEAR}`).focus();
        await page.keyboard.press("Enter");
        const menu = page.locator(".pk-chip-menu");
        // to the Filter row and into its level
        await menu.getByTestId("topic-filter").focus();
        await page.keyboard.press("Enter");
        await expect(menu.getByTestId("quick-all")).toBeFocused();
        // down: This year, then Last 5 years, each applied at once
        await page.keyboard.press("ArrowDown");
        await expect(badge(page, "rows", YEAR)).toHaveText(`this year (${thisYear})`);
        await page.keyboard.press("ArrowDown");
        await expect(menu.getByTestId("quick-years")).toBeFocused();
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 5 years (${thisYear - 4}–${thisYear})`);
        // Tab to its count, typed, Escape gives back what applies, Escape again goes back a level
        await page.keyboard.press("Tab");
        await expect(menu.getByTestId("quick-years-count")).toBeFocused();
        await page.keyboard.type("0");
        await page.keyboard.press("Escape");
        await expect(menu.getByTestId("quick-years-count")).toHaveValue("5");
        await page.keyboard.press("Escape");
        await expect(menu.getByTestId("topic-filter")).toBeFocused();
    });

    test("the search finds “last 2 years”, “from 2022” and the rules, and applies them at once", async ({ page }) => {
        await openView(page, byYear());
        await chipMenu(page, YEAR);
        const menu = page.locator(".pk-chip-menu");
        const search = menu.getByTestId("menu-search");
        const hits = menu.getByTestId("menu-search-hits").locator('[role^="menuitem"]');
        await search.fill("last 2 years");
        await expect(hits.first()).toHaveText(new RegExp(`^Last 2 years \\(${thisYear - 1}–${thisYear}\\)`));
        await search.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 2 years (${thisYear - 1}–${thisYear})`);
        await search.fill("from 2022");
        await expect(hits.first()).toHaveText(/^From 2022/);
        await search.press("ArrowDown");
        await page.keyboard.press("Enter");
        // a quick choice and a comparison: both apply, the chip says the first and "+1"
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 2 years (${thisYear - 1}–${thisYear}) +1`);
        await search.fill("rule");
        await search.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(menu.getByTestId("filter-more")).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByTestId("rule")).toHaveCount(2);
        await expect(menu.getByTestId("rule-item-op").first()).toBeFocused();
    });

    test("in German: the quick choices, the rules and the chip", async ({ page }) => {
        await openView(page, byYear(), "de");
        const chip = (await page.locator('[data-zone="rows"] .pk-chip').first().getAttribute("data-chip")) ?? "";
        await chipMenu(page, chip, "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("quick-choices")).toContainText("Dieses Jahr");
        await expect(menu.getByTestId("quick-choices")).toContainText("Letzte");
        await menu.getByTestId("quick-years").check();
        await expect(badge(page, "rows", chip)).toHaveText(`letzte 5 Jahre (${thisYear - 4}–${thisYear})`);
        await openMoreFilters(menu);
        await expect(menu.getByTestId("rules")).toContainText("Einträge behalten, für die alles zutrifft:");
        await menu.getByTestId("rule-item-op").selectOption({ label: "ab" });
        await menu.getByTestId("rule-item-value").selectOption({ label: "2022" });
        await expect(badge(page, "rows", chip)).toHaveText(`ab 2022`);
        await expect(menu.getByTestId("quick-custom")).toBeChecked();
        await expect(menu.getByTestId("quick-custom")).toHaveAccessibleName("Eigene Regeln");
    });
});
