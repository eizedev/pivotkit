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

test.describe("a second rule added while the first one's value still waits (#245)", () => {
    test("on the item: both rules apply, each in its own row, and stay when the menu opens again", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Year"], values: [{ agg: "count" }] });
        await chipMenu(page, "Year", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-value").click();
        await page.keyboard.type("2000");
        // no wait for the first value to apply: Add at once
        await menu.getByTestId("rule-add-item").click();
        await expect(menu.getByTestId("rule")).toHaveCount(2);
        await expect(menu.getByTestId("rule-item-op").last()).toBeFocused();
        await menu.getByTestId("rule-item-op").last().selectOption("<=");
        await menu.getByTestId("rule-item-value").last().click();
        await page.keyboard.type("2010");
        const both = nobelYears.filter((y) => y >= 2000 && y <= 2010);
        await expect.poll(() => years(page)).toEqual(both);
        await expect(menu.getByTestId("rule-result")).toHaveText([/^Keeps /, /^Keeps /]);
        await expect.poll(() => menu.getByTestId("rule-item-op").evaluateAll((list) => list.map((c) => c.value))).toEqual([">=", "<="]);
        await menu.getByTestId("section-rules").focus();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-chip-menu")).toHaveCount(0);
        await expect.poll(() => years(page)).toEqual(both);
        await chipMenu(page, "Year", "filter");
        await expect(page.locator(".pk-chip-menu").getByTestId("rule")).toHaveCount(2);
    });

    test("on the total: both rules apply, each in its own row", async ({ page }) => {
        await openView(page, "endoflife", { derived: [{ name: YEAR, field: "Released", by: "year" }], rows: [YEAR], values: [{ agg: "count" }] });
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await menu.getByTestId("rule-add-total").click();
        await menu.getByTestId("value-filter-number").click();
        await page.keyboard.type("20");
        await menu.getByTestId("rule-add-total").click();
        await expect(menu.getByTestId("rule")).toHaveCount(2);
        await expect(menu.getByTestId("value-filter-op").last()).toBeFocused();
        await menu.getByTestId("value-filter-op").last().selectOption("<");
        await menu.getByTestId("value-filter-number").last().click();
        await page.keyboard.type("300");
        await expect.poll(() => years(page)).toEqual(eolPerYear.filter(([, n]) => n > 20 && n < 300).map(([y]) => y));
        await expect(menu.getByTestId("rule-result")).toHaveText([/^Keeps /, /^Keeps /]);
        await expect.poll(() => menu.getByTestId("value-filter-op").evaluateAll((list) => list.map((c) => c.value))).toEqual([">", "<"]);
    });
});

test.describe("a rule's × clicked while its value still waits (#320)", () => {
    test("on the name, the item and the total: the rule goes, nothing applies on the way", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Year"], values: [{ agg: "count" }] });
        await chipMenu(page, "Year", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        for (const [add, field, text] of [["rule-add-name", "filter-condition-text", "19"], ["rule-add-item", "rule-item-value", "2000"], ["rule-add-total", "value-filter-number", "5"]]) {
            await menu.getByTestId(add).click();
            await menu.getByTestId(field).click();
            await page.keyboard.type(text);
            // no wait for the value to apply: the row's × at once
            await menu.getByTestId("rule-remove").click();
            await expect(menu.getByTestId("rule")).toHaveCount(0);
            await expect.poll(() => years(page)).toEqual(nobelYears);
            await expect(badge(page, "Year")).toHaveCount(0);
            await expect(badge(page, "Year", "condition-badge")).toHaveCount(0);
            await openRules(menu);
        }
    });

    test("on a rule that applies, with a new value still waiting: the rule goes, the new value never applies", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Year"], values: [{ agg: "count" }] });
        await chipMenu(page, "Year", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-value").click();
        await page.keyboard.type("2000");
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y >= 2000));
        await page.keyboard.type("0");
        await menu.getByTestId("rule-remove").click();
        await expect(menu.getByTestId("rule")).toHaveCount(0);
        await expect.poll(() => years(page)).toEqual(nobelYears);
        await expect(badge(page, "Year")).toHaveCount(0);
    });

    test("two rules, B waits, × on A: A goes, B applies on its own, A never comes back", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Year"], values: [{ agg: "count" }] });
        await chipMenu(page, "Year", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        // A: from 2000, applied
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-value").click();
        await page.keyboard.type("2000");
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y >= 2000));
        // B: up to 2010, its value still waiting when A's × is clicked
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-op").last().selectOption("<=");
        await menu.getByTestId("rule-item-value").last().click();
        await page.keyboard.type("2010");
        await menu.getByTestId("rule-remove").first().click();
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect.poll(() => menu.getByTestId("rule-item-op").evaluateAll((list) => list.map((c) => c.value))).toEqual(["<="]);
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y <= 2010));
    });
});

