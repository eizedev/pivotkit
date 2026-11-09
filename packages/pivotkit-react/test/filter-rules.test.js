// The Filter level's rules and quick choices as pure view changes, their words (en, de), and the
// search entries made from what is typed ("last 3 years", "from 2022").
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize, relativeDateRange } from "pivotkit-core";
import { LABELS, plural } from "../src/labels.js";
import { en as menuEn } from "../src/menu-labels.js";
import { de as menuDe } from "../src/menu-labels-de.js";
import { RULES_MAX, RULE_TYPES, filterState, quickChoice, removeRules, resetFilter, ruleKind, ruleText, setAnchor, setItemFilter, setQuickRange, setRule, setYearsCombined, yearRules } from "../src/menu-ops.js";
import { axisTopics, filterZoneTopics, searchEntries, searchHits } from "../src/menu-topics.js";
import { compareText, itemRuleText, rangeText, relativeText } from "../src/names.js";
import { addField, filtersOf, groupField } from "../src/view-ops.js";

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
    const kind = (item, dates, cyclic, quick, months, days, unit) => ({ item, dates, cyclic, quick, months, days, unit });
    assert.deepEqual(ruleKind(data, norm({ rows: ["Price"] }), "Price"), kind("number", false, false, false, false, false, null));
    // a date field: every quick choice, days too
    assert.deepEqual(ruleKind(data, norm({ rows: ["Released"] }), "Released"), kind("date", true, false, true, true, true, null));
    // a grouping by year: no months; by month along the time line: months, no days
    assert.deepEqual(ruleKind(data, byYear, YEAR), kind("group", true, false, true, false, false, "year"));
    assert.deepEqual(ruleKind(data, byMonth, "Released (Month)"), kind("group", true, false, true, true, false, "yearMonth"));
    // a grouping that repeats every year ("month of the year") has no quick choices: it combines the years
    assert.deepEqual(ruleKind(data, byCyclic, CYCLIC), kind("group", true, true, false, false, false, "month"));
    assert.deepEqual(ruleKind(data, norm({ rows: ["Region"] }), "Region"), kind(null, false, false, false, false, false, null));
});

test("quick choices: each writes one relative range and replaces the comparisons; All removes them", () => {
    const fk = ruleKind(data, byYear, YEAR);
    let v = setItemFilter(byYear, YEAR, [2019, 2022], [2019, 2022, 2025]);
    assert.deepEqual(quickChoice(v, YEAR, fk), { id: "all", filters: [] });
    v = setQuickRange(v, YEAR, { unit: "year", count: 5 });
    const range = { field: YEAR, type: "relative", unit: "year", count: 5 };
    assert.deepEqual(quickChoice(v, YEAR, fk), { id: "years", count: 5, anchor: "today", filters: [range] });
    // the picks stay: the filters apply together
    assert.deepEqual(filtersOf(v, YEAR).map((f) => f.type).sort(), ["exclude", "relative"]);
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "year", count: 1 }), YEAR, fk).id, "thisYear");
    // months where they are not offered, two ranges, a comparison: custom rules
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "month", count: 6 }), YEAR, fk).id, "all");
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "month", count: 6 }), YEAR, { ...fk, months: true }).id, "months");
    assert.deepEqual(quickChoice(setQuickRange(norm({ rows: ["Released"] }), "Released", { unit: "day", count: 7 }), "Released", ruleKind(data, norm({ rows: ["Released"] }), "Released")).id, "days");
    // a comparison is a rule beside the quick choice: both stay, each is changed on its own
    const custom = setRule(v, YEAR, null, { field: YEAR, type: "compare", op: ">=", value: 2022 });
    assert.deepEqual(quickChoice(custom, YEAR, fk), { id: "years", count: 5, anchor: "today", filters: [range] });
    assert.deepEqual(filtersOf(setQuickRange(custom, YEAR, { unit: "year", count: 2 }), YEAR).map((f) => f.type).sort(), ["compare", "exclude", "relative"]);
    assert.deepEqual(filtersOf(setQuickRange(custom, YEAR, null), YEAR).map((f) => f.type).sort(), ["compare", "exclude"]);
    assert.deepEqual(quickChoice(setQuickRange(custom, YEAR, null), YEAR, fk), { id: "all", filters: [] });
    // a second range is a rule too: the first one that is offered is the quick choice
    const two = setRule(v, YEAR, null, { field: YEAR, type: "relative", unit: "month", count: 3 });
    assert.deepEqual(quickChoice(two, YEAR, fk).filters, [range]);
    assert.deepEqual(quickChoice(two, YEAR, { ...fk, months: true }).filters, [range]);
    // the anchor: counted back from the latest record is written, today is not; a switch rewrites the field's ranges
    const latest = setQuickRange(v, YEAR, { unit: "year", count: 2, anchor: "latest" });
    assert.deepEqual(filtersOf(latest, YEAR, ["relative"]), [{ field: YEAR, type: "relative", unit: "year", count: 2, anchor: "latest" }]);
    assert.deepEqual(quickChoice(latest, YEAR, fk).anchor, "latest");
    assert.deepEqual(filtersOf(setAnchor(latest, YEAR, "today"), YEAR, ["relative"]), [{ field: YEAR, type: "relative", unit: "year", count: 2 }]);
    assert.deepEqual(filtersOf(setAnchor(v, YEAR, "latest"), YEAR, ["relative"]), [{ ...range, anchor: "latest" }]);
    assert.deepEqual(filtersOf(setQuickRange(v, YEAR, { unit: "year", count: 2, anchor: "today" }), YEAR, ["relative"]), [{ ...range, count: 2 }]);
    // every quick choice is a view the core reads without an issue
    assert.deepEqual(normalize(setQuickRange(v, YEAR, { unit: "year", count: 3, anchor: "latest" }), data).issues, []);
    // Reset filter takes the picks, the quick choice and the rules off; Top N stays
    const topped = { ...custom, filters: [...custom.filters, { field: YEAR, type: "top", count: 2 }] };
    assert.deepEqual(filtersOf(resetFilter(topped, YEAR), YEAR).map((f) => f.type), ["top"]);
    // Remove the rules keeps the quick choice when asked to
    const both = setRule(v, YEAR, null, { field: YEAR, type: "value", by: { field: null, agg: "count" }, op: ">", value: 1 });
    assert.deepEqual(filtersOf(removeRules(both, YEAR, [range]), YEAR).map((f) => f.type).sort(), ["exclude", "relative"]);
    assert.deepEqual(filtersOf(removeRules(both, YEAR), YEAR).map((f) => f.type), ["exclude"]);
});

