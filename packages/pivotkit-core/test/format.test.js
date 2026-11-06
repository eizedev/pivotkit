import { test } from "node:test";
import assert from "node:assert/strict";
import { formatter, isFormat } from "../src/index.js";
import { parseFormat } from "../src/format.js";

test("known formats with locale", () => {
    const en = { locale: "en-US" };
    assert.equal(formatter("number:2", en)(1234.5), "1,234.50");
    assert.equal(formatter("number:2", { locale: "de-DE" })(1234.5), "1.234,50");
    assert.equal(formatter("integer", en)(1234.5), "1,235");
    assert.equal(formatter("percent:0", en)(0.256), "26%");
    assert.equal(formatter("percent100", en)(25), "25%");
    assert.equal(formatter("bytes", en)(1536), "1.5 KB");
    assert.equal(formatter("duration:min", en)(125), "2 h 5 min");
    assert.equal(formatter("date", en)(Date.UTC(2026, 2, 4)), "Mar 4, 2026");
    assert.equal(formatter("text")(null), "");
    assert.match(formatter("currency:usd", en)(5), /\$5\.00/);
});

test("format names are a fixed grammar; anything else is refused", () => {
    for (const bad of ["number:abc", "currency:EURO", "duration:week", "x", "number;[Red]", "", null, 5, { name: "number" }, "number:123"]) {
        assert.equal(isFormat(bad), false, String(bad));
    }
    assert.deepEqual(parseFormat(" Currency:EUR "), { name: "currency", arg: "eur", decimals: undefined });
    // an unknown format falls back to locale numbers
    assert.equal(formatter("bogus", { locale: "en-US" })(1.234), "1.23");
});

test("values that round to zero show no minus sign", () => {
    const en = { locale: "en-US" };
    assert.equal(formatter("number", en)(-0.001), "0");
    assert.equal(formatter("number", en)(-0), "0");
    assert.equal(formatter("percent", en)(-0.0001), "0%");
    assert.equal(formatter("bytes", en)(-0.2), "0 B");
    assert.equal(formatter("number", en)(-1.5), "-1.5");
});

test("explicit decimals are exact for number, percent and percent100; up to 20", () => {
    const en = { locale: "en-US" };
    assert.equal(formatter("percent:2", en)(0.25), "25.00%");
    assert.equal(formatter("percent", en)(0.25), "25%");
    assert.equal(formatter("percent100:1", en)(25), "25.0%");
    assert.equal(isFormat("number:20"), true);
    assert.equal(isFormat("number:21"), false);
});

test("the automatic format has the same decimals in a whole value column", async () => {
    const { computePivot, encode, toGrid } = await import("../src/index.js");
    const texts = (rows, agg) => toGrid(computePivot(encode(rows), { rows: ["k"], values: [{ field: "v", agg }], totals: { grandTotalRow: false } })).rows.slice(1).map((r) => r[1].text);
    assert.deepEqual(texts([{ k: "a", v: 3 }, { k: "b", v: 1.5 }, { k: "c", v: 2.25 }], "sum"), ["3.00", "1.50", "2.25"]);
    assert.deepEqual(texts([{ k: "a", v: 3 }, { k: "b", v: 1.5 }], "max"), ["3.0", "1.5"]);
    assert.deepEqual(texts([{ k: "a", v: 3 }, { k: "b", v: 12 }], "sum"), ["3", "12"], "whole numbers stay whole");
    assert.deepEqual(texts([{ k: "a", v: 3 }, { k: "a", v: 4 }, { k: "b", v: 12 }], "average"), ["3.50", "12.00"]);
});
