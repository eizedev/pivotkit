// An attribute or a property of <pivot-report> lives in three places: its row in src/props.js (the
// one table the element reads), its accessor with its JSDoc in src/element.js (the public type), and
// its name in src/jsx.d.ts (React's props). This test keeps the three in step, so a new one cannot
// be added to one place and forgotten in another.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ATTRIBUTES, OBJECT_PROPS } from "../src/props.js";

const source = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const table = [...ATTRIBUTES.map((a) => a.prop), ...OBJECT_PROPS].sort();

test("every property of the table has its getter and setter on the element, and the element has no other", () => {
    const element = source("element.js");
    const getters = [...element.matchAll(/^ {4}get (\w+)\(\)/gm)].map((m) => m[1]).sort();
    const setters = [...element.matchAll(/^ {4}set (\w+)\(/gm)].map((m) => m[1]).sort();
    assert.deepEqual(getters, table, "a getter per property of src/props.js");
    assert.deepEqual(setters, table, "a setter per property of src/props.js");
});

test("React's JSX props name every property of the table", () => {
    const settable = /type Settable = ([^;]+);/.exec(source("jsx.d.ts"))?.[1] ?? "";
    const names = [...settable.matchAll(/"(\w+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(names, table);
});

test("the props the element renders read every property of the table", () => {
    const element = source("element.js");
    const start = element.indexOf("    #props() {");
    const body = element.slice(start, element.indexOf("\n    }\n", start));
    // the import worker's URL is read when a file is read (#startImportWorker), not on render
    const read = table.filter((prop) => prop !== "importWorkerUrl" && !new RegExp(`(this|v)\\.${prop}\\b`).test(body));
    assert.deepEqual(read, [], "a property the report never gets");
});
