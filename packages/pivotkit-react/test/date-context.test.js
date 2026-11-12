import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, toGrid } from "pivotkit-core";
import { dateContext, dateRangeText, yearSetText, yearsOf } from "../src/date-context.js";
import { calendarDays, groupHint, groupStats } from "../src/group-context.js";
import { LABELS } from "../src/labels.js";
import { en } from "../src/menu-labels.js";
import { de } from "../src/menu-labels-de.js";

const data = encode([{Date: "2024-01-01", Amount: 1}, {Date: "2025-12-31", Amount: 2}, {Date: null, Amount: 3}]);
const view = { rows: ["Month"], derived: [{name: "Month", field: "Date", by: "month"}], values: [{field: "Amount", agg: "sum"}] };
test("date context describes all data, combines distinct filtered years and never changes saved names", () => {
    const result = computePivot(data, view);
    const context = dateContext(result, LABELS.en);
    assert.deepEqual(yearsOf(result, "Date"), [2024, 2025]);
    assert.equal(context.labels.core.fields.Month, "Month · 2024–2025 combined");
    assert.equal(context.ranges[0].text, "Jan 1, 2024 – Dec 31, 2025");
    assert.deepEqual(result.view.rows, ["Month"]);
    assert.equal(result.rowColumns[0].labeler(1, "en-US"), "Jan");
});
test("one filtered year is written on cyclic items and no combined suffix remains", () => {
    const result = computePivot(data, {...view, filters: [{field: "Date", type: "compare", op: ">=", value: "2025-01-01"}]});
    const context = dateContext(result, LABELS.en);
    assert.deepEqual(yearsOf(result, "Date"), [2025]);
    assert.equal(context.labels.core.fields.Month, undefined);
    assert.match(JSON.stringify(toGrid(context.result)), /Dec 2025/);
});
test("empty/non-date fields have no fabricated range; German range and Group hints use real dates", () => {
    assert.equal(dateRangeText(null, "en-US"), "");
    assert.equal(groupHint(data, "Date", "yearQuarter", "en-US", {...LABELS.en, ...en}), "Q1 2024 … Q4 2025 (8)");
    assert.match(groupHint(data, "Date", "month", "de-DE", {...LABELS.de, ...de}), /2 Jahre zusammen/);
    assert.match(dateContext(computePivot(data, view), LABELS.de).labels.core.fields.Month, /zusammengefasst/);
    assert.deepEqual(dateContext(computePivot(data, {values: [{field: "Amount", agg: "sum"}]}), LABELS.en).ranges, []);
});

test("year sets preserve gaps and day counts normalize both endpoints", () => {
    assert.equal(yearSetText([2023, 2025]), "2023, 2025");
    assert.equal(yearSetText([2022, 2023, 2025, 2026]), "2022–2023, 2025–2026");
    assert.equal(calendarDays({min: Date.UTC(2025, 0, 1, 23), max: Date.UTC(2025, 0, 2, 1)}), 2);
});
test("one Group dictionary scan supplies every unit's hints", () => {
    let reads = 0;
    const counted = {...data, column: (field) => { reads++; return data.column(field); }};
    const stats = groupStats(counted, "Date");
    for (const unit of ["year", "yearQuarter", "yearMonth", "yearWeek", "day", "quarter", "month", "week", "weekday", "hour"]) groupHint(counted, "Date", unit, "en-US", {...LABELS.en, ...en}, stats);
    assert.equal(reads, 1);
});

test("year scans are reused across derived fields and table/chart contexts", () => {
    const result = computePivot(data, {...view, derived: [...view.derived, {name:"Quarter", field:"Date", by:"quarter"}]});
    let reads = 0;
    const counted = {...result, encoded: {...result.encoded, column: (field) => { if (field === "Date") reads++; return result.encoded.column(field); }}};
    const first = yearsOf(counted, "Date");
    assert.strictEqual(yearsOf(counted, "Date"), first);
    assert.equal(reads, 1);
    dateContext(counted, LABELS.en);
    dateContext(counted, LABELS.en);
    // Footer spans have their own immutable-dataset cache; year scans remain shared.
    assert.strictEqual(yearsOf(counted, "Date"), first);
});

