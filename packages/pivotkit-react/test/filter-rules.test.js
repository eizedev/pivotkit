// The Filter level's rules and quick choices as pure view changes, their words (en, de), and the
// search entries made from what is typed ("last 3 years", "from 2022").
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize, relativeDateRange } from "pivotkit-core";
import { LABELS, fill, plural } from "../src/labels.js";
import { en as menuEn } from "../src/menu-labels.js";
import { de as menuDe } from "../src/menu-labels-de.js";
import { QUICK_UNITS, RULES_MAX, RULE_TYPES, filterState, keepsBlanks, rowsInRange, setRuleBlanks, setTopFilter, setLabelFilter, textOn, quickChoice, removeRules, resetFilter, ruleKind, ruleText, setAnchor, setItemFilter, setQuickRange, setRule, setYearsCombined, yearRules } from "../src/menu-ops.js";
import { axisTopics, filterZoneTopics, searchEntries, searchHits } from "../src/menu-topics.js";
import { compareText, itemRuleText, rangeText, relativeText } from "../src/names.js";
import { addField, dateSpan, filtersOf, groupField } from "../src/view-ops.js";

const data = encode([
    { Region: "North", Units: 3, Price: 10, Released: "2019-05-01" },
    { Region: "South", Units: 7, Price: 20, Released: "2022-02-14" },
    { Region: "West", Units: 1, Price: 30, Released: "2025-12-20" }
]);
const norm = (v) => normalize(v, data).view;
const MENU = { en: { ...LABELS.en, ...menuEn }, de: { ...LABELS.de, ...menuDe } };
const types = new Map([["region", "string"], ["units", "number"], ["price", "number"], ["released", "date"]]);
const byYear = norm(groupField(norm({ rows: ["Released"] }), "Released", "year", { name: "Released (Year)" }).view);
const byMonth = norm(groupField(norm({ rows: ["Released"] }), "Released", "yearMonth", { name: "Released (Month)" }).view);
const YEAR = "Released (Year)";
const CYCLIC = "Released (Month of year)";
const byCyclic = norm(groupField(norm({ rows: ["Released"] }), "Released", "month", { name: CYCLIC }).view);

test("ruleKind: how the rules compare a field's items, and which quick choices a date field has", () => {
    const kind = (item, dates, cyclic, quick, months, days, unit, units = []) => ({ item, dates, cyclic, quick, months, days, unit, units });
    assert.deepEqual(ruleKind(data, norm({ rows: ["Price"] }), "Price"), kind("number", false, false, false, false, false, null));
    // a date field: every quick choice, days and weeks too
    assert.deepEqual(ruleKind(data, norm({ rows: ["Released"] }), "Released"), kind("date", true, false, true, true, true, null, ["day", "week", "month", "quarter", "year"]));
    // a grouping by year: years alone; by month along the time line: months, quarters, years; no unit finer than the grouping
    assert.deepEqual(ruleKind(data, byYear, YEAR), kind("group", true, false, true, false, false, "year", ["year"]));
    assert.deepEqual(ruleKind(data, byMonth, "Released (Month)"), kind("group", true, false, true, true, false, "yearMonth", ["month", "quarter", "year"]));
    const byWeek = norm(groupField(norm({ rows: ["Released"] }), "Released", "yearWeek", { name: "Released (Week)" }).view);
    assert.deepEqual(ruleKind(data, byWeek, "Released (Week)").units, ["week", "month", "quarter", "year"]);
    const byQuarter = norm(groupField(norm({ rows: ["Released"] }), "Released", "yearQuarter", { name: "Released (Quarter)" }).view);
    assert.deepEqual(ruleKind(data, byQuarter, "Released (Quarter)").units, ["quarter", "year"]);
    const byDay = norm(groupField(norm({ rows: ["Released"] }), "Released", "day", { name: "Released (Day)" }).view);
    assert.deepEqual(ruleKind(data, byDay, "Released (Day)").units, ["day", "week", "month", "quarter", "year"]);
    // a grouping that repeats every year ("month of the year") has no quick choices: it combines the years
    assert.deepEqual(ruleKind(data, byCyclic, CYCLIC), kind("group", true, true, false, false, false, "month"));
    assert.deepEqual(ruleKind(data, norm({ rows: ["Region"] }), "Region"), kind(null, false, false, false, false, false, null));
});

