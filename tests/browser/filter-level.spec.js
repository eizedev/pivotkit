// The Filter level on real data whose dates end before today (the weather snapshot ends on
// 2025-12-31) and on data that reach today (endoflife): what a person sees in the summary, the quick
// choices, the table and the chip. Each test fails without its feature, on the defects found by hand:
// quick choices on a grouping that combines the years, choices with no data behind them, an empty
// result without its reason, items ticked yet "left out", a native select over the menu.
import { readFileSync } from "node:fs";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, tableRows, test } from "./fixtures.js";
import { unpack } from "../../examples/playground/data/sources.js";

const load = (name) => unpack(JSON.parse(readFileSync(new URL(`../../examples/playground/data/${name}.json`, import.meta.url), "utf8")));
const weather = load("weather");
const eol = load("endoflife");
const dates = weather.map((r) => r.Date).sort();
const [firstDay, lastDay] = [dates[0], dates[dates.length - 1]];
const lastYear = Number(lastDay.slice(0, 4));
const thisYear = new Date().getUTCFullYear();
const day = (iso) => new Date(`${iso}T00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
const n = (x) => x.toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The average of Mean °C per month of the year over the given years, as the Grand Total column shows it. */
const avgByMonth = (years) => MONTHS.map((_m, i) => {
    const rows = weather.filter((r) => years.includes(Number(r.Date.slice(0, 4))) && Number(r.Date.slice(5, 7)) === i + 1);
    return rows.reduce((a, r) => a + r["Mean °C"], 0) / rows.length;
});

const CYCLIC = "Date by month of year";
const MONTH = "Date by month";
/** The weather by month of the year (the years combined), cities in Columns, the average Mean °C. */
const cyclic = (more = {}) => ({ derived: [{ name: CYCLIC, field: "Date", by: "month" }], rows: [CYCLIC], cols: ["City"], values: [{ field: "Mean °C", agg: "average" }], ...more });
/** The weather by month along the time line. */
const monthly = (more = {}) => ({ derived: [{ name: MONTH, field: "Date", by: "yearMonth" }], rows: [MONTH], values: [{ field: "Mean °C", agg: "average" }], ...more });

async function openView(page, data, view, lang = "en") {
    await page.goto(`?data=${data}&empty&lang=${lang}#pivot-playground=${encodeViewLink(view)}`);
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
}
/** The data rows of the table (without the grand total). */
const bodyRows = async (page) => (await tableRows(page)).filter((r) => r[0] !== "Grand Total");
const badge = (page, chip) => page.locator(`[data-zone="rows"] .pk-chip[data-chip="${chip}"] [data-testid="rule-badge"]`);

