import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, strToU8 } from "fflate";
import { readFileSync } from "node:fs";
import { PivotkitError, encode, fromViewFile, normalize, toViewFile } from "pivotkit-core";
import { LINK_ISSUE_CODES, LINK_LIMITS, decodeViewLink, encodeViewLink, linkFragment, linkParam, readViewLink } from "pivotkit-core/link";
import { SALES } from "./fixtures.js";

const data = encode(SALES);
const view = normalize({ rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], filters: [{ field: "Rep", type: "exclude", items: ["Dee", "Zoë"] }], chart: { title: "Units – €" } }, data).view;

/** base64url of raw bytes, as a link carries them */
const b64 = (bytes) => Buffer.from(bytes).toString("base64url");

test("a view goes into a link text and comes back the same", () => {
    const text = encodeViewLink(view);
    assert.match(text, /^1\.[A-Za-z0-9_-]+$/);
    assert.deepEqual(decodeViewLink(text), { view, issues: [] });
    // shorter than the JSON: a link stays short
    assert.ok(text.length < JSON.stringify(view).length);
    // white space around a pasted text does not matter
    assert.deepEqual(decodeViewLink(` ${text}\n`).view, view);
});

test("a broken, foreign or empty link is no view and says why; it never throws", () => {
    const why = (text) => decodeViewLink(text).issues.map((i) => i.message);
    assert.deepEqual(why(""), ["empty link"]);
    assert.deepEqual(why(undefined), ["empty link"]);
    assert.deepEqual(why("2.abc"), ["not a pivotkit view link"]);
    assert.deepEqual(why("1.ab+c"), ["not a pivotkit view link"]);
    assert.deepEqual(why("1.!!!"), ["not a pivotkit view link"]);
    assert.deepEqual(why("1.abcd"), ["the link is damaged"]);
    assert.deepEqual(why(`1.${b64(deflateSync(strToU8("[1, 2]")))}`), ["not a view object"]);
    assert.deepEqual(why(`1.${b64(deflateSync(strToU8("{nope")))}`), ["not valid JSON"]);
    assert.equal(decodeViewLink("2.abc").view, null);
});

test("the link text and the inflated view are size-capped before anything large is made", () => {
    assert.deepEqual(decodeViewLink(`1.${"A".repeat(LINK_LIMITS.text)}`).issues[0].message, `link longer than ${LINK_LIMITS.text} characters`);
    // a small link that inflates to a huge text (a deflate bomb) stops at the limit
    const bomb = `1.${b64(deflateSync(strToU8(`{"rows":["${"x".repeat(LINK_LIMITS.json + 10)}"]}`), { level: 9 }))}`;
    assert.ok(bomb.length < LINK_LIMITS.text);
    assert.deepEqual(decodeViewLink(bomb), { view: null, issues: [{ path: "", message: `view larger than ${LINK_LIMITS.json} characters`, code: "linkTooLarge", severity: "error" }] });
});

test("a view too large for a link throws LIMIT_EXCEEDED; a non-object is a programmer error", () => {
    // random names compress badly: far more than a link holds
    let seed = 1;
    const word = () => Array.from({ length: 12 }, () => String.fromCharCode(97 + ((seed = (seed * 48271) % 2147483647) % 26))).join("");
    const huge = { ...view, filters: [{ field: "Rep", type: "exclude", items: Array.from({ length: 5000 }, word) }] };
    assert.throws(() => encodeViewLink(huge), (e) => e instanceof PivotkitError && e.code === "LIMIT_EXCEEDED" && e.details.limit === "link");
    assert.throws(() => encodeViewLink(null), (e) => e instanceof PivotkitError && e.code === "INVALID_ARGUMENT");
});

test("a decoded view is user input: normalize keeps what fits the data and reports the rest", () => {
    const text = encodeViewLink({ rows: ["Region", "Nowhere"], values: [{ field: "Units", agg: "sum" }], __proto__: { polluted: true } });
    const { view: raw } = decodeViewLink(text);
    const { view: shown, issues } = normalize(raw, data);
    assert.deepEqual(shown.rows, ["Region"]);
    assert.deepEqual(issues.map((i) => i.path), ["rows[1]"]);
    assert.equal(/** @type {any} */ ({}).polluted, undefined);
});

test("an empty payload is damaged; inflating stops at the cap instead of inflating the whole bomb", async () => {
    assert.deepEqual(decodeViewLink("1.").issues[0].message, "the link is damaged");
    const { inflateCapped } = await import("../src/inflate.js");
    // 30 MB of zeros deflate to a few KB: the inflater must stop near the cap, not produce 30 MB
    const bomb = deflateSync(new Uint8Array(30_000_000), { level: 9 });
    const capped = inflateCapped(bomb, 1_000_000);
    assert.equal(capped.bytes, null);
    assert.ok(capped.inflated < 3_000_000, `inflated ${capped.inflated} bytes before it stopped`);
    // within the cap the bytes come back whole
    const small = inflateCapped(deflateSync(strToU8("hello")), 100);
    assert.equal(Buffer.from(small.bytes).toString(), "hello");
    assert.throws(() => inflateCapped(deflateSync(strToU8("hello")).subarray(0, 3), 100));
});