test("quick choices: each writes one relative range and replaces the comparisons; All removes them", () => {
    const fk = ruleKind(data, byYear, YEAR);
    let v = setItemFilter(byYear, YEAR, [2019, 2022], [2019, 2022, 2025]);
    assert.deepEqual(quickChoice(v, YEAR, fk), { id: "all", filters: [] });
    v = setQuickRange(v, YEAR, { unit: "year", count: 5 });
    const range = { field: YEAR, type: "relative", unit: "year", count: 5, not: false, blanks: "exclude" };
    const last5 = { id: "last", unit: "year", count: 5, anchor: "today", calendar: true, includeCurrent: true, filters: [range] };
    assert.deepEqual(quickChoice(v, YEAR, fk), last5);
    // the picks stay: the filters apply together
    assert.deepEqual(filtersOf(v, YEAR).map((f) => f.type).sort(), ["in", "relative"]);
    // This year is the current year alone (no count); the last 1 year is a Last choice
    const thisYear = setQuickRange(v, YEAR, { direction: "this", unit: "year" });
    assert.deepEqual(filtersOf(thisYear, YEAR, ["relative"]), [{ field: YEAR, type: "relative", direction: "this", unit: "year", not: false, blanks: "exclude" }]);
    assert.deepEqual(quickChoice(norm(thisYear), YEAR, fk), { id: "this", unit: "year", count: 1, anchor: "today", calendar: true, includeCurrent: true, filters: filtersOf(norm(thisYear), YEAR, ["relative"]) });
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "year", count: 1 }), YEAR, fk).id, "last");
    // a unit finer than the grouping is no quick choice (a rule); the units offered are
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "month", count: 6 }), YEAR, fk).id, "all");
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "month", count: 6 }), YEAR, { ...fk, units: ["month", "quarter", "year"] }).unit, "month");
    const dateKind = ruleKind(data, norm({ rows: ["Released"] }), "Released");
    assert.deepEqual(quickChoice(setQuickRange(norm({ rows: ["Released"] }), "Released", { unit: "week", count: 7 }), "Released", dateKind).unit, "week");
    // next, before the last, without the current period, rolling, from the first record or a date: the quick choice too, as written
    const more = setQuickRange(norm({ rows: ["Released"] }), "Released", { direction: "next", unit: "quarter", count: 2, includeCurrent: false, anchor: "first" });
    assert.deepEqual(filtersOf(more, "Released"), [{ field: "Released", type: "relative", direction: "next", unit: "quarter", count: 2, includeCurrent: false, anchor: "first", not: false, blanks: "exclude" }]);
    assert.deepEqual(normalize(more, data).issues, []);
    const read = quickChoice(norm(more), "Released", dateKind);
    assert.deepEqual([read.id, read.unit, read.count, read.anchor, read.calendar, read.includeCurrent], ["next", "quarter", 2, "first", true, false]);
    // rolling: no includeCurrent written (a rolling range counts from the moment itself)
    const rolling = setQuickRange(norm({ rows: ["Released"] }), "Released", { direction: "before", unit: "day", count: 30, calendar: false, includeCurrent: false, anchor: "2025-06-30" });
    assert.deepEqual(filtersOf(rolling, "Released"), [{ field: "Released", type: "relative", direction: "before", unit: "day", count: 30, calendar: false, anchor: "2025-06-30", not: false, blanks: "exclude" }]);
    assert.deepEqual(normalize(rolling, data).issues, []);
    assert.deepEqual(quickChoice(norm(rolling), "Released", dateKind).id, "before");
    // an inverted range, or one that keeps the blanks alone, is a rule
    assert.deepEqual(quickChoice(norm({ version: 2, rows: ["Released"], filters: [{ field: "Released", type: "relative", unit: "year", count: 1, not: true, blanks: "exclude" }] }), "Released", dateKind).id, "all");
    assert.deepEqual(quickChoice(norm({ version: 2, rows: ["Released"], filters: [{ field: "Released", type: "relative", unit: "year", count: 1, blanks: "only" }] }), "Released", dateKind).id, "all");
    // a comparison is a rule beside the quick choice: both stay, each is changed on its own
    const custom = setRule(v, YEAR, null, { field: YEAR, type: "compare", op: ">=", value: 2022 });
    assert.deepEqual(quickChoice(custom, YEAR, fk), last5);
    assert.deepEqual(filtersOf(setQuickRange(custom, YEAR, { unit: "year", count: 2 }), YEAR).map((f) => f.type).sort(), ["compare", "in", "relative"]);
    assert.deepEqual(filtersOf(setQuickRange(custom, YEAR, null), YEAR).map((f) => f.type).sort(), ["compare", "in"]);
    assert.deepEqual(quickChoice(setQuickRange(custom, YEAR, null), YEAR, fk), { id: "all", filters: [] });
    // a second range is a rule too: the first one that is offered is the quick choice
    const two = setRule(v, YEAR, null, { field: YEAR, type: "relative", unit: "month", count: 3 });
    assert.deepEqual(quickChoice(two, YEAR, fk).filters, [range]);
    assert.deepEqual(quickChoice(two, YEAR, { ...fk, units: ["month", "year"] }).filters, [range]);
    // with the quick choice named, a new choice replaces it alone: the second range stays a rule
    const replaced = setQuickRange(two, YEAR, { unit: "year", count: 2 }, range);
    assert.deepEqual(filtersOf(replaced, YEAR, ["relative"]), [{ ...range, count: 2 }, { field: YEAR, type: "relative", unit: "month", count: 3 }]);
    assert.deepEqual(filtersOf(setQuickRange(two, YEAR, null, range), YEAR, ["relative"]), [{ field: YEAR, type: "relative", unit: "month", count: 3 }]);
    // without one (null) the choice is added after the field's filters
    assert.deepEqual(filtersOf(setQuickRange(custom, YEAR, null, null), YEAR).length, filtersOf(custom, YEAR).length);
    // the anchor: counted back from the latest record is written, today is not; a switch rewrites the field's ranges
    const latest = setQuickRange(v, YEAR, { unit: "year", count: 2, anchor: "latest" });
    assert.deepEqual(filtersOf(latest, YEAR, ["relative"]), [{ field: YEAR, type: "relative", unit: "year", count: 2, anchor: "latest", not: false, blanks: "exclude" }]);
    assert.deepEqual(quickChoice(latest, YEAR, fk).anchor, "latest");
    assert.deepEqual(filtersOf(setAnchor(latest, YEAR, "today"), YEAR, ["relative"]), [{ field: YEAR, type: "relative", unit: "year", count: 2, not: false, blanks: "exclude" }]);
    assert.deepEqual(filtersOf(setAnchor(v, YEAR, "latest"), YEAR, ["relative"]), [{ ...range, anchor: "latest" }]);
    assert.deepEqual(filtersOf(setQuickRange(v, YEAR, { unit: "year", count: 2, anchor: "today" }), YEAR, ["relative"]), [{ ...range, count: 2 }]);
    // every quick choice is a view the core reads without an issue
    assert.deepEqual(normalize(setQuickRange(v, YEAR, { unit: "year", count: 3, anchor: "latest" }), data).issues, []);
    // Reset filter takes the picks, the quick choice and the rules off; Top N stays
    const topped = { ...custom, filters: [...custom.filters, { field: YEAR, type: "top", count: 2 }] };
    assert.deepEqual(filtersOf(resetFilter(topped, YEAR), YEAR).map((f) => f.type), ["top"]);
    // Remove the rules keeps the quick choice when asked to
    const both = setRule(v, YEAR, null, { field: YEAR, type: "value", by: { field: null, agg: "count" }, op: ">", value: 1 });
    assert.deepEqual(filtersOf(removeRules(both, YEAR, [range]), YEAR).map((f) => f.type).sort(), ["in", "relative"]);
    assert.deepEqual(filtersOf(removeRules(both, YEAR), YEAR).map((f) => f.type), ["in"]);
});

