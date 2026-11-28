import { test } from "node:test";
import assert from "node:assert/strict";
import { DESCRIBE_LABELS, DESCRIBE_LIMITS, PivotkitError, describeLabels, describeSource, describeView, encode, relativeDateRange, suggestLayout } from "../src/index.js";
import { COMPARE_OPS, COMPARE_PRECISIONS, TEXT_OPS } from "../src/filters.js";
import { RELATIVE_DIRECTIONS, RELATIVE_UNITS } from "../src/relative.js";
import { CHART_TYPES } from "../src/view.js";
import { SALES } from "./fixtures.js";

const data = encode(SALES);

test("describeSource: each field's type, items, blanks, range, and what works on it", () => {
    const d = describeSource(data);
    assert.equal(d.rows, 8);
    const region = d.fields.find((f) => f.name === "Region");
    assert.deepEqual(region, {
        name: "Region", type: "string", distinct: 3, blanks: 1, items: ["North", "South", "West"],
        aggregators: region?.aggregators, filters: ["in", "blank", "text", "top", "value"], text: "Region: string, 3 distinct, 1 blank"
    });
    assert.ok(region?.aggregators.includes("count") && !region.aggregators.includes("sum"));
    const date = d.fields.find((f) => f.name === "Date");
    assert.equal(date?.min, "2025-12-31");
    assert.equal(date?.max, "2026-04-30");
    assert.deepEqual(date?.filters, ["in", "blank", "text", "compare", "relative", "top", "value"]);
    assert.equal(d.fields.find((f) => f.name === "Units")?.text, "Units: number, 7 distinct, 1 blank, from 1 to 7");
    assert.match(d.text, /^8 rows, 6 fields: Region \(string\), Product \(string\)/);
    // capped items; a schema without data: types only
    assert.equal(describeSource(data, { items: 2 }).fields[0].items?.length, 2);
    const typesOnly = describeSource(data.schema).fields[0];
    assert.equal(typesOnly.items, undefined);
    assert.equal(describeSource([{ name: "A", type: "number" }]).rows, null);
    assert.equal(DESCRIBE_LIMITS.items, 20);
    // rows that are not encoded are no fields: an error that says so, not "0 fields"
    assert.throws(() => describeSource([{ Region: "North" }]), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT" && /encode\(\)/.test(e.message));
    for (const raw of [
        [{ name: "Alice", age: 3 }],
        [{ name: "Alice", type: 3 }],
        [{ name: "Alice", type: "customer" }],
        [{ name: "A", type: "number" }, { name: "Alice", age: 3 }]
    ]) {
        assert.throws(() => describeSource(raw), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT" && /encode\(\)/.test(e.message));
    }
    // encoded rows with a `name` column work; encoded.schema.fields and field objects with extra keys pass
    const namedRows = encode([{ name: "Alice", age: 3 }]);
    assert.deepEqual(describeSource(namedRows).fields.map((f) => [f.name, f.type]), [["name", "string"], ["age", "number"]]);
    assert.equal(describeSource(data.schema.fields).fields.length, data.schema.fields.length);
    const extraFields = describeSource([
        { name: "Region", type: "string", detected: "string", label: "Area" },
        { name: "Flag", type: "boolean", extra: true },
        { name: "Empty", type: "null" }
    ]);
    assert.deepEqual(extraFields.fields.map((f) => [f.name, f.type]), [["Region", "string"], ["Flag", "boolean"], ["Empty", "null"]]);
    assert.equal(describeSource([]).fields.length, 0);
    // a field name from the data is capped in the words, as its items are
    const long = describeSource(encode([{ ["N".repeat(500)]: 1 }]));
    assert.equal(long.fields[0].name.length, 500);
    assert.ok(long.text.length < 200 && long.fields[0].text.length < 200, long.text);
});

test("describeView: an invalid view says so in its words, and an empty list of items is named", () => {
    const d = describeView({ version: 2, rows: ["Nope"], filters: [{ field: "Region", type: "compare", op: "!=", value: 3, blanks: "exclude" }] }, data);
    assert.equal(d.valid, false);
    assert.equal(d.text, "(invalid: 2 errors, the parts they name are left out) count of rows");
    assert.equal(describeView({ version: 2, filters: [{ field: "Region", type: "in", items: [], blanks: "include" }] }, data).filters[0].text, "Region is one of (no items) (blanks kept)");
});

test("describeView: the view in parts, each with its words, and what is wrong with it", () => {
    const d = describeView(
        {
            version: 2,
            rows: ["Region"],
            cols: ["Product"],
            values: [{ field: "Units", agg: "sum" }],
            filters: [
                { field: "Region", type: "in", items: ["North", "South"], blanks: "exclude" },
                { field: "Rep", type: "text", op: "contains", value: "an", not: true, blanks: "include" },
                { field: "Date", type: "relative", unit: "month", count: 3, calendar: false, blanks: "exclude" },
                { field: "Region", type: "top", count: 1, ties: "all" },
                { field: "Product", type: "value", op: "between", value: 1, value2: 9, by: { field: "Units", agg: "sum" } }
            ],
            display: "chart",
            chart: { type: "bar" }
        },
        data
    );
    assert.equal(d.valid, true);
    assert.deepEqual(d.filters.map((f) => f.text), [
        'Region is one of "North", "South" (blanks dropped)',
        'Rep does not contain "an", case insensitive, whitespace collapse (blanks kept)',
        "Date is in the last 3 months (rolling) (blanks dropped)",
        "top 1 Region by sum of Units, ties kept",
        "Product where sum of Units is between 1 and 9"
    ]);
    assert.equal(d.text, 'sum of Units by Region across Product where Region is one of "North", "South" (blanks dropped); and Rep does not contain "an", case insensitive, whitespace collapse (blanks kept); and Date is in the last 3 months (rolling) (blanks dropped); and top 1 Region by sum of Units, ties kept; and Product where sum of Units is between 1 and 9 as a bar chart');
    assert.deepEqual(d.display, { mode: "chart", chart: "bar" });
    // what is wrong: errors and warnings with their hints
    const bad = describeView({ rows: ["Regoin"], filters: [{ field: "Region", type: "in", items: ["north"] }] }, data);
    assert.equal(bad.valid, false);
    assert.deepEqual(bad.errors.map((e) => [e.code, e.params?.suggestion]), [["unknownField", "Region"]]);
    assert.deepEqual(bad.warnings.map((w) => [w.code, w.params?.suggestion]), [["itemCase", "North"], ["blanksUnspecified", undefined]]);
    assert.equal(bad.text, '(invalid: 1 error, the parts they name are left out) count of rows where Region is one of "north" (blanks dropped)');
});

test("describeSource counts in the singular for one row and one field", () => {
    assert.equal(describeSource(encode([{ A: 1 }])).text, "1 row, 1 field: A (number)");
});

// #696: a date item of a sort's column read as milliseconds ("in the column 1767571200000")
test("describeView names a date item of a sort's column as its day, other items as they are", () => {
    const day = Date.UTC(2026, 0, 5);
    const d = describeView({ version: 2, rows: ["Region"], cols: ["Date", "Product"], values: [{ field: "Units", agg: "sum" }], sort: [{ field: "Region", by: "value", value: { field: "Units", agg: "sum" }, column: [day, "A"], order: "desc" }] }, data);
    assert.equal(d.valid, true, JSON.stringify(d.errors));
    assert.equal(d.sort[0].text, "Region by sum of Units in the column 2026-01-05 › A, descending");
    assert.deepEqual(d.sort[0].column, [day, "A"], "the structured part keeps the key");
    // a grouping of a date that is itself a date (day) reads as a day too; a number grouping stays a number
    const grouped = describeView({ version: 2, rows: ["Region"], cols: ["Day", "Month"], derived: [{ name: "Day", field: "Date", by: "day" }, { name: "Month", field: "Date", by: "month" }], values: [{ field: "Units", agg: "sum" }], sort: [{ field: "Region", by: "value", value: { field: "Units", agg: "sum" }, column: [day, 1], order: "asc" }] }, data);
    assert.equal(grouped.sort[0].text, "Region by sum of Units in the column 2026-01-05 › 1, ascending");
    // a time of day keeps its minute; a key no date can hold stays a number instead of throwing
    const at = (key) => describeView({ version: 2, rows: ["Region"], cols: ["Date"], values: [{ field: "Units", agg: "sum" }], sort: [{ field: "Region", by: "value", value: { field: "Units", agg: "sum" }, column: [key], order: "asc" }] }, data).sort[0]?.text;
    assert.equal(at(day + 3600000), "Region by sum of Units in the column 2026-01-05T01:00, ascending");
    assert.equal(at(1e20), "Region by sum of Units in the column 100000000000000000000, ascending");
});

test("describeView: a comparison and a text rule in words for each operator, with not", () => {
    const data = encode(SALES);
    const text = (filter) => describeView({ version: 2, filters: [{ blanks: "exclude", ...filter }] }, data).filters[0].text;
    assert.equal(text({ field: "Units", type: "compare", op: "=", value: 5 }), "Units is 5 (blanks dropped)");
    assert.equal(text({ field: "Units", type: "compare", op: "=", value: 5, not: true }), "Units is not 5 (blanks dropped)");
    assert.equal(text({ field: "Units", type: "compare", op: ">=", value: 5 }), "Units is at least 5 (blanks dropped)");
    assert.equal(text({ field: "Units", type: "compare", op: "<", value: 5, not: true }), "Units is not less than 5 (blanks dropped)");
    assert.equal(text({ field: "Units", type: "compare", op: "between", value: 1, value2: 9 }), "Units is between 1 and 9 (blanks dropped)");
    assert.equal(describeView({ version: 2, filters: [{ field: "Region", type: "value", op: "=", value: 5, by: { field: "Units", agg: "sum" } }] }, data).filters[0].text, "Region where sum of Units is 5");
    assert.equal(text({ field: "Rep", type: "text", op: "beginsWith", value: "A" }), 'Rep begins with "A", case insensitive, whitespace collapse (blanks dropped)');
    assert.equal(text({ field: "Rep", type: "text", op: "endsWith", value: "n", not: true }), 'Rep does not end with "n", case insensitive, whitespace collapse (blanks dropped)');
    assert.equal(text({ field: "Rep", type: "text", op: "equals", value: "Ann", not: true }), 'Rep does not equal "Ann", case insensitive, whitespace collapse (blanks dropped)');
});

test("describeView in German: every filter type, the parts and the whole sentence", () => {
    const de = { labels: DESCRIBE_LABELS.de };
    const text = (filter) => describeView({ version: 2, filters: [{ blanks: "exclude", ...filter }] }, data, de).filters[0].text;
    // "=" is the value alone, as in English: "Units ist 5", never "ist ist"
    assert.equal(text({ field: "Units", type: "compare", op: "=", value: 5 }), "Units ist 5, ohne leere Werte");
    assert.equal(text({ field: "Units", type: "compare", op: "=", value: 5, not: true }), "Units ist nicht 5, ohne leere Werte");
    assert.equal(text({ field: "Units", type: "compare", op: "between", value: 1, value2: 9 }), "Units ist zwischen 1 und 9, ohne leere Werte");
    assert.equal(text({ field: "Date", type: "compare", op: ">", value: "2026-01-01", precision: "month" }), "Date ist größer als „2026-01-01“ (nach Monat), ohne leere Werte");
    assert.equal(text({ field: "Region", type: "in", items: ["North", "South"], blanks: "include" }), "Region ist einer der Werte „North“; „South“, mit leeren Werten");
    assert.equal(text({ field: "Region", type: "in", items: [], not: true }), "Region ist keiner der Werte (keine Einträge), ohne leere Werte");
    assert.equal(text({ field: "Region", type: "blank", not: true }), "Region ist nicht leer");
    assert.equal(text({ field: "Rep", type: "text", op: "contains", value: "a", on: "label" }), "Rep (wie angezeigt) enthält „a“, Groß- und Kleinschreibung egal, Leerraum zusammengefasst, ohne leere Werte");
    assert.equal(text({ field: "Rep", type: "text", op: "endsWith", value: "n", not: true, match: { case: "sensitive", whitespace: "exact" } }), "Rep endet nicht auf „n“, Groß- und Kleinschreibung beachtet, Leerraum genau, ohne leere Werte");
    assert.equal(text({ field: "Date", type: "relative", direction: "this", unit: "year" }), "Date ist in diesem Jahr, ohne leere Werte");
    assert.equal(text({ field: "Date", type: "relative", direction: "next", count: 3, unit: "week", anchor: "2026-01-05" }), "Date ist in den nächsten 3 Wochen (gezählt ab 2026-01-05), ohne leere Werte");
    assert.equal(text({ field: "Date", type: "relative", direction: "before", count: 2, unit: "day", calendar: false, includeCurrent: false, anchor: "latest" }), "Date ist vor den letzten 2 Tagen (gleitend, gezählt ab dem letzten Datensatz), ohne leere Werte");
    assert.equal(text({ field: "Region", type: "top", count: 2, by: { field: "Units", agg: "sum" }, ties: "all" }), "die 2 obersten Einträge von Region nach Summe von Units, gleiche Werte behalten");
    assert.equal(text({ field: "Region", type: "top", count: 1, bottom: true, by: { field: "Units", agg: "average" } }), "der unterste Eintrag von Region nach Durchschnitt von Units");
    assert.equal(text({ field: "Region", type: "value", op: "=", value: 5, by: { field: "Units", agg: "sum" } }), "Region mit Summe von Units 5");
    assert.equal(text({ field: "Region", type: "value", op: ">=", value: 5, not: true, by: { field: "Units", agg: "sum" } }), "Region mit Summe von Units nicht mindestens 5");
    const d = describeView({
        version: 2, rows: ["Region", "Month"], cols: ["Product"], derived: [{ name: "Month", field: "Date", by: "yearMonth" }],
        values: [{ field: "Units", agg: "sum" }, { agg: "count" }], display: "both", chart: { type: "bar" },
        filters: [{ field: "Units", type: "compare", op: ">", value: 1 }, { field: "Region", type: "blank", not: true }],
        sort: [{ field: "Region", by: "value", value: { field: "Units", agg: "sum" }, order: "desc" }, { field: "Product", by: "label", order: "asc" }]
    }, data, de);
    assert.equal(d.text, "Summe von Units, Anzahl der Zeilen nach Region > Month; in Spalten: Product; Filter: Units ist größer als 1, ohne leere Werte; und Region ist nicht leer; als Tabelle und Balkendiagramm");
    assert.deepEqual(d.derived.map((x) => x.text), ["Month: Date nach Monat"]);
    assert.deepEqual(d.sort.map((x) => x.text), ["Region nach Summe von Units, absteigend", "Product nach Beschriftung, aufsteigend"]);
    assert.equal(describeView({ version: 2, rows: ["Nope"] }, data, de).text, "(ungültig: 1 Fehler, betroffene Teile fehlen) Anzahl der Zeilen");
    assert.equal(describeView({ version: 2, rows: ["Nope", "Gone"] }, data, de).text, "(ungültig: 2 Fehler, betroffene Teile fehlen) Anzahl der Zeilen");
    assert.equal(describeLabels("de-AT"), DESCRIBE_LABELS.de);
    assert.equal(describeLabels("fr-FR"), DESCRIBE_LABELS.en);
});

test("describeView in German: lists and filters stay apart where numbers have a decimal comma", () => {
    const view = { version: 2, filters: [{ field: "Units", type: "in", items: [1, 2.5, 3, 1234567.25] }, { field: "Region", type: "in", items: ["North", "South"] }, { field: "Units", type: "compare", op: ">", value: 2.5 }] };
    const de = describeView(view, data, { labels: DESCRIBE_LABELS.de, locale: "de-DE" });
    // a list's items by "; ", so "2,5" stays one number; a filter after a blanks clause by "; und "
    assert.equal(de.filters[0].text, "Units ist einer der Werte 1; 2,5; 3; 1234567,25, ohne leere Werte");
    assert.equal(de.text, "Anzahl der Zeilen; Filter: Units ist einer der Werte 1; 2,5; 3; 1234567,25, ohne leere Werte; und Region ist einer der Werte „North“; „South“, ohne leere Werte; und Units ist größer als 2,5, ohne leere Werte");
    // English word for word as before
    assert.equal(describeView(view, data).text, 'count of rows where Units is one of 1, 2.5, 3, 1234567.25 (blanks dropped); and Region is one of "North", "South" (blanks dropped); and Units is greater than 2.5 (blanks dropped)');
});

test("describeView: true and false of a filter in the words of the language, as the report's table writes them", () => {
    const paid = encode([{ Paid: true }, { Paid: false }]);
    const view = { version: 2, filters: [{ field: "Paid", type: "in", items: [true, false] }] };
    assert.equal(describeView(view, paid, { labels: DESCRIBE_LABELS.de }).filters[0].text, "Paid ist einer der Werte Ja; Nein, ohne leere Werte");
    assert.equal(describeView(view, paid).filters[0].text, "Paid is one of true, false (blanks dropped)");
});

test("describeView: a rolling range says nothing about the current unit, as the engine ignores includeCurrent there", () => {
    const range = (includeCurrent) => relativeDateRange("week", 2, { now: "2026-11-13", calendar: false, includeCurrent });
    // the engine: a rolling range counts back from the moment, with or without includeCurrent
    assert.deepEqual(range(false), range(true));
    for (const labels of [DESCRIBE_LABELS.en, DESCRIBE_LABELS.de]) {
        const text = (includeCurrent) => describeView({ version: 2, filters: [{ field: "Date", type: "relative", direction: "last", count: 2, unit: "week", calendar: false, includeCurrent }] }, data, { labels }).filters[0].text;
        assert.equal(text(false), text(true));
    }
    assert.equal(describeView({ version: 2, filters: [{ field: "Date", type: "relative", direction: "last", count: 1, unit: "week", calendar: false, includeCurrent: false }] }, data, { labels: DESCRIBE_LABELS.de }).filters[0].text, "Date ist innerhalb der letzten Woche (gleitend), ohne leere Werte");
    assert.equal(describeView({ version: 2, filters: [{ field: "Date", type: "relative", direction: "before", count: 2, unit: "day", calendar: false, includeCurrent: false, anchor: "latest" }] }, data).filters[0].text, "Date is in the before 2 days (rolling, from latest) (blanks dropped)");
});

test("describeLabels: a locale's words with a host's own over them at every depth", () => {
    const own = describeLabels("de-DE", { blanks: { exclude: "ohne Leere" } });
    assert.equal(own.blanks.exclude, "ohne Leere");
    assert.equal(own.blanks.include, DESCRIBE_LABELS.de.blanks.include);
    assert.equal(own.where, DESCRIBE_LABELS.de.where);
    assert.equal(describeLabels("en-US", { where: "if {filters}" }).and, DESCRIBE_LABELS.en.and);
    assert.equal(describeLabels("de-DE", undefined), DESCRIBE_LABELS.de);
    // words that name their language go over that language's: English words for a German locale keep no German word ("heute")
    assert.deepEqual(describeLabels("de-DE", DESCRIBE_LABELS.en), DESCRIBE_LABELS.en);
    assert.throws(() => describeLabels("de-DE", /** @type {any} */ ("de")), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT");
});

test("describeView fills its words once: a name or a value that looks like a placeholder stays as it is", () => {
    const odd = encode([{ "{value}": "{field}", n: 1 }]);
    for (const labels of [undefined, DESCRIBE_LABELS.de]) {
        const d = describeView({ version: 2, filters: [{ field: "{value}", type: "text", op: "equals", value: "{field}" }] }, odd, { labels });
        assert.match(d.filters[0].text, /^\{value\} (equals "\{field\}"|ist gleich „\{field\}“)/);
    }
});

test("describeView: labels that leave a key or a table entry out take English for it", () => {
    const d = describeView({ version: 2, rows: ["Region"], filters: [{ field: "Units", type: "compare", op: ">", value: 1 }] }, data, { labels: { rows: "per {fields}", blanks: { exclude: "no blanks" } } });
    assert.equal(d.text, "count of rows per Region where Units is greater than 1 (no blanks)");
    // a table given in part keeps English for its other entries
    assert.equal(describeView({ version: 2, filters: [{ field: "Units", type: "compare", op: ">", value: 1, blanks: "include" }] }, data, { labels: { blanks: { exclude: "no blanks" } } }).filters[0].text, "Units is greater than 1 (blanks kept)");
    // at every depth: an empty table, or one that names one form, keeps the rest
    const day = { field: "Date", type: "relative", direction: "last", unit: "day", blanks: "include" };
    const relative = (labels, count) => describeView({ version: 2, filters: [{ ...day, count }] }, data, { labels }).filters[0].text;
    assert.equal(relative({ ranges: {}, text: {}, blanks: {} }, 3), "Date is in the last 3 days (blanks kept)");
    assert.equal(relative({ ranges: { last: { day: { other: "past {count} days" } } } }, 3), "Date is in the past 3 days (blanks kept)");
    assert.equal(relative({ ranges: { last: { day: { other: "past {count} days" } } } }, 1), "Date is in the last 1 day (blanks kept)");
    assert.equal(relative({ ranges: { last: { day: {} } }, rows: undefined, cols: null }, 2), "Date is in the last 2 days (blanks kept)");
});

test("describeView: labels that are not an object of words throw INVALID_OPTION", () => {
    for (const labels of ["de", 1, ["de"], true]) {
        assert.throws(() => describeView({ version: 2 }, data, { labels }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION" && /options\.labels must be an object/.test(e.message), String(labels));
    }
    assert.equal(describeView({ version: 2 }, data, { labels: null }).text, "count of rows");
});

test("describeView and describeLabels refuse a key they do not know and a word of the wrong kind", () => {
    const wrong = [
        [{ blanks: 5 }, "blanks is a table of words, not a number"],
        [{ blanks: [] }, "blanks is a table of words, not a list"],
        [{ list: 5 }, "list is a text, not a number"],
        [{ top: 5 }, "top is a text or a table of words, not a number"],
        [{ aggregators: "sum" }, "aggregators is a table of words, not a string"],
        [{ ranges: { last: { day: { current: 1 } } } }, "ranges.last.day.current is a text, not a number"],
        [{ lang: 5 }, "lang is a text, not a number"],
        [{ lang: "!!" }, 'lang is a language such as "de", not "!!"'],
        [{ nope: "x" }, "nope is not a word of describeView"],
        [{ blanks: { nope: "x" } }, "blanks.nope is not a word of describeView"],
        [JSON.parse('{"__proto__":{"x":1}}'), "__proto__ is not a word of describeView"]
    ];
    for (const [labels, problem] of wrong) {
        assert.throws(() => describeView({ version: 2 }, data, { labels }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION" && e.message === `describeView: options.labels.${problem}`, problem);
        assert.throws(() => describeLabels("de-DE", /** @type {any} */ (labels)), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT" && e.message === `describeLabels: own words: ${problem}`, problem);
    }
    // the kinds either language has: German's counted forms, a table English leaves null, both tables whole
    for (const labels of [{ top: { one: "the top {field}", other: "top {count} {field}" } }, { aggregators: { sum: "Sum" } }, { anchoredRanges: { this: { day: "that day" } } }, DESCRIBE_LABELS.de, DESCRIBE_LABELS.en]) {
        assert.equal(typeof describeView({ version: 2 }, data, { labels }).text, "string");
        assert.ok(Object.isFrozen(describeLabels("de-DE", labels)));
    }
});

test("describeView's labels: a table of forms by count takes every plural category of its lang", () => {
    const top = (count, labels) => describeView({ version: 2, filters: [{ field: "Region", type: "top", count, by: { field: "Units", agg: "sum" } }] }, data, { labels }).filters[0].text;
    const pl = { lang: "pl", top: { one: "jeden {field}", few: "kilka {count} {field}", many: "wiele {count} {field}", other: "inne {count} {field}" } };
    assert.deepEqual([1, 3, 5].map((n) => top(n, pl)), ["jeden Region", "kilka 3 Region", "wiele 5 Region"]);
    const ru = { lang: "ru", invalid: { one: "{count} ошибка", few: "{count} ошибки", many: "{count} ошибок", other: "{count}" }, ranges: { last: { day: { one: "последний {count} день", few: "последние {count} дня", many: "последние {count} дней", other: "{count}" } } } };
    assert.match(describeView({ version: 2, rows: ["Nope", "Gone"] }, data, { labels: ru }).text, /^2 ошибки /);
    assert.equal(describeView({ version: 2, filters: [{ field: "Date", type: "relative", direction: "last", count: 3, unit: "day" }] }, data, { labels: ru }).filters[0].text, "Date is in the последние 3 дня (blanks dropped)");
    // a key that is no plural category stays refused, and a plural category outside such a table too
    assert.throws(() => describeView({ version: 2 }, data, { labels: { top: { one: "a", nope: "b" } } }), (e) => e instanceof PivotkitError && e.message === "describeView: options.labels.top.nope is not a word of describeView");
    assert.throws(() => describeView({ version: 2 }, data, { labels: { blanks: { few: "b" } } }), (e) => e instanceof PivotkitError && e.message === "describeView: options.labels.blanks.few is not a word of describeView");
});

test("describeLabels: the result is a frozen copy; changing the host's tables afterwards changes nothing", () => {
    const own = { blanks: { exclude: "no blanks" }, top: { one: "the top {field}", other: "top {count} {field}" }, aggregators: { sum: "Sum" } };
    const words = describeLabels("en-US", own);
    own.blanks.exclude = "changed";
    own.top.one = "changed";
    own.aggregators.sum = "changed";
    assert.deepEqual([words.blanks.exclude, /** @type {any} */ (words.top).one, words.aggregators?.sum], ["no blanks", "the top {field}", "Sum"]);
    assert.ok(Object.isFrozen(words.top) && Object.isFrozen(words.aggregators) && Object.isFrozen(words.blanks));
});

test("describeView in German: no parentheses inside parentheses, in a filter or the whole sentence", () => {
    const filters = [
        { field: "Date", type: "relative", direction: "last", count: 2, unit: "year", calendar: false, anchor: "latest" },
        { field: "Date", type: "compare", op: ">", value: "2026-01-01", precision: "month" },
        { field: "Rep", type: "text", op: "contains", value: "a", on: "label" },
        { field: "Region", type: "in", items: [] }
    ].map((f) => ({ ...f, blanks: "exclude" }));
    const nested = /\([^()]*\(/;
    const d = describeView({ version: 2, rows: ["Region", "Nope"], cols: ["Product"], filters, display: "chart" }, data, { labels: DESCRIBE_LABELS.de });
    for (const text of [...d.filters.map((f) => f.text), d.text]) {
        assert.doesNotMatch(text, nested, text);
    }
});

test("describeView in German: a relative range of one whole unit says what the engine keeps: today, yesterday, tomorrow", () => {
    const text = (filter) => describeView({ version: 2, filters: [{ field: "Date", type: "relative", ...filter }] }, data, { labels: DESCRIBE_LABELS.de }).filters[0].text;
    const days = (options) => relativeDateRange("day", 1, { now: "2026-11-13", ...options });
    // the engine: "last 1 day" and "next 1 day" are today; without the current day the day before or after
    assert.deepEqual(days({}), { from: "2026-11-13", to: "2026-11-13" });
    assert.deepEqual(days({ direction: "next" }), { from: "2026-11-13", to: "2026-11-13" });
    assert.deepEqual(days({ includeCurrent: false }), { from: "2026-11-12", to: "2026-11-12" });
    assert.deepEqual(days({ direction: "next", includeCurrent: false }), { from: "2026-11-14", to: "2026-11-14" });
    assert.equal(text({ direction: "last", count: 1, unit: "day" }), "Date ist heute, ohne leere Werte");
    assert.equal(text({ direction: "next", count: 1, unit: "day" }), "Date ist heute, ohne leere Werte");
    assert.equal(text({ direction: "last", count: 1, unit: "day", includeCurrent: false }), "Date ist gestern, ohne leere Werte");
    assert.equal(text({ direction: "next", count: 1, unit: "day", includeCurrent: false }), "Date ist morgen, ohne leere Werte");
    assert.equal(text({ direction: "last", count: 1, unit: "month" }), "Date ist in diesem Monat, ohne leere Werte");
    assert.equal(text({ direction: "last", count: 1, unit: "year", includeCurrent: false }), "Date ist im Vorjahr, ohne leere Werte");
    assert.equal(text({ direction: "before", count: 1, unit: "day" }), "Date ist vor dem heutigen Tag, ohne leere Werte");
    assert.equal(text({ direction: "before", count: 1, unit: "month", includeCurrent: false }), "Date ist vor dem Vormonat, ohne leere Werte");
    // rolling: the unit up to now, not a calendar day
    assert.equal(text({ direction: "last", count: 1, unit: "day", calendar: false }), "Date ist innerhalb des letzten Tages (gleitend), ohne leere Werte");
    // counted from an anchor that is not today: the same unit, the one before or after it, not "today"
    assert.deepEqual(days({ anchor: "latest", latest: "2025-06-30", includeCurrent: false }), { from: "2025-06-29", to: "2025-06-29" });
    assert.equal(text({ direction: "last", count: 1, unit: "day", anchor: "latest" }), "Date ist am selben Tag (gezählt ab dem letzten Datensatz), ohne leere Werte");
    assert.equal(text({ direction: "last", count: 1, unit: "day", anchor: "latest", includeCurrent: false }), "Date ist am Tag davor (gezählt ab dem letzten Datensatz), ohne leere Werte");
    assert.equal(text({ direction: "next", count: 1, unit: "week", anchor: "2025-06-30", includeCurrent: false }), "Date ist in der Woche danach (gezählt ab 2025-06-30), ohne leere Werte");
    assert.equal(text({ direction: "this", unit: "day", anchor: "2025-06-30" }), "Date ist am selben Tag (gezählt ab 2025-06-30), ohne leere Werte");
    assert.equal(text({ direction: "before", count: 1, unit: "month", anchor: "first" }), "Date ist vor demselben Monat (gezählt ab dem ersten Datensatz), ohne leere Werte");
    // English keeps its words
    assert.equal(describeView({ version: 2, filters: [{ field: "Date", type: "relative", direction: "last", count: 1, unit: "day", includeCurrent: false }] }, data).filters[0].text, "Date is in the last 1 day (current excluded) (blanks dropped)");
});

test("describeView: numbers of filter values in the locale, without grouping; text values in the words' quotes", () => {
    const view = { version: 2, rows: ["Region"], filters: [{ field: "Units", type: "compare", op: "between", value: 1.5, value2: 2025 }, { field: "Region", type: "in", items: ["North", "Say \"hi\""] }, { field: "Units", type: "in", items: [0.5, 1200] }] };
    const de = describeView(view, data, { labels: DESCRIBE_LABELS.de, locale: "de-DE" });
    assert.deepEqual(de.filters.map((f) => f.text), ["Units ist zwischen 1,5 und 2025, ohne leere Werte", "Region ist einer der Werte „North“; „Say \\\"hi\\\"“, ohne leere Werte", "Units ist einer der Werte 0,5; 1200, ohne leere Werte"]);
    // every decimal the number has, not the three of a default number format
    assert.equal(describeView({ version: 2, filters: [{ field: "Units", type: "compare", op: ">", value: 0.1234567 }] }, data, { labels: DESCRIBE_LABELS.de, locale: "de-DE" }).filters[0].text, "Units ist größer als 0,1234567, ohne leere Werte");
    // de-CH writes a point
    assert.equal(describeView(view, data, { labels: DESCRIBE_LABELS.de, locale: "de-CH" }).filters[0].text, "Units ist zwischen 1.5 und 2025, ohne leere Werte");
    // without a locale, and in English, as JSON writes them, word for word as before
    const en = describeView(view, data);
    assert.deepEqual(en.filters.map((f) => f.text), ["Units is between 1.5 and 2025 (blanks dropped)", 'Region is one of "North", "Say \\"hi\\"" (blanks dropped)', "Units is one of 0.5, 1200 (blanks dropped)"]);
    assert.equal(describeView(view, data, { locale: "en-US" }).text, en.text);
    assert.throws(() => describeView(view, data, { locale: "not a locale!" }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION");
});

test("describeView has words for every unit, direction, operator, precision and chart type of the engine, in English as before", () => {
    const filterOf = (labels, filter) => describeView({ version: 2, filters: [filter] }, data, { labels }).filters[0]?.text ?? "";
    const usable = (text) => text !== "" && !/undefined|\{\w+\}/.test(text);
    for (const labels of [DESCRIBE_LABELS.en, DESCRIBE_LABELS.de]) {
        for (const direction of RELATIVE_DIRECTIONS) {
            for (const unit of RELATIVE_UNITS) {
                // "this" is the current unit alone, without a count
                for (const count of direction === "this" ? [1] : [1, 3]) {
                    const text = filterOf(labels, { field: "Date", type: "relative", direction, unit, ...(direction === "this" ? {} : { count }) });
                    assert.ok(usable(text), `${labels.lang} ${direction} ${count} ${unit}: ${text}`);
                    if (labels === DESCRIBE_LABELS.en) {
                        const range = direction === "this" ? `this ${unit}` : `${direction} ${count} ${unit}${count === 1 ? "" : "s"}`;
                        assert.equal(text, `Date is in the ${range} (blanks dropped)`);
                    }
                }
            }
        }
        for (const op of COMPARE_OPS) {
            for (const precision of COMPARE_PRECISIONS) {
                const filter = describeView({ version: 2, filters: [{ field: "Date", type: "compare", op, value: "2026-01-01", value2: "2026-02-01", precision }] }, data, { labels }).filters[0];
                const text = filter?.text ?? "";
                assert.ok(usable(text), `${labels.lang} ${op} ${precision}: ${text}`);
                if (labels === DESCRIBE_LABELS.en) {
                    // the values as normalize() writes them ("2026-01-01T00:00" by hour)
                    const words = { "=": "", ">": "greater than ", ">=": "at least ", "<": "less than ", "<=": "at most ", between: "between " }[op];
                    const value = op === "between" ? `${JSON.stringify(filter.value)} and ${JSON.stringify(filter.value2)}` : JSON.stringify(filter.value);
                    assert.equal(text, `Date is ${words}${value}${precision === "day" ? "" : ` (by ${precision})`} (blanks dropped)`);
                }
            }
        }
        for (const op of TEXT_OPS) {
            for (const not of [false, true]) {
                assert.ok(usable(filterOf(labels, { field: "Rep", type: "text", op, value: "a", not })), `${labels.lang} text ${op}`);
            }
        }
        for (const type of CHART_TYPES) {
            const text = describeView({ version: 2, display: "chart", chart: { type } }, data, { labels }).text;
            assert.ok(usable(text), `${labels.lang} chart ${type}: ${text}`);
            if (labels === DESCRIBE_LABELS.en) {
                assert.equal(text, `count of rows as a ${type === "auto" ? "chart" : `${type} chart`}`);
            }
        }
    }
});

test("expanded source description days and minutes remain usable for layout suggestions", () => {
    for (const dates of [["+010000-02-29", "+010001-03-01"], ["-000001-01-01T12:30", "0002-01-01T14:15"]]) {
        const description = describeSource(encode(dates.map((Date) => ({Date}))));
        const field = description.fields[0];
        assert.deepEqual(field.items, dates);
        assert.equal(field.min, dates[0]);
        assert.equal(field.max, dates[1]);
        assert.ok(!suggestLayout(description).notes.some((n) => n.code === "noSuggestion"));
    }
});