test("cyclic hints preserve gaps and cross-year month/quarter coverage", () => {
    const season = encode(["2024-11-01", "2024-12-01", "2025-01-01", "2025-02-01"].map(Date => ({Date})));
    const labels = {...LABELS.en, ...en};
    assert.equal(groupHint(season, "Date", "month", "en-US", labels), "Jan–Feb, Nov–Dec · 2 years together");
    assert.equal(groupHint(season, "Date", "quarter", "en-US", labels), "Q1, Q4 · 2 years together");
});

test("one-day/year Group labels use singular forms in English and German", async () => {
    const {plural, fill} = await import("../src/labels.js");
    const single = encode([{Date:"2024-01-01"}]);
    for (const [labels, locale, day, year] of [[{...LABELS.en,...en},"en-US","day","year together"],[{...LABELS.de,...de},"de-DE","Tag","Jahr zusammen"]]) {
        assert.match(groupHint(single,"Date","month",locale,labels), new RegExp(`1 ${year}$`));
        assert.match(fill(plural(labels.groupDataRange,1,{lang:labels.lang,locale}),{range:"R"}),new RegExp(`1 ${day}\\)`));
    }
});

test("view-derived __proto__ is an own display label, not a prototype setter", () => {
    const result = computePivot(data, {...view, rows:["__proto__"], derived:[{name:"__proto__",field:"Date",by:"month"}]});
    const context = dateContext(result,LABELS.en);
    assert.ok(Object.hasOwn(context.labels.core.fields,"__proto__"));
    assert.match(context.labels.core.fields.__proto__, /2024–2025 combined/);
    assert.equal(Object.getPrototypeOf(context.labels.core.fields),Object.prototype);
});

test("combined and single-year context follows the effective calendar and digits", () => {
    for (const locale of ["th-TH", "ar-EG"]) {
        const fmt = new Intl.DateTimeFormat(locale,{year:"numeric",timeZone:"UTC"});
        const result = computePivot(data, {...view,formatting:{locale}});
        const context = dateContext(result,LABELS.en);
        assert.ok(context.labels.core.fields.Month.includes(fmt.format(Date.UTC(2024,0,1))));
        const single = computePivot(data, {...view,formatting:{locale},filters:[{field:"Date",type:"compare",op:">=",value:"2025-01-01"}]});
        const monthFmt = new Intl.DateTimeFormat(locale,{month:"short",year:"numeric",timeZone:"UTC"});
        const expected = locale === "th-TH" ? monthFmt.format(Date.UTC(2025,11,31)) : fmt.format(Date.UTC(2025,0,1));
        assert.ok(JSON.stringify(toGrid(dateContext(single,LABELS.en).result)).includes(expected));
    }
});

test("timeline Group endpoint years follow core Gregorian labels", () => {
    for (const locale of ["th-TH", "ar-EG", "ja-JP-u-ca-japanese"]) {
        for (const unit of ["year", "yearQuarter"]) {
            const hint = groupHint(data,"Date",unit,locale,{...LABELS.en,...en});
            assert.ok(hint.includes("2024"));
            assert.ok(hint.includes("2025"));
        }
    }
});


test("Japanese calendar context uses observed eras within a Gregorian year", () => {
    const locale = "ja-JP-u-ca-japanese";
    const fmt = new Intl.DateTimeFormat(locale, {year: "numeric", timeZone: "UTC"});
    const sample = (dates) => computePivot(encode(dates.map(Date => ({Date, Amount: 1}))), {...view, formatting: {locale}});
    const june = dateContext(sample(["2019-06-01"]), LABELS.en);
    assert.ok(JSON.stringify(toGrid(june.result)).includes(fmt.format(Date.UTC(2019,5,1))));
    assert.ok(!JSON.stringify(toGrid(june.result)).includes(fmt.format(Date.UTC(2019,0,1))));
    const transition = dateContext(sample(["2019-04-01", "2019-06-01"]), LABELS.en);
    assert.ok(transition.labels.core.fields.Month.includes(fmt.format(Date.UTC(2019,3,1))));
    assert.ok(transition.labels.core.fields.Month.includes(fmt.format(Date.UTC(2019,5,1))));
    assert.match(transition.labels.core.fields.Month, /combined/);
});