test("years combined: a cyclic grouping's years as whole-year comparisons; a gap is a 'not between'", () => {
    const fk = ruleKind(data, byCyclic, CYCLIC);
    const all = [2019, 2022, 2025];
    assert.deepEqual(yearRules(CYCLIC, all, all), []);
    assert.deepEqual(yearRules(CYCLIC, [2022, 2025], all), [{ field: CYCLIC, type: "compare", op: "between", value: "2022-01-01", value2: "2025-12-31", not: false, blanks: "exclude" }]);
    assert.deepEqual(yearRules(CYCLIC, [2019, 2025], all), [
        { field: CYCLIC, type: "compare", op: "between", value: "2019-01-01", value2: "2025-12-31", not: false, blanks: "exclude" },
        { field: CYCLIC, type: "compare", op: "between", value: "2020-01-01", value2: "2024-12-31", not: true, blanks: "exclude" }
    ]);
    let v = setYearsCombined(byCyclic, CYCLIC, [2019, 2025], all);
    assert.deepEqual(quickChoice(v, CYCLIC, fk, all), { id: "yearsCombined", years: [2019, 2025], filters: filtersOf(v, CYCLIC, ["compare"]) });
    // the engine keeps the two years, as months of the year
    const r = computePivot(data, { ...v, values: [{ agg: "count" }] });
    assert.deepEqual(r.rowRoot.children.map((n) => n.key), [5, 12]);
    assert.deepEqual(normalize(v, data).issues, []);
    // every year ticked: no rule; a comparison of a month's own key is a custom rule, not the years
    assert.deepEqual(filtersOf(setYearsCombined(v, CYCLIC, all, all), CYCLIC, ["compare"]), []);
    // a comparison of a month's own key is a rule of its own, no quick choice; it stays beside Years combined
    const fromJun = { field: CYCLIC, type: "compare", op: ">=", value: 6 };
    const withJun = setRule(byCyclic, CYCLIC, null, fromJun);
    assert.deepEqual(quickChoice(withJun, CYCLIC, fk, all), { id: "all", filters: [] });
    const both = setYearsCombined(withJun, CYCLIC, [2025], all);
    const afterToggle = setYearsCombined(both, CYCLIC, [2019, 2025], all);
    assert.deepEqual(quickChoice(afterToggle, CYCLIC, fk, all).years, [2019, 2025]);
    assert.deepEqual(filtersOf(afterToggle, CYCLIC, ["compare"]).filter((f) => f.value === 6), [fromJun]);
    assert.deepEqual(quickChoice(setYearsCombined(afterToggle, CYCLIC, all, all), CYCLIC, fk, all), { id: "all", filters: [] });
    assert.deepEqual(filtersOf(setYearsCombined(afterToggle, CYCLIC, all, all), CYCLIC, ["compare"]), [fromJun]);
    // the chip says the years, not the days
    const L = MENU.en;
    assert.equal(compareText({ op: "between", value: "2022-01-01", value2: "2025-12-31" }, L, "en-US", { date: true }), "2022 to 2025");
    assert.equal(compareText({ op: "between", value: "2025-01-01", value2: "2025-12-31" }, L, "en-US", { date: true }), "2025");
    assert.equal(compareText({ op: "between", not: true, value: "2020-01-01", value2: "2024-12-31" }, L, "en-US", { date: true }), "not 2020 to 2024");
    assert.equal(compareText({ op: "between", value: "2022-01-01", value2: "2025-12-30" }, L, "en-US", { date: true }), "Jan 1, 2022 to Dec 30, 2025");
});

