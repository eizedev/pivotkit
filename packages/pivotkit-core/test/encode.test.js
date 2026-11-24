import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError, encode } from "../src/index.js";
import { toWallMs, wallClock } from "../src/time.js";
import { random } from "./fixtures.js";
import { cpuClock } from "../../../tests/cpu-time.js";

const utc = wallClock("UTC");

test("infers string, number, boolean, date and null columns", () => {
    const d = encode([
        { s: "a", n: 1, b: true, d: "2026-03-04", t: "2026-03-04T10:15:00", x: null, o: new Date(Date.UTC(2026, 0, 2, 23, 30)) },
        { s: "b", n: 2.5, b: false, d: "2026-03-05", t: null, x: undefined, o: null }
    ]);
    assert.deepEqual(d.schema.fields, [
        { name: "s", type: "string", detected: "string" },
        { name: "n", type: "number", detected: "number" },
        { name: "b", type: "boolean", detected: "boolean" },
        { name: "d", type: "date", detected: "date" },
        { name: "t", type: "date", detected: "date" },
        { name: "x", type: "null", detected: "null" },
        { name: "o", type: "date", detected: "date" }
    ]);
    assert.equal(d.column("d").dateOnly, true);
    assert.equal(d.column("t").dateOnly, false);
    // a Date object is an instant, read at the wall clock of the default time zone UTC on every machine
    assert.equal(d.column("o").values[0], Date.UTC(2026, 0, 2, 23, 30));
    assert.equal(d.timeZone, "UTC");
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
    assert.equal(toWallMs("2026-03-04T10:15:00", utc), Date.UTC(2026, 2, 4, 10, 15));
    assert.equal(toWallMs("2026-03-04", utc), Date.UTC(2026, 2, 4));
    assert.equal(toWallMs("2026-03-04T10:15:00Z", utc), Date.UTC(2026, 2, 4, 10, 15));
    assert.equal(toWallMs("2026-03-04T10:15:00+02:00", utc), Date.UTC(2026, 2, 4, 8, 15));
    assert.ok(Number.isNaN(toWallMs("not a date", utc)));
});

test("only the requested columns, in that order", () => {
    const d = encode([{ a: 1, b: 2, c: 3 }], { columns: ["C", "a"] });
    assert.deepEqual(d.schema.fields.map((f) => f.name), ["c", "a"]);
});

test("survives non-object rows and empty input; rows that are no array are a programmer error", () => {
    assert.equal(encode([]).length, 0);
    for (const bad of [null, undefined, "rows", { length: 4e9 }, 5]) {
        assert.throws(() => encode(bad), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT", String(bad));
    }
    const d = encode([null, 5, "x", { a: 1 }]);
    assert.equal(d.length, 4);
    assert.deepEqual([...d.column("a").codes], [-1, -1, -1, 0]);
});

test("numeric text stays text unless inferNumbers is on; the detected type says what it could be", () => {
    const rows = [{ n: "12", m: "7", s: "x" }, { n: "-3.5", m: 3, s: "1" }, { n: "1e3", m: null, s: "0x10" }];
    const plain = encode(rows);
    assert.deepEqual(plain.schema.fields.map((f) => [f.name, f.type, f.detected]), [["n", "string", "number"], ["m", "string", "number"], ["s", "string", "string"]]);
    const inferred = encode(rows, { inferNumbers: true });
    assert.deepEqual(inferred.schema.fields.map((f) => f.type), ["number", "number", "string"]);
    assert.deepEqual([...inferred.column("n").values], [12, -3.5, 1000]);
    // "0x10", "Infinity" and blanks are no numbers
    assert.deepEqual(encode([{ s: "Infinity" }, { s: " " }], { inferNumbers: true }).column("s").type, "string");
});

test("numeric text is recognised in linear time, and very long text is no number", () => {
    // the pattern used to backtrack quadratically on digits followed by something else
    const digits = "1".repeat(100_000);
    const cpu = cpuClock();
    const d = encode([{ v: `${digits}x` }, { v: "2" }]);
    assert.ok(cpu() < 200, `${Math.round(cpu())} ms of CPU`);
    assert.equal(d.schema.fields[0].detected, "string");
    // longer than 100 characters: text, even when it is all digits
    assert.equal(encode([{ v: "1".repeat(101) }], { inferNumbers: true }).column("v").type, "string");
    assert.equal(encode([{ v: "1".repeat(100) }], { inferNumbers: true }).column("v").type, "number");
});

test("numeric text: random short strings count as numbers exactly when a plain number pattern matches them", () => {
    // a simple, ambiguous pattern as the reference: fine for short strings, slow on long ones
    const reference = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
    const alphabet = ["0", "1", "9", ".", "+", "-", "e", "E", " ", "x"];
    const rnd = random(7);
    const strings = ["", ".", "1.", ".5", "1.e5", "1e", "+.e1", "-0.0E-0", "1..2", "1e5.5"];
    for (let i = 0; i < 20_000; i++) {
        const length = 1 + Math.floor(rnd() * 8);
        strings.push(Array.from({ length }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(""));
    }
    for (const s of strings) {
        const isNumber = encode([{ v: s }], { inferNumbers: true }).column("v")?.type === "number";
        assert.equal(isNumber, s.trim() !== "" && reference.test(s.trim()), JSON.stringify(s));
    }
});

test("functions and symbols in the data are blank, never their source text", () => {
    const d = encode([{ k: function secret() { return "token"; }, v: Symbol("s") }, { k: "a", v: 1 }]);
    assert.deepEqual(d.column("k").dict, ["a"]);
    assert.deepEqual([...d.column("k").codes], [-1, 0]);
    assert.equal(d.column("v").type, "number");
    const text = encode([{ k: () => "x" }, { k: { nested: true } }]);
    assert.deepEqual(text.column("k").dict, ['{"nested":true}']);
});

test("column names that differ only in case are one column, and that is reported", () => {
    const d = encode([{ Team: "a" }, { team: "b" }, { Team: "c", TEAM: "d" }]);
    assert.equal(d.columns.length, 1);
    assert.deepEqual(d.column("team").dict, ["a", "b", "d"]);
    assert.deepEqual(d.issues.map((i) => i.message), [
        '"team" and "Team" are one column: names match case-insensitively',
        '"TEAM" and "Team" are one column: names match case-insensitively',
        'row 2 has "TEAM" next to another spelling of it; the later value is used'
    ]);
    assert.deepEqual(encode([{ a: 1 }]).issues, []);
});

test("a case collision has a code: one column, a value of a row left out, a columnar column left out", () => {
    const rows = encode([{ A: 1, a: 2 }]);
    assert.deepEqual([...rows.column("a").values], [2]);
    assert.deepEqual(rows.issues.map((i) => [i.code, i.params]), [
        ["columnCase", { column: "A", spelling: "a" }],
        ["columnCaseValue", { column: "A", spelling: "a", row: 0 }]
    ]);
    const columnar = encode({ columns: ["A", "a"], data: [[1], [2]] });
    assert.deepEqual([...columnar.column("a").values], [1]);
    assert.deepEqual(columnar.issues.map((i) => [i.code, i.params]), [["columnCaseLeftOut", { column: "A", spelling: "a" }]]);
});