test("date spans reuse date scans per immutable dataset without caching non-date fields", async () => {
    const {dateSpan} = await import("../src/view-ops.js");
    let reads = 0;
    const counted = {...data, column: (field) => { reads++; return data.column(field); }};
    const span = dateSpan(counted, "Date");
    assert.strictEqual(dateSpan(counted, "date"), span);
    dateSpan(counted, "Amount"); dateSpan(counted, "Amount");
    assert.equal(reads, 3);
    const next = encode([{Date: "2030-01-01"}]);
    assert.equal(dateSpan(next, "Date").min, Date.UTC(2030,0,1));
});

test("100k nonconsecutive observed years have bounded retained spans and labels", () => {
    const rows = Array.from({length: 100000}, (_, i) => {
        const date = new Date(0);
        date.setUTCFullYear(1000 + 2 * i, 0, 1);
        return date.getTime();
    });
    const result = computePivot(encode({columns:["Date","Amount"], types:["date","number"], data:[rows, rows.map(() => 1)]}), view);
    assert.equal(yearsOf(result, "Date").length, 32);
    const label = dateContext(result, LABELS.en).labels.core.fields.Month;
    assert.match(label, /… combined$/);
    assert.ok(label.length < 400);
    assert.equal(groupStats(result.encoded, "Date").years, 100000);
    assert.ok(yearSetText(Array.from({length: 100000}, (_, i) => 1000 + 2 * i)).length < 400);
});

test("cyclic week labels do not claim a single Gregorian year is an ISO week-year", () => {
    const result = computePivot(encode([{Date:"2018-01-01", Amount:1}, {Date:"2018-12-31", Amount:2}]),
        {...view, rows:["Week"], derived:[{name:"Week", field:"Date", by:"week"}]});
    const grid = JSON.stringify(toGrid(dateContext(result, LABELS.en).result));
    assert.match(grid, /W01/);
    assert.doesNotMatch(grid, /W01 2018/);
});

test("nonrepresentable typed dates cannot crash field info, footer, years or Group hints", async () => {
    const {dateSpan} = await import("../src/view-ops.js");
    const invalid = {columns:["Date", "Amount"], types:["date", "number"], data:[[8.64e15 + 1, -8.64e15 - 1], [1, 2]]};
    const encoded = encode(invalid);
    assert.equal(dateSpan(encoded, "Date"), null);
    assert.equal(groupStats(encoded, "Date"), null);
    const result = computePivot(encoded, {values:[{field:"Amount", agg:"sum"}]});
    assert.deepEqual(yearsOf(result, "Date"), []);
    assert.doesNotThrow(() => dateContext(result, LABELS.en));
    assert.equal(dateRangeText({min:0, max:8.64e15 + 1}, "en-US"), "");
    const mixed = encode({...invalid, data:[[8.64e15 + 1, Date.UTC(2024,0,1)], [1,2]]});
    assert.deepEqual(dateSpan(mixed,"Date"), {min:Date.UTC(2024,0,1), max:Date.UTC(2024,0,1)});
    assert.equal(groupStats(mixed,"Date").years, 1);
});

test("historical cyclic year context distinguishes BCE and CE including year zero", () => {
    assert.equal(yearSetText([0, 1]), "1 BC–1");
    const values = ["0000-01-01", "0001-01-01"].map(day => Date.parse(`${day}T00:00Z`));
    const typed = dates => encode({columns:["Date", "Amount"], types:["date", "number"], data:[dates, dates.map(() => 1)]});
    const combined = dateContext(computePivot(typed(values), view), LABELS.en);
    assert.equal(combined.labels.core.fields.Month, "Month · 1 BC–1 combined");
    assert.match(combined.ranges[0].text, /BC/);
    const single = dateContext(computePivot(typed([values[0]]), view), LABELS.en);
    assert.match(JSON.stringify(toGrid(single.result)), /Jan 1 BC/);
    assert.equal(groupHint(typed(values), "Date", "year", "en-US", {...LABELS.en,...en}), "0 … 1 (2)");
});

