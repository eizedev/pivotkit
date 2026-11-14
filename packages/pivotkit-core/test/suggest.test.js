// A view from a layout and a data set's field description (suggest.js): suggestLayout's rules, each
// on data that exercises it, and viewFromLayout, the one function both pivotkit-cli commands and the
// operations of pivotkit-report build a view with. Every suggestion normalizes without findings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError, dateUnitFor, describeSource, encode, groupingName, isIdentifierName, renameFields, suggestDateUnit, suggestLayout, validate, viewFileFields, viewFromLayout } from "../src/index.js";

const day = (d) => new Date(Date.UTC(2025, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);

/** Rows of a sales file as people keep one: the date first, a quantity before the revenue. */
const SALES = Array.from({ length: 60 }, (_, i) => ({
    Date: day(i * 11),
    OrderId: 1000 + i,
    Region: ["North", "South", "East", "West"][i % 4],
    Customer: `Customer ${i}`,
    Category: ["Hardware", "Software", "Services"][i % 3],
    Units: (i % 7) + 1,
    Revenue: 100 + i * 37
}));

const described = (rows) => describeSource(encode(rows));
/** The suggestion as a view, normalized against its data: no errors, no warnings. */
function suggested(rows, layout = {}, options = {}) {
    const data = encode(rows);
    const description = describeSource(data);
    const s = suggestLayout(description, options);
    const merged = { ...s.layout, ...layout };
    const built = viewFromLayout(merged, description, options);
    const checked = validate(built.view, data);
    assert.deepEqual([...checked.errors, ...checked.warnings], [], JSON.stringify(built.view));
    return { ...s, ...built, notes: [...s.notes, ...built.notes] };
}

test("suggestLayout: rows the first text field with few values, columns its date by the span, values the first number that is no identifier", () => {
    const s = suggested(SALES);
    // Customer: every row another value, so no category; OrderId: a number named as an identifier
    assert.deepEqual(s.layout.rows, ["Region"]);
    assert.deepEqual(s.layout.cols, ["Date"]);
    assert.deepEqual(s.layout.groups, [{ field: "Date", by: "yearMonth" }]);
    assert.deepEqual(s.layout.values, [{ field: "Units", agg: "sum" }]);
    assert.deepEqual(s.view.rows, ["Region"]);
    assert.deepEqual(s.view.cols, ["Date by month"]);
    assert.deepEqual(s.view.derived, [{ name: "Date by month", field: "Date", by: "yearMonth" }]);
    assert.equal(s.name, "Sum of Units by Region and Date by month");
    // each pick has a stable code and names the alternatives a person can take instead
    const values = s.picks.find((p) => p.part === "values");
    assert.equal(values?.code, "firstNumber");
    assert.deepEqual(values?.others, ["Revenue"]);
    const rows = s.picks.find((p) => p.part === "rows");
    assert.equal(rows?.code, "category");
    assert.deepEqual(rows?.others, ["Category"]);
    assert.deepEqual(s.notes, []);
});

test("suggestLayout: the date's grouping follows its span as suggestDateUnit does, at each boundary", () => {
    for (const [days, unit] of [[0, null], [30, "day"], [62, "day"], [63, "yearMonth"], [732, "yearMonth"], [733, "yearQuarter"], [2196, "yearQuarter"], [2197, "year"]]) {
        const rows = [{ D: day(0), T: "a", N: 1 }, { D: day(days), T: "b", N: 2 }, { D: day(0), T: "a", N: 3 }];
        const data = encode(rows);
        const d = describeSource(data).fields.find((f) => f.name === "D");
        assert.equal(dateUnitFor(Date.parse(d?.min ?? ""), Date.parse(d?.max ?? "")), unit, `${days} days`);
        assert.equal(suggestDateUnit(data, "D"), unit, `${days} days, encoded`);
    }
    // a date with times: the description's minutes read as UTC, as the data's
    const timed = describeSource(encode([{ T: "2025-01-01T10:30:00Z" }, { T: "2025-01-02T10:29:00Z" }])).fields[0];
    assert.equal(dateUnitFor(Date.parse(`${timed.min}Z`), Date.parse(`${timed.max}Z`)), null);
});

test("suggestLayout: without a date the next category with up to 12 values goes to columns; without a category the date goes to rows", () => {
    const noDate = suggested(SALES.map(({ Date: _d, ...r }) => r));
    assert.deepEqual(noDate.layout.rows, ["Region"]);
    assert.deepEqual(noDate.layout.cols, ["Category"]);
    const onlyDate = suggested(SALES.map((r) => ({ Date: r.Date, Revenue: r.Revenue })));
    assert.deepEqual(onlyDate.layout.rows, ["Date"]);
    assert.deepEqual(onlyDate.layout.cols, []);
    assert.deepEqual(onlyDate.view.rows, ["Date by month"]);
    // a second category with more than 12 values stays out of the columns
    const wide = suggested(Array.from({ length: 80 }, (_, i) => ({ A: `a${i % 3}`, B: `b${i % 20}`, N: i })));
    assert.deepEqual(wide.layout.cols, []);
});

test("suggestLayout: identifiers are counted, not summed; no number at all is a count of rows", () => {
    const ids = suggested(SALES.map((r) => ({ Region: r.Region, "Order No": r.OrderId, CustomerID: r.OrderId + 1 })));
    assert.deepEqual(ids.layout.values, [{ agg: "count" }]);
    assert.equal(ids.picks.find((p) => p.part === "values")?.code, "countRows");
    assert.equal(ids.name, "Count by Region");
});

test("suggestLayout: nothing to group by is said (noSuggestion), and the draft is still a valid count", () => {
    const note = [{ Note: "This sheet holds no data." }, { Note: "The sheets 2025 and 2026 do." }, { Note: "Give --sheet." }];
    const s = suggested(note);
    assert.deepEqual(s.layout.rows, []);
    assert.deepEqual(s.layout.cols, []);
    assert.deepEqual(s.notes.map((n) => n.code), ["noSuggestion"]);
    // an empty description: no fields, no rows
    assert.deepEqual(suggestLayout(describeSource([])).notes.map((n) => n.code), ["noSuggestion"]);
});

test("suggestLayout: a description without counts (only the fields' types) takes a text field as a category", () => {
    const s = suggestLayout(describeSource([{ name: "Region", type: "string" }, { name: "When", type: "date" }, { name: "Revenue", type: "number" }]));
    assert.deepEqual(s.layout.rows, ["Region"]);
    // no span known: the date is not grouped by the suggestion
    assert.deepEqual(s.layout.cols, []);
    assert.deepEqual(s.layout.values, [{ field: "Revenue", agg: "sum" }]);
});

test("suggestLayout and viewFromLayout change neither the description nor the layout, and give the same on every run", () => {
    const description = described(SALES);
    const frozen = JSON.parse(JSON.stringify(description));
    const deepFreeze = (o) => {
        Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v));
        return Object.freeze(o);
    };
    deepFreeze(description);
    const a = suggestLayout(description);
    const layout = deepFreeze(JSON.parse(JSON.stringify(a.layout)));
    const b = viewFromLayout(layout, description);
    assert.deepEqual(JSON.parse(JSON.stringify(description)), frozen);
    assert.deepEqual(viewFromLayout(layout, description), b);
    assert.deepEqual(suggestLayout(description), a);
});

