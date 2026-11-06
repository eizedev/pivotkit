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