test("rules: added, replaced and removed one at a time; Remove the rules keeps the picks and Top items", () => {
    const rule = { field: YEAR, type: "compare", op: ">=", value: 2022 };
    let v = setRule(byYear, YEAR, null, rule);
    v = setRule(v, YEAR, null, { field: YEAR, type: "value", by: { field: null, agg: "count" }, op: ">", value: 0 });
    assert.deepEqual(filtersOf(v, YEAR, RULE_TYPES).map((f) => f.type), ["compare", "value"]);
    const edited = setRule(v, YEAR, rule, { ...rule, op: "<", value: 2025 });
    assert.deepEqual(filtersOf(edited, YEAR, ["compare"]), [{ ...rule, op: "<", value: 2025 }]);
    assert.deepEqual(filtersOf(setRule(v, YEAR, rule, null), YEAR, RULE_TYPES).map((f) => f.type), ["value"]);
    // all rules apply together: the years from 2022 with rows
    const r = computePivot(data, { ...v, values: [{ agg: "count" }] });
    assert.deepEqual(r.rowRoot.children.map((n) => n.key), [2022, 2025]);
    v = setItemFilter(v, YEAR, [2022], [2019, 2022, 2025]);
    v = { ...v, filters: [...v.filters, { field: YEAR, type: "top", count: 1, bottom: false }] };
    assert.deepEqual(filtersOf(removeRules(v, YEAR), YEAR).map((f) => f.type), ["in", "top"]);
    // a field in Filters stays there when its last rule goes
    const zone = addField(norm({}), "Region", "filters");
    const ruled = setRule(zone, "Region", null, { field: "Region", type: "text", op: "contains", value: "o" });
    assert.deepEqual(filtersOf(removeRules(ruled, "Region"), "Region"), [{ field: "Region", type: "in", items: [], not: true, blanks: "include" }]);
    assert.ok(RULES_MAX >= 5);
});

test("the words of a rule: the chip, the first level and the Filter level say the same", () => {
    const L = MENU.en;
    const now = "2026-11-09";
    const r = (unit, count, anchor) => ({ unit, count, ...(anchor ? { anchor } : {}) });
    assert.equal(rangeText(r("year", 5), "en-US", "UTC", now), "2022–2026");
    assert.equal(rangeText(r("year", 1), "en-US", "UTC", now), "2026");
    assert.equal(rangeText(r("month", 3), "en-US", "UTC", now), "Sep 2026–Nov 2026");
    assert.equal(rangeText(r("day", 1), "en-US", "UTC", now), "Nov 9, 2026");
    assert.equal(relativeText(r("year", 5), L, "en-US", "UTC", now), "last 5 years (2022–2026)");
    assert.equal(relativeText(r("year", 1), L, "en-US", "UTC", now), "this year (2026)");
    assert.equal(relativeText(r("month", 12), MENU.de, "de-DE", "UTC", now), "letzte 12 Monate (Dez. 2025–Nov. 2026)");
    // today in the data's time zone: New Year's night in UTC is still December in New York
    assert.equal(rangeText(r("year", 1), "en-US", "America/New_York", new Date("2026-01-01T03:00:00Z")), "2025");
    // the data's share of the range: the data end Dec 31, 2025, so 2026 has no data
    const span = { min: Date.UTC(2023, 0, 1), max: Date.UTC(2025, 11, 31) };
    assert.equal(relativeText(r("year", 2), L, "en-US", "UTC", now, span), "last 2 years (2025; 2026 has no data)");
    assert.equal(relativeText(r("year", 5), L, "en-US", "UTC", now, span), "last 5 years (2023–2025; 2022, 2026 have no data)");
    assert.equal(relativeText(r("month", 12), L, "en-US", "UTC", now, span), "last 12 months (Dec 2025; 2026 has no data)");
    assert.equal(relativeText(r("year", 1), L, "en-US", "UTC", now, span), "this year (2026 has no data)");
    assert.equal(relativeText(r("day", 7), L, "en-US", "UTC", now, span), "last 7 days (Nov 3, 2026–Nov 9, 2026 has no data)");
    // the data cover the range: the range alone
    assert.equal(relativeText(r("year", 3), L, "en-US", "UTC", "2025-06-01", span), "last 3 years (2023–2025)");
    // a part missing inside a year that has data is written as the unit writes it
    assert.equal(relativeText(r("month", 12), L, "en-US", "UTC", "2026-03-15", { min: Date.UTC(2025, 5, 1), max: Date.UTC(2025, 11, 31) }), "last 12 months (Jun 2025–Dec 2025; Apr 2025–May 2025, 2026 have no data)");
    assert.equal(relativeText(r("year", 2), MENU.de, "de-DE", "UTC", now, span), "letzte 2 Jahre (2025; 2026 hat keine Daten)");
    // counted back from the latest record: the end named, the days only when the data do not cover them
    assert.equal(relativeText(r("month", 12, "latest"), L, "en-US", "UTC", now, span), "last 12 months to Dec 2025");
    assert.equal(relativeText(r("year", 1, "latest"), L, "en-US", "UTC", now, span), "this year to 2025");
    assert.equal(relativeText(r("year", 5, "latest"), L, "en-US", "UTC", now, span), "last 5 years to 2025 (2023–2025; 2021–2022 have no data)");
    assert.equal(relativeText(r("year", 2, "latest"), MENU.de, "de-DE", "UTC", now, span), "letzte 2 Jahre bis 2025");
    assert.equal(rangeText(r("year", 2, "latest"), "en-US", "UTC", now, span.max), "2024–2025");
    // without the data's dates a range anchored at them has no days to name
    assert.equal(relativeText(r("year", 2, "latest"), L, "en-US", "UTC", now), "last 2 years");
    const labelOf = (v) => (v === 202503 ? "Mar 2025" : undefined);
    assert.equal(compareText({ op: ">=", value: 2022 }, L, "en-US", { date: true }), "from 2022");
    assert.equal(compareText({ op: ">=", value: 202503 }, L, "en-US", { date: true, labelOf }), "from Mar 2025");
    assert.equal(compareText({ op: "<", value: "2022-03-01" }, L, "en-US", { date: true }), "before Mar 1, 2022");
    assert.equal(compareText({ op: "between", value: 2024, value2: 2022 }, MENU.de, "de-DE", { date: true }), "2022 bis 2024");
    assert.equal(compareText({ op: ">=", value: 1000 }, L, "en-US", { date: false }), "≥ 1,000");
    assert.equal(compareText({ op: ">=", value: 2022 }, MENU.de, "de-DE", { date: true }), "ab 2022");
    const total = { field: YEAR, type: "value", by: { field: null, agg: "count" }, op: ">", value: 3 };
    assert.equal(ruleText(byYear, total, { labels: L, locale: "en-US", timeZone: "UTC", date: true }), "Count of rows > 3");
    assert.equal(ruleText(byYear, { field: YEAR, type: "text", op: "contains", value: "2" }, { labels: L, locale: "en-US", timeZone: "UTC", date: true }), "contains “2”");
    // the first level's state: the chip's rules first, then the names' and the totals' rules
    const state = { summary: null, rules: ["last 5 years (2022–2026)"] };
    assert.equal(filterState(setRule(byYear, YEAR, null, total), YEAR, state, L, "en-US"), "last 5 years (2022–2026), Count of rows > 3");
});

