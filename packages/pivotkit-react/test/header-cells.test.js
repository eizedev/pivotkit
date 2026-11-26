// What the table's header cells name (#920): a field's name gets its zone, its fill (a value name
// repeated over the columns its icon alone) and the scope of the cells it heads; the empty corner
// names the fields on each axis. Read from the grid pivotkit-core builds, as the table draws it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize, toGrid } from "pivotkit-core";
import { LABELS } from "../src/labels.js";
import "../src/deferred.js";
import { cornerLabel, headerField, scopeOf } from "../src/header-cells.js";

const data = encode([
    { Team: "Desk", Category: "Access", Priority: "P1", Channel: "Chat", Hours: 2 },
    { Team: "Net", Category: "Email", Priority: "P2", Channel: "Mail", Hours: 3 }
]);
const count = { field: "Hours", agg: "count" };
const sum = { field: "Hours", agg: "sum" };

/** Each header cell that names a field, as "text: zone fill scope", row by row. */
function named(spec) {
    const view = normalize(spec, data).view;
    const grid = toGrid(computePivot(data, view));
    const out = [];
    grid.rows.slice(0, grid.headerRows).forEach((row, r) => {
        for (const cell of row) {
            const field = cell ? headerField(view, cell, r === grid.headerRows - 1) : null;
            if (field) out.push(`${cell.text}: ${field.zone}${field.fill ? " filled" : ""} ${field.scope}`);
        }
    });
    return out;
}

test("one field on each axis and one value: every field name filled, in its zone's scope", () => {
    assert.deepEqual(named({ rows: ["Team"], cols: ["Priority"], values: [count] }), ["Priority: cols filled row", "Team: rows filled col", "Count of Hours: values filled col"]);
});

test("two fields on each axis: a column field's name heads its row of items, a row field's name its column of labels", () => {
    assert.deepEqual(named({ rows: ["Team", "Category"], cols: ["Priority", "Channel"], values: [count] }), [
        "Priority: cols filled row",
        "Channel: cols filled row",
        "Team: rows filled col",
        "Category: rows filled col",
        "Count of Hours: values filled col"
    ]);
});

test("two values: their names stay the lowest column level, each with its icon and without the fill", () => {
    const cells = named({ rows: ["Team"], cols: ["Priority"], values: [count, sum] });
    assert.deepEqual(cells.slice(0, 2), ["Priority: cols filled row", "Team: rows filled col"]);
    // the names repeat under each priority and the grand total
    assert.deepEqual([...new Set(cells.slice(2))], ["Count of Hours: values col", "Sum of Hours: values col"]);
    assert.equal(cells.length, 2 + 2 * 3);
});

test("an item, a total and the empty corner name no field", () => {
    const view = normalize({ rows: ["Team", "Category"], cols: ["Priority"], values: [count] }, data).view;
    assert.equal(headerField(view, { kind: "colHeader", text: "P1", colPath: ["P1"] }, false), null);
    assert.equal(headerField(view, { kind: "corner", text: "" }, false), null);
    // a value's name above the last row is an item's header, not the value's
    assert.equal(headerField(view, { kind: "colHeader", text: "Count of Hours", valueIndex: 0 }, false), null);
    // an item heads its column; the empty corner heads nothing
    assert.equal(scopeOf({ kind: "colHeader" }, null), "col");
    assert.equal(scopeOf({ kind: "corner" }, null), undefined);
    assert.equal(scopeOf({ kind: "corner" }, { scope: "row" }), "row");
});

test("the empty corner names the fields on each axis, in the report's language", () => {
    const view = { rows: ["Team", "Category"], cols: ["Priority", "Channel"] };
    assert.equal(cornerLabel(view, LABELS.en), "Rows: Team, Category; Columns: Priority, Channel");
    assert.equal(cornerLabel(view, LABELS.de), "Zeilen: Team, Category; Spalten: Priority, Channel");
    assert.equal(cornerLabel({ rows: [], cols: ["Priority"] }, LABELS.en), "Columns: Priority");
    assert.equal(cornerLabel({ rows: [], cols: [] }, LABELS.en), "");
});
