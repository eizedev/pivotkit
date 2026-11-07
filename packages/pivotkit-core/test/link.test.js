import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, strToU8 } from "fflate";
import { PivotkitError, encode, normalize } from "pivotkit-core";
import { LINK_LIMITS, decodeViewLink, encodeViewLink } from "pivotkit-core/link";
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
    assert.deepEqual(decodeViewLink(bomb), { view: null, issues: [{ path: "", message: `view larger than ${LINK_LIMITS.json} characters` }] });
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