test("search: quick choices with the count typed, a year compared, and the rules by name; they apply at once", () => {
    const topics = axisTopics({ view: byYear, zone: "rows", index: 0, field: YEAR, types, labels: MENU.en, locale: "en-US", encoded: data });
    const hits = (q) => searchHits(searchEntries(topics, q), q, "en-US");
    const years = relativeDateRange("year", 2);
    const last2 = hits("last 2 years")[0];
    // the words of the chip, with a capital (the data's share of the range included)
    const span = dateSpan(data, "Released");
    const chip = (f) => relativeText(f, MENU.en, "en-US", "UTC", undefined, span);
    assert.equal(last2.text, chip({ unit: "year", count: 2 }).replace(/^l/, "L"));
    assert.ok(last2.text.startsWith(`Last 2 years (`) && last2.text.includes(years.from.slice(0, 4)));
    assert.deepEqual(filtersOf(last2.choice.change().view, YEAR, RULE_TYPES), [{ field: YEAR, type: "relative", unit: "year", count: 2, not: false, blanks: "exclude" }]);
    // a range counted back from the latest record (2025): the search's choices count from it too
    const anchored = axisTopics({ view: setQuickRange(byYear, YEAR, { unit: "year", count: 1, anchor: "latest" }), zone: "rows", index: 0, field: YEAR, types, labels: MENU.en, locale: "en-US", encoded: data });
    const hit = searchHits(searchEntries(anchored, "last 3 years"), "last 3 years", "en-US")[0];
    assert.equal(hit.text, chip({ unit: "year", count: 3, anchor: "latest" }).replace(/^l/, "L"));
    assert.deepEqual(filtersOf(hit.choice.change().view, YEAR, RULE_TYPES), [{ field: YEAR, type: "relative", unit: "year", count: 3, anchor: "latest", not: false, blanks: "exclude" }]);
    // a cyclic grouping has no quick choices to find
    const cyclic = axisTopics({ view: byCyclic, zone: "rows", index: 0, field: CYCLIC, types, labels: MENU.en, locale: "en-US", encoded: data });
    assert.equal(searchHits(searchEntries(cyclic, "last 2 years"), "last 2 years", "en-US").length, 0);
    // a year grouping: no months
    assert.equal(hits("last 2 months").length, 0);
    const from = hits("from 2022")[0];
    assert.equal(from.text, "From 2022");
    assert.deepEqual(filtersOf(from.choice.change().view, YEAR, RULE_TYPES), [{ field: YEAR, type: "compare", op: ">=", value: 2022, not: false, blanks: "exclude" }]);
    assert.deepEqual(hits("rule").map((e) => e.id).slice(0, 2), ["open-filter-rules", "open-filter-text"]);
    // a date field: months too, and a year as its first or last day
    const raw = axisTopics({ view: norm({ rows: ["Released"] }), zone: "rows", index: 0, field: "Released", types, labels: MENU.en, locale: "en-US", encoded: data });
    const rawHits = (q) => searchHits(searchEntries(raw, q), q, "en-US");
    assert.equal(rawHits("last 6 months").length, 1);
    // a date field compares days: no year entry, whose chip would say a day ("from Jan 1, 2022")
    assert.equal(rawHits("up to 2022").length, 0);
    assert.equal(rawHits("from 2022").length, 0);
    // German words
    const de = axisTopics({ view: byYear, zone: "rows", index: 0, field: YEAR, types, labels: MENU.de, locale: "de-DE", encoded: data });
    assert.equal(searchHits(searchEntries(de, "ab 2022"), "ab 2022", "de-DE")[0].text, "Ab 2022");
    assert.ok(searchHits(searchEntries(de, "letzte 3 jahre"), "letzte 3 jahre", "de-DE")[0].text.startsWith("Letzte 3 Jahre ("));
    // a text field gets none of them; nothing typed, nothing made
    const text = axisTopics({ view: norm({ rows: ["Region"] }), zone: "rows", index: 0, field: "Region", types, labels: MENU.en, locale: "en-US", encoded: data });
    assert.equal(searchHits(searchEntries(text, "last 2 years"), "last 2 years", "en-US").length, 0);
    assert.equal(searchEntries(topics).some((e) => e.id.startsWith("quick-")), false);
});

