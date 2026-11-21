// Sorting the rows by one column from the table's headers (#70): a column's header sorts the rows by
// its values, its corner name sorts the column field; the sort says its column in words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePivot, encode, normalize, toGrid } from "pivotkit-core";
import { LABELS } from "../src/labels.js";
import "../src/deferred.js";
import { en as menuEn } from "../src/menu-labels.js";
import { sortText } from "../src/names.js";
import { headerSortState, headerSortTarget, nextHeaderSort, setSort } from "../src/view-ops.js";
import { axisTopics } from "../src/menu-topics.js";

const data = encode([
    { City: "Oslo", Month: "Jan", Temp: -4 },
    { City: "Oslo", Month: "Jul", Temp: 17 },
    { City: "Cairo", Month: "Jan", Temp: 14 },
    { City: "Cairo", Month: "Jul", Temp: 29 }
]);
const labels = { ...LABELS.en, ...menuEn };
const typeOf = (f) => ({ city: "string", month: "string", temp: "number" })[f.toLowerCase()];
const temp = { field: "Temp", agg: "average" };
const view = normalize({ rows: ["City"], cols: ["Month"], values: [temp] }, data).view;
const header = (v) => {
    const grid = toGrid(computePivot(data, v));
    return grid.rows.slice(0, grid.headerRows).flat().filter(Boolean);
};

test("a column's header sorts the rows by its values; the merged value name and the Grand Total by the whole row", () => {
    const cells = header(view);
    const jul = cells.find((c) => c.text === "Jul");
    assert.deepEqual(headerSortTarget(view, jul, typeOf), { field: "City", ref: temp, column: ["Jul"] });
    const whole = cells.find((c) => c.kind === "colHeader" && c.valueIndex === 0);
    assert.deepEqual(headerSortTarget(view, whole, typeOf), { field: "City", ref: temp });
    // the corner's column field name sorts that field A to Z and back
    const corner = cells.find((c) => c.kind === "corner" && c.field === "Month");
    assert.deepEqual(headerSortTarget(view, corner, typeOf), { field: "Month" });
    // two values: each value's header in a column sorts by that value in that column
    const two = normalize({ rows: ["City"], cols: ["Month"], values: [temp, { field: "Temp", agg: "max" }] }, data).view;
    const max = header(two).find((c) => c.kind === "colHeader" && c.valueIndex === 1 && c.colPath?.length);
    assert.deepEqual(headerSortTarget(two, max, typeOf), { field: "City", ref: { field: "Temp", agg: "max" }, column: [max.colPath[0]] });
});

test("a column's header goes from largest first to smallest first to the default; its state is its own", () => {
    const target = { field: "City", ref: temp, column: ["Jul"] };
    const first = nextHeaderSort(view, target);
    assert.deepEqual(first, { by: "value", order: "desc", value: temp, column: ["Jul"] });
    const sorted = setSort(view, "City", first);
    assert.deepEqual(headerSortState(sorted, target), { order: "descending", chosen: true });
    // another column, or the whole row, is not sorted by it
    assert.deepEqual(headerSortState(sorted, { ...target, column: ["Jan"] }), { order: null, chosen: false });
    assert.deepEqual(headerSortState(sorted, { field: "City", ref: temp }), { order: null, chosen: false });
    const second = nextHeaderSort(sorted, target);
    assert.equal(second.order, "asc");
    assert.equal(nextHeaderSort(setSort(view, "City", second), target), null);
});

test("the sort says its column: in the chip's state and the menu, not as a sort by the whole row", () => {
    const sorted = setSort(view, "City", { by: "value", order: "desc", value: temp, column: ["Jul"] });
    assert.equal(sortText(sorted, sorted.sort[0], labels, "Jul"), "Largest Average of Temp in Jul first");
    const topics = axisTopics({ view: sorted, zone: "rows", index: 0, field: "City", types: new Map([["city", "string"], ["month", "string"], ["temp", "number"]]), labels, locale: "en-US", encoded: data });
    const sortValue = topics.find((t) => t.id === "sortValue");
    assert.equal(sortValue.state, "Largest Average of Temp in Jul first");
    // the menu's "Largest … first" sorts by the whole row: not checked while a column decides
    assert.deepEqual(sortValue.groups.flatMap((g) => g.choices).filter((c) => c.checked), []);
});
