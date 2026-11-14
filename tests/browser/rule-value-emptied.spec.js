// A rule on the item or on its total whose value is emptied (issue #244): the field looks empty, so
// the rule leaves the view at once (the table, the chip and the summary show every item again) and its
// row stays, "Applies once it is complete.", until a new value applies it again in its place. The
// expected rows are computed here from the snapshots of the real data sets "nobel" (Year, a number)
// and "endoflife" (Released by year, its total).
import { readFileSync } from "node:fs";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, openRules, tableRows, test } from "./fixtures.js";
import { unpack } from "../../examples/playground/data/sources.js";

const load = (name) => unpack(JSON.parse(readFileSync(new URL(`../../examples/playground/data/${name}.json`, import.meta.url), "utf8")));
const nobel = load("nobel");
const eol = load("endoflife");
/** The distinct years of a data set, sorted. */
const yearsIn = (list) => [...new Set(list)].sort((a, b) => a - b);
const nobelYears = yearsIn(nobel.map((r) => r.Year));
const YEAR = "Released by year";
const eolPerYear = Object.entries(Object.groupBy(eol.filter((x) => x.Released), (x) => Number(x.Released.slice(0, 4)))).map(([y, list]) => [Number(y), list.length]);

async function openView(page, data, view) {
    await page.goto(`?data=${data}&empty&lang=en#pivot-playground=${encodeViewLink(view)}`);
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
}
/** The years the table shows (a number written with a group separator read back). */
const years = async (page) => (await tableRows(page)).filter((r) => /^\d[\d,]*$/.test(r[0])).map((r) => Number(r[0].replace(/,/g, "")));
const badge = (page, chip, id = "rule-badge") => page.locator(`[data-zone="rows"] .pk-chip[data-chip="${chip}"] [data-testid="${id}"]`);
/** Empties the focused field as a user does: select all, then Delete. */
async function empty(page) {
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
}

test.beforeAll(() => {
    // the data has to exercise the rules: some years before 2000 and after, totals above and below 20
    expect(nobelYears.some((y) => y < 2000) && nobelYears.some((y) => y >= 2000)).toBe(true);
    expect(eolPerYear.some(([, n]) => n > 20) && eolPerYear.some(([, n]) => n <= 20)).toBe(true);
});

test.describe("a rule's value emptied (#244)", () => {
    test("on the item (a number): the rule goes, every item shows again, the row waits for a new value", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Year"], values: [{ agg: "count" }] });
        await expect.poll(() => years(page)).toEqual(nobelYears);
        await chipMenu(page, "Year", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await menu.getByTestId("rule-add-item").click();
        await expect(menu.getByTestId("rule-item-op")).toHaveValue(">=");
        const value = menu.getByTestId("rule-item-value");
        await value.click();
        await page.keyboard.type("2000");
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y >= 2000));
        await expect(badge(page, "Year")).toHaveCount(1);
        await empty(page);
        await expect(value).toHaveValue("");
        // the field looks empty, so nothing narrows the table any more
        await expect.poll(() => years(page)).toEqual(nobelYears);
        await expect(badge(page, "Year")).toHaveCount(0);
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-result")).toHaveText("Applies once it is complete.");
        await expect(menu.getByTestId("rule-item-op")).toHaveValue(">=");
        await expect(value).toBeFocused();
        // a new value applies again in the same row
        await page.keyboard.type("1990");
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y >= 1990));
        await expect(badge(page, "Year")).toHaveCount(1);
        // between: its second value emptied takes the rule off as well
        await menu.getByTestId("rule-item-op").selectOption("between");
        await menu.getByTestId("rule-item-value2").click();
        await page.keyboard.type("1999");
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y >= 1990 && y <= 1999));
        await empty(page);
        await expect.poll(() => years(page)).toEqual(nobelYears);
        await expect(badge(page, "Year")).toHaveCount(0);
        // closing the menu with a field empty leaves no rule behind
        await menu.getByTestId("section-rules").focus();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-chip-menu")).toHaveCount(0);
        await expect(badge(page, "Year")).toHaveCount(0);
        await expect.poll(() => years(page)).toEqual(nobelYears);
    });

    test("on the item (a date): the day cleared takes the rule off", async ({ page }) => {
        const quakeDays = [...new Set(load("earthquakes").map((r) => r.Time.slice(0, 10)))].sort();
        await openView(page, "earthquakes", { rows: ["Time"], values: [{ agg: "count" }] });
        await chipMenu(page, "Time", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await menu.getByTestId("rule-add-item").click();
        const day = quakeDays[Math.floor(quakeDays.length / 2)];
        await menu.getByTestId("rule-item-value").fill(day);
        await expect(badge(page, "Time")).toHaveCount(1);
        await expect(menu.getByTestId("rule-result")).not.toHaveText("Applies once it is complete.");
        await menu.getByTestId("rule-item-value").fill("");
        await expect(badge(page, "Time")).toHaveCount(0);
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-result")).toHaveText("Applies once it is complete.");
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(/^All /);
    });

    test("on the total: the number emptied takes the rule off; a new number applies it in its place before the next rule", async ({ page }) => {
        const all = eolPerYear.map(([y]) => y);
        await openView(page, "endoflife", { derived: [{ name: YEAR, field: "Released", by: "year" }], rows: [YEAR], values: [{ agg: "count" }] });
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await menu.getByTestId("rule-add-total").click();
        const number = menu.getByTestId("value-filter-number");
        await number.click();
        await page.keyboard.type("20");
        await expect.poll(() => years(page)).toEqual(eolPerYear.filter(([, n]) => n > 20).map(([y]) => y));
        await expect(badge(page, YEAR, "condition-badge")).toHaveText("Count > 20");
        await empty(page);
        await expect(number).toHaveValue("");
        await expect.poll(() => years(page)).toEqual(all);
        await expect(badge(page, YEAR, "condition-badge")).toHaveCount(0);
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-result")).toHaveText("Applies once it is complete.");
        await expect(number).toBeFocused();
        await page.keyboard.type("100");
        await expect.poll(() => years(page)).toEqual(eolPerYear.filter(([, n]) => n > 100).map(([y]) => y));
        await expect(badge(page, YEAR, "condition-badge")).toHaveText("Count > 100");
    });
});