test("the Filters zone's menu: Filter with its state, then Move to (no sort, grouping or Top items)", () => {
    const v = setQuickRange(addField(norm({}), "Released", "filters"), "Released", { unit: "year", count: 2 });
    const topics = filterZoneTopics({ view: v, index: 0, field: "Released", types, labels: MENU.en, locale: "en-US", state: { summary: null, rules: ["last 2 years"] }, encoded: data });
    assert.deepEqual(topics.map((t) => t.id), ["filter", "move"]);
    assert.equal(topics[0].state, "last 2 years");
    assert.equal(topics[0].changed, true);
    assert.deepEqual(topics[1].groups[0].choices.map((c) => c.id), ["move-cols", "move-rows", "move-values"]);
});

test("a rule on the names says its words as the others do; counts of one have their own words (en, de)", () => {
    const label = { field: "Region", type: "text", op: "contains", value: "linux" };
    assert.equal(itemRuleText(label, MENU.en, "en-US", { timeZone: "UTC", date: false }), "contains “linux”");
    assert.equal(itemRuleText(label, MENU.de, "de-DE", { timeZone: "UTC", date: false }), "enthält „linux“");
    // the chip's words already hold it: the first level does not say it twice
    const v = setRule(norm({ rows: ["Region"] }), "Region", null, label);
    assert.equal(filterState(v, "Region", { summary: null, rules: ["contains “linux”"] }, MENU.en, "en-US"), "contains “linux”");
    assert.equal(filterState(v, "Region", null, MENU.en, "en-US"), "contains “linux”");
    const say = (forms, n, lang) => plural(forms, n, { lang, locale: lang === "de" ? "de-DE" : "en-US" });
    // the quick choices' words around the count and the unit ("Letztes [1] [Jahr]", "Vor den letzten [3] [Monaten]")
    assert.equal(fill(say(MENU.de.relativeMore.last.year, 1, "de"), { count: 1 }), "letztes 1 Jahr");
    assert.equal(fill(say(MENU.de.relativeMore.last.month, 3, "de"), { count: 3 }), "letzte 3 Monate");
    assert.equal(fill(say(MENU.de.relativeMore.before.month, 3, "de"), { count: 3 }), "vor den letzten 3 Monaten");
    assert.equal(fill(say(MENU.en.relativeMore.last.year, 1, "en"), { count: 1 }), "last 1 year");
    // each unit the quick choices offer has its words and its count's name in both languages
    for (const L of [MENU.en, MENU.de]) {
        for (const unit of QUICK_UNITS) {
            for (const d of ["last", "next", "before"]) {
                assert.match(L.relativeMore[d][unit].one, /\{count\}/, `${d} ${unit}`);
            }
            assert.ok(L.relativeMore.this[unit] && L.quickCount[unit] && L.quickCurrent[unit], unit);
        }
    }
    assert.equal(`${say(MENU.de.lastOp, 1, "de")} 1 ${say(MENU.de.ruleUnits.month, 1, "de")}`, "im letzten 1 Monat");
    assert.equal(`${say(MENU.de.lastOp, 3, "de")} 3 ${say(MENU.de.ruleUnits.month, 3, "de")}`, "in den letzten 3 Monaten");
});

test("a rule on the names keeps every item that begins with the text, whatever its case and spaces (#159)", () => {
    // items copied from a web page hold no-break spaces; the text typed has plain ones and a space at the end
    const nbsp = String.fromCharCode(0xa0);
    const names = encode([{ Name: `ACTIVE${nbsp}DIRECTORY` }, { Name: "ACTIVE DIRECTORY Sync" }, { Name: `Active${nbsp}Directory admins` }, { Name: "Other" }]);
    const view = setLabelFilter(normalize({ rows: ["Name"] }, names).view, "Name", { op: "beginsWith", value: "ACTIVE DIRECTORY ", on: textOn(names, "Name") });
    const result = computePivot(names, view);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.rowRoot.children.map((n) => n.key).sort(), [`ACTIVE${nbsp}DIRECTORY`, "ACTIVE DIRECTORY Sync", `Active${nbsp}Directory admins`].sort());
    // begins and ends with have their negations; a not the menus have no word for is said in words
    assert.equal(itemRuleText({ type: "text", op: "beginsWith", value: "a", not: true }, MENU.en, "en-US", { timeZone: "UTC", date: false }), "does not begin with “a”");
    assert.equal(itemRuleText({ type: "text", op: "endsWith", value: "a", not: true }, MENU.de, "de-DE", { timeZone: "UTC", date: false }), "endet nicht mit „a“");
    assert.equal(itemRuleText({ type: "compare", op: ">", value: 5, not: true }, MENU.en, "en-US", { timeZone: "UTC", date: false }), "not (> 5)");
    assert.equal(itemRuleText({ type: "text", op: "contains", value: "a", not: true }, MENU.de, "de-DE", { timeZone: "UTC", date: false }), "enthält nicht „a“");
    // a number field's rule compares the label the table shows
    assert.equal(textOn(data, "Units"), "label");
    assert.equal(textOn(names, "Name"), "value");
});