test.describe("the Filter level on data that end before today (weather, to Dec 31, 2025)", () => {
    test.beforeAll(() => {
        // the tests below need data that end before today; a refreshed snapshot that reaches today would need other data
        expect(lastYear, "the weather snapshot ends before this year").toBeLessThan(thisYear);
    });

    test("a grouping that combines the years (month of the year) has Years combined, no quick choices; the summary says which years", async ({ page }) => {
        await openView(page, "weather", cyclic());
        await chipMenu(page, CYCLIC, "filter");
        const menu = page.locator(".pk-chip-menu");
        // no "This year", no "Last N months": they do not fit a grouping that puts every year's January together
        await expect(menu.getByTestId("quick-choices")).toHaveCount(0);
        await expect(menu.getByTestId("quick-this")).toHaveCount(0);
        const years = menu.getByTestId("years-combined").locator("button");
        await expect(years).toHaveText([/^2023/, /^2024/, /^2025/]);
        await expect(menu.getByTestId("year-2023")).toHaveAttribute("aria-pressed", "true");
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("All 12 months shown");
        await expect(menu.getByTestId("filter-summary-why")).toHaveText("Every item is picked, no rules.");
        await expect(menu.getByTestId("filter-summary-meta")).toHaveText(`${n(weather.length)} of ${n(weather.length)} rows · data ${day(firstDay)} – ${day(lastDay)} · 2023–2025 combined`);
        await expect(menu.getByTestId("filter-reset")).toBeDisabled();
        // the Grand Total of January over all three years
        const grand = async (month) => Number((await bodyRows(page)).find((r) => r[0] === month)?.at(-1));
        expect(await grand("Jan")).toBeCloseTo(avgByMonth([2023, 2024, 2025])[0], 1);
        // 2023 off: the table still has twelve months, their totals over 2024 and 2025 only
        await menu.getByTestId("year-2023").click();
        await expect(menu.getByTestId("year-2023")).toHaveAttribute("aria-pressed", "false");
        await expect(menu.getByTestId("filter-summary-meta")).toContainText("2024–2025 combined");
        await expect(badge(page, CYCLIC)).toHaveText("2024 to 2025");
        await expect.poll(async () => (await bodyRows(page)).length).toBe(12);
        expect(await grand("Jan")).toBeCloseTo(avgByMonth([2024, 2025])[0], 1);
        // the years are no rule of their own: Rules says none, the choice stands among them as a line to read
        await expect(menu.getByTestId("section-rules")).toContainText("No rules");
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByTestId("section-picks")).toHaveAttribute("aria-expanded", "false");
        await expect(menu.getByTestId("rule-quick")).toContainText("Quick choice: 2024–2025 combined");
        // one year left: it cannot go, and the table shows it alone
        await menu.getByTestId("year-2024").click();
        await expect(menu.getByTestId("year-2025")).toBeDisabled();
        await expect(menu.getByTestId("filter-summary-meta")).toContainText("2025 only");
        await expect(menu.getByTestId("fsection-years")).toContainText("The table shows 2025 only.");
        await expect(badge(page, CYCLIC)).toHaveText("2025");
        expect(await grand("Jan")).toBeCloseTo(avgByMonth([2025])[0], 1);
        // Reset filter: all years again
        await menu.getByTestId("filter-reset").click();
        await expect(menu.getByTestId("year-2023")).toHaveAttribute("aria-pressed", "true");
        await expect(badge(page, CYCLIC)).toHaveCount(0);
        await expect(menu.getByTestId("filter-summary-meta")).toContainText("2023–2025 combined");
    });

    test("a date along the time line: only choices with data, the ones without named, the data's share said everywhere, the reference date", async ({ page }) => {
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        const menu = page.locator(".pk-chip-menu");
        // "This year" (or this quarter, this month) would show nothing: not offered, said why; the counted choices start where the data end
        await expect(menu.getByTestId("quick-this")).toHaveCount(0);
        await expect(menu.getByTestId("quick-hidden")).toHaveText(`This year (${thisYear}) is not offered: the data end ${day(lastDay)}.`);
        const yearsN = thisYear - lastYear + 1;
        // the months from December of the data's last year to this one
        const monthsN = Math.max(2, (thisYear - lastYear) * 12 + new Date().getUTCMonth() - 10);
        // by month: months first (no unit finer than the grouping), the count the smallest that reaches December 2025
        const unit = menu.getByTestId("quick-last-unit");
        await expect(unit.locator("option")).toHaveText(["months", "quarters", "years"]);
        await expect(menu.getByTestId("quick-last")).toHaveAccessibleName(`Last ${monthsN} months`);
        const lastRow = menu.locator(".pk-quick-row", { has: page.getByTestId("quick-last") });
        await expect(lastRow).toContainText("Dec 2025 (");
        await expect(lastRow).toContainText(`${n(weather.filter((r) => r.Date.startsWith("2025-12")).length)} rows`);
        // the reference date shows, since the latest record lies before this month
        const anchor = menu.getByTestId("quick-anchor");
        await expect(anchor.locator("option")).toHaveText([/^today \(/, `the latest record (${day(lastDay)})`, `the first record (${day(firstDay)})`, "a date…"]);
        await expect(anchor).toHaveValue("today");
        // years, then the count: Last N years from today, the months of 2025 only, said with the data's share on the row, the chip and in the summary
        await unit.selectOption("year");
        await menu.getByTestId("quick-last-count").fill(String(yearsN));
        const rows2025 = weather.filter((r) => r.Date.startsWith("2025")).length;
        await expect(menu.getByTestId("quick-last")).toHaveAccessibleName(`Last ${yearsN} years`);
        await expect(lastRow).toContainText(`2025 (${yearsN === 2 ? "2026" : `2026–${thisYear}`} ${yearsN === 2 ? "has" : "have"} no data)`);
        await expect(lastRow).toContainText(`${n(rows2025)} rows`);
        await expect(menu.getByTestId("quick-last")).toBeChecked();
        const share = `last ${yearsN} years (2025; ${yearsN === 2 ? "2026 has" : `2026–${thisYear} have`} no data)`;
        await expect(badge(page, MONTH)).toHaveText(share);
        await expect.poll(async () => (await bodyRows(page)).map((r) => r[0])).toEqual(MONTHS.map((m) => `${m} 2025`));
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("12 of 36 months shown");
        await expect(menu.getByTestId("filter-summary-why")).toHaveText(`24 outside ${share}`);
        await expect(menu.getByTestId("filter-summary-meta")).toContainText(`${n(rows2025)} of ${n(weather.length)} rows`);
        // a quick choice is no rule: Rules says none, but opens with the choice as a line to read; Pick items folds
        await expect(menu.getByTestId("section-rules")).toContainText("No rules");
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByTestId("section-picks")).toHaveAttribute("aria-expanded", "false");
        await expect(menu.getByTestId("rule-quick")).toHaveText(`Quick choice: ${share}change it above`);
        // the months left out keep their ticks in a folded group at the end, not among the others
        await menu.getByTestId("section-picks").click();
        await expect(menu.locator(".pk-values > .pk-value")).toHaveCount(12);
        await expect(menu.getByTestId("tail-toggle")).toHaveText("Left out by the rules (24) – their ticks apply again once they go");
        await expect(menu.getByTestId("tail-list")).toHaveCount(0);
        await menu.getByTestId("tail-toggle").click();
        await expect(menu.getByTestId("tail-list").locator("input:checked")).toHaveCount(24);
        await expect(menu.locator(".pk-filter-level")).not.toContainText("left out by a rule");
        // counted back from the latest record: the same two years are 2024 and 2025, and This year (2025) is offered
        await anchor.selectOption("latest");
        await expect(badge(page, MONTH)).toHaveText(`last ${yearsN} years to 2025`);
        await expect.poll(async () => (await bodyRows(page)).length).toBe(yearsN === 2 ? 24 : 36);
        await expect(menu.getByTestId("quick-this")).toBeVisible();
        await expect(menu.getByTestId("quick-hidden")).toHaveCount(0);
        // back to months: the count reaches the data, so it stays
        await unit.selectOption("month");
        await expect(menu.getByTestId("quick-last")).toHaveAccessibleName(`Last ${yearsN} months`);
        await menu.getByTestId("quick-last-count").fill("12");
        await expect(badge(page, MONTH)).toHaveText("last 12 months to Dec 2025");
        await expect.poll(async () => (await bodyRows(page)).map((r) => r[0])).toEqual(MONTHS.map((m) => `${m} 2025`));
        // the first level says the same words
        await menu.getByTestId("level-back").click();
        await expect(menu.getByTestId("topic-state-filter")).toHaveText("● last 12 months to Dec 2025");
    });

    test("a rule on the total that nothing meets: the summary and the rule's line say so with the nearest totals; the i explains the Grand Total", async ({ page }) => {
        await openView(page, "weather", cyclic());
        // the Grand Total of each month as the table writes it
        const totals = (await bodyRows(page)).map((r) => [r[0], r.at(-1)]);
        const byValue = [...totals].sort((a, b) => Number(a[1]) - Number(b[1]));
        const [low, high] = [byValue[0], byValue[byValue.length - 1]];
        const spread = `the totals go from ${low[1]} (${low[0]}) to ${high[1]} (${high[0]})`;
        await chipMenu(page, CYCLIC, "filter");
        const menu = page.locator(".pk-chip-menu");
        // the rules are folded without one: open them, add a rule on the total
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "false");
        await menu.getByTestId("section-rules").click();
        await menu.getByTestId("rule-add-total").click();
        await expect(menu.getByTestId("rule-result")).toHaveText("Applies once it is complete.");
        await menu.getByTestId("value-filter-number").fill("25");
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("Nothing shown");
        await expect(menu.getByTestId("filter-summary")).toHaveClass(/pk-summary-empty/);
        await expect(menu.getByTestId("filter-summary-why")).toHaveText(`No month has a total Average of Mean °C that is greater than 25 – ${spread}.`);
        await expect(menu.getByTestId("rule-result")).toHaveText(`Keeps 0 of 12 months – ${spread}.`);
        await expect(menu.getByTestId("rule-result")).toHaveClass(/pk-rule-result-empty/);
        await expect.poll(async () => (await bodyRows(page)).length).toBe(0);
        // the rule is one: a dot and its count on the header
        await expect(menu.getByTestId("section-rules")).toContainText("1 rule");
        // the i: the total is the month's Grand Total over all cities and the data's dates
        await menu.getByTestId("rule-info").click();
        const info = menu.getByTestId("rule-info-text");
        await expect(info).toContainText("The total is the month’s Grand Total");
        await expect(info).toContainText(`all 14 City items and the dates ${day(firstDay)} – ${day(lastDay)}`);
        await expect(info).toContainText("not a single cell");
        // the other way round every month stays
        await menu.getByTestId("value-filter-op").selectOption("<");
        await expect(menu.getByTestId("rule-result")).toHaveText("Keeps 12 of 12 months");
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("All 12 months shown");
        await expect.poll(async () => (await bodyRows(page)).length).toBe(12);
        // Remove beside Rules takes it off; the rules fold, the items open
        await menu.getByTestId("filter-remove-rules").click();
        await expect(menu.getByTestId("rule")).toHaveCount(0);
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "false");
        await expect(menu.getByTestId("section-picks")).toHaveAttribute("aria-expanded", "true");
    });

    test("the sections fold on every change between no rule and one, and back; a fold by hand holds until the next change", async ({ page }) => {
        // Years combined: untick, tick, untick again - the fold follows every time
        await openView(page, "weather", cyclic());
        await chipMenu(page, CYCLIC, "filter");
        const menu = page.locator(".pk-chip-menu");
        const picks = menu.getByTestId("section-picks");
        const rules = menu.getByTestId("section-rules");
        await expect(picks).toHaveAttribute("aria-expanded", "true");
        await expect(rules).toHaveAttribute("aria-expanded", "false");
        await menu.getByTestId("year-2024").click();
        await expect(picks).toHaveAttribute("aria-expanded", "false");
        await expect(rules).toHaveAttribute("aria-expanded", "true");
        await menu.getByTestId("year-2024").click();
        await expect(picks).toHaveAttribute("aria-expanded", "true");
        await expect(rules).toHaveAttribute("aria-expanded", "false");
        await menu.getByTestId("year-2024").click();
        await expect(picks).toHaveAttribute("aria-expanded", "false");
        await expect(rules).toHaveAttribute("aria-expanded", "true");
        // opened by hand: the next change leaves it, the one after folds again
        await picks.click();
        await expect(picks).toHaveAttribute("aria-expanded", "true");
        await menu.getByTestId("year-2024").click();
        await expect(picks).toHaveAttribute("aria-expanded", "true");
        await expect(rules).toHaveAttribute("aria-expanded", "true");
        await menu.getByTestId("year-2024").click();
        await expect(picks).toHaveAttribute("aria-expanded", "false");
        await expect(rules).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        // Quick choices on a grouping by quarter: All, Last 2 years, All, Last 2 years
        const QUARTER = "Date by quarter";
        await openView(page, "weather", { derived: [{ name: QUARTER, field: "Date", by: "yearQuarter" }], rows: [QUARTER], values: [{ field: "Mean °C", agg: "average" }] });
        await chipMenu(page, QUARTER, "filter");
        await expect(picks).toHaveAttribute("aria-expanded", "true");
        for (let i = 0; i < 2; i++) {
            await menu.getByTestId("quick-last").check();
            await expect(picks).toHaveAttribute("aria-expanded", "false");
            await expect(rules).toHaveAttribute("aria-expanded", "true");
            await menu.getByTestId("quick-all").check();
            await expect(picks).toHaveAttribute("aria-expanded", "true");
            await expect(rules).toHaveAttribute("aria-expanded", "false");
        }
    });

    test("Reset filter, Clear and Remove are disabled, and look so, exactly while they would change nothing; change it above goes to the choice", async ({ page }) => {
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        const menu = page.locator(".pk-chip-menu");
        const reset = menu.getByTestId("filter-reset");
        const clear = menu.getByTestId("filter-clear-picks");
        const remove = menu.getByTestId("filter-remove-rules");
        /** How a text action looks: a disabled one is muted without a pointer; an enabled one has a hover background and no underline. */
        const look = (el) => el.evaluate((b) => {
            const s = getComputedStyle(b);
            return { cursor: s.cursor, underline: s.textDecorationLine, color: s.color, muted: getComputedStyle(b.closest(".pk-root") ?? document.documentElement).getPropertyValue("--pk-muted").trim() };
        });
        for (const button of [reset, clear, remove]) {
            await expect(button).toBeDisabled();
            const l = await look(button);
            expect(l.cursor).not.toBe("pointer");
            expect(l.underline).toBe("none");
        }
        // one month only: Clear and Reset can act, Remove not (no rule)
        const jan = menu.locator(".pk-value", { hasText: "Jan 2023" });
        await jan.hover();
        await jan.locator(".pk-only").click();
        await expect(clear).toBeEnabled();
        await expect(reset).toBeEnabled();
        await expect(remove).toBeDisabled();
        expect((await look(reset)).underline).toBe("none");
        await reset.hover();
        expect((await look(reset)).cursor).toBe("pointer");
        // a quick choice is no rule: Remove stays disabled, Reset can act
        await reset.click();
        await expect(reset).toBeDisabled();
        await menu.getByTestId("quick-last").check();
        await expect(remove).toBeDisabled();
        await expect(reset).toBeEnabled();
        await expect(clear).toBeDisabled();
        // a rule: Remove can act; Remove leaves the quick choice, so Reset still can
        await menu.getByTestId("rule-add-total").click();
        await menu.getByTestId("value-filter-number").fill("0");
        await expect(remove).toBeEnabled();
        await remove.click();
        await expect(remove).toBeDisabled();
        await expect(reset).toBeEnabled();
        await expect(menu.getByTestId("quick-last")).toBeChecked();
        // "change it above" with the choices folded: unfolds them, the checked choice takes the focus and is in view
        await menu.getByTestId("section-quick").click();
        await expect(menu.getByTestId("quick-choices")).toHaveCount(0);
        await menu.getByTestId("rule-quick-change").click();
        await expect(menu.getByTestId("quick-last")).toBeFocused();
        await expect(menu.getByTestId("quick-last")).toBeInViewport();
        // the same for Years combined: the first year ticked
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await openView(page, "weather", cyclic());
        await chipMenu(page, CYCLIC, "filter");
        await menu.getByTestId("year-2023").click();
        await menu.getByTestId("section-years").click();
        await menu.getByTestId("rule-quick-change").click();
        await expect(menu.getByTestId("year-2024")).toBeFocused();
        await expect(menu.getByTestId("fsection-years")).toContainText("2023");
    });

    test("in German: the summary, the share of a quick choice, the reference date", async ({ page }) => {
        await openView(page, "weather", monthly(), "de");
        await chipMenu(page, MONTH, "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("Alle 36 Monate gezeigt");
        await expect(menu.getByTestId("quick-hidden")).toHaveText(`Dieses Jahr (${thisYear}) wird nicht angeboten: die Daten enden am ${new Date(`${lastDay}T00:00Z`).toLocaleDateString("de-DE", { dateStyle: "medium", timeZone: "UTC" })}.`);
        await expect(menu.getByTestId("fsection-quick")).toContainText("Gezählt ab");
        const yearsN = thisYear - lastYear + 1;
        await menu.getByTestId("quick-last-unit").selectOption("year");
        await expect(menu.getByTestId("quick-last-unit").locator("option")).toHaveText(["Monate", "Quartale", "Jahre"]);
        await menu.getByTestId("quick-last-count").fill(String(yearsN));
        const share = `letzte ${yearsN} Jahre (2025; ${yearsN === 2 ? "2026 hat" : `2026–${thisYear} haben`} keine Daten)`;
        await expect(badge(page, MONTH)).toHaveText(share);
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("12 der 36 Monate gezeigt");
        await expect(menu.getByTestId("filter-summary-why")).toHaveText(`24 außerhalb von ${share}`);
        await expect(menu.getByTestId("rule-quick")).toContainText(`Schnellauswahl: ${share}`);
        await expect(menu.getByTestId("section-rules")).toContainText("Keine Regeln");
    });
});

