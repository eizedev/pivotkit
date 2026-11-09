// The Filter level's rules and quick choices as pure view changes, their words (en, de), and the
// search entries made from what is typed ("last 3 years", "from 2022").
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize, relativeDateRange } from "pivotkit-core";
import { LABELS, plural } from "../src/labels.js";
import { en as menuEn } from "../src/menu-labels.js";
import { de as menuDe } from "../src/menu-labels-de.js";
import { RULES_MAX, RULE_TYPES, filterState, quickChoice, removeRules, ruleKind, ruleText, setItemFilter, setQuickRange, setRule } from "../src/menu-ops.js";
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

test("ruleKind: how the rules compare a field's items, and which quick choices a date field has", () => {
    assert.deepEqual(ruleKind(data, norm({ rows: ["Price"] }), "Price"), { item: "number", dates: false, months: false });
    assert.deepEqual(ruleKind(data, norm({ rows: ["Released"] }), "Released"), { item: "date", dates: true, months: true });
    assert.deepEqual(ruleKind(data, byYear, YEAR), { item: "group", dates: true, months: false });
    assert.deepEqual(ruleKind(data, byMonth, "Released (Month)"), { item: "group", dates: true, months: true });
    assert.deepEqual(ruleKind(data, norm({ rows: ["Region"] }), "Region"), { item: null, dates: false, months: false });
});

test("quick choices: each writes one relative range and replaces the comparisons; All removes them", () => {
    let v = setItemFilter(byYear, YEAR, [2019, 2022], [2019, 2022, 2025]);
    assert.deepEqual(quickChoice(v, YEAR, false), { id: "all" });
    v = setQuickRange(v, YEAR, { unit: "year", count: 5 });
    assert.deepEqual(quickChoice(v, YEAR, false), { id: "years", count: 5 });
    // the picks stay: the filters apply together
    assert.deepEqual(filtersOf(v, YEAR).map((f) => f.type).sort(), ["exclude", "relative"]);
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "year", count: 1 }), YEAR, false), { id: "thisYear", count: 1 });
    // months where they are not offered, two ranges, a comparison: custom rules
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "month", count: 6 }), YEAR, false), { id: "custom" });
    assert.deepEqual(quickChoice(setQuickRange(v, YEAR, { unit: "month", count: 6 }), YEAR, true), { id: "months", count: 6 });
    const custom = setRule(v, YEAR, null, { field: YEAR, type: "compare", op: ">=", value: 2022 });
    assert.deepEqual(quickChoice(custom, YEAR, false), { id: "custom" });
    // a quick choice replaces the range and the comparison, All takes both away
    assert.deepEqual(filtersOf(setQuickRange(custom, YEAR, { unit: "year", count: 2 }), YEAR).map((f) => f.type).sort(), ["exclude", "relative"]);
    assert.deepEqual(filtersOf(setQuickRange(custom, YEAR, null), YEAR).map((f) => f.type), ["exclude"]);
    // every quick choice is a view the core reads without an issue
    assert.deepEqual(normalize(setQuickRange(v, YEAR, { unit: "year", count: 3 }), data).issues, []);
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
    assert.equal(rangeText("year", 5, "en-US", "UTC", now), "2022–2026");
    assert.equal(rangeText("year", 1, "en-US", "UTC", now), "2026");
    assert.equal(rangeText("month", 3, "en-US", "UTC", now), "Sep 2026–Nov 2026");
    assert.equal(rangeText("day", 1, "en-US", "UTC", now), "Nov 9, 2026");
    assert.equal(relativeText({ unit: "year", count: 5 }, L, "en-US", "UTC", now), "last 5 years (2022–2026)");
    assert.equal(relativeText({ unit: "year", count: 1 }, L, "en-US", "UTC", now), "this year (2026)");
    assert.equal(relativeText({ unit: "month", count: 12 }, MENU.de, "de-DE", "UTC", now), "letzte 12 Monate (Dez. 2025–Nov. 2026)");
    // today in the data's time zone: New Year's night in UTC is still December in New York
    assert.equal(rangeText("year", 1, "en-US", "America/New_York", new Date("2026-01-01T03:00:00Z")), "2025");
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