test("viewFromLayout: names in any case are written in the data's spelling; a field with spaces, colons and commas is one name", () => {
    const rows = SALES.map((r) => ({ "Time: start": r.Date, "Revenue, EUR": r.Revenue, "sales region": r.Region }));
    const data = encode(rows);
    const { view, notes } = viewFromLayout({ rows: ["SALES REGION"], cols: ["time: START"], values: [{ field: "revenue, eur", agg: "sum" }] }, describeSource(data));
    assert.deepEqual(view.rows, ["sales region"]);
    // a date on an axis without a grouping is grouped as the browser groups it when placed
    assert.deepEqual(view.cols, ["Time: start by month"]);
    assert.deepEqual(view.derived, [{ name: "Time: start by month", field: "Time: start", by: "yearMonth" }]);
    assert.deepEqual(view.values, [{ field: "Revenue, EUR", agg: "sum" }]);
    assert.deepEqual(notes.map((n) => n.code), ["dateGrouped"]);
    assert.equal(validate(view, data).valid, true);
});

test("viewFromLayout: groupings replace their field on the axes, in the report's language; a field grouped twice shows both", () => {
    const description = described(SALES);
    const en = viewFromLayout({ rows: ["Date"], groups: [{ field: "Date", by: "year" }, { field: "Date", by: "month" }], values: [{ field: "Revenue" }] }, description);
    assert.deepEqual(en.view.rows, ["Date by year", "Date by month of year"]);
    assert.deepEqual(en.view.values, [{ field: "Revenue", agg: "sum" }]);
    const de = viewFromLayout({ rows: ["Region"], cols: ["Date"], groups: [{ field: "Date", by: "yearQuarter" }], values: [{ field: "Revenue", agg: "average" }] }, description, { locale: "de-DE" });
    assert.deepEqual(de.view.cols, ["Date nach Quartal"]);
    assert.equal(de.name, "Durchschnitt von Revenue nach Region und Date nach Quartal");
    // number ranges: "Revenue (by 500)"
    const bins = viewFromLayout({ rows: ["Revenue"], groups: [{ field: "Revenue", by: "bin", size: 500 }] }, description);
    assert.deepEqual(bins.view.derived, [{ name: "Revenue (by 500)", field: "Revenue", by: "bin", size: 500 }]);
    // a grouping named on an axis by its own name; one no axis or filter uses is said
    const named = viewFromLayout({ rows: ["Date by year"], groups: [{ field: "Date", by: "year" }, { field: "Region", by: "month" }] }, description);
    assert.deepEqual(named.view.rows, ["Date by year"]);
    assert.deepEqual(named.notes.map((n) => n.code), ["unusedGroup"]);
    assert.equal(groupingName("Date", "weekday", { locale: "de-AT" }), "Date nach Wochentag");
    assert.equal(groupingName("Date", "weekday", { locale: "fr-FR" }), "Date by weekday");
});

