// An attribute or a property of <pivot-report> lives in five places: its row in src/props.js (the
// table the element reads), its getter and setter with JSDoc in src/element.js (the public type), the
// line of #props() that passes it to the report, its name in the Settable union of src/jsx.d.ts
// (React's props) and its row in docs/reference/element.md. These tests keep them in step. A name
// in Settable without an accessor also fails tsc (npm run types); a name missing there only fails here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ATTRIBUTES, OBJECT_PROPS } from "../src/props.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const element = read("src/element.js");
const table = [...ATTRIBUTES.map((a) => a.prop), ...OBJECT_PROPS].sort();
/** Code without its comments, so a commented-out line counts as gone. */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** The body of a class member that starts with `start`. */
const bodyOf = (start) => {
    const at = element.indexOf(start);
    assert.ok(at !== -1, `${start} not found`);
    return code(element.slice(at, element.indexOf("\n    }\n", at)));
};

test("every property of the table has its getter and setter on the element, reading its own attribute, and the element has no other", () => {
    const getters = [...element.matchAll(/^ {4}get (\w+)\(\)/gm)].map((m) => m[1]).sort();
    const setters = [...element.matchAll(/^ {4}set (\w+)\(/gm)].map((m) => m[1]).sort();
    assert.deepEqual(getters, table, "a getter per property of src/props.js");
    assert.deepEqual(setters, table, "a setter per property of src/props.js");
    // an attribute is the property's storage, except a JSON one: a view is an object, kept as one
    for (const { attr, prop } of ATTRIBUTES.filter((a) => a.kind !== "json")) {
        assert.match(bodyOf(`    get ${prop}()`), new RegExp(`#read\\("${attr}"\\)`), `get ${prop} reads "${attr}"`);
        assert.match(bodyOf(`    set ${prop}(`), new RegExp(`#write\\("${attr}"`), `set ${prop} writes "${attr}"`);
    }
    for (const prop of [...ATTRIBUTES.filter((a) => a.kind === "json").map((a) => a.prop), ...OBJECT_PROPS]) {
        assert.match(bodyOf(`    set ${prop}(`), new RegExp(`#set\\("${prop}"`), `set ${prop} keeps "${prop}"`);
    }
});

/** The key of the report's prop a property is passed under, where it is not its own name; null: not on render. */
const PASSED_AS = { saveTemplates: "onSaveTemplate", sourceId: "source", sourceName: "source", importWorkerUrl: null, serverUrl: "server", serverSource: "server", serverParams: "server", getToken: "server" };

test("#props() passes every property of the table to the report under its key", () => {
    const props = bodyOf("    #props() {");
    const missing = table.filter((prop) => {
        const key = Object.hasOwn(PASSED_AS, prop) ? PASSED_AS[prop] : prop;
        if (key === null) return false;
        const line = new RegExp(`^\\s*${key}: .*\\b(this|v)\\.${prop}\\b`, "m");
        return !line.test(props);
    });
    assert.deepEqual(missing, [], "a property the report never gets under its key");
});

test("React's JSX props name every property of the table", () => {
    const settable = /type Settable = ([^;]+);/.exec(read("src/jsx.d.ts"))?.[1] ?? "";
    assert.deepEqual([...settable.matchAll(/"(\w+)"/g)].map((m) => m[1]).sort(), table);
});

test("the docs' table of properties and attributes lists each property with its attribute", () => {
    const doc = readFileSync(new URL("../../../docs/reference/element.md", import.meta.url), "utf8");
    const section = doc.slice(doc.indexOf("## Properties and attributes"), doc.indexOf("\n## ", doc.indexOf("## Properties and attributes") + 1));
    const rows = [...section.matchAll(/^\| `(\w+)` \|\s*(?:`([\w-]+)`[^|]*)?\|/gm)].map((m) => [m[1], m[2] ?? null]);
    const documented = rows.map(([prop, attr]) => `${prop}=${attr}`).sort();
    const expected = [...ATTRIBUTES.map((a) => `${a.prop}=${a.attr}`), ...OBJECT_PROPS.map((p) => `${p}=null`)].sort();
    assert.deepEqual(documented, expected);
});
