import { test } from "node:test";
import assert from "node:assert/strict";
import { numberText, parseNumber } from "../src/numbers.js";

test("numbers typed in English: grouping commas, a decimal point, signs", () => {
    const en = (t) => parseNumber(t, "en-US");
    assert.equal(en("1000"), 1000);
    assert.equal(en("1,000.5"), 1000.5);
    assert.equal(en("1,234,567"), 1234567);
    assert.equal(en("-1,000.25"), -1000.25);
    assert.equal(en("−42"), -42);
    assert.equal(en("+3"), 3);
    assert.equal(en(".5"), 0.5);
    assert.equal(en(" 7 "), 7);
    assert.equal(en("1e17"), 1e17);
    // a comma is no decimal mark here, and a wrong grouping is no number
    assert.equal(en("1,5"), null);
    assert.equal(en("1000,5"), null);
    assert.equal(en("1,00"), null);
    assert.equal(en(""), null);
    assert.equal(en("abc"), null);
    assert.equal(en("12abc"), null);
    assert.equal(en("-"), null);
});

test("numbers typed in German: grouping points, a decimal comma; a plain point number still reads", () => {
    const de = (t) => parseNumber(t, "de-DE");
    assert.equal(de("1.000,5"), 1000.5);
    assert.equal(de("1000,5"), 1000.5);
    assert.equal(de("1.234.567"), 1234567);
    assert.equal(de("1.000"), 1000);
    assert.equal(de("-1.000,25"), -1000.25);
    assert.equal(de(",5"), 0.5);
    // what people paste: a plain number with a point
    assert.equal(de("1000.5"), 1000.5);
    assert.equal(de("1,000.5"), null);
    assert.equal(de("1.00,5"), null);
});

test("numbers typed in French: spaces of any kind group, a decimal comma", () => {
    const fr = (t) => parseNumber(t, "fr-FR");
    assert.equal(fr("1 000,5"), 1000.5); // a plain space
    assert.equal(fr("1\u202F000,5"), 1000.5); // a narrow no-break space, as Intl writes French
    assert.equal(fr("1\u00A0234\u00A0567"), 1234567); // no-break spaces
    assert.equal(fr("-2 500"), -2500);
    assert.equal(fr("12,75"), 12.75);
    assert.equal(fr("1.5"), 1.5);
});

test("a number for editing: the locale's decimal mark, no grouping", () => {
    assert.equal(numberText(1000.5, "de-DE"), "1000,5");
    assert.equal(numberText(1234567.25, "en-US"), "1234567.25");
    assert.equal(numberText(-0.125, "fr-FR"), "-0,125");
    assert.equal(numberText(undefined, "en-US"), "");
    // what it writes reads back
    for (const locale of ["en-US", "de-DE", "fr-FR"]) {
        for (const n of [0, 1000.5, -1234567.891, 0.000123]) {
            assert.equal(parseNumber(numberText(n, locale), locale), n, `${locale} ${n}`);
        }
    }
});

test("numbers still read right after more locales than the marks' cache keeps (the first one is read anew)", () => {
    assert.equal(parseNumber("1.000,5", "de-DE"), 1000.5);
    for (let i = 0; i < 40; i++) {
        assert.equal(parseNumber("1,000.5", `en-US-x-k${i}`), 1000.5);
    }
    assert.equal(parseNumber("1.000,5", "de-DE"), 1000.5);
});
