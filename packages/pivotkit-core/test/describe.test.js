import { test } from "node:test";
import assert from "node:assert/strict";
import { DESCRIBE_LABELS, DESCRIBE_LIMITS, PivotkitError, describeLabels, describeSource, describeView, encode } from "../src/index.js";
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
    assert.equal(text({ field: "Units", type: "compare", op: "=", value: 5 }), "Units ist 5 (ohne leere Werte)");
    assert.equal(text({ field: "Units", type: "compare", op: "=", value: 5, not: true }), "Units ist nicht 5 (ohne leere Werte)");
    assert.equal(text({ field: "Units", type: "compare", op: "between", value: 1, value2: 9 }), "Units ist zwischen 1 und 9 (ohne leere Werte)");
    assert.equal(text({ field: "Date", type: "compare", op: ">", value: "2026-01-01", precision: "month" }), 'Date ist größer als "2026-01-01" (nach Monat) (ohne leere Werte)');
    assert.equal(text({ field: "Region", type: "in", items: ["North", "South"], blanks: "include" }), 'Region ist einer der Werte "North", "South" (mit leeren Werten)');
    assert.equal(text({ field: "Region", type: "in", items: [], not: true }), "Region ist keiner der Werte (keine Einträge) (ohne leere Werte)");
    assert.equal(text({ field: "Region", type: "blank", not: true }), "Region ist nicht leer");
    assert.equal(text({ field: "Rep", type: "text", op: "contains", value: "a", on: "label" }), 'Rep (wie angezeigt) enthält "a", Groß- und Kleinschreibung egal, Leerraum zusammengefasst (ohne leere Werte)');
    assert.equal(text({ field: "Rep", type: "text", op: "endsWith", value: "n", not: true, match: { case: "sensitive", whitespace: "exact" } }), 'Rep endet nicht auf "n", Groß- und Kleinschreibung beachtet, Leerraum genau (ohne leere Werte)');
    assert.equal(text({ field: "Date", type: "relative", direction: "this", unit: "year" }), "Date liegt in diesem Jahr (ohne leere Werte)");
    assert.equal(text({ field: "Date", type: "relative", direction: "last", count: 1, unit: "month" }), "Date liegt im letzten Monat (ohne leere Werte)");
    assert.equal(text({ field: "Date", type: "relative", direction: "next", count: 3, unit: "week", anchor: "2026-01-05" }), "Date liegt in den nächsten 3 Wochen (ab 2026-01-05) (ohne leere Werte)");
    assert.equal(text({ field: "Date", type: "relative", direction: "before", count: 2, unit: "day", calendar: false, includeCurrent: false, anchor: "latest" }), "Date liegt vor den letzten 2 Tagen (gleitend, ohne den laufenden Zeitraum, ab dem letzten Datensatz) (ohne leere Werte)");
    assert.equal(text({ field: "Region", type: "top", count: 2, by: { field: "Units", agg: "sum" }, ties: "all" }), "die obersten 2 von Region nach Summe von Units, gleiche Werte behalten");
    assert.equal(text({ field: "Region", type: "value", op: "=", value: 5, by: { field: "Units", agg: "sum" } }), "Region, bei denen Summe von Units 5 ist");
    const d = describeView({
        version: 2, rows: ["Region", "Month"], cols: ["Product"], derived: [{ name: "Month", field: "Date", by: "yearMonth" }],
        values: [{ field: "Units", agg: "sum" }, { agg: "count" }], display: "both", chart: { type: "bar" },
        filters: [{ field: "Units", type: "compare", op: ">", value: 1 }, { field: "Region", type: "blank", not: true }],
        sort: [{ field: "Region", by: "value", value: { field: "Units", agg: "sum" }, order: "desc" }, { field: "Product", by: "label", order: "asc" }]
    }, data, de);
    assert.equal(d.text, "Summe von Units, Anzahl der Zeilen nach Region > Month über Product (Filter: Units ist größer als 1 (ohne leere Werte); Region ist nicht leer) als Tabelle und Balkendiagramm");
    assert.deepEqual(d.derived.map((x) => x.text), ["Month: Date nach Monat"]);
    assert.deepEqual(d.sort.map((x) => x.text), ["Region nach Summe von Units, absteigend", "Product nach Beschriftung, aufsteigend"]);
    assert.equal(describeView({ version: 2, rows: ["Nope"] }, data, de).text, "(ungültig: 1 Fehler, die Teile, die er nennt, fehlen) Anzahl der Zeilen");
    assert.equal(describeLabels("de-AT"), DESCRIBE_LABELS.de);
    assert.equal(describeLabels("fr-FR"), DESCRIBE_LABELS.en);
});

test("describeView fills its words once: a name or a value that looks like a placeholder stays as it is", () => {
    const odd = encode([{ "{value}": "{field}", n: 1 }]);
    for (const labels of [undefined, DESCRIBE_LABELS.de]) {
        const d = describeView({ version: 2, filters: [{ field: "{value}", type: "text", op: "equals", value: "{field}" }] }, odd, { labels });
        assert.match(d.filters[0].text, /^\{value\} (equals|ist gleich) "\{field\}"/);
    }
});

test("describeView: labels that leave a key or a table entry out take English for it", () => {
    const d = describeView({ version: 2, rows: ["Region"], filters: [{ field: "Units", type: "compare", op: ">", value: 1 }] }, data, { labels: { rows: "per {fields}", blanks: { exclude: "no blanks" } } });
    assert.equal(d.text, "count of rows per Region where Units is greater than 1 (no blanks)");
    // a table given in part keeps English for its other entries
    assert.equal(describeView({ version: 2, filters: [{ field: "Units", type: "compare", op: ">", value: 1, blanks: "include" }] }, data, { labels: { blanks: { exclude: "no blanks" } } }).filters[0].text, "Units is greater than 1 (blanks kept)");
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