test("viewFromLayout: a value without an aggregator is summed when it is a number, else counted, as a click in the field list does", () => {
    const { view } = viewFromLayout({ rows: ["Region"], values: [{ field: "Revenue" }, { field: "OrderId" }, { field: "Region" }, { agg: "count" }, {}] }, described(SALES));
    assert.deepEqual(view.values, [{ field: "Revenue", agg: "sum" }, { field: "OrderId", agg: "count" }, { field: "Region", agg: "count" }, { agg: "count" }, { agg: "count" }]);
});

test("viewFromLayout: unknown names, aggregators and units pass through, so normalize names them with what was meant", () => {
    const data = encode(SALES);
    const { view } = viewFromLayout({ rows: ["Regoin"], values: [{ field: "Revenue", agg: "summ" }], groups: [{ field: "Date", by: "yearMonht" }], cols: ["Date"] }, describeSource(data));
    const { errors } = validate(view, data);
    const codes = errors.map((e) => e.code);
    assert.ok(codes.includes("unknownField"), codes.join());
    assert.equal(errors.find((e) => e.code === "unknownField")?.params?.suggestion, "Region");
    assert.equal(view.values[0].agg, "summ");
});

test("viewFromLayout: filters, chart type and map", () => {
    const rows = SALES.map((r) => ({ ...r, Turnover: r.Revenue, Revenue: undefined }));
    const data = encode(rows.map(({ Revenue: _r, ...r }) => r));
    const layout = {
        rows: ["Region"],
        values: [{ field: "Revenue", agg: "sum" }],
        filters: [{ field: "Region", type: "in", items: ["North", "South"] }, { field: "Region", type: "top", count: 1, by: { field: "Revenue", agg: "sum" } }],
        chart: "line",
        map: { Revenue: "Turnover" }
    };
    const { view, notes } = viewFromLayout(layout, describeSource(data));
    assert.deepEqual(view.values, [{ field: "Turnover", agg: "sum" }]);
    assert.deepEqual(view.filters[1].by, { field: "Turnover", agg: "sum" });
    assert.equal(view.display, "chart");
    assert.deepEqual(view.chart, { type: "line" });
    assert.deepEqual(notes, []);
    assert.equal(validate(view, data).valid, true);
    // a filter in the layout is a copy: changing the view leaves the layout alone
    assert.deepEqual(layout.filters[0].items, ["North", "South"]);
    assert.equal(viewFromLayout({ rows: ["Region"], map: { Nope: "Region" } }, describeSource(data)).notes[0].code, "unusedMap");
});

