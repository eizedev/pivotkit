import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_DATE_MS, computePivot, encode, formatter, isDateMs } from "../src/index.js";

/** Wall-clock ms of an ISO day in any year, without Date.UTC's remapping of years 0-99. */
const dayMs = (year, month, day) => {
    const d = new Date(0);
    d.setUTCFullYear(year, month - 1, day);
    return d.getTime();
};

test("ISO days with a sign and six digits (ECMAScript's expanded years) are dates", () => {
    const days = { "+010000-02-29": dayMs(10000, 2, 29), "-000001-01-11": dayMs(-1, 1, 11), "-271821-04-20": -MAX_DATE_MS, "+275760-09-13": MAX_DATE_MS };
    const column = encode(Object.keys(days).map((d) => ({ d }))).column("d");
    assert.equal(column.type, "date");
    assert.deepEqual([...column.values], Object.values(days));
    assert.equal(encode([{ d: "+002026-03-04T10:00Z" }]).column("d").values[0], Date.UTC(2026, 2, 4, 10));
});

test("expanded years a Date cannot hold, or ECMAScript forbids, stay text", () => {
    for (const s of [
        "-000000-01-01", // minus zero is not a year
        "+010000-02-30",
        "+275760-09-14", // past the last day a Date holds
        "-271821-04-19", // before the first
        "+275760-09-13T00:00-01:00", // the instant is past the last moment
        "+10000-01-01", // five digits
        "10000-01-01" // no sign
    ]) {
        assert.equal(encode([{ d: s }]).column("d").type, "string", s);
    }
});

test("the Date limit is exported once", () => {
    assert.equal(MAX_DATE_MS, 8.64e15);
    assert.equal(new Date(MAX_DATE_MS).getTime(), MAX_DATE_MS);
    assert.ok(Number.isNaN(new Date(MAX_DATE_MS + 1).getTime()));
    assert.deepEqual([MAX_DATE_MS, -MAX_DATE_MS, 0].map(isDateMs), [true, true, true]);
    assert.deepEqual([MAX_DATE_MS + 1, -MAX_DATE_MS - 1, NaN, Infinity, "0", null].map(isDateMs), [false, false, false, false, false, false]);
});

// One convention for years before 1 AD (#225): the era, as Intl writes it ("2 BC", "2 v. Chr."), in every
// date grouping and every date label; years from 1 AD are written as before, without it.
const BCE = [
    {
        locale: "en-US",
        day: ["Jan 11, 2 BC", "Jan 8, 2"],
        year: ["2 BC", "2"],
        yearQuarter: ["Q1 2 BC", "Q1 2"],
        yearMonth: ["Jan 2 BC", "Jan 2"],
        yearWeek: ["2 BC-W02", "2-W02"],
        datetime: "Jan 11, 2 BC, 10:30 AM"
    },
    {
        locale: "de-DE",
        day: ["11.01.2 v. Chr.", "08.01.2"],
        year: ["2 v. Chr.", "2"],
        yearQuarter: ["Q1 2 v. Chr.", "Q1 2"],
        yearMonth: ["Jan. 2 v. Chr.", "Jan. 2"],
        yearWeek: ["2 v. Chr.-W02", "2-W02"],
        datetime: "11.01.2 v. Chr., 10:30"
    }
];

for (const expected of BCE) {
    test(`a year before 1 AD is written with its era in every date label (${expected.locale})`, () => {
        const { locale } = expected;
        const data = encode([{ Date: "-000001-01-11" }, { Date: "0002-01-08" }]);
        const labels = (view) => {
            const r = computePivot(data, { ...view, values: [{ agg: "count" }], formatting: { locale } });
            assert.deepEqual(r.issues, []);
            return r.rowRoot.children.map((n) => r.label("rows", n));
        };
        assert.deepEqual(labels({ rows: ["Date"] }), expected.day);
        for (const by of ["year", "yearQuarter", "yearMonth", "yearWeek"]) {
            assert.deepEqual(labels({ rows: ["G"], derived: [{ name: "G", field: "Date", by }] }), expected[by], by);
        }
        assert.equal(formatter("date", { locale })(dayMs(-1, 1, 11)), expected.day[0]);
        // ICU versions differ in the space before "AM" (U+0020 or U+202F)
        assert.equal(formatter("datetime", { locale })(dayMs(-1, 1, 11) + 37_800_000).replace(/\s/gu, " "), expected.datetime);
        assert.equal(formatter("date", { locale })(dayMs(2, 1, 8)), expected.day[1]);
    });
}

test("a calendar that writes its own era keeps its form", () => {
    const locale = "en-US-u-ca-islamic-civil";
    const own = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(dayMs(-1, 1, 11));
    assert.equal(formatter("date", { locale })(dayMs(-1, 1, 11)), own);
});
