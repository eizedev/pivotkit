// The Filter level's choices of view version 2 on real data, checked by what the table, the chip and
// the summary show: the rule on the name with "does not begin with" and "does not end with", "Also
// keep items without a value" on fields with blank items (nobel's Country, endoflife's EOL date), a
// date's quick choices with a unit (This, Last without the current period, Next, Before the last,
// rolling, counted from the first record or a date) on dates that reach years past today, and Top
// items with the items tied with the last one. The expected rows are computed here from the
// snapshots with plain JavaScript, relative to today as the browser sees it (the data are in UTC).
import { readFileSync } from "node:fs";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, openRules, openZones, tableRows, test } from "./fixtures.js";
import { unpack } from "../../examples/playground/data/sources.js";

const load = (name) => unpack(JSON.parse(readFileSync(new URL(`../../examples/playground/data/${name}.json`, import.meta.url), "utf8")));
const nobel = load("nobel");
const eol = load("endoflife");
const n = (x) => x.toLocaleString("en-US");

async function openView(page, data, view, lang = "en") {
    await page.goto(`?data=${data}&empty&lang=${lang}#pivot-playground=${encodeViewLink(view)}`);
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
}
/** The table's rows without the grand total, as [label, count]. */
const bodyRows = async (page) => (await tableRows(page)).filter((r) => r[0] !== "Grand Total").map((r) => [r[0], r[1]]);
const badge = (page, zone, chip) => page.locator(`[data-zone="${zone}"] .pk-chip[data-chip="${chip}"] [data-testid="rule-badge"]`);
/** Rows per value of a field, as the table writes the counts; null is the blank item. */
const countBy = (rows, key) => {
    const out = new Map();
    for (const r of rows) {
        const k = key(r);
        out.set(k, (out.get(k) ?? 0) + 1);
    }
    return out;
};