test("viewFromLayout: a layout of the wrong shape or too large throws; every list is capped", () => {
    const description = described(SALES);
    const bad = (layout, code = "INVALID_ARGUMENT") => assert.throws(() => viewFromLayout(/** @type {any} */ (layout), description), (e) => e instanceof PivotkitError && e.code === code, JSON.stringify(layout).slice(0, 80));
    bad(null);
    bad([]);
    bad({ rows: "Region" });
    bad({ rows: [1] });
    bad({ values: ["sum:Revenue"] });
    bad({ groups: [{ field: "Date" }] });
    bad({ filters: ["x"] });
    bad({ map: { Revenue: 3 } });
    bad({ chart: 3 });
    bad({ whatever: 1 });
    bad({ rows: Array.from({ length: 1000 }, (_, i) => `F${i}`) }, "LIMIT_EXCEEDED");
    bad({ rows: ["x".repeat(100_000)] }, "LIMIT_EXCEEDED");
    // __proto__ as a map key is data, not a prototype
    const map = JSON.parse('{"__proto__":"Region"}');
    assert.equal(viewFromLayout({ rows: ["Region"], map }, description).notes[0].code, "unusedMap");
});

test("renameFields: every reference to a data field is renamed at once, case-insensitively; groupings' names stay", () => {
    const view = {
        version: 2,
        rows: ["region", "Date by month"],
        cols: ["Category"],
        values: [{ field: "Revenue", agg: "sum", showAs: { type: "percentOfRowTotal", axis: "rows" } }, { agg: "count" }],
        derived: [{ name: "Date by month", field: "Date", by: "yearMonth" }],
        filters: [{ field: "Region", type: "in", items: ["North"] }, { field: "Category", type: "top", count: 2, by: { field: "revenue", agg: "sum" } }, { field: "Date by month", type: "in", items: [202501] }],
        sort: [{ field: "Region", by: "value", order: "desc", value: { field: "Revenue", agg: "sum" } }],
        display: "table"
    };
    const before = JSON.stringify(view);
    // a swap: Region and Category trade names, applied at once, not one after the other
    const { view: out, unused } = renameFields(view, { Region: "Category", Category: "Region", Revenue: "Turnover", Date: "Ordered", Nope: "X" });
    assert.equal(JSON.stringify(view), before, "the input is not changed");
    assert.deepEqual(out.rows, ["Category", "Date by month"]);
    assert.deepEqual(out.cols, ["Region"]);
    assert.equal(out.values[0].field, "Turnover");
    assert.deepEqual(out.derived[0], { name: "Date by month", field: "Ordered", by: "yearMonth" });
    assert.deepEqual(out.filters.map((f) => f.field), ["Category", "Region", "Date by month"]);
    assert.equal(out.filters[1].by.field, "Turnover");
    assert.equal(out.sort[0].field, "Category");
    assert.equal(out.sort[0].value.field, "Turnover");
    assert.deepEqual(unused, ["Nope"]);
    // no data field's old name is left anywhere the view names fields
    assert.ok(!viewFileFields(out).some((f) => ["revenue", "date"].includes(f.toLowerCase())), viewFileFields(out).join());
    // two old names onto one new name would merge two fields: refused
    assert.throws(() => renameFields(view, { Region: "X", Category: "x" }), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT");
    // a grouping's name is no data field: "Date by month" is not renamed
    assert.deepEqual(renameFields(view, { "Date by month": "Z" }).unused, ["Date by month"]);
});

test("isIdentifierName: the one rule pivotkit-react and the suggestions share", () => {
    for (const name of ["ID", "OrderId", "CustomerID", "Order No", "asset_nr", "Serial #", "Serial#", "userID2", "ID (Asset)", "Key"]) {
        assert.equal(isIdentifierName(name), true, name);
    }
    for (const name of ["Paid", "PAID", "UUID", "Number of items", "Revenue", "Units"]) {
        assert.equal(isIdentifierName(name), false, name);
    }
});

test("a suggestion on random data normalizes without findings, whatever the columns' order", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 40; n++) {
        const cols = ["A", "B", "C", "D", "E"].map((name) => ({ name, kind: ["text", "few", "date", "number", "id"][Math.floor(rnd() * 5)] }));
        const rows = Array.from({ length: 30 }, (_, i) =>
            Object.fromEntries(cols.map((c) => [c.kind === "id" ? `${c.name} No` : c.name, c.kind === "text" ? `t${i}` : c.kind === "few" ? `f${i % 3}` : c.kind === "date" ? day(Math.floor(rnd() * 900)) : c.kind === "id" ? i : Math.round(rnd() * 100)]))
        );
        suggested(rows);
    }
});
