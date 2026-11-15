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

test("the first and last years a Date holds group by month and week without a throw or a blank", () => {
    const group = (day, by) => {
        const r = computePivot(encode([{ D: day }]), { rows: ["G"], derived: [{ name: "G", field: "D", by }], values: [{ agg: "count" }] });
        return r.rowRoot.children.map((n) => [n.key, r.label("rows", n)]);
    };
    // the first month a Date holds starts on April 20
    assert.deepEqual(group("-271821-04-20", "yearMonth"), [[-27182096, "Apr 271822 BC"]]);
    // weekdays repeat every 400 years: -271821-04-20 is a Tuesday as 2179-04-20 is, in week 16
    assert.deepEqual(group("-271821-04-20", "yearWeek"), [[-27182084, "271822 BC-W16"]]);
    assert.deepEqual(group("-271821-04-20", "week"), [[16, "W16"]]);
    assert.deepEqual(group("-271821-12-31", "yearWeek"), [[-27182048, "271822 BC-W52"]]);
    assert.deepEqual(group("+275760-09-13", "yearWeek"), [[27576037, "275760-W37"]]);
});

test("every date grouping labels the first and last 400 days a Date holds, and their weeks run on", () => {
    const days = 400;
    const first = Array.from({ length: days }, (_, i) => -MAX_DATE_MS + i * 86_400_000);
    const last = Array.from({ length: days }, (_, i) => MAX_DATE_MS - (days - 1 - i) * 86_400_000);
    for (const run of [first, last]) {
        const data = encode(run.map((ms) => ({ D: new Date(ms) })));
        for (const by of ["year", "quarter", "month", "week", "day", "hour", "weekday", "yearQuarter", "yearMonth", "yearWeek"]) {
            const r = computePivot(data, { rows: ["G"], derived: [{ name: "G", field: "D", by }], values: [{ agg: "count" }] });
            for (const n of r.rowRoot.children) {
                assert.ok(n.key !== null && r.label("rows", n) !== "(blank)", `${by} ${run[0]}`);
            }
            assert.equal(r.value(r.rowRoot, r.colRoot, 0), days, `${by}: every day in a group`);
        }
        // ISO weeks, day by day: a new week on Mondays only, one more or week 1 of the next year; 4 January in week 1
        const yearWeek = derivedKeys(data, "yearWeek");
        for (let i = 1; i < days; i++) {
            const day = new Date(run[i]);
            const [prev, cur] = [yearWeek[i - 1], yearWeek[i]];
            if (day.getUTCDay() !== 1) {
                assert.equal(cur, prev, `${day.toISOString()} stays in its week`);
            } else {
                assert.ok(cur === prev + 1 || (Math.floor(cur / 100) === Math.floor(prev / 100) + 1 && cur - Math.floor(cur / 100) * 100 === 1), `${day.toISOString()} starts week ${cur} after ${prev}`);
            }
            if (day.getUTCMonth() === 0 && day.getUTCDate() === 4) {
                assert.equal(cur, day.getUTCFullYear() * 100 + 1, `${day.toISOString()} is in week 1`);
            }
        }
    }
});

/** The key of a date grouping for each row, in row order. */
function derivedKeys(data, by) {
    const r = computePivot(data, { rows: ["D", "G"], derived: [{ name: "G", field: "D", by }], values: [{ agg: "count" }] });
    return r.rowRoot.children.sort((a, b) => a.key - b.key).map((n) => n.children[0].key);
}