test.describe("the Filter level on data that reach today (endoflife)", () => {
    const YEAR = "Released by year";
    const MONTHLY = "Released by month";
    const released = eol.map((r) => r.Released).filter(Boolean).sort();
    const months = [...new Set(released.map((d) => d.slice(0, 7)))];

    test.beforeAll(() => {
        expect(Number(released[released.length - 1].slice(0, 4)), "the endoflife snapshot reaches this year").toBe(thisYear);
    });

    test("This year is offered, nothing is hidden and the reference date waits under More choices", async ({ page }) => {
        await openView(page, "endoflife", { derived: [{ name: YEAR, field: "Released", by: "year" }], rows: [YEAR], values: [{ agg: "count" }] });
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("quick-this")).toBeVisible();
        await expect(menu.getByTestId("quick-hidden")).toHaveCount(0);
        await expect(menu.getByTestId("quick-anchor")).toHaveCount(0);
        await menu.getByTestId("quick-more").click();
        await expect(menu.getByTestId("quick-more-body").getByTestId("quick-anchor")).toHaveValue("today");
        await menu.getByTestId("quick-more").click();
        // the smallest count that reaches the latest record would be one year, which This year is already: two
        await expect(menu.getByTestId("quick-last")).toHaveAccessibleName("Last 2 years");
        await expect(menu.getByTestId("filter-summary-meta")).toContainText(`data ${day(released[0])} – ${day(released[released.length - 1])}`);
        await menu.getByTestId("quick-this").check();
        await expect(badge(page, YEAR)).toHaveText(`this year (${thisYear})`);
        const years = new Set(released.map((d) => d.slice(0, 4))).size;
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(`1 of ${years} years shown`);
    });

    test("a grouping with hundreds of items: its rule picks the item from a searchable list, never a native select", async ({ page }) => {
        await openView(page, "endoflife", { derived: [{ name: MONTHLY, field: "Released", by: "yearMonth" }], rows: [MONTHLY], values: [{ agg: "count" }] });
        await chipMenu(page, MONTHLY, "filter");
        const menu = page.locator(".pk-chip-menu");
        await menu.getByTestId("section-rules").click();
        await menu.getByTestId("rule-add-item").click();
        const value = menu.getByTestId("rule-item-value");
        await expect(value).toHaveJSProperty("tagName", "BUTTON");
        await expect(value).toHaveAttribute("aria-haspopup", "listbox");
        await expect(menu.locator('select[data-testid="rule-item-value"]')).toHaveCount(0);
        // the picker: a search over the months, the matches listed inside the window, the count said
        await value.click();
        const search = page.getByTestId("picker-search");
        await expect(search).toBeFocused();
        await expect(page.getByTestId("picker-list")).toBeInViewport();
        await expect(page.getByTestId("picker-count")).toHaveText(`${n(months.length)} of ${n(months.length)} match`);
        await search.fill("2024");
        const in2024 = months.filter((m) => m.startsWith("2024"));
        await expect(page.getByTestId("picker-count")).toHaveText(`${in2024.length} of ${n(months.length)} match`);
        await expect(page.getByTestId("picker-option")).toHaveCount(in2024.length);
        await expect(page.getByTestId("picker-option").first()).toHaveText(/^Jan 2024/);
        // the arrow keys and Enter: the second match applies, the chip says it, the table starts there
        await search.press("ArrowDown");
        await search.press("Enter");
        await expect(page.getByTestId("picker-list")).toHaveCount(0);
        await expect(badge(page, MONTHLY)).toHaveText("from Feb 2024");
        await expect(value).toHaveText("Feb 2024");
        await expect.poll(async () => (await bodyRows(page))[0]?.[0]).toBe("Feb 2024");
        await expect.poll(async () => (await bodyRows(page)).length).toBe(months.filter((m) => m >= "2024-02").length);
        await expect(menu.getByTestId("rule-result")).toHaveText(`Keeps ${months.filter((m) => m >= "2024-02").length} of ${months.length} months`);
        // Escape closes the list and leaves the rule as it is, the focus back on the button
        await value.click();
        await expect(search).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("picker-list")).toHaveCount(0);
        await expect(value).toBeFocused();
        await expect(badge(page, MONTHLY)).toHaveText("from Feb 2024");
    });
});