/**
 * Runs `act` with the page's timers held (the clock installed before the page loaded): a value typed
 * in it applies by a timer a moment after the typing, so it still waits when `act` goes on, however
 * slow the run. Timers due before run first; the clock goes on after `act`.
 */
async function timersHeld(page, act) {
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    await act();
    await page.clock.resume();
}
const incomplete = "Applies once it is complete.";

test.describe("a rule's × clicked while its value surely still waits: the page's timers held (#320)", () => {
    test.beforeEach(async ({ page }) => {
        await page.clock.install();
    });

    test("held timers, on the name, the item and the total: the value waits when the × is clicked, the rule goes", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Year"], values: [{ agg: "count" }] });
        await chipMenu(page, "Year", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        for (const [add, field, text] of [["rule-add-name", "filter-condition-text", "19"], ["rule-add-item", "rule-item-value", "2000"], ["rule-add-total", "value-filter-number", "5"]]) {
            await menu.getByTestId(add).click();
            await menu.getByTestId(field).click();
            await timersHeld(page, async () => {
                await page.keyboard.type(text);
                await expect(menu.getByTestId("rule-result")).toHaveText(incomplete);
                await menu.getByTestId("rule-remove").click();
            });
            await expect(menu.getByTestId("rule")).toHaveCount(0);
            await expect.poll(() => years(page)).toEqual(nobelYears);
            await expect(badge(page, "Year")).toHaveCount(0);
            await expect(badge(page, "Year", "condition-badge")).toHaveCount(0);
            await openRules(menu);
        }
    });

    test("held timers, two rules, B waits, × on A: B shows it waits when the × is clicked; A goes, B applies, A never comes back", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Year"], values: [{ agg: "count" }] });
        await chipMenu(page, "Year", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-value").click();
        await page.keyboard.type("2000");
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y >= 2000));
        await menu.getByTestId("rule-add-item").click();
        await menu.getByTestId("rule-item-op").last().selectOption("<=");
        await menu.getByTestId("rule-item-value").last().click();
        await timersHeld(page, async () => {
            await page.keyboard.type("2010");
            await expect(menu.getByTestId("rule-result").last()).toHaveText(incomplete);
            await menu.getByTestId("rule-remove").first().click();
        });
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect.poll(() => menu.getByTestId("rule-item-op").evaluateAll((list) => list.map((c) => c.value))).toEqual(["<="]);
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y <= 2010));
    });

    test("held timers, three rules, the last two emptied, B typed again and waiting, × on A: only B, no emptied row comes back", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Year"], values: [{ agg: "count" }] });
        await chipMenu(page, "Year", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        // A from 1950, B up to 2010, C from 1990: all three apply
        for (const [i, op, text] of [[0, ">=", "1950"], [1, "<=", "2010"], [2, ">=", "1990"]]) {
            await menu.getByTestId("rule-add-item").click();
            await menu.getByTestId("rule-item-op").nth(i).selectOption(op);
            await menu.getByTestId("rule-item-value").nth(i).click();
            await page.keyboard.type(text);
            await expect(menu.getByTestId("rule-result").nth(i)).toHaveText(/^Keeps /);
        }
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y >= 1990 && y <= 2010));
        // C emptied, then B: both rows wait for a new value, only A applies
        for (const i of [2, 1]) {
            await menu.getByTestId("rule-item-value").nth(i).click();
            await empty(page);
            await expect(menu.getByTestId("rule-result").nth(i)).toHaveText(incomplete);
        }
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y >= 1950));
        await expect(menu.getByTestId("rule")).toHaveCount(3);
        // B typed again, still waiting when A's × is clicked
        await timersHeld(page, async () => {
            await page.keyboard.type("2010");
            await expect(menu.getByTestId("rule-result").nth(1)).toHaveText(incomplete);
            await menu.getByTestId("rule-remove").first().click();
        });
        await expect.poll(() => years(page)).toEqual(nobelYears.filter((y) => y <= 2010));
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-result")).toHaveText([/^Keeps /]);
    });
});