// ---- a link's data source and readViewLink ----

const golden = JSON.parse(readFileSync(new URL("./v1-golden.json", import.meta.url), "utf8"));

test("every issue of a link has a code of LINK_ISSUE_CODES", () => {
    const codes = ["", `1.${"A".repeat(LINK_LIMITS.text)}`, "2.abc", "1.", "1.AAAA", `1.${b64(deflateSync(strToU8("[1]")))}`, `1.${b64(deflateSync(strToU8("{x")))}`].map((t) => decodeViewLink(t).issues[0].code);
    assert.deepEqual(codes, ["linkEmpty", "linkTooLong", "notLink", "linkDamaged", "linkDamaged", "notView", "notJson"]);
    assert.ok(codes.every((c) => LINK_ISSUE_CODES.includes(c)));
});

test("readViewLink: the view of a report's entry in the fragment, with its name and data source", () => {
    const file = toViewFile(view, { name: "By region", source: { id: "sales", params: { year: "2026", region: "north" } } }, { link: true });
    assert.deepEqual(file.source, { id: "sales", params: { year: "2026", region: "north" } });
    const hash = `#/reports/a?tab=2&pivot-sales=${encodeViewLink(file)}&pivot=${encodeViewLink({ rows: ["Product"] })}`;
    const read = readViewLink(hash, "sales", { allowParams: ["year"] });
    assert.deepEqual(read.view, view);
    assert.equal(read.name, "By region");
    // only the parameters the host allows by name; the others are left out with an issue
    assert.deepEqual(read.src, { id: "sales", params: { year: "2026" } });
    assert.deepEqual(read.issues.map((i) => i.path), ["source.params.region"]);
    assert.deepEqual(readViewLink(hash, "sales").src, { id: "sales" });
    assert.deepEqual(readViewLink(hash).view, { rows: ["Product"] });
    assert.equal(readViewLink(hash).src, null);
    assert.equal(readViewLink("#other=1", "sales").failed, "none");
    assert.deepEqual(readViewLink("#pivot=2.x").issues.map((i) => i.code), ["notLink"]);
    assert.equal(linkFragment(hash, "sales"), encodeViewLink(file));
    assert.equal(linkParam("sales"), "pivot-sales");
});

test("readViewLink: a parameter the host allows is kept whatever its name; bad host options throw at once", () => {
    const params = JSON.parse('{"__proto__": "p", "constructor": "c", "a": "1"}');
    const file = toViewFile(view, { source: { id: "s", params } }, { link: true });
    const read = readViewLink(`#pivot=${encodeViewLink(file)}`, null, { allowParams: ["__proto__", "constructor", "a"] });
    assert.deepEqual(Object.keys(read.src?.params ?? {}), ["__proto__", "constructor", "a"]);
    assert.equal(Object.getPrototypeOf(read.src?.params), Object.prototype);
    assert.equal(/** @type {any} */ ({}).p, undefined);
    // a programmer error, whether or not the page has a link
    for (const hash of ["", "#pivot=x", `#pivot=${encodeViewLink(file)}`]) {
        assert.throws(() => readViewLink(hash, null, { limits: /** @type {any} */ ({ nope: 1 }) }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION");
    }
});

test("source params are text within the limits; what does not fit is left out", () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}`, "x"]));
    const written = toViewFile(view, { source: { id: "s", params: { ...many, long: "x".repeat(300), n: /** @type {any} */ (5) } } });
    assert.equal(Object.keys(written.source.params).length, 16);
    const read = fromViewFile({ format: "pivotkit-view", formatVersion: 2, source: { id: "s", params: { a: "1", b: 2, ["x".repeat(300)]: "y" } }, view });
    assert.deepEqual(read.source, { id: "s", params: { a: "1" } });
    assert.equal(read.issues.length, 2);
    // without an id there is no source to parameterize
    assert.equal(toViewFile(view, { source: { params: { a: "1" } } }).source.params, undefined);
});

test("links of view format version 1 decode and read as they did (golden texts of pivotkit-core 0.4.0)", () => {
    for (const [name, text] of Object.entries(golden.links)) {
        const read = readViewLink(`#pivot=${text}`);
        assert.equal(read.failed, null, name);
        assert.equal(/** @type {any} */ (read.view).version, 1, name);
        // normalized, a version-1 view becomes version 2 without an error
        assert.deepEqual(normalize(read.view, data).issues.filter((i) => i.severity === "error"), [], name);
    }
    assert.deepEqual(readViewLink(`#pivot=${golden.links["with source and filters"]}`).src, { id: "sales" });
});
