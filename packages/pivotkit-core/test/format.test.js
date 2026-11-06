import { test } from "node:test";
import assert from "node:assert/strict";
import { excelNumberFormat, formatter, isFormat, parseFormat } from "../src/index.js";

test("known formats with locale", () => {
    assert.equal(formatter("number:2", "en-US")(1234.5), "1,234.50");
    assert.equal(formatter("number:2", "de-DE")(1234.5), "1.234,50");
    assert.equal(formatter("integer", "en-US")(1234.5), "1,235");
    assert.equal(formatter("percent:0", "en-US")(0.256), "26%");
    assert.equal(formatter("percent100", "en-US")(25), "25%");
    assert.equal(formatter("bytes", "en-US")(1536), "1.5 KB");
    assert.equal(formatter("duration:min", "en-US")(125), "2 h 5 min");
    assert.equal(formatter("date", "en-US")(Date.UTC(2026, 2, 4)), "Mar 4, 2026");
    assert.equal(formatter("text")(null), "");
    assert.match(formatter("currency:usd", "en-US")(5), /\$5\.00/);
});

test("format names are a fixed grammar; anything else is refused", () => {
    for (const bad of ["number:abc", "currency:EURO", "duration:week", "x", "number;[Red]", "", null, 5, { name: "number" }, "number:123"]) {
        assert.equal(isFormat(bad), false, String(bad));
    }
    assert.deepEqual(parseFormat(" Currency:EUR "), { name: "currency", arg: "eur" });
    // an unknown format falls back to locale numbers
    assert.equal(formatter("bogus", "en-US")(1.234), "1.23");
});

test("Excel number formats", () => {
    assert.equal(excelNumberFormat("number:2"), "#,##0.00");
    assert.equal(excelNumberFormat("number"), "General");
    assert.equal(excelNumberFormat("percent:1"), "0.0%");
    assert.equal(excelNumberFormat("currency:usd"), '#,##0.00 "USD"');
    assert.equal(excelNumberFormat("date"), "yyyy-mm-dd");
    assert.equal(excelNumberFormat(undefined), "General");
});
