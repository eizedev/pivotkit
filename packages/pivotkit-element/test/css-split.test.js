// The shadow root's stylesheet split at build time (src/css-split.js): which rules wait for the menus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classesIn, joinStyles, splitStyles, topRules } from "../src/css-split.js";

test("the top-level rules: blocks, at-rules with their blocks, statements; braces in strings and comments do not count", () => {
    const css = '@charset "utf-8";.a{content:"}"}@media (width>1px){.b{color:red}.c{color:blue}}/* { */.d{}';
    assert.deepEqual(topRules(css), ['@charset "utf-8";', '.a{content:"}"}', "@media (width>1px){.b{color:red}.c{color:blue}}", "/* { */.d{}"]);
    assert.throws(() => topRules(".a{"), /braces/);
});

test("the classes code writes: whole names and the prefixes of names built from parts, not the bare pk-", () => {
    const { names, prefixes } = classesIn('className="pk-chip pk-over" x={`pk-zone-${z}`} y={`pk-${kind}`} z={" pk-flash"}');
    assert.deepEqual([...names].sort(), ["pk-chip", "pk-flash", "pk-over", "pk-zone-"]);
    assert.deepEqual(prefixes, ["pk-zone-"]);
});

test("a rule waits for the menus only when each selector names a class only the menus write", () => {
    const first = 'className="pk-table pk-option" c={`pk-type-${t}`}';
    const menus = 'className="pk-level pk-option pk-type-date-extra" t={`pk-topic${open ? " pk-open" : ""}`}';
    const css = [
        ".pk-table{a:1}",
        ".pk-level{a:2}", // menus only
        ".pk-level .pk-option{a:3}", // the option inside a level: menus only
        ".pk-option{a:4}", // both write it: first
        ".pk-level,.pk-table{a:5}", // one selector of the first load: first
        ".pk-type-date-extra{a:6}", // a name the first load builds from parts: first
        ".pk-unknown{a:7}", // nobody writes it: first
        "@media (hover:none){.pk-level{a:8}}", // an at-rule: first
        ".pk-topic{a:9}"
    ].join("");
    const { first: runs, menus: later } = splitStyles(css, first, menus);
    assert.deepEqual(runs, [".pk-table{a:1}", ".pk-option{a:4}.pk-level,.pk-table{a:5}.pk-type-date-extra{a:6}.pk-unknown{a:7}@media (hover:none){.pk-level{a:8}}", ""]);
    assert.deepEqual(later, [".pk-level{a:2}.pk-level .pk-option{a:3}", ".pk-topic{a:9}"]);
    // the runs in their order are the stylesheet again; without the menus' the first load's alone
    assert.equal(joinStyles(runs, later), css);
    assert.equal(joinStyles(runs, null), runs.join(""));
});