test.describe("a rule on the name and the blank items (nobel, Country: 7 laureates without one)", () => {
    const countries = countBy(nobel, (r) => r.Country ?? null);
    const blanks = countries.get(null);
    const shown = (keep) => [...countries].filter(([c]) => c !== null && keep(c.toLowerCase())).map(([c, k]) => [c, n(k)]);
    const sorted = (rows) => [...rows].sort((a, b) => (a[0] < b[0] ? -1 : 1));

    test.beforeAll(() => {
        expect(blanks, "the snapshot has laureates without a country").toBeGreaterThan(0);
    });

    test("does not begin with, does not end with; Also keep items without a value adds the blank item, for every rule, and goes again", async ({ page }) => {
        await openView(page, "nobel", { rows: ["Country"], values: [{ agg: "count" }] });
        await chipMenu(page, "Country", "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        // no rule on the items yet: nothing to keep the blanks with
        await expect(menu.getByTestId("rules-blanks")).toHaveCount(0);
        await menu.getByTestId("rule-add-name").click();
        const op = menu.getByTestId("filter-condition-op");
        await expect(op.locator("option")).toHaveText(["is", "is not", "contains", "does not contain", "begins with", "does not begin with", "ends with", "does not end with"]);
        await op.selectOption({ label: "does not begin with" });
        await menu.getByTestId("filter-condition-text").fill("united");
        await expect(badge(page, "rows", "Country")).toHaveText("does not begin with “united”");
        const notUnited = shown((c) => !c.startsWith("united"));
        await expect.poll(async () => sorted(await bodyRows(page))).toEqual(sorted(notUnited));
        await expect(menu.getByTestId("rule-result")).toHaveText(`Keeps ${notUnited.length} of ${countries.size} items`);
        // the checkbox under the rules, with the blank item's rows; ticked, the table has the blank item too
        const keep = menu.getByTestId("rules-blanks");
        await expect(keep.locator("..")).toHaveText(`Also keep items without a value (${blanks} rows)`);
        await expect(keep).not.toBeChecked();
        await keep.click();
        await expect(keep).toBeChecked();
        await expect.poll(async () => sorted(await bodyRows(page))).toEqual(sorted([...notUnited, ["(blank)", n(blanks)]]));
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(`${notUnited.length + 1} of ${countries.size} items shown`);
        // a second rule keeps them as well: both rules apply, the blank item stays
        await menu.getByTestId("rule-add-name").click();
        await menu.getByTestId("filter-condition-op").last().selectOption({ label: "does not end with" });
        await menu.getByTestId("filter-condition-text").last().fill("LAND");
        const neither = shown((c) => !c.startsWith("united") && !c.endsWith("land"));
        await expect.poll(async () => sorted(await bodyRows(page))).toEqual(sorted([...neither, ["(blank)", n(blanks)]]));
        await expect(keep).toBeChecked();
        // off: neither rule keeps them
        await keep.click();
        await expect.poll(async () => sorted(await bodyRows(page))).toEqual(sorted(neither));
        // Undo gives them back, and the checkbox follows
        await menu.getByTestId("section-rules").focus();
        await page.keyboard.press("ControlOrMeta+z");
        await expect(keep).toBeChecked();
        await expect.poll(async () => (await bodyRows(page)).some((r) => r[0] === "(blank)")).toBe(true);
    });

    test("a loaded view's “does not end with” is a rule the row edits, not one only removed", async ({ page }) => {
        await openView(page, "nobel", { version: 2, rows: ["Country"], values: [{ agg: "count" }], filters: [{ field: "Country", type: "text", op: "endsWith", value: "land", not: true, blanks: "include" }] });
        await expect(badge(page, "rows", "Country")).toHaveText("does not end with “land”");
        await chipMenu(page, "Country", "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("rule")).toHaveAttribute("data-kind", "name");
        await expect(menu.getByTestId("rule-fixed")).toHaveCount(0);
        await expect(menu.getByTestId("filter-condition-op")).toHaveValue("notEndsWith");
        await expect(menu.getByTestId("rules-blanks")).toBeChecked();
        await menu.getByTestId("filter-condition-op").selectOption({ label: "ends with" });
        await expect.poll(async () => sorted(await bodyRows(page))).toEqual(sorted([...shown((c) => c.endsWith("land")), ["(blank)", n(blanks)]]));
    });

    test("in German: the words of the operators and of the checkbox", async ({ page }) => {
        await openView(page, "nobel", { version: 2, rows: ["Country"], values: [{ agg: "count" }], filters: [{ field: "Country", type: "text", op: "beginsWith", value: "united", not: true, blanks: "exclude" }] }, "de");
        await expect(badge(page, "rows", "Country")).toHaveText("beginnt nicht mit „united“");
        await chipMenu(page, "Country", "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("filter-condition-op").locator("option")).toHaveText(["ist", "ist nicht", "enthält", "enthält nicht", "beginnt mit", "beginnt nicht mit", "endet mit", "endet nicht mit"]);
        await expect(menu.getByTestId("rules-blanks").locator("..")).toHaveText(`Auch Einträge ohne Wert behalten (${blanks} Zeilen)`);
    });
});

test.describe("a date's quick choices on dates past today (endoflife, EOL date by month)", () => {
    const EOL = "EOL date by month";
    const view = (more = {}) => ({ derived: [{ name: EOL, field: "EOL date", by: "yearMonth" }], rows: [EOL], values: [{ agg: "count" }], ...more });
    const dates = eol.map((r) => r["EOL date"]);
    const dated = dates.filter(Boolean);
    const blanks = dates.length - dated.length;
    const now = new Date();
    const [Y, M] = [now.getUTCFullYear(), now.getUTCMonth()];
    /** "2026-11" of the month `k` months after this one. */
    const monthAt = (k) => new Date(Date.UTC(Y, M + k, 1)).toISOString().slice(0, 7);
    const label = (ym) => new Date(`${ym}-01T00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    const perMonth = countBy(dated, (d) => d.slice(0, 7));
    /** The table's rows of the months from..to ("YYYY-MM", both included) that have data. */
    const monthsRows = (from, to) => [...perMonth].filter(([m]) => m >= from && m <= to).sort().map(([m, k]) => [label(m), n(k)]);
    const rowsWhere = (keep) => dated.filter(keep).length;

    test.beforeAll(() => {
        expect(blanks, "the snapshot has releases without an EOL date").toBeGreaterThan(0);
        expect(dated.some((d) => d.slice(0, 7) > monthAt(24)), "the snapshot has EOL dates two years ahead").toBe(true);
    });

    test("This [unit], Last [N] [unit] without the current period, Next and Before the last under More choices, rolling", async ({ page }) => {
        await openView(page, "endoflife", view());
        await chipMenu(page, EOL, "filter");
        const menu = page.locator(".pk-chip-menu");
        // by month: no unit finer than a month; This offers the units whose current period has data
        const thisQ = Math.floor(M / 3) * 3;
        const has = { month: perMonth.has(monthAt(0)), quarter: [0, 1, 2].some((k) => perMonth.has(monthAt(thisQ - M + k))), year: dated.some((d) => d.startsWith(String(Y))) };
        const offered = ["month", "quarter", "year"].filter((u) => has[u]);
        expect(offered, "this year has EOL dates").toContain("year");
        const thisUnit = menu.getByTestId("quick-this-unit");
        if (offered.length > 1) {
            await expect(thisUnit.locator("option")).toHaveText(offered.map((u) => `This ${u}`));
        }
        await expect(menu.getByTestId("quick-last-unit").locator("option")).toHaveText(["months", "quarters", "years"]);
        // This quarter: the months of this quarter that have data
        if (has.quarter && offered.length > 1) {
            await thisUnit.selectOption("quarter");
            await expect(menu.getByTestId("quick-this")).toBeChecked();
            await expect(badge(page, "rows", EOL)).toHaveText(new RegExp(`^this quarter \\(Q${thisQ / 3 + 1} ${Y}`));
            await expect.poll(() => bodyRows(page)).toEqual(monthsRows(monthAt(thisQ - M), monthAt(thisQ - M + 2)));
        }
        // Last 3 months, the current one left out: the three months before this one
        await menu.getByTestId("quick-last-unit").selectOption("month");
        await menu.getByTestId("quick-last-count").fill("3");
        await expect(menu.getByTestId("quick-last")).toBeChecked();
        const current = menu.getByTestId("quick-last-current");
        await expect(current.locator("..")).toHaveText(/^Include the current month/);
        await expect(current).toBeChecked();
        await expect.poll(() => bodyRows(page)).toEqual(monthsRows(monthAt(-2), monthAt(0)));
        await current.click();
        await expect(current).not.toBeChecked();
        await expect.poll(() => bodyRows(page)).toEqual(monthsRows(monthAt(-3), monthAt(-1)));
        await expect(badge(page, "rows", EOL)).toHaveText(`last 3 months, current period excluded (${label(monthAt(-3))}–${label(monthAt(-1))})`);
        // More choices: Next 2 months, this one included
        await expect(menu.getByTestId("quick-next")).toHaveCount(0);
        await menu.getByTestId("quick-more").click();
        await expect(menu.getByTestId("quick-more")).toHaveAttribute("aria-expanded", "true");
        await menu.getByTestId("quick-next").click();
        await menu.getByTestId("quick-next-count").fill("2");
        await expect.poll(() => bodyRows(page)).toEqual(monthsRows(monthAt(0), monthAt(1)));
        await expect(menu.getByTestId("quick-next-current")).toBeChecked();
        await expect(menu.getByTestId("quick-last-current")).toHaveCount(0);
        // Before the last 10 years: every EOL date before January of the tenth year back
        await menu.getByTestId("quick-before").click();
        await menu.getByTestId("quick-before-unit").selectOption("year");
        await menu.getByTestId("quick-before-count").fill("10");
        const cut = `${Y - 9}-01-01`;
        await expect(menu.getByTestId("filter-summary-meta")).toContainText(`${n(rowsWhere((d) => d < cut))} of ${n(eol.length)} rows`);
        await expect(badge(page, "rows", EOL)).toHaveText(`before the last 10 years (until Dec 31, ${Y - 10})`);
        // rolling: before the same day ten years ago, not before a whole year; no "current period" then
        await menu.getByTestId("quick-rolling").click();
        await expect(menu.getByTestId("quick-before-current")).toHaveCount(0);
        const tenYearsAgo = new Date(Date.UTC(Y - 10, M, now.getUTCDate())).toISOString().slice(0, 10);
        await expect(menu.getByTestId("filter-summary-meta")).toContainText(`${n(rowsWhere((d) => d <= tenYearsAgo))} of ${n(eol.length)} rows`);
        await expect(badge(page, "rows", EOL)).toHaveText(/^before the last 10 years, rolling \(until /);
        // the menu opened again: More choices open with the choice that is set, its settings kept
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await chipMenu(page, EOL, "filter");
        await expect(menu.getByTestId("quick-more")).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByTestId("quick-before")).toBeChecked();
        await expect(menu.getByTestId("quick-before-count")).toHaveValue("10");
        await expect(menu.getByTestId("quick-before-unit")).toHaveValue("year");
        await expect(menu.getByTestId("quick-rolling")).toBeChecked();
        // All takes the choice off
        await menu.getByTestId("quick-all").click();
        await expect(badge(page, "rows", EOL)).toHaveCount(0);
    });

    test("counted from a date or the first record: the ranges move with it; the blank dates kept with the choice", async ({ page }) => {
        await openView(page, "endoflife", view());
        await chipMenu(page, EOL, "filter");
        const menu = page.locator(".pk-chip-menu");
        // the data reach past this month: the reference date waits under More choices
        await expect(menu.getByTestId("quick-anchor")).toHaveCount(0);
        await menu.getByTestId("quick-more").click();
        const anchor = menu.getByTestId("quick-anchor");
        const first = [...dated].sort()[0];
        await expect(anchor.locator("option")).toHaveText([/^today \(/, /^the latest record \(/, `the first record (${new Date(`${first}T00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })})`, "a date…"]);
        // a date of its own: Last 3 months to June 2024
        await anchor.selectOption("date");
        await menu.getByTestId("quick-anchor-date").fill("2024-06-30");
        await menu.getByTestId("quick-last-unit").selectOption("month");
        await menu.getByTestId("quick-last-count").fill("3");
        await expect(menu.getByTestId("quick-last")).toBeChecked();
        await expect.poll(() => bodyRows(page)).toEqual(monthsRows("2024-04", "2024-06"));
        await expect(badge(page, "rows", EOL)).toHaveText(/^last 3 months, counted from Jun 30, 2024 \(/);
        // the reference stays where it was, among More choices, while it is used
        await expect(menu.getByTestId("quick-more-body").getByTestId("quick-anchor")).toHaveValue("date");
        // the first record: the three months up to its month
        await anchor.selectOption("first");
        await expect.poll(() => bodyRows(page)).toEqual(monthsRows(new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 3, 1)).toISOString().slice(0, 7), first.slice(0, 7)));
        // the blank dates: kept with the quick choice when ticked, the rows said
        await anchor.selectOption("today");
        await menu.getByTestId("quick-last-count").fill("2");
        await menu.getByTestId("quick-last-unit").selectOption("year");
        await openRules(menu);
        const keep = menu.getByTestId("rules-blanks");
        await expect(keep.locator("..")).toHaveText(`Also keep items without a value (${n(blanks)} rows)`);
        const lastTwo = [...perMonth].filter(([m]) => m >= `${Y - 1}-01` && m <= `${Y}-12`).length;
        await expect.poll(async () => (await bodyRows(page)).length).toBe(lastTwo);
        await keep.click();
        await expect.poll(async () => (await bodyRows(page)).at(-1)).toEqual(["(blank)", n(blanks)]);
        await expect(menu.getByTestId("quick-last")).toBeChecked();
        // another count keeps the blanks: the choice is still the one with the blanks
        await menu.getByTestId("quick-last-count").fill("3");
        await expect(badge(page, "rows", EOL)).toHaveText(new RegExp(`^last 3 years \\(${Y - 2}–${Y}\\)`));
        await expect.poll(async () => (await bodyRows(page)).at(-1)).toEqual(["(blank)", n(blanks)]);
        await expect(keep).toBeChecked();
    });

    test("on data that end before today: the include checkbox says the current month has no data (weather)", async ({ page }) => {
        const weather = load("weather");
        const last = weather.map((r) => r.Date).sort().at(-1);
        expect(last < `${Y}-${String(M + 1).padStart(2, "0")}`, "the weather snapshot ends before this month").toBe(true);
        const MONTH = "Date by month";
        await openView(page, "weather", { derived: [{ name: MONTH, field: "Date", by: "yearMonth" }], rows: [MONTH], values: [{ field: "Mean °C", agg: "average" }] });
        await chipMenu(page, MONTH, "filter");
        const menu = page.locator(".pk-chip-menu");
        await menu.getByTestId("quick-last").click();
        await expect(menu.getByTestId("quick-last-current").locator("..")).toHaveText(`Include the current month (${label(monthAt(0))} has no data)`);
        // the weather has no blank dates: no checkbox for them
        await openRules(menu);
        await expect(menu.getByTestId("rules-blanks")).toHaveCount(0);
    });
});

test.describe("Top items with the items tied with the last one (nobel, Country by count)", () => {
    const counts = [...countBy(nobel.filter((r) => r.Country), (r) => r.Country)].sort((a, b) => b[1] - a[1]);
    // the first count at which the item after the cut has the same count
    const cut = counts.findIndex((c, i) => i >= 2 && counts[i + 1] && counts[i + 1][1] === c[1]) + 1;

    test("Top N with a tie at the cut: exactly N, then every item tied with the last one; the checkbox shows while a top is set", async ({ page }) => {
        expect(cut, "a tie at some cut").toBeGreaterThan(2);
        const tied = counts.filter((c) => c[1] >= counts[cut - 1][1]).length;
        expect(tied).toBeGreaterThan(cut);
        await openView(page, "nobel", { rows: ["Country"], values: [{ agg: "count" }] });
        await chipMenu(page, "Country", "top");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("top-ties")).toHaveCount(0);
        await menu.getByTestId("top-own").click();
        await menu.getByTestId("top-count").fill(String(cut));
        await expect.poll(async () => (await bodyRows(page)).length).toBe(cut);
        const ties = menu.getByTestId("top-ties");
        await expect(ties.locator("..")).toHaveText("Also show items with the same value as the last one");
        // the items the top shows, under the checkbox: N, then N and those tied with the last one
        await expect(menu.getByTestId("top-shown")).toHaveText(`${cut} items shown`);
        await ties.click();
        await expect(ties).toBeChecked();
        await expect.poll(async () => (await bodyRows(page)).map((r) => r[0]).sort()).toEqual(counts.slice(0, tied).map((c) => c[0]).sort());
        await expect(menu.getByTestId("top-shown")).toHaveText(`${tied} items shown`);
        // another count keeps the ties
        await menu.getByTestId("top-count").fill(String(cut - 1));
        await expect.poll(async () => (await bodyRows(page)).length).toBe(counts.filter((c) => c[1] >= counts[cut - 2][1]).length);
        await expect(ties).toBeChecked();
        // Off: no top, no checkbox
        await menu.getByTestId("top-off").click();
        await expect(ties).toHaveCount(0);
        await expect.poll(async () => (await bodyRows(page)).length).toBe(counts.length + 1);
    });
});

test.describe("the review's findings on the quick choices (endoflife, EOL date by month; weather)", () => {
    const EOL = "EOL date by month";
    const view = (more = {}) => ({ derived: [{ name: EOL, field: "EOL date", by: "yearMonth" }], rows: [EOL], values: [{ agg: "count" }], ...more });

    test("every select and field of the quick choices is a target's height at least, and each unit select is named after its choice", async ({ page }) => {
        await openView(page, "endoflife", view());
        await chipMenu(page, EOL, "filter");
        const menu = page.locator(".pk-chip-menu");
        await menu.getByTestId("quick-more").click();
        await menu.getByTestId("quick-anchor").selectOption("date");
        const controls = menu.locator('[data-testid="fsection-quick"] :is(select, input[type="date"], input[type="text"])');
        const n = await controls.count();
        expect(n, "the unit selects, the counts, the reference and its date").toBeGreaterThanOrEqual(8);
        for (let i = 0; i < n; i++) {
            const box = await controls.nth(i).boundingBox();
            expect(box?.height, await controls.nth(i).getAttribute("data-testid")).toBeGreaterThanOrEqual(24);
        }
        await expect(menu.getByTestId("quick-last-unit")).toHaveAccessibleName("Unit of “Last …”");
        await expect(menu.getByTestId("quick-next-unit")).toHaveAccessibleName("Unit of “Next …”");
        await expect(menu.getByTestId("quick-before-unit")).toHaveAccessibleName("Unit of “Before the last …”");
        const thisUnit = menu.getByTestId("quick-this-unit");
        if (await thisUnit.count()) {
            await expect(thisUnit).toHaveAccessibleName("Current period");
        }
    });

    test("a date being typed: the range keeps the last whole date, the field says so, and leaving it gives the date back", async ({ page }) => {
        await openView(page, "endoflife", view({ version: 2, filters: [{ field: EOL, type: "relative", unit: "month", count: 3, anchor: "2024-06-30", blanks: "exclude" }] }));
        await expect(badge(page, "rows", EOL)).toHaveText(/^last 3 months, counted from Jun 30, 2024 \(/);
        const before = await bodyRows(page);
        await chipMenu(page, EOL, "filter");
        const menu = page.locator(".pk-chip-menu");
        const date = menu.getByTestId("quick-anchor-date");
        await expect(date).toHaveValue("2024-06-30");
        await date.fill("");
        await expect(date).toHaveAttribute("aria-invalid", "true");
        await expect(menu.getByTestId("quick-anchor-date-hint")).toHaveText("Enter a whole date; the ranges still count from Jun 30, 2024.");
        await expect(date).toHaveAccessibleDescription("Enter a whole date; the ranges still count from Jun 30, 2024.");
        await expect(badge(page, "rows", EOL)).toHaveText(/^last 3 months, counted from Jun 30, 2024 \(/);
        expect(await bodyRows(page)).toEqual(before);
        await date.blur();
        await expect(date).toHaveValue("2024-06-30");
        await expect(menu.getByTestId("quick-anchor-date-hint")).toHaveCount(0);
    });

    test("a loaded reference date with a time shows its day in the date field", async ({ page }) => {
        await openView(page, "endoflife", view({ version: 2, filters: [{ field: EOL, type: "relative", unit: "month", count: 3, anchor: "2024-06-30T18:00:00", blanks: "exclude" }] }));
        await chipMenu(page, EOL, "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("quick-anchor")).toHaveValue("date");
        await expect(menu.getByTestId("quick-anchor-date")).toHaveValue("2024-06-30");
    });

    test("on data that end before today: one click counts Last back from the latest record; the note of the choices not offered sits under them", async ({ page }) => {
        const weather = load("weather");
        const last = weather.map((r) => r.Date).sort().at(-1);
        const now = new Date();
        expect(last.slice(0, 4) < String(now.getUTCFullYear()), "the weather snapshot ends before this year").toBe(true);
        const MONTH = "Date by month";
        await openView(page, "weather", { derived: [{ name: MONTH, field: "Date", by: "yearMonth" }], rows: [MONTH], values: [{ agg: "count" }] });
        await chipMenu(page, MONTH, "filter");
        const menu = page.locator(".pk-chip-menu");
        // This year is not offered: said right under the choices, before the reference date
        const hidden = menu.getByTestId("quick-hidden");
        await expect(hidden).toBeVisible();
        expect(await hidden.evaluate((el, other) => Boolean(el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await menu.getByTestId("quick-anchor").elementHandle())).toBe(true);
        await menu.getByTestId("quick-last").click();
        await expect(menu.getByTestId("quick-last-current").locator("..")).toContainText("has no data");
        const fix = menu.getByTestId("quick-last-from-latest");
        const latest = new Date(`${last}T00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
        await expect(fix).toHaveText(`Count back from the latest record (${latest}) instead`);
        // it looks like the level's other buttons (a border, as "Compare"), a target's height at least
        await expectButtonLook(fix, menu.getByTestId("rule-add-total"));
        // reached by Tab from the checkbox above it, with a focus ring, and pressed with Enter
        await menu.getByTestId("quick-last-current").focus();
        await page.keyboard.press("Tab");
        await expect(fix).toBeFocused();
        expect(await fix.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
        await page.keyboard.press("Enter");
        await expect(menu.getByTestId("quick-anchor")).toHaveValue("latest");
        await expect(fix).toHaveCount(0);
        await expect(menu.getByTestId("quick-last-current").locator("..")).toHaveText("Include the current month");
        // the last N months of the data, to the month of its latest record
        const count = Number(await menu.getByTestId("quick-last-count").inputValue());
        const rows = await bodyRows(page);
        expect(rows.length).toBe(count);
        expect(rows.at(-1)?.[0]).toBe(new Date(`${last.slice(0, 7)}-01T00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }));
        await expect(badge(page, "rows", MONTH)).toContainText("to ");
    });

    test("at phone width the button that counts back from the latest record wraps inside the menu and stays a button", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const MONTH = "Date by month";
        await openView(page, "weather", { derived: [{ name: MONTH, field: "Date", by: "yearMonth" }], rows: [MONTH], values: [{ agg: "count" }] });
        await openZones(page);
        await chipMenu(page, MONTH, "filter");
        const menu = page.locator(".pk-chip-menu");
        await menu.getByTestId("quick-last").click();
        const fix = menu.getByTestId("quick-last-from-latest");
        await expectButtonLook(fix, menu.getByTestId("rule-add-total"));
        const [b, m] = [await fix.boundingBox(), await menu.boundingBox()];
        expect(b.x).toBeGreaterThanOrEqual(m.x);
        expect(b.x + b.width).toBeLessThanOrEqual(m.x + m.width);
        // its text is not cut: the button is as wide as its words need, or wraps them
        expect(await fix.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await fix.click();
        await expect(menu.getByTestId("quick-anchor")).toHaveValue("latest");
    });
});

/**
 * A secondary action of a level drawn as the level's other buttons: a visible border in the colour the
 * reference button has, at least a target's height (24 px).
 */
async function expectButtonLook(button, reference) {
    const look = (el) => {
        const s = getComputedStyle(el);
        return { width: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor, height: el.getBoundingClientRect().height };
    };
    const [mine, theirs] = [await button.evaluate(look), await reference.evaluate(look)];
    expect(mine.style).toBe("solid");
    expect(parseFloat(mine.width)).toBeGreaterThan(0);
    expect({ width: mine.width, color: mine.color }).toEqual({ width: theirs.width, color: theirs.color });
    expect(mine.height).toBeGreaterThanOrEqual(24);
}