test("years combined: a cyclic grouping's years as whole-year comparisons; a gap is a 'not between'", () => {
    const fk = ruleKind(data, byCyclic, CYCLIC);
    const all = [2019, 2022, 2025];
    assert.deepEqual(yearRules(CYCLIC, all, all), []);
    assert.deepEqual(yearRules(CYCLIC, [2022, 2025], all), [{ field: CYCLIC, type: "compare", op: "between", value: "2022-01-01", value2: "2025-12-31" }]);
    assert.deepEqual(yearRules(CYCLIC, [2019, 2025], all), [
        { field: CYCLIC, type: "compare", op: "between", value: "2019-01-01", value2: "2025-12-31" },
        { field: CYCLIC, type: "compare", op: "notBetween", value: "2020-01-01", value2: "2024-12-31" }
    ]);
    let v = setYearsCombined(byCyclic, CYCLIC, [2019, 2025], all);
    assert.deepEqual(quickChoice(v, CYCLIC, fk, all), { id: "yearsCombined", years: [2019, 2025], filters: filtersOf(v, CYCLIC, ["compare"]) });
    // the engine keeps the two years, as months of the year
    const r = computePivot(data, { ...v, values: [{ agg: "count" }] });
    assert.deepEqual(r.rowRoot.children.map((n) => n.key), [5, 12]);
    assert.deepEqual(normalize(v, data).issues, []);
    // every year ticked: no rule; a comparison of a month's own key is a custom rule, not the years
    assert.deepEqual(filtersOf(setYearsCombined(v, CYCLIC, all, all), CYCLIC, ["compare"]), []);
    assert.deepEqual(quickChoice(setRule(byCyclic, CYCLIC, null, { field: CYCLIC, type: "compare", op: ">=", value: 6 }), CYCLIC, fk, all).id, "custom");
    // the chip says the years, not the days
    const L = MENU.en;
    assert.equal(compareText({ op: "between", value: "2022-01-01", value2: "2025-12-31" }, L, "en-US", { date: true }), "2022 to 2025");
    assert.equal(compareText({ op: "between", value: "2025-01-01", value2: "2025-12-31" }, L, "en-US", { date: true }), "2025");
    assert.equal(compareText({ op: "notBetween", value: "2020-01-01", value2: "2024-12-31" }, L, "en-US", { date: true }), "not 2020 to 2024");
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
    assert.deepEqual(filtersOf(removeRules(v, YEAR), YEAR).map((f) => f.type), ["exclude", "top"]);
    // a field in Filters stays there when its last rule goes
    const zone = addField(norm({}), "Region", "filters");
    const ruled = setRule(zone, "Region", null, { field: "Region", type: "label", op: "contains", value: "o" });
    assert.deepEqual(filtersOf(removeRules(ruled, "Region"), "Region"), [{ field: "Region", type: "exclude", items: [] }]);
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
    assert.equal(ruleText(byYear, { field: YEAR, type: "label", op: "contains", value: "2" }, { labels: L, locale: "en-US", timeZone: "UTC", date: true }), "contains “2”");
    // the first level's state: the chip's rules first, then the names' and the totals' rules
    const state = { summary: null, rules: ["last 5 years (2022–2026)"] };
    assert.equal(filterState(setRule(byYear, YEAR, null, total), YEAR, state, L, "en-US"), "last 5 years (2022–2026), Count of rows > 3");
});

