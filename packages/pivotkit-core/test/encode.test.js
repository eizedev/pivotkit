import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, toWallMs } from "../src/index.js";

test("infers string, number, boolean, date and null columns", () => {
    const d = encode([
        { s: "a", n: 1, b: true, d: "2026-03-04", t: "2026-03-04T10:15:00", x: null, o: new Date(2026, 0, 2) },
        { s: "b", n: 2.5, b: false, d: "2026-03-05", t: null, x: undefined, o: null }
    ]);
    assert.deepEqual(d.schema.fields, [
        { name: "s", type: "string" },
        { name: "n", type: "number" },
        { name: "b", type: "boolean" },
        { name: "d", type: "date" },
        { name: "t", type: "date" },
        { name: "x", type: "null" },
        { name: "o", type: "date" }
    ]);
    assert.equal(d.column("d").dateOnly, true);
    assert.equal(d.column("t").dateOnly, false);
    // a Date object is read at its local wall clock: midnight of 2 January everywhere
    assert.equal(d.column("o").values[0], Date.UTC(2026, 0, 2));
});

test("matches column names case-insensitively and keeps the first spelling", () => {
    const d = encode([{ Team: "a", Score: 1 }, { team: "b", SCORE: 2 }]);
    assert.deepEqual(d.schema.fields.map((f) => f.name), ["Team", "Score"]);
    assert.equal(d.column("TEAM").name, "Team");
    assert.deepEqual([...d.column("team").codes], [0, 1]);
    assert.deepEqual([...d.column("score").values], [1, 2]);
});

test("codes are dictionary indices, blank is -1, measures are Float64 with NaN", () => {
    const d = encode([{ k: "x", v: 1 }, { k: "", v: null }, { k: "x", v: 3 }, {}]);
    const k = d.column("k");
    assert.ok(k.codes instanceof Int32Array);
    assert.deepEqual([...k.codes], [0, -1, 0, -1]);
    assert.deepEqual(k.dict, ["x"]);
    const v = d.column("v");
    assert.ok(v.values instanceof Float64Array);
    assert.ok(Number.isNaN(v.values[1]) && Number.isNaN(v.values[3]));
});

test("a mixed column is a string column; overrides change the type", () => {
    const d = encode([{ a: 1, b: "1" }, { a: "two", b: "2.5" }], { types: { B: "number" } });
    assert.equal(d.column("a").type, "string");
    assert.deepEqual(d.column("a").dict, ["1", "two"]);
    assert.equal(d.column("b").type, "number");
    assert.deepEqual([...d.column("b").values], [1, 2.5]);
});

test("invalid calendar dates are text, not dates", () => {
    const d = encode([{ d: "2026-02-30" }, { d: "2026-02-28" }]);
    assert.equal(d.column("d").type, "string");
});

test("ISO strings without an offset keep their wall clock; with an offset they convert", () => {
    assert.equal(toWallMs("2026-03-04T10:15:00"), Date.UTC(2026, 2, 4, 10, 15));
    assert.equal(toWallMs("2026-03-04"), Date.UTC(2026, 2, 4));
    assert.equal(toWallMs("2026-03-04T10:15:00Z", "UTC"), Date.UTC(2026, 2, 4, 10, 15));
    assert.equal(toWallMs("2026-03-04T10:15:00+02:00", "UTC"), Date.UTC(2026, 2, 4, 8, 15));
    assert.ok(Number.isNaN(toWallMs("not a date")));
});

test("only the requested columns, in that order", () => {
    const d = encode([{ a: 1, b: 2, c: 3 }], { columns: ["C", "a"] });
    assert.deepEqual(d.schema.fields.map((f) => f.name), ["c", "a"]);
});

test("survives non-object rows and empty input", () => {
    assert.equal(encode(null).length, 0);
    const d = encode([null, 5, "x", { a: 1 }]);
    assert.equal(d.length, 4);
    assert.deepEqual([...d.column("a").codes], [-1, -1, -1, 0]);
});