test("a relative range says what it keeps: whole periods by their names, the others by their dates; a loaded one is the quick choice", () => {
    const now = "2026-03-15T12:00:00Z";
    const say = (f, L = MENU.en, locale = "en-US") => relativeText({ blanks: "exclude", not: false, calendar: true, includeCurrent: true, anchor: "today", ...f }, L, locale, "UTC", now);
    assert.equal(say({ direction: "next", unit: "week", count: 2 }), "next 2 weeks (Mar 9, 2026 – Mar 22, 2026)");
    assert.equal(say({ direction: "this", unit: "quarter" }), "this quarter (Q1 2026)");
    assert.equal(say({ direction: "last", unit: "quarter", count: 4 }), "last 4 quarters (Q2 2025–Q1 2026)");
    assert.equal(say({ direction: "last", unit: "week", count: 2 }), "last 2 weeks (Mar 2, 2026–Mar 15, 2026)");
    assert.equal(say({ direction: "this", unit: "day" }), "today (Mar 15, 2026)");
    assert.equal(say({ direction: "before", unit: "day", count: 30, calendar: false }), "before the last 30 days, rolling (until Feb 13, 2026, 11:59 AM)");
    assert.equal(say({ direction: "last", unit: "month", count: 1, includeCurrent: false }), "last 1 month, current period excluded (Feb 2026)");
    assert.equal(say({ direction: "last", unit: "month", count: 3, includeCurrent: false }, MENU.de, "de-DE"), "letzte 3 Monate, ohne den laufenden Zeitraum (Dez. 2025–Feb. 2026)");
    assert.equal(say({ direction: "last", unit: "year", count: 1, anchor: "2025-06-30" }), "last 1 year, counted from Jun 30, 2025 (Jan 1, 2025 – Dec 31, 2025)");
    assert.equal(say({ direction: "next", unit: "week", count: 2 }, MENU.de, "de-DE"), "nächste 2 Wochen (09.03.2026 – 22.03.2026)");
    assert.equal(say({ direction: "before", unit: "year", count: 1 }, MENU.de, "de-DE"), "vor dem letzten 1 Jahr (bis 31.12.2025)");
    // the menus' own ranges keep their words
    assert.equal(say({ direction: "last", unit: "year", count: 2 }), "last 2 years (2025–2026)");
    const loaded = norm({ version: 2, rows: ["Released"], filters: [{ field: "Released", type: "relative", direction: "next", unit: "year", count: 1, blanks: "exclude" }] });
    assert.deepEqual(quickChoice(loaded, "Released", ruleKind(data, loaded, "Released")).id, "next");
});

test("a comparison of dates by another precision says its unit", () => {
    const say = (f) => compareText({ op: "=", ...f }, MENU.en, "en-US", { date: true });
    assert.equal(say({ value: "2026-02-01", precision: "month" }), "Feb 2026");
    assert.equal(say({ op: ">=", value: "2026-04-01", precision: "quarter" }), "from Q2 2026");
    assert.equal(say({ op: "<", value: "2026-01-01", precision: "year" }), "before 2026");
    assert.equal(say({ value: "2026-03-01T14:00", precision: "hour" }), "Mar 1, 2026, 2:00 PM");
    assert.equal(say({ value: "2026-03-01" }), "Mar 1, 2026");
});

// rows with blank names and blank dates: what "Also keep items without a value" must keep
const gaps = encode([
    { Team: "Service desk", Opened: "2026-01-10", Hours: 4 },
    { Team: "Server", Opened: "2026-02-03", Hours: 6 },
    { Team: "Network", Opened: "2025-11-20", Hours: 2 },
    { Team: null, Opened: null, Hours: 5 },
    { Team: null, Opened: "2026-02-20", Hours: 1 },
    { Team: "Service desk", Opened: null, Hours: 3 }
]);
const gapView = (more) => normalize({ rows: ["Team"], values: [{ field: "Hours", agg: "sum" }], ...more }, gaps).view;
/** The table's rows as [key, value] without the grand total. */
const keyed = (view) => {
    const r = computePivot(gaps, view);
    assert.deepEqual(r.issues, []);
    return r.rowRoot.children.map((n) => [n.key, r.value(n, r.colRoot, 0)]);
};

test("Also keep items without a value: the rules on the items keep the blank item too, a new state for every rule at once", () => {
    let v = setLabelFilter(gapView(), "Team", { op: "notBeginsWith", value: "serv", on: "value" });
    // does not begin with "serv": Network alone; the blanks are dropped by default
    assert.deepEqual(keyed(v), [["Network", 2]]);
    assert.equal(keepsBlanks(v, "Team"), false);
    v = setRuleBlanks(v, "Team", true);
    assert.equal(keepsBlanks(normalize(v, gaps).view, "Team"), true);
    assert.deepEqual(keyed(v).sort(), [["Network", 2], [null, 6]].sort());
    // a second rule: the blank item passes neither unless both keep it
    v = setRule(v, "Team", null, { field: "Team", type: "text", op: "endsWith", value: "desk", not: true, on: "value", blanks: "exclude" });
    assert.equal(keepsBlanks(v, "Team"), false);
    assert.deepEqual(keyed(v), [["Network", 2]]);
    v = setRuleBlanks(v, "Team", true);
    assert.deepEqual(filtersOf(v, "Team").map((f) => f.blanks), ["include", "include"]);
    assert.deepEqual(keyed(v).sort(), [["Network", 2], [null, 6]].sort());
    // off again: every rule drops them
    assert.deepEqual(filtersOf(setRuleBlanks(v, "Team", false), "Team").map((f) => f.blanks), ["exclude", "exclude"]);
    // a rule on the total has no blanks of its own; the picks are left alone
    const mixed = setItemFilter(setRule(v, "Team", null, { field: "Team", type: "value", by: { field: "Hours", agg: "sum" }, op: ">", value: 0 }), "Team", ["Network", null], ["Network", "Server", "Service desk", null]);
    const set = setRuleBlanks(mixed, "Team", false);
    assert.deepEqual(filtersOf(set, "Team", ["value"])[0].blanks, undefined);
    assert.deepEqual(filtersOf(set, "Team", ["in"]), filtersOf(mixed, "Team", ["in"]));
    // without a rule on the items there is nothing to keep them with
    assert.equal(keepsBlanks(gapView(), "Team"), false);
});

