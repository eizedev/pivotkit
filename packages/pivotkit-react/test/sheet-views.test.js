// The sheet of a workbook a view names (issue #252): which views of the browser store a workbook's
// sheet lists, what opening a view of another sheet does, and that the store keeps a view of the same
// name per sheet, giving a view saved before views named their sheet the sheet on its next Save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileOfId, listedFor, sheetOfSource, sheetPlan } from "../src/sheet-views.js";
import { changedViews, storedViews } from "../src/view-store.js";
import { isLoadedEntry, saveAsTarget, saveTarget } from "../src/view-save.js";
import { templateEntries } from "../src/templates.js";
import { toViewFile } from "pivotkit-core";

const Q1 = "quarters.xlsx#1111111111111111";
const Q3 = "quarters.xlsx#3333333333333333";
const OTHER = "other.xlsx#3333333333333333";
const VIEW = { version: 2, rows: ["Product"] };
const SHEETS = ["Q1", "Q2", "Q3"];
const tooMuch = () => "too much";

test("a loaded file's id names its file; a host's id names none", () => {
    assert.equal(fileOfId(Q3), "quarters.xlsx");
    assert.equal(fileOfId("a#b.xlsx#0123456789abcdef"), "a#b.xlsx");
    assert.equal(fileOfId("sales"), null);
    assert.equal(fileOfId("sales#123"), null);
    assert.equal(fileOfId(undefined), null);
    assert.equal(sheetOfSource({ id: Q3, params: { sheet: "Q3" } }), "Q3");
    assert.equal(sheetOfSource({ id: Q3, params: { sheet: "" } }), null);
    assert.equal(sheetOfSource({ id: Q3 }), null);
    assert.equal(sheetOfSource(null), null);
});

test("listed: the data's own views, views for no data, and views of another sheet of the same file while a workbook is shown", () => {
    const shown = { id: Q1, sheet: "Q1", sheets: SHEETS };
    assert.equal(listedFor({ sourceId: Q1 }, shown), true);
    assert.equal(listedFor({}, shown), true);
    assert.equal(listedFor({ sourceId: Q3, sheet: "Q3" }, shown), true);
    // a sheet the workbook no longer has is listed too: opening it says so
    assert.equal(listedFor({ sourceId: Q3, sheet: "Q9" }, shown), true);
    // a view of that file saved before views named their sheet, another file, a CSV shown
    assert.equal(listedFor({ sourceId: Q3 }, shown), false);
    assert.equal(listedFor({ sourceId: OTHER, sheet: "Q3" }, shown), false);
    assert.equal(listedFor({ sourceId: Q3, sheet: "Q3" }, { id: "quarters.xlsx#4444444444444444", sheet: null, sheets: [] }), false);
});

test("opening: the sheet shown or none is nothing; another sheet of the file is read; a sheet gone is said", () => {
    const shown = { id: Q1, sheet: "Q1", sheets: SHEETS };
    assert.deepEqual(sheetPlan({ id: Q1, sheet: "Q1" }, shown), { kind: "none" });
    assert.deepEqual(sheetPlan({ id: Q3, sheet: null }, shown), { kind: "none" });
    assert.deepEqual(sheetPlan({ id: Q3, sheet: "Q3" }, shown), { kind: "switch", sheet: "Q3" });
    // the same columns on every sheet: the same id, the sheet tells them apart
    assert.deepEqual(sheetPlan({ id: Q1, sheet: "Q3" }, shown), { kind: "switch", sheet: "Q3" });
    assert.deepEqual(sheetPlan({ id: Q3, sheet: "Q9" }, shown), { kind: "missing", sheet: "Q9" });
    // the order of the sheets does not count, their names do
    assert.deepEqual(sheetPlan({ id: Q3, sheet: "Q3" }, { ...shown, sheets: ["Q3", "Q2", "Q1"] }), { kind: "switch", sheet: "Q3" });
    // other data: another file, a host's source, a file that is no workbook
    assert.deepEqual(sheetPlan({ id: OTHER, sheet: "Q3" }, shown), { kind: "none" });
    assert.deepEqual(sheetPlan({ id: "sales", sheet: "Q3" }, { id: "sales", sheet: null, sheets: [] }), { kind: "none" });
    assert.deepEqual(sheetPlan({ id: Q3, sheet: "Q3" }, { id: "quarters.xlsx#5555555555555555", sheet: null, sheets: [] }), { kind: "none" });
});

test("the store keeps a view of a name per sheet; a view saved before views named their sheet takes the sheet on Save", () => {
    let text = changedViews(null, { name: "By region", view: VIEW, sourceId: Q1, sheet: "Jan" }, tooMuch);
    text = changedViews(text, { name: "By region", view: { ...VIEW, rows: ["Region"] }, sourceId: Q1, sheet: "Mar" }, tooMuch);
    const files = JSON.parse(/** @type {string} */ (text));
    assert.deepEqual(files.map((f) => f.source), [{ id: Q1, params: { sheet: "Jan" } }, { id: Q1, params: { sheet: "Mar" } }]);
    // the same name, data and sheet again replaces it
    text = changedViews(text, { name: "By region", view: VIEW, sourceId: Q1, sheet: "Mar" }, tooMuch);
    assert.equal(JSON.parse(/** @type {string} */ (text)).length, 2);
    const listed = storedViews(text, Q1, { sheet: "Jan", sheets: ["Jan", "Feb", "Mar"] });
    assert.deepEqual(listed.map((t) => [t.name, t.sheet]), [["By region", "Jan"], ["By region", "Mar"]]);

    // an older entry without a sheet: Save on the data's sheet writes over it and adds the sheet
    let old = changedViews(null, { name: "Old", view: VIEW, sourceId: Q3 }, tooMuch);
    const entries = templateEntries([], storedViews(old, Q3, { sheet: "Q3", sheets: SHEETS }), false);
    const loaded = { name: "Old", scope: /** @type {const} */ ("user"), store: true, storeSource: Q3, storeSheet: null };
    assert.equal(isLoadedEntry(entries[0], loaded), true);
    const target = saveTarget(loaded, entries, { host: false, store: true, publish: false, sourceId: Q3, sheet: "Q3" });
    assert.equal(target?.kind, "store");
    old = changedViews(old, { name: "Old", view: VIEW, sourceId: Q3, sheet: "Q3", replace: /** @type {any} */ (target).at }, tooMuch);
    assert.deepEqual(JSON.parse(/** @type {string} */ (old))[0].source, { id: Q3, params: { sheet: "Q3" } });
    // Save as of that name on another sheet of the same data adds one, it does not replace Jan's
    const as = saveAsTarget("By region", templateEntries([], listed, false), { host: false, store: true, publish: false, sourceId: Q1, sheet: "Feb" });
    assert.equal(as.replaces, null);
    const same = saveAsTarget("By region", templateEntries([], listed, false), { host: false, store: true, publish: false, sourceId: Q1, sheet: "Mar" });
    assert.equal(same.replaces?.sheet, "Mar");
});

test("a host's view file names its sheet in the Views menu's entry", () => {
    const file = toViewFile(VIEW, { name: "Q3", source: { id: Q3, params: { sheet: "Q3" } } });
    const [entry] = templateEntries([{ name: "Q3 products", file }], [], false);
    assert.equal(entry.sheet, "Q3");
    assert.equal(entry.sheetOf, Q3);
    const [plain] = templateEntries([{ name: "Plain", view: VIEW }], [], false);
    assert.equal(plain.sheet, undefined);
});