test("cyclic month hints use Gregorian grouping semantics in non-Gregorian locales", () => {
    const january = encode([{Date: "2024-01-15"}]);
    for (const locale of ["en-US-u-ca-islamic", "ar-SA", "he-IL-u-ca-hebrew"]) {
        const month = new Intl.DateTimeFormat(locale, {calendar:"gregory",month:"short",timeZone:"UTC"}).format(Date.UTC(2024,0,15));
        assert.ok(groupHint(january,"Date","month",locale,{...LABELS.en,...en}).startsWith(`${month} ·`));
    }
});


test("single-year cyclic months describe observed calendar months, never synthetic year-2000 months", () => {
    for (const locale of ["en-US-u-ca-islamic", "he-IL-u-ca-hebrew", "ar-SA"]) {
        const fmt = new Intl.DateTimeFormat(locale, {month:"short",year:"numeric",timeZone:"UTC"});
        for (const days of [["2024-01-15"], ["2024-01-01", "2024-01-31"]]) {
            const result = computePivot(encode(days.map(Date => ({Date, Amount:1}))), {...view, formatting:{locale}});
            const grid = JSON.stringify(toGrid(dateContext(result,LABELS.en).result));
            for (const day of days) assert.ok(grid.includes(fmt.format(Date.parse(day))), grid);
        }
    }
});

test("date ranges reuse formatters for large date schemas and distinguish era options", () => {
    const Original = Intl.DateTimeFormat;
    let constructions = 0;
    Intl.DateTimeFormat = function(...args) { constructions++; return new Original(...args); };
    try {
        const locale = "en-GB-u-nu-arab";
        const modern = {min:Date.UTC(2024,0,1),max:Date.UTC(2024,11,31)};
        const ancient = {min:Date.parse("0000-01-01T00:00Z"),max:Date.parse("0001-01-01T00:00Z")};
        for (let i=0;i<1000;i++) {
            assert.ok(dateRangeText(modern,locale));
            assert.match(dateRangeText(ancient,locale), /BC/);
        }
        assert.ok(constructions <= 2, `${constructions} formatters constructed`);
    } finally { Intl.DateTimeFormat = Original; }
});


test("combined cyclic month keys use localized Gregorian names", () => {
    const locale = "en-US-u-ca-islamic-civil";
    const result = computePivot(encode(["2024-01-15", "2024-08-15"].map(Date => ({Date, Amount:1}))), {...view, formatting:{locale}});
    const context = dateContext(result, LABELS.en);
    assert.match(context.labels.core.fields.Month, /combined/);
    const grid = JSON.stringify(toGrid(context.result));
    const fmt = new Intl.DateTimeFormat(locale, {calendar:"gregory", month:"short", timeZone:"UTC"});
    for (const month of [0,7]) assert.ok(grid.includes(fmt.format(Date.UTC(2024,month,15))), grid);
});

test("Group navigation reuses bounded shared date formatters", () => {
    const Original = Intl.DateTimeFormat;
    let constructions = 0;
    Intl.DateTimeFormat = function(...args) { constructions++; return new Original(...args); };
    try {
        const stats = groupStats(data, "Date");
        for (let i=0;i<10;i++) for (const unit of ["year","yearQuarter","yearMonth","yearWeek","day","quarter","month","week","weekday","hour"])
            groupHint(data,"Date",unit,"en-GB-u-nu-deva",{...LABELS.en,...en},stats);
        assert.ok(constructions <= 4, `${constructions} formatters constructed`);
    } finally { Intl.DateTimeFormat = Original; }
});