test("a date's quick choice keeps the blank dates with the rules, and Years combined keeps them as it rewrites its years", () => {
    const now = new Date("2026-03-15T12:00:00Z");
    const view = normalize({ rows: ["Opened"], values: [{ field: "Hours", agg: "sum" }] }, gaps).view;
    const fk = ruleKind(gaps, view, "Opened");
    let v = setQuickRange(view, "Opened", { direction: "this", unit: "year", blanks: "include" }, null);
    const keys = (x) => computePivot(gaps, x, { now }).rowRoot.children.map((n) => n.key);
    // this year (2026): three dated rows and the blank date
    assert.equal(keys(v).length, 4);
    assert.ok(keys(v).includes(null));
    assert.equal(quickChoice(normalize(v, gaps).view, "Opened", fk).id, "this");
    assert.equal(keepsBlanks(v, "Opened"), true);
    v = setRuleBlanks(v, "Opened", false);
    assert.equal(keys(v).includes(null), false);
    // a cyclic grouping: the years kept rewrite their comparisons with the field's blanks
    const MONTH = "Opened (Month of year)";
    const cyc = normalize(groupField(normalize({ rows: ["Opened"] }, gaps).view, "Opened", "month", { name: MONTH }).view, gaps).view;
    const kept = setRuleBlanks(setYearsCombined(cyc, MONTH, [2026], [2025, 2026]), MONTH, true);
    const again = setYearsCombined(normalize(kept, gaps).view, MONTH, [2025], [2025, 2026]);
    assert.deepEqual(filtersOf(again, MONTH, ["compare"]).map((f) => [f.value, f.blanks]), [["2025-01-01", "include"]]);
    assert.equal(quickChoice(normalize(again, gaps).view, MONTH, ruleKind(gaps, cyc, MONTH), [2025, 2026]).id, "yearsCombined");
});

test("the rows a quick choice keeps: days and minutes both included, before without a start", () => {
    const col = gaps.column("Opened");
    const counts = new Float64Array(col.dict.length);
    for (const c of col.codes) {
        if (c >= 0) {
            counts[c]++;
        }
    }
    assert.equal(rowsInRange({ from: "2026-01-01", to: "2026-12-31" }, col.dict, counts), 3);
    // the last day counts whole, the last minute whole
    assert.equal(rowsInRange({ from: "2026-02-20", to: "2026-02-20" }, col.dict, counts), 1);
    assert.equal(rowsInRange({ from: "2026-02-19T12:00", to: "2026-02-20T00:00" }, col.dict, counts), 1);
    assert.equal(rowsInRange({ from: "2026-02-19T12:00", to: "2026-02-19T23:59" }, col.dict, counts), 0);
    assert.equal(rowsInRange({ from: null, to: "2025-12-31" }, col.dict, counts), 1);
});

test("Top items with ties: the items tied with the last one stay; a change keeps the ties until they are taken off", () => {
    const tied = encode([
        { Name: "A", Score: 9 },
        { Name: "B", Score: 7 },
        { Name: "C", Score: 7 },
        { Name: "D", Score: 7 },
        { Name: "E", Score: 1 }
    ]);
    const base = normalize({ rows: ["Name"], values: [{ field: "Score", agg: "sum" }] }, tied).view;
    const by = { field: "Score", agg: "sum" };
    const names = (v) => computePivot(tied, v).rowRoot.children.map((n) => n.key).sort();
    const top2 = setTopFilter(base, "Name", { count: 2, bottom: false, by });
    assert.deepEqual(names(top2).length, 2);
    const ties = setTopFilter(top2, "Name", { count: 2, bottom: false, by, ties: "all" }, filtersOf(top2, "Name", ["top"])[0]);
    assert.deepEqual(filtersOf(ties, "Name", ["top"])[0].ties, "all");
    assert.deepEqual(names(ties), ["A", "B", "C", "D"]);
    // another count keeps the ties
    const top3 = setTopFilter(normalize(ties, tied).view, "Name", { count: 3, bottom: false, by }, filtersOf(normalize(ties, tied).view, "Name", ["top"])[0]);
    assert.deepEqual(filtersOf(top3, "Name", ["top"])[0].ties, "all");
    // taken off: the first in the data
    const off = setTopFilter(top3, "Name", { count: 2, bottom: false, by, ties: "first" }, filtersOf(top3, "Name", ["top"])[0]);
    assert.equal(filtersOf(off, "Name", ["top"])[0].ties, undefined);
    assert.equal(names(off).length, 2);
});

test("search: a quick choice found takes the place of the one set, keeps a range that is a rule and the blanks as the rules keep them", () => {
    const fk = ruleKind(data, byYear, YEAR);
    // a quick choice that keeps the blanks, and an inverted range (a rule)
    const rule = { field: YEAR, type: "relative", unit: "year", count: 1, not: true, blanks: "include" };
    const view = norm(setRule(setQuickRange(byYear, YEAR, { unit: "year", count: 5, blanks: "include" }, null), YEAR, null, rule));
    assert.equal(quickChoice(view, YEAR, fk).count, 5);
    const topics = axisTopics({ view, zone: "rows", index: 0, field: YEAR, types, labels: MENU.en, locale: "en-US", encoded: data });
    const hit = searchHits(searchEntries(topics, "last 3 years"), "last 3 years", "en-US")[0];
    const ranges = filtersOf(hit.choice.change().view, YEAR, ["relative"]);
    assert.deepEqual(ranges.map((f) => [f.count, f.not, f.blanks]), [[3, false, "include"], [1, true, "include"]]);
});
