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
        await expect(menu.getByTestId("quick-thisYear")).toHaveCount(0);
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
        // "This year" would show nothing: not offered, said why; the counted choices start where the data end
        await expect(menu.getByTestId("quick-thisYear")).toHaveCount(0);
        await expect(menu.getByTestId("quick-hidden")).toHaveText(`This year (${thisYear}) is not offered: the data end ${day(lastDay)}.`);
        const yearsN = thisYear - lastYear + 1;
        await expect(menu.getByTestId("quick-years")).toHaveAccessibleName(`Last ${yearsN} years`);
        const rows2025 = weather.filter((r) => r.Date.startsWith("2025")).length;
        const yearsRow = menu.locator(".pk-quick-row", { has: page.getByTestId("quick-years") });
        await expect(yearsRow).toContainText(`2025 (${yearsN === 2 ? "2026" : `2026–${thisYear}`} ${yearsN === 2 ? "has" : "have"} no data)`);
        await expect(yearsRow).toContainText(`${n(rows2025)} rows`);
        const monthsRow = menu.locator(".pk-quick-row", { has: page.getByTestId("quick-months") });
        await expect(monthsRow).toContainText("Dec 2025 (");
        await expect(monthsRow).toContainText(`${n(weather.filter((r) => r.Date.startsWith("2025-12")).length)} rows`);
        // the reference date shows, since the latest record lies before this month
        const anchor = menu.getByTestId("quick-anchor");
        await expect(anchor.locator("option")).toHaveText([/^today \(/, `the latest record (${day(lastDay)})`]);
        await expect(anchor).toHaveValue("today");
        // Last N years from today: the months of 2025 only, said with the data's share on the chip and in the summary
        await menu.getByTestId("quick-years").check();
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
        await expect(menu.getByTestId("quick-thisYear")).toBeVisible();
        await expect(menu.getByTestId("quick-hidden")).toHaveCount(0);
        await menu.getByTestId("quick-months").check();
        await expect(menu.getByTestId("quick-months")).toHaveAccessibleName("Last 1 month");
        await menu.getByTestId("quick-months-count").fill("12");
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

    test("in German: the summary, the share of a quick choice, the reference date", async ({ page }) => {
        await openView(page, "weather", monthly(), "de");
        await chipMenu(page, MONTH, "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("filter-summary-head")).toHaveText("Alle 36 Monate gezeigt");
        await expect(menu.getByTestId("quick-hidden")).toHaveText(`Dieses Jahr (${thisYear}) wird nicht angeboten: die Daten enden am ${new Date(`${lastDay}T00:00Z`).toLocaleDateString("de-DE", { dateStyle: "medium", timeZone: "UTC" })}.`);
        await expect(menu.getByTestId("fsection-quick")).toContainText("Gezählt ab");
        await menu.getByTestId("quick-years").check();
        const yearsN = thisYear - lastYear + 1;
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

    test("This year is offered, nothing is hidden and no reference date is asked for", async ({ page }) => {
        await openView(page, "endoflife", { derived: [{ name: YEAR, field: "Released", by: "year" }], rows: [YEAR], values: [{ agg: "count" }] });
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("quick-thisYear")).toBeVisible();
        await expect(menu.getByTestId("quick-hidden")).toHaveCount(0);
        await expect(menu.getByTestId("quick-anchor")).toHaveCount(0);
        // the smallest count that reaches the latest record would be one year, which This year is already: two
        await expect(menu.getByTestId("quick-years")).toHaveAccessibleName("Last 2 years");
        await expect(menu.getByTestId("filter-summary-meta")).toContainText(`data ${day(released[0])} – ${day(released[released.length - 1])}`);
        await menu.getByTestId("quick-thisYear").check();
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
