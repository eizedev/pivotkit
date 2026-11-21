// A field's own name in the report (#158): Name in its chip menu writes view.fieldLabels; the name goes
// with the field when it leaves the report; the placeholder is the name without the report's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, normalize, withFieldLabels } from "pivotkit-core";
import { LABELS } from "../src/labels.js";
import { en as menuEn } from "../src/menu-labels.js";
import { axisTopics, filterZoneTopics } from "../src/menu-topics.js";
import { sourceFieldName } from "../src/names.js";
import { removeAt, setFieldLabel } from "../src/view-ops.js";

const data = encode([{ cn: "Berlin", Date: new Date("2025-01-02"), Revenue: 3 }]);
const types = new Map([["cn", "string"], ["date", "date"], ["revenue", "number"]]);
const labels = { ...LABELS.en, ...menuEn };
const base = normalize({ rows: ["cn"], filters: [{ field: "Date", type: "in", items: [], not: true }], values: [{ field: "Revenue", agg: "sum" }] }, data).view;

test("Name sets the field's own name, trims it, and an empty one takes it away", () => {
    const named = setFieldLabel(base, "cn", "  City ");
    assert.deepEqual(named.fieldLabels, { cn: "City" });
    // the same field in another case replaces it
    assert.deepEqual(setFieldLabel(named, "CN", "Town").fieldLabels, { CN: "Town" });
    assert.equal(Object.hasOwn(setFieldLabel(named, "cn", " "), "fieldLabels"), false);
    assert.equal(Object.hasOwn(setFieldLabel(named, "cn", null), "fieldLabels"), false);
    // a field called __proto__ is an own entry
    assert.equal(Object.keys(setFieldLabel(base, "__proto__", "x").fieldLabels).join(), "__proto__");
    // a normalized view keeps it
    assert.deepEqual(normalize(named, data).view.fieldLabels, { cn: "City" });
});

test("a field taken out of the report takes its name along", () => {
    const named = setFieldLabel(base, "cn", "City");
    assert.equal(Object.hasOwn(removeAt(named, "rows", 0), "fieldLabels"), false);
});

test("the menus of Rows and Filters have Name; its state is the name shown, changed when set", () => {
    const named = setFieldLabel(base, "cn", "City");
    const shown = { ...labels, hostNames: null, core: withFieldLabels(labels.core, named.fieldLabels) };
    const topic = axisTopics({ view: named, zone: "rows", index: 0, field: "cn", types, labels: shown, locale: "en-US", state: {}, encoded: data }).find((t) => t.id === "name");
    assert.equal(topic.state, "City");
    assert.equal(topic.changed, true);
    const plain = filterZoneTopics({ view: base, index: 0, field: "Date", types, labels, locale: "en-US", state: {}, encoded: data }).find((t) => t.id === "name");
    assert.equal(plain.changed, false);
    assert.equal(plain.state, "Date");
    // the name without the report's: the host's display name, else the field's
    assert.equal(sourceFieldName("cn", shown), "cn");
    assert.equal(sourceFieldName("cn", { ...shown, hostNames: { cn: "Host city" } }), "Host city");
});