test("search: quick choices with the count typed, a year compared, and the rules by name; they apply at once", () => {
    const topics = axisTopics({ view: byYear, zone: "rows", index: 0, field: YEAR, types, labels: MENU.en, locale: "en-US", encoded: data });
    const hits = (q) => searchHits(searchEntries(topics, q), q, "en-US");
    const years = relativeDateRange("year", 2);
    const last2 = hits("last 2 years")[0];
    assert.equal(last2.text, `Last 2 years (${years.from.slice(0, 4)}–${years.to.slice(0, 4)})`);
    assert.deepEqual(filtersOf(last2.choice.change().view, YEAR, RULE_TYPES), [{ field: YEAR, type: "relative", unit: "year", count: 2 }]);
    // a range counted back from the latest record (2025): the search's choices count from it too
    const anchored = axisTopics({ view: setQuickRange(byYear, YEAR, { unit: "year", count: 1, anchor: "latest" }), zone: "rows", index: 0, field: YEAR, types, labels: MENU.en, locale: "en-US", encoded: data });
    const hit = searchHits(searchEntries(anchored, "last 3 years"), "last 3 years", "en-US")[0];
    assert.equal(hit.text, "Last 3 years (2023–2025)");
    assert.deepEqual(filtersOf(hit.choice.change().view, YEAR, RULE_TYPES), [{ field: YEAR, type: "relative", unit: "year", count: 3, anchor: "latest" }]);
    // a cyclic grouping has no quick choices to find
    const cyclic = axisTopics({ view: byCyclic, zone: "rows", index: 0, field: CYCLIC, types, labels: MENU.en, locale: "en-US", encoded: data });
    assert.equal(searchHits(searchEntries(cyclic, "last 2 years"), "last 2 years", "en-US").length, 0);
    // a year grouping: no months
    assert.equal(hits("last 2 months").length, 0);
    const from = hits("from 2022")[0];
    assert.equal(from.text, "From 2022");
    assert.deepEqual(filtersOf(from.choice.change().view, YEAR, RULE_TYPES), [{ field: YEAR, type: "compare", op: ">=", value: 2022 }]);
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
    const label = { field: "Region", type: "label", op: "contains", value: "linux" };
    assert.equal(itemRuleText(label, MENU.en, "en-US", { timeZone: "UTC", date: false }), "contains “linux”");
    assert.equal(itemRuleText(label, MENU.de, "de-DE", { timeZone: "UTC", date: false }), "enthält „linux“");
    // the chip's words already hold it: the first level does not say it twice
    const v = setRule(norm({ rows: ["Region"] }), "Region", null, label);
    assert.equal(filterState(v, "Region", { summary: null, rules: ["contains “linux”"] }, MENU.en, "en-US"), "contains “linux”");
    assert.equal(filterState(v, "Region", null, MENU.en, "en-US"), "contains “linux”");
    const say = (forms, n, lang) => plural(forms, n, { lang, locale: lang === "de" ? "de-DE" : "en-US" });
    assert.equal(say(MENU.de.quickLast.year, 1, "de"), "Letztes 1 Jahr");
    assert.equal(say(MENU.de.quickLast.month, 3, "de"), "Letzte 3 Monate");
    assert.equal(say(MENU.en.quickLast.year, 1, "en"), "Last 1 year");
    assert.equal(`${say(MENU.de.lastOp, 1, "de")} 1 ${say(MENU.de.ruleUnits.month, 1, "de")}`, "im letzten 1 Monat");
    assert.equal(`${say(MENU.de.lastOp, 3, "de")} 3 ${say(MENU.de.ruleUnits.month, 3, "de")}`, "in den letzten 3 Monaten");
});
