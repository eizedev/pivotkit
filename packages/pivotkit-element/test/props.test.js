// The attribute table of <pivot-report>: how an attribute becomes a property (and a prop of
// <PivotReport>) and back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTRIBUTES, OBJECT_PROPS, fromAttribute, localeOf, parseJson, toAttribute } from "../src/props.js";

const def = (attr) => ATTRIBUTES.find((d) => d.attr === attr);

test("every attribute has its own property, none is also an object property", () => {
    const props = ATTRIBUTES.map((d) => d.prop);
    assert.equal(new Set(props).size, props.length);
    assert.deepEqual(props.filter((p) => OBJECT_PROPS.includes(p)), []);
    // data-* names are the page's own (dataset): no attribute of the element may take one
    assert.deepEqual(ATTRIBUTES.filter((d) => d.attr.startsWith("data-")), []);
});

test("theme: light, dark or auto; anything else is auto", () => {
    assert.equal(fromAttribute(def("theme"), "dark"), "dark");
    assert.equal(fromAttribute(def("theme"), " Light "), "light");
    assert.equal(fromAttribute(def("theme"), "blue"), "auto");
    assert.equal(fromAttribute(def("theme"), null), "auto");
});

test("height: a number of pixels or a CSS length; empty is the default", () => {
    assert.equal(fromAttribute(def("height"), "480"), 480);
    assert.equal(fromAttribute(def("height"), "100%"), "100%");
    assert.equal(fromAttribute(def("height"), " 40rem "), "40rem");
    assert.equal(fromAttribute(def("height"), ""), undefined);
    assert.equal(fromAttribute(def("height"), null), undefined);
    assert.equal(toAttribute(def("height"), 480), "480");
    assert.equal(toAttribute(def("height"), undefined), null);
});

test("drill-down is on unless it says false; save-templates is a boolean attribute", () => {
    assert.equal(fromAttribute(def("drill-down"), null), true);
    assert.equal(fromAttribute(def("drill-down"), ""), true);
    assert.equal(fromAttribute(def("drill-down"), "FALSE"), false);
    assert.equal(toAttribute(def("drill-down"), false), "false");
    assert.equal(toAttribute(def("drill-down"), true), null);
    assert.equal(fromAttribute(def("save-templates"), ""), true);
    assert.equal(fromAttribute(def("save-templates"), null), false);
    assert.equal(toAttribute(def("save-templates"), true), "");
    assert.equal(toAttribute(def("save-templates"), false), null);
});

test("numbers: a finite number or nothing", () => {
    assert.equal(fromAttribute(def("drill-down-limit"), "250"), 250);
    assert.equal(fromAttribute(def("drill-down-limit"), "many"), undefined);
    assert.equal(fromAttribute(def("drill-down-limit"), ""), undefined);
    assert.equal(toAttribute(def("drill-down-limit"), 250), "250");
});

test("strings are kept; null removes the attribute", () => {
    assert.equal(fromAttribute(def("locale"), "de-DE"), "de-DE");
    assert.equal(fromAttribute(def("locale"), null), undefined);
    assert.equal(toAttribute(def("file-name"), "tickets"), "tickets");
    assert.equal(toAttribute(def("file-name"), null), null);
});

test("JSON attributes: an object, else nothing (never evaluated)", () => {
    assert.deepEqual(fromAttribute(def("view"), '{"rows":["Region"]}'), { rows: ["Region"] });
    assert.equal(parseJson("[1, 2]"), undefined);
    assert.equal(parseJson("null"), undefined);
    assert.equal(parseJson("{rows: 1}"), undefined);
    assert.equal(parseJson("  "), undefined);
    assert.equal(parseJson(null), undefined);
    // a key named like a prototype property is plain data
    assert.equal(Object.getPrototypeOf(parseJson('{"__proto__": {"x": 1}}')), Object.prototype);
});

test("the locale: the locale attribute, then the element's lang, then the report's default", () => {
    assert.equal(localeOf("de-DE", "en"), "de-DE");
    assert.equal(localeOf(undefined, "de"), "de");
    assert.equal(localeOf(" ", ""), undefined);
    assert.equal(localeOf(undefined, null), undefined);
});

test("label names the report's region and is reflected", () => {
    assert.deepEqual(def("label"), { attr: "label", prop: "label", kind: "string" });
    assert.equal(toAttribute(def("label"), "Tickets"), "Tickets");
});

test("tips and storage-key are text attributes; the tip list is read by the report", () => {
    assert.equal(fromAttribute(def("tips"), "off"), "off");
    assert.equal(fromAttribute(def("tips"), "top,cells"), "top,cells");
    assert.equal(fromAttribute(def("tips"), null), undefined);
    assert.equal(toAttribute(def("storage-key"), "sales"), "sales");
    assert.ok(OBJECT_PROPS.includes("dismissedTips"), "a list is a property");
});
