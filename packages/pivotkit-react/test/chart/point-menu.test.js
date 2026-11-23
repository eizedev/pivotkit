// The small menu at a clicked bar, slice or point (#53): Show the rows first, then Only and Without
// for the category's item and for the series' item; each a filter that Undo takes back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, normalize } from "pivotkit-core";
import { LABELS } from "../../src/labels.js";
import "../../src/deferred.js";
import { de as menuDe } from "../../src/menu-labels-de.js";
import { en as menuEn } from "../../src/menu-labels.js";
import { pointActions } from "../../src/menu-ops.js";
import { filtersOf, selectedItems } from "../../src/view-ops.js";

const data = encode([
    { Region: "East", Category: "Hardware", Revenue: 3 },
    { Region: "West", Category: "Hardware", Revenue: 4 },
    { Region: "East", Category: "Software", Revenue: 5 },
    { Region: "North", Category: "Software", Revenue: 1 }
]);
const en = { ...LABELS.en, ...menuEn };
const de = { ...LABELS.de, ...menuDe };
const view = normalize({ rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], display: "chart" }, data).view;
const point = { rowPath: ["East"], colPath: ["Hardware"], valueIndex: 0, value: 3 };

test("a bar's menu: Show the rows, then Only and Without its category, then its series", () => {
    const actions = pointActions(view, point, data, en, "en-US");
    assert.deepEqual(actions.map((a) => [a.id, a.text]), [
        ["rows", "Show the rows"],
        ["only-row", "Only East"],
        ["without-row", "Without East"],
        ["only-col", "Only Hardware"],
        ["without-col", "Without Hardware"]
    ]);
    assert.deepEqual(pointActions(view, point, data, de, "de-DE").map((a) => a.text), ["Zeilen zeigen", "Nur East", "Ohne East", "Nur Hardware", "Ohne Hardware"]);
    // each filter entry names its field: with two fields on an axis, the item is the inner field's
    assert.deepEqual(actions.map((a) => a.field), [undefined, "Region", "Region", "Category", "Category"]);
});

test("Only keeps the one item, Without leaves it out of what is picked; each says what it did", () => {
    const actions = pointActions(view, point, data, en, "en-US");
    const only = actions.find((a) => a.id === "only-row").change();
    assert.deepEqual(selectedItems(only.view, "Region", ["East", "North", "West"]), ["East"]);
    assert.equal(only.note.step, "filter");
    const without = actions.find((a) => a.id === "without-col").change();
    assert.deepEqual(selectedItems(without.view, "Category", ["Hardware", "Software"]), ["Software"]);
    // Without on top of a pick: the other picks stay
    const picked = pointActions(only.view, { ...point }, data, en, "en-US").find((a) => a.id === "without-col").change().view;
    assert.deepEqual(selectedItems(picked, "Region", ["East", "North", "West"]), ["East"]);
    assert.deepEqual(selectedItems(picked, "Category", ["Hardware", "Software"]), ["Software"]);
});

test("a slice of a pie, or a chart without columns: no series entries; the last item standing is not taken away", () => {
    const rowsOnly = normalize({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "chart" }, data).view;
    assert.deepEqual(pointActions(rowsOnly, { rowPath: ["West"], colPath: [], valueIndex: 0, value: 4 }, data, en, "en-US").map((a) => a.id), ["rows", "only-row", "without-row"]);
    // a pie's slice adds up every column: no rows of one cell to show
    assert.deepEqual(pointActions(rowsOnly, { rowPath: ["West"], colPath: [], valueIndex: 0, value: 4, slice: true }, data, en, "en-US").map((a) => a.id), ["only-row", "without-row"]);
    // with only East left, Without East would leave nothing: not offered
    const onlyEast = pointActions(rowsOnly, { rowPath: ["East"], colPath: [], valueIndex: 0, value: 8 }, data, en, "en-US").find((a) => a.id === "only-row").change().view;
    assert.deepEqual(pointActions(onlyEast, { rowPath: ["East"], colPath: [], valueIndex: 0, value: 8 }, data, en, "en-US").map((a) => a.id), ["rows"]);
    assert.equal(filtersOf(onlyEast, "Region", ["in"]).length, 1);
});

test("no rows to show (drillDown off, no onCellClick): no Show the rows, the filters stay (#705)", () => {
    assert.deepEqual(pointActions(view, point, data, en, "en-US", { showRows: false }).map((a) => a.id), ["only-row", "without-row", "only-col", "without-col"]);
    // on by default: a caller without the option keeps the entry
    for (const options of [{ showRows: true }, undefined]) {
        assert.equal(pointActions(view, point, data, en, "en-US", options)[0].id, "rows");
    }
});