test("unused derived definitions never traverse surviving rows", () => {
    const result = computePivot(data, {...view, rows:[], cols:[], filters:[]});
    const counted = {...result, rows: new Proxy(result.rows, {get(target, key) { if (key === Symbol.iterator) throw new Error("unused source year scan"); return Reflect.get(target,key); }})};
    assert.doesNotThrow(() => dateContext(counted, LABELS.en));
});

test("localized context coalesces the same calendar year across Gregorian boundaries", () => {
    const locale = "en-US-u-ca-islamic-civil";
    const result = computePivot(encode(["2024-12-31", "2025-01-01"].map(Date => ({Date, Amount:1}))), {...view, formatting:{locale}});
    const year = new Intl.DateTimeFormat(locale,{year:"numeric",timeZone:"UTC"}).format(Date.UTC(2024,11,31));
    assert.equal(dateContext(result,LABELS.en).labels.core.fields.Month, `Month · ${year} combined`);
});

test("timeline year and quarter hints match actual derived labels for calendar and digits", () => {
    for (const locale of ["ar-EG", "th-TH-u-ca-buddhist"]) {
        for (const unit of ["year", "yearQuarter"]) {
            const r = computePivot(data, {rows:["Period"], derived:[{name:"Period",field:"Date",by:unit}],values:[{agg:"count"}],formatting:{locale}});
            const hint = groupHint(data,"Date",unit,locale,{...LABELS.en,...en});
            for (const value of unit === "year" ? [2024, 2025] : [20241, 20254]) assert.ok(hint.includes(r.rowColumns[0].labeler(value,locale)), hint);
        }
    }
});

test("timeline month hints preserve historical years zero through 99 and BCE endpoints", () => {
    for (const days of [["0001-02-15", "0099-11-20"], ["0000-01-15", "0001-12-20"], ["-000001-03-15", "0000-08-20"]]) {
        const values = days.map(day => Date.parse(`${day}T00:00Z`));
        const historical = encode({columns:["Date"],types:["date"],data:[values]});
        for (const locale of ["en-US", "de-DE", "en-US-u-ca-islamic-civil"]) {
            const dates = values.map(value => new Date(value));
            const fmt = new Intl.DateTimeFormat(locale,{year:"numeric",month:"short",timeZone:"UTC",era:dates[0].getUTCFullYear() <= 0 ? "short" : undefined});
            const expected = dates.map(date => { date.setUTCDate(1); return fmt.format(date); });
            const count = (dates[1].getUTCFullYear()-dates[0].getUTCFullYear())*12 + dates[1].getUTCMonth()-dates[0].getUTCMonth()+1;
            assert.equal(groupHint(historical,"Date","yearMonth",locale,{...LABELS.en,...en}),`${expected[0]} … ${expected[1]} (${count})`);
        }
    }
});

test("date-span LRU remains bounded across unlimited host columns", async () => {
    const {dateSpan} = await import("../src/view-ops.js");
    const {LIMITS} = await import("pivotkit-core");
    const columns = Array.from({length: LIMITS.cacheEntries + 1}, (_, i) => `Date${i}`);
    const dates = encode({columns, types: columns.map(() => "date"), data: columns.map(() => [0])});
    const first = dateSpan(dates, columns[0]);
    const second = dateSpan(dates, columns[1]);
    for (let i = 2; i < LIMITS.cacheEntries; i++) dateSpan(dates, columns[i]);
    // Arbitrarily many non-date/missing fields must not consume retained entries.
    for (let i = 0; i < 1000; i++) assert.equal(dateSpan(dates, `Missing${i}`), null);
    assert.strictEqual(dateSpan(dates, columns[0].toLowerCase()), first, "a hit refreshes LRU recency");
    dateSpan(dates, columns[LIMITS.cacheEntries]);
    assert.strictEqual(dateSpan(dates, columns[0]), first, "recent date remains cached");
    const rescanned = dateSpan(dates, columns[1]);
    assert.deepEqual(rescanned, second, "eviction preserves the computed span");
    assert.notStrictEqual(rescanned, second, "least recently used date was evicted and rescanned");
});