// What the owner's hands-on test and the review found on the rebuilt Filter level (weather, to Dec 31, 2025).
test.describe("the Filter level: findings of the hands-on test (weather)", () => {
    const rule = (op, value, extra = {}) => ({ field: CYCLIC, type: "compare", op, value, ...extra });
    const wholeYear = (y) => rule("between", `${y}-01-01`, { value2: `${y}-12-31` });
    const menuOf = (page) => page.locator(".pk-chip-menu");
    /** The focused element inside the menu has a test id: it is on a control, not lost to the page body. */
    const focusedId = (page) => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName);

    test("the summary names the items left out, not the number of rules; a total rule says total; a quick choice alone has its own sentence", async ({ page }) => {
        // two rules on the item (from Apr, until Nov) leave four months out: "4", not "2"
        await openView(page, "weather", cyclic({ filters: [rule(">=", 4), rule("<=", 11)] }));
        await chipMenu(page, CYCLIC, "filter");
        const menu = menuOf(page);
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("8 of 12 months shown");
        await expect(menu.getByTestId("filter-summary-why")).toHaveText("4 left out by the rules");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        // one rule, three months out: the form of "rule" follows the rules, the number the months
        await openView(page, "weather", cyclic({ filters: [rule(">=", 4)] }));
        await chipMenu(page, CYCLIC, "filter");
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("9 of 12 months shown");
        await expect(menu.getByTestId("filter-summary-why")).toHaveText("3 left out by the rule");
        // a rule on the total reads "items whose total Average of Mean °C is ..."
        await menu.getByTestId("rule-add-total").click();
        await expect(menu.locator('[data-kind="total"]')).toContainText(/items whose total\s*Average of Mean °C/);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        // only Years combined: neither "the rules keep them all" nor "no rules" for the same state
        await openView(page, "weather", cyclic({ filters: [wholeYear(2025)] }));
        await chipMenu(page, CYCLIC, "filter");
        await expect(menu.getByTestId("section-rules")).toContainText("No rules");
        await expect(menu.getByTestId("filter-summary-why")).toHaveText("Every item is picked; 2025 only.");
    });

    test("Years combined and a comparison rule live side by side: a year toggled keeps the rule, the rule shows once", async ({ page }) => {
        await openView(page, "weather", cyclic({ filters: [wholeYear(2025), rule(">=", 6)] }));
        await chipMenu(page, CYCLIC, "filter");
        const menu = menuOf(page);
        await expect(menu.getByTestId("year-2025")).toHaveAttribute("aria-pressed", "true");
        await expect(menu.getByTestId("year-2023")).toHaveAttribute("aria-pressed", "false");
        await expect(menu.getByTestId("filter-summary-meta")).toContainText("2025 only");
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-item-op")).toHaveValue(">=");
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("7 of 12 months shown");
        // toggling a year keeps "is from Jun"
        await menu.getByTestId("year-2024").click();
        await expect(menu.getByTestId("year-2024")).toHaveAttribute("aria-pressed", "true");
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-item-op")).toHaveValue(">=");
        await expect(menu.getByTestId("filter-summary-meta")).toContainText("2024–2025 combined");
        await expect.poll(async () => (await bodyRows(page)).length).toBe(7);
        await menu.getByTestId("year-2024").click();
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("filter-summary-meta")).toContainText("2025 only");
    });

    test("text actions are quiet buttons: no underline, padding, a hover background; muted when disabled", async ({ page }) => {
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        const menu = menuOf(page);
        const style = (el) => el.evaluate((b) => {
            const s = getComputedStyle(b);
            return { underline: s.textDecorationLine, padding: parseFloat(s.paddingLeft), background: s.backgroundColor };
        });
        for (const id of ["select-all", "select-none", "filter-clear-picks", "filter-reset", "filter-remove-rules"]) {
            const l = await style(menu.getByTestId(id));
            expect(l.underline, id).toBe("none");
            expect(l.padding, id).toBeGreaterThan(2);
        }
        const none = (await style(menu.getByTestId("select-all"))).background;
        await menu.getByTestId("select-all").hover();
        await expect.poll(async () => (await style(menu.getByTestId("select-all"))).background, "hover background").not.toBe(none);
        // the quick-choice line's "change it above" is the same kind of button
        await menu.getByTestId("quick-last").check();
        const change = menu.getByTestId("rule-quick-change");
        expect((await style(change)).underline).toBe("none");
        await change.hover();
        await expect.poll(async () => (await style(change)).background).not.toBe(none);
    });

    test("one word for one thing: the radio, the chip and the search hit say the same", async ({ page }) => {
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        const menu = menuOf(page);
        await menu.getByTestId("quick-last-count").fill("1");
        await expect(menu.getByTestId("quick-last")).toBeChecked();
        await expect(menu.getByTestId("quick-last")).toHaveAccessibleName("Last 1 month");
        await expect(badge(page, MONTH)).toHaveText(/^last 1 month /);
        await page.keyboard.press("Escape");
        // the search: a hit for "Last 3 years" says what the chip will say after it
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH);
        const search = menu.getByTestId("menu-search");
        await search.fill("last 3 years");
        const hit = menu.getByTestId("menu-search-hits").locator('[role^="menuitem"]', { hasText: "Last 3 years" }).first();
        const hitText = (await hit.innerText()).replace(/\s+/g, " ");
        await hit.click();
        const chip = (await badge(page, MONTH).innerText()).replace(/\s+/g, " ");
        expect(chip).toMatch(/^last 3 years \(/);
        expect(hitText).toContain(chip.charAt(0).toUpperCase() + chip.slice(1));
    });

    test("the quick choices describe each radio (aria-describedby), the months and years as well as All", async ({ page }) => {
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        const menu = menuOf(page);
        await menu.getByTestId("quick-more").click();
        for (const id of ["quick-all", "quick-this", "quick-last", "quick-next", "quick-before"]) {
            const radio = menu.getByTestId(id);
            if (!(await radio.count())) continue;
            const text = await radio.evaluate((el) => {
                const ref = el.getAttribute("aria-describedby");
                return ref ? (el.getRootNode().getElementById(ref)?.textContent ?? "") : null;
            });
            expect(text, id).toMatch(/rows/);
        }
        await expect(menu.getByTestId("quick-last")).toHaveAttribute("aria-describedby", /.+/);
        await expect(menu.getByTestId("quick-before")).toHaveAttribute("aria-describedby", /.+/);
    });

    test("the left-out group, expanded, shows its first item", async ({ page }) => {
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        const menu = menuOf(page);
        await menu.getByTestId("quick-last").check();
        await menu.getByTestId("section-picks").click();
        const toggle = menu.getByTestId("tail-toggle");
        await toggle.scrollIntoViewIfNeeded();
        await toggle.click();
        const first = menu.getByTestId("tail-list").locator("li").first();
        await expect(first).toBeVisible();
        // inside what its scrolling parent shows, not below its edge
        await expect.poll(() => first.evaluate((el) => {
            let p = el.parentElement;
            while (p && !(p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
            if (!p) return true;
            const [a, b] = [el.getBoundingClientRect(), p.getBoundingClientRect()];
            return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
        })).toBe(true);
    });

    test("the searchable picker closes on a press elsewhere in the menu; one Escape closes only the picker", async ({ page }) => {
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        const menu = menuOf(page);
        await menu.getByTestId("section-rules").click();
        await menu.getByTestId("rule-add-item").click();
        const value = menu.getByTestId("rule-item-value");
        await value.click();
        await expect(page.getByTestId("picker-list")).toBeVisible();
        await menu.getByTestId("filter-summary-head").click();
        await expect(page.getByTestId("picker-list")).toHaveCount(0);
        await expect(menu.getByTestId("filter-summary")).toBeVisible();
        // Escape: the picker only, the level stays
        await value.click();
        await expect(page.getByTestId("picker-search")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("picker-list")).toHaveCount(0);
        await expect(menu.getByTestId("filter-summary")).toBeVisible();
        await expect(value).toBeFocused();
    });

    test("the focus stays on a control of the level after Clear and after the last rule goes", async ({ page }) => {
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        const menu = menuOf(page);
        // Clear by mouse
        await menu.getByTestId("select-none").click();
        await expect(menu.getByTestId("filter-clear-picks")).toBeEnabled();
        await menu.getByTestId("filter-clear-picks").click();
        await expect(menu.getByTestId("filter-clear-picks")).toBeDisabled();
        await expect.poll(() => focusedId(page)).toBe("section-picks");
        // Clear by keyboard
        await menu.getByTestId("select-none").focus();
        await page.keyboard.press("Enter");
        await menu.getByTestId("filter-clear-picks").focus();
        await page.keyboard.press("Enter");
        await expect(menu.getByTestId("filter-clear-picks")).toBeDisabled();
        await expect.poll(() => focusedId(page)).toBe("section-picks");
        // Rules opened by hand, a rule added, then taken off by its x: the focus is not lost
        await menu.getByTestId("section-rules").click();
        await menu.getByTestId("rule-add-total").click();
        await menu.getByTestId("value-filter-number").fill("0");
        await expect(menu.getByTestId("rule-result")).toContainText("Keeps");
        await menu.getByTestId("rule-remove").click();
        await expect(menu.getByTestId("rule")).toHaveCount(0);
        await expect.poll(async () => (await focusedId(page)) !== "BODY").toBe(true);
        await expect(page.locator(".pk-chip-menu :focus")).toHaveCount(1);
    });

    test("change it above puts the focus (document.activeElement) on the active control, also with one year on", async ({ page }) => {
        const active = () => page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
        // Years combined with 2025 only: that toggle is disabled, so the first year that can take the focus gets it
        await openView(page, "weather", cyclic({ filters: [wholeYear(2025)] }));
        await chipMenu(page, CYCLIC, "filter");
        const menu = menuOf(page);
        await menu.getByTestId("section-years").click();
        await expect(menu.getByTestId("years-combined")).toHaveCount(0);
        await menu.getByTestId("rule-quick-change").click();
        await expect(menu.getByTestId("years-combined")).toBeVisible();
        await expect.poll(active).toBe("year-2023");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        // Quick choices: the checked radio
        await openView(page, "weather", monthly());
        await chipMenu(page, MONTH, "filter");
        await menu.getByTestId("quick-last").check();
        await menu.getByTestId("section-quick").click();
        await expect(menu.getByTestId("quick-choices")).toHaveCount(0);
        await menu.getByTestId("rule-quick-change").click();
        await expect.poll(active).toBe("quick-last");
    });

    /**
     * The chip's name and badges and whether each is whole (its text within its box, also the cut
     * text of a badge in words); the label's title, what hovering the chip shows.
     */
    const chipParts = (page, chip) =>
        page.locator(`.pk-chip[data-chip="${chip}"]`).evaluate((el) => {
            const whole = (e) => e.scrollWidth <= e.clientWidth;
            const name = el.querySelector(".pk-chip-name");
            const em = parseFloat(getComputedStyle(name).fontSize);
            return {
                badges: [...el.querySelectorAll("span.pk-chip-badge")].map((b) => ({ text: b.textContent, whole: whole(b) && [...b.querySelectorAll(".pk-badge-cut")].every(whole) })),
                name: { text: name.textContent, whole: whole(name), ems: name.clientWidth / em, overflow: getComputedStyle(name).textOverflow },
                cut: [...el.querySelectorAll(".pk-badge-cut")].map((c) => ({ whole: whole(c), overflow: getComputedStyle(c).textOverflow })),
                title: el.querySelector(".pk-chip-label").getAttribute("title")
            };
        });
    /** The chip's title is its accessible name: the field and every state word. */
    const titleIsName = async (page, chip, title) => {
        expect(title).toBeTruthy();
        await expect(page.getByTestId(`chip-menu-${chip}`)).toHaveAccessibleName(title);
    };

    test("a desktop shows every badge whole; a phone cuts a rule to “…” and keeps the name; the chip's tooltip says it all", async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        // the chip of the hands-on test: a field named "Month" by month of the year, 2025 only, two months
        // unticked ("10 of 12", "2025"); a name this short made the badge show "2(" on a desktop
        const SHORT = "Month";
        const picked = { derived: [{ name: SHORT, field: "Date", by: "month" }], rows: [SHORT], cols: ["City"], values: [{ field: "Mean °C", agg: "average" }], filters: [{ ...wholeYear(2025), field: SHORT }, { field: SHORT, type: "exclude", items: [1, 2] }] };
        await openView(page, "weather", picked);
        let parts = await chipParts(page, SHORT);
        expect(parts.badges).toEqual([{ text: "10 of 12", whole: true }, { text: "2025", whole: true }]);
        expect(parts.name).toMatchObject({ text: SHORT, whole: true });
        expect(parts.title).toBe(`${SHORT}, filtered 10 of 12, 2025`);
        await titleIsName(page, SHORT, parts.title);
        // the other badges on a chip: a comparison with "+1" and a value condition, Top N and the sort,
        // and a value shown as a share with a format
        const by = { field: "Mean °C", agg: "average" };
        await openView(page, "weather", {
            derived: [{ name: SHORT, field: "Date", by: "month" }],
            rows: [SHORT],
            cols: ["City"],
            filters: [
                { ...wholeYear(2025), field: SHORT },
                { ...rule(">=", 6), field: SHORT },
                { field: "City", type: "top", count: 5, by },
                { field: SHORT, type: "value", op: ">", value: 10, by }
            ],
            sort: [{ field: "City", order: "desc" }],
            values: [{ field: "Mean °C", agg: "sum", showAs: "percentOfGrandTotal", format: "percent" }]
        });
        parts = await chipParts(page, SHORT);
        expect(parts.badges).toEqual([{ text: "2025 +1", whole: true }, { text: "Average of Mean °C > 10", whole: true }]);
        expect(parts.name).toMatchObject({ text: SHORT, whole: true });
        expect(parts.title).toBe(`${SHORT}, 2025, from Jun, Average of Mean °C > 10`);
        await titleIsName(page, SHORT, parts.title);
        parts = await chipParts(page, "City");
        expect(parts.badges).toEqual([{ text: "Top 5", whole: true }]);
        expect(parts.title).toBe("City, Top 5, sorted Z to A");
        await titleIsName(page, "City", parts.title);
        const share = "% of grand total of Mean °C";
        parts = await chipParts(page, share);
        expect(parts).toMatchObject({ badges: [], name: { text: share, whole: true }, title: share });
        await titleIsName(page, share, share);
        // a quick choice next to the filter count (a time line, the months of its last year, one month
        // unticked): its words take more than half the zone's width next to the field list, so that folds
        const yearsN = thisYear - lastYear + 1;
        await openView(page, "weather", {
            derived: [{ name: SHORT, field: "Date", by: "yearMonth" }],
            rows: [SHORT],
            values: [{ field: "Mean °C", agg: "average" }],
            filters: [{ field: SHORT, type: "relative", unit: "year", count: yearsN }, { field: SHORT, type: "exclude", items: [202501] }]
        });
        await page.getByTestId("collapse-fields").click();
        await expect(page.getByTestId("field-rail")).toBeVisible();
        parts = await chipParts(page, SHORT);
        expect(parts.badges).toEqual([{ text: "35 of 36", whole: true }, { text: `last ${yearsN} years (2025; ${yearsN === 2 ? "2026 has" : `2026–${thisYear} have`} no data)`, whole: true }]);
        await titleIsName(page, SHORT, parts.title);
        // a phone, the same state on the long field name: the name keeps several words and the rule
        // ends in "…" at its floor, the title still whole
        await page.setViewportSize({ width: 390, height: 844 });
        await openView(page, "weather", cyclic({ filters: [wholeYear(2025), { field: CYCLIC, type: "exclude", items: [1, 2] }] }));
        if (!(await page.getByTestId(`chip-menu-${CYCLIC}`).isVisible())) await page.getByTestId("layout-summary").click();
        parts = await chipParts(page, CYCLIC);
        expect(parts.badges[0]).toEqual({ text: "10 of 12", whole: true });
        expect(parts.cut).toEqual([{ whole: false, overflow: "ellipsis" }]);
        expect(parts.name.ems).toBeGreaterThan(5);
        expect(parts.name.overflow).toBe("ellipsis");
        expect(parts.title).toBe(`${CYCLIC}, filtered 10 of 12, 2025`);
    });
});
