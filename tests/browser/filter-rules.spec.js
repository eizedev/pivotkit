// The Filter level's quick choices and rules on the real data set "endoflife" (Released: the day a
// release cycle came out): Last 2 years, a year compared ("from 2022"), a rule on the total, the same
// level in Filters, the keys, the search and German. The expected numbers are computed here from the
// snapshot with plain JavaScript, relative to today as the browser sees it (the data is in UTC).
import { readFileSync } from "node:fs";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, openLevel, openRules, pickItem, tableRows, test } from "./fixtures.js";
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
        // in this order: the summary, the quick choices (All checked and focused), the items, the folded rules
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(`All ${perYear.length} years shown`);
        await expect(menu.getByTestId("quick-all")).toBeChecked();
        await expect(menu.getByTestId("quick-all")).toBeFocused();
        await expect(menu.getByTestId("quick-thisYear")).toHaveAccessibleName("This year");
        // a year grouping has no "Last N months"
        await expect(menu.getByTestId("quick-months")).toHaveCount(0);
        await expect(menu.getByTestId("section-picks")).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "false");
        // the count first, then its choice: applied a moment after the typing stops (2 is the count it starts with)
        await expect(menu.getByTestId("quick-years")).toHaveAccessibleName("Last 2 years");
        await menu.getByTestId("quick-years-count").fill("3");
        const range = `${thisYear - 2}–${thisYear}`;
        await expect(menu.getByTestId("quick-years")).toBeChecked();
        await expect(menu.getByTestId("quick-choices")).toContainText(range);
        await expect.poll(() => yearRows(page)).toEqual(rowsOf((y) => y >= thisYear - 2));
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 3 years (${range})`);
        // the summary counts what shows and why not the rest; the years before sit in the folded tail of the list
        const kept = rowsOf((y) => y >= thisYear - 2).length;
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(`${kept} of ${perYear.length} years shown`);
        await expect(menu.getByTestId("filter-summary-why")).toHaveText(`${perYear.length - kept} outside last 3 years (${range})`);
        await expect(menu.getByTestId("section-picks")).toHaveAttribute("aria-expanded", "false");
        await menu.getByTestId("section-picks").click();
        await expect(menu.locator(".pk-values > .pk-value")).toHaveCount(kept);
        await expect(menu.locator(".pk-values > .pk-value", { hasText: String(thisYear) })).toHaveCount(1);
        await expect(menu.getByTestId("tail-toggle")).toHaveText(`Left out by the rules (${perYear.length - kept}) – their ticks apply again once they go`);
        await menu.getByTestId("tail-toggle").click();
        await expect(menu.getByTestId("tail-list").locator(".pk-value", { hasText: String(thisYear - 3) }).locator("input")).toBeChecked();
        // a count above the most says so, and nothing changes
        await menu.getByTestId("quick-years-count").fill("501");
        await expect(menu.getByTestId("quick-years-count-problem")).toHaveText("Enter a whole number up to 500.");
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 3 years (${range})`);
        await menu.getByTestId("quick-years-count").fill("2");
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 2 years (${thisYear - 1}–${thisYear})`);
        await menu.getByTestId("quick-years-count").fill("7");
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 7 years (${thisYear - 6}–${thisYear})`);
        // Undo while the level is open (its keys from a button): the count and the choice follow
        await menu.getByTestId("section-rules").focus();
        await page.keyboard.press("ControlOrMeta+z");
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 2 years (${thisYear - 1}–${thisYear})`);
        await expect(menu.getByTestId("quick-years-count")).toHaveValue("2");
        await expect(menu.getByTestId("quick-years")).toHaveAccessibleName("Last 2 years");
        await page.keyboard.press("ControlOrMeta+z");
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 3 years (${range})`);
        await expect(menu.getByTestId("quick-years-count")).toHaveValue("3");
        // the first level says the same words; All takes it off
        await menu.getByTestId("level-back").click();
        await expect(menu.getByTestId("topic-state-filter")).toHaveText(`● last 3 years (${range})`);
        await openLevel(menu, "filter");
        await menu.getByTestId("quick-all").check();
        await expect(badge(page, "rows", YEAR)).toHaveCount(0);
        await expect.poll(async () => (await yearRows(page)).length).toBe(perYear.length);
    });

    test("rules: the year compared (from 2022) and its total (Count of rows > 20), both applied together; × takes one off", async ({ page }) => {
        await openView(page, byYear({ values: [] }));
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await menu.getByTestId("rule-add-item").click();
        // "is from" first; the year is one of the grouping's items
        await expect(menu.getByTestId("rule-item-op")).toBeFocused();
        await expect(menu.getByTestId("rule-item-op").locator("option:checked")).toHaveText("is from");
        await pickItem(page, menu, "rule-item-value", "2022");
        await expect.poll(() => years(page)).toEqual(yearsOf((y) => y >= 2022));
        await expect(badge(page, "rows", YEAR)).toHaveText("from 2022");
        // a rule, no quick choice: All stays, the rule counts on the header with its result line
        await expect(menu.getByTestId("quick-all")).toBeChecked();
        await expect(menu.getByTestId("section-rules")).toContainText("1 rule");
        await expect(menu.getByTestId("rule-result")).toHaveText(`Keeps ${yearsOf((y) => y >= 2022).length} of ${perYear.length} years`);
        // with nothing in Values the total is the count of rows, named in full
        await menu.getByTestId("rule-add-total").click();
        // the sentence names the field's items: "Released by year items whose Count of rows …"
        await expect(menu.getByTestId("rule").nth(1)).toContainText(`${YEAR} items whose`);
        await expect(menu.getByTestId("value-filter-by")).toHaveText("Count of rows");
        await menu.getByTestId("value-filter-number").fill("20");
        await expect.poll(() => years(page)).toEqual(yearsOf((y, n) => y >= 2022 && n > 20));
        await expect(badge(page, "rows", YEAR, "condition-badge")).toHaveText("Count of rows > 20");
        await expect(menu.getByTestId("rule")).toHaveCount(2);
        await expect(menu.getByTestId("rule").nth(1)).toContainText("and");
        // "is not" keeps no blank item: said under it
        await expect(menu.getByTestId("rule-blanks")).toHaveCount(0);
        await menu.getByTestId("rule-item-op").selectOption("!=");
        await expect(menu.getByTestId("rule-blanks")).toHaveText("Blank items are not kept.");
        // between and its second year
        await menu.getByTestId("rule-item-op").selectOption("between");
        await pickItem(page, menu, "rule-item-value2", "2024");
        await expect(badge(page, "rows", YEAR)).toHaveText("2022 to 2024");
        await expect.poll(() => years(page)).toEqual(yearsOf((y, n) => y >= 2022 && y <= 2024 && n > 20));
        // the first rule's × takes it alone off
        await menu.getByTestId("rule-remove").first().click();
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(badge(page, "rows", YEAR)).toHaveCount(0);
        await expect.poll(() => years(page)).toEqual(yearsOf((_y, n) => n > 20));
        // "in the last N years" is the quick choice: it moves up to the choices and stands among the rules as a line
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-op").last().selectOption("last");
        await expect(menu.getByTestId("quick-years")).toBeChecked();
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 5 years (${thisYear - 4}–${thisYear})`);
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-quick")).toContainText(`Quick choice: last 5 years (${thisYear - 4}–${thisYear})`);
    });

    test("a field in Filters gets the same Filter level, and filters the whole report", async ({ page }) => {
        await openView(page, { rows: ["Category"], values: [{ field: "Cycle", agg: "count" }], filters: [{ field: "Released", type: "exclude", items: [] }] });
        await page.getByTestId("chip-menu-Released").click();
        const menu = page.locator(".pk-chip-menu");
        // Filter, then Move to; no sort, grouping or Top items
        await expect(menu.getByTestId("topic-state-filter")).toHaveText("All");
        await expect(menu.getByTestId("topic-sort")).toHaveCount(0);
        await openLevel(menu, "filter");
        // an ungrouped date has the months (and days) too; the count starts at the smallest that reaches the latest record
        await expect(menu.getByTestId("quick-days")).toBeVisible();
        await menu.getByTestId("quick-months").check();
        await expect(badge(page, "filters", "Released")).toHaveText(/^last 1 month \(/);
        await menu.getByTestId("quick-years-count").fill("3");
        const kept = eol.filter((x) => x.Released && yearOf(x) >= thisYear - 2).length;
        await expect.poll(async () => (await tableRows(page)).find((r) => r[0] === "Grand Total")?.[1]).toBe(kept.toLocaleString("en-US"));
        await expect(page.getByTestId("chip-menu-Released")).toHaveAccessibleName(`Released, last 3 years (${thisYear - 2}–${thisYear})`);
    });

    test("by keys alone: the menu, the Filter level, the quick choices with the arrow keys", async ({ page }) => {
        await openView(page, byYear());
        await page.getByTestId(`chip-menu-${YEAR}`).focus();
        await page.keyboard.press("Enter");
        const menu = page.locator(".pk-chip-menu");
        // the menu takes the focus a frame after it opens: wait for that, so it does not take it back
        await expect.poll(() => page.evaluate(() => document.activeElement?.closest(".pk-chip-menu") !== null)).toBe(true);
        // to the Filter row and into its level
        await menu.getByTestId("topic-filter").focus();
        await page.keyboard.press("Enter");
        await expect(menu.getByTestId("quick-all")).toBeFocused();
        // down: This year, then Last 5 years, each applied at once
        await page.keyboard.press("ArrowDown");
        await expect(badge(page, "rows", YEAR)).toHaveText(`this year (${thisYear})`);
        await page.keyboard.press("ArrowDown");
        await expect(menu.getByTestId("quick-years")).toBeFocused();
        // "Last 1 year" would be This year again: the count starts at 2
        await expect(badge(page, "rows", YEAR)).toHaveText(`last 2 years (${thisYear - 1}–${thisYear})`);
        // Tab to its count, typed, Escape gives back what applies, Escape again goes back a level
        await page.keyboard.press("Tab");
        await expect(menu.getByTestId("quick-years-count")).toBeFocused();
        await page.keyboard.type("0");
        await page.keyboard.press("Escape");
        await expect(menu.getByTestId("quick-years-count")).toHaveValue("2");
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
        // the rules open on the comparison; the quick choice stands above them as a line
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-quick")).toContainText("Quick choice: last 2 years");
        await expect(menu.getByTestId("rule-item-op").first()).toBeFocused();
    });

    test("in German: the quick choices, the rules and the chip", async ({ page }) => {
        await openView(page, byYear(), "de");
        const chip = (await page.locator('[data-zone="rows"] .pk-chip').first().getAttribute("data-chip")) ?? "";
        await chipMenu(page, chip, "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("quick-choices")).toContainText("Dieses Jahr");
        await expect(menu.getByTestId("quick-choices")).toContainText("Letzte");
        // one year: its own words
        await menu.getByTestId("quick-years-count").fill("1");
        await expect(menu.getByTestId("quick-years")).toHaveAccessibleName("Letztes 1 Jahr");
        await menu.getByTestId("quick-years-count").fill("5");
        await menu.getByTestId("quick-years").check();
        await expect(badge(page, "rows", chip)).toHaveText(`letzte 5 Jahre (${thisYear - 4}–${thisYear})`);
        await expect(menu.getByTestId("filter-summary-why")).toContainText(`außerhalb von letzte 5 Jahre (${thisYear - 4}–${thisYear})`);
        await openRules(menu);
        await expect(menu.getByTestId("rules")).toContainText("Jahre behalten, für die alles zutrifft:");
        await expect(menu.getByTestId("rule-quick")).toContainText("Schnellauswahl: letzte 5 Jahre");
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-op").selectOption({ label: "ab" });
        await pickItem(page, menu, "rule-item-value", "2022");
        // the quick choice first on the chip, the rule as "+1"
        await expect(badge(page, "rows", chip)).toHaveText(`letzte 5 Jahre (${thisYear - 4}–${thisYear}) +1`);
        await expect(menu.getByTestId("section-rules")).toContainText("1 Regel");
        await menu.getByTestId("rule-item-op").selectOption("last");
        await menu.getByTestId("rule-last-count").fill("1");
        await expect(menu.getByTestId("rule-item-op").locator("option:checked")).toHaveText("im letzten");
        await expect(menu.getByTestId("rule-last-unit").locator("option:checked")).toHaveText("Jahr");
    });

    test("a new rule and the opened rules come into view; on a phone the chip keeps its name and cuts the rule", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 620 });
        await openView(page, byYear());
        // a window this low folds the zones into one line: open them
        if (!(await page.getByTestId(`chip-menu-${YEAR}`).isVisible())) await page.getByTestId("layout-summary").click();
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        await menu.getByTestId("section-rules").click();
        await expect(menu.getByTestId("rules")).toBeInViewport();
        await menu.getByTestId("rule-add-item").click();
        await pickItem(page, menu, "rule-item-value", "2022");
        await menu.getByTestId("rule-add-total").click();
        // the whole new row, not only its first control
        await expect(menu.getByTestId("rule").last()).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page.setViewportSize({ width: 390, height: 844 });
        await openView(page, byYear({ filters: [{ field: YEAR, type: "relative", unit: "year", count: 2 }, { field: YEAR, type: "compare", op: ">=", value: 2022 }] }));
        if (!(await page.getByTestId(`chip-menu-${YEAR}`).isVisible())) await page.getByTestId("layout-summary").click();
        const chip = page.locator(`.pk-chip[data-chip="${YEAR}"]`);
        const sizes = await chip.evaluate((el) => {
            const name = el.querySelector(".pk-chip-name").getBoundingClientRect().width;
            const cut = el.querySelector('[data-testid="rule-badge"] .pk-badge-cut');
            const label = el.querySelector(".pk-chip-label");
            return { name, cut: cut.scrollWidth > cut.clientWidth, overflow: getComputedStyle(cut).textOverflow, fits: label.scrollWidth <= label.clientWidth + 1 };
        });
        // the name keeps a few words, the rule ends in "…", "+1" stays, nothing is clipped mid-text
        expect(sizes.name).toBeGreaterThan(60);
        expect(sizes).toMatchObject({ cut: true, overflow: "ellipsis", fits: true });
        await expect(chip.getByTestId("rule-badge")).toContainText("+1");
    });
});
