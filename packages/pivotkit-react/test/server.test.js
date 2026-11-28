// A report with a `server` (record 0021): what it asks for, read from the page's own configuration
// and its query string only; how answers that are not the rows become states; their words. The
// same code against a real pivotkit-server is in the repository's tests/browser-path.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCESS_PARAM, paramsText, withQuery } from "../src/share.js";
import { keptQuery, serverBase, serverRequestOf } from "../src/server-request.js";
import { AUTO_RETRY_MAX, failureOf, fetchRows, retryAtOf, tokenOf } from "../src/server-rows.js";
import { de, en, stateWords } from "../src/server-labels.js";
import { keys } from "./helpers.js";

const getToken = () => "pkb.token";
const base = { url: "https://reports.example.com/", source: "sales", getToken };

test("the server's address comes from the page's code: http or https without a user, no query or fragment", () => {
    assert.equal(serverBase("https://reports.example.com/"), "https://reports.example.com");
    assert.equal(serverBase("https://example.com/pivotkit/?a=1#x"), "https://example.com/pivotkit");
    assert.equal(serverBase("http://localhost:8080"), "http://localhost:8080");
    for (const bad of ["javascript:alert(1)", "data:text/plain,x", "https://user:pw@example.com", "/relative", "", 42, null]) {
        assert.equal(serverBase(bad), null, String(bad));
    }
    assert.deepEqual(serverRequestOf({ ...base, url: "ftp://example.com" }, ""), { problem: "server.url must be an http or https address without a user name" });
    assert.match(/** @type {any} */ (serverRequestOf({ ...base, source: " " }, "")).problem, /server\.source/);
    assert.match(/** @type {any} */ (serverRequestOf({ ...base, getToken: "x" }, "")).problem, /getToken/);
    assert.equal(serverRequestOf(undefined, ""), null);
});

test("parameters come from the query string, only the names in allowParams, the first value of a name given twice", () => {
    const read = /** @type {any} */ (serverRequestOf({ ...base, allowParams: ["customer", "__proto__", "year"] }, "?customer=acme&customer=beta&region=north&__proto__=x&pk-access=abc.def"));
    assert.equal(read.request.base, "https://reports.example.com");
    assert.equal(read.request.source, "sales");
    assert.deepEqual(Object.keys(read.request.params), ["customer", "__proto__"]);
    assert.equal(read.request.params.customer, "acme");
    assert.equal(Object.getPrototypeOf(read.request.params), Object.prototype, "__proto__ is a key of its own");
    assert.equal(read.request.access, "abc.def");
    // without allowParams nothing of the query is a parameter; pk-access is never one
    const none = /** @type {any} */ (serverRequestOf({ ...base, allowParams: [ACCESS_PARAM] }, "?customer=acme&pk-access=v"));
    assert.deepEqual(none.request.params, {});
    // the key changes with what is asked, and with refreshKey, never with getToken
    const k = (server, search = "") => /** @type {any} */ (serverRequestOf(server, search)).request.key;
    assert.equal(k({ ...base, getToken: () => "other" }), k(base));
    assert.notEqual(k({ ...base, refreshKey: 1 }), k(base));
    assert.notEqual(k({ ...base, allowParams: ["customer"] }, "?customer=acme"), k({ ...base, allowParams: ["customer"] }, "?customer=beta"));
});

test("a copied link keeps the parameters read and the access level; the toast names only the parameters", () => {
    const read = /** @type {any} */ (serverRequestOf({ ...base, allowParams: ["customer"] }, "?customer=acme&pk-access=abc.def"));
    const kept = keptQuery(read.request);
    assert.deepEqual(kept, [["customer", "acme"], [ACCESS_PARAM, "abc.def"]]);
    assert.equal(paramsText(kept), "customer: acme");
    assert.equal(withQuery("https://intranet.example.com/report#pivot=1.x", kept), "https://intranet.example.com/report?customer=acme&pk-access=abc.def#pivot=1.x");
    assert.equal(withQuery("https://intranet.example.com/report?customer=old", [["customer", "new"]]), "https://intranet.example.com/report?customer=new");
    assert.deepEqual(keptQuery(null), []);
});

test("getToken's answer: a text, or the exchange route's answer with its expiry", () => {
    assert.deepEqual(tokenOf("abc"), { token: "abc", expiresAt: null });
    assert.deepEqual(tokenOf({ token: "abc", expiresAt: "2026-11-28T10:00:00Z" }), { token: "abc", expiresAt: Date.parse("2026-11-28T10:00:00Z") });
    for (const nothing of [null, undefined, "", {}, { token: "" }, 5]) {
        assert.equal(tokenOf(nothing), null);
    }
});

/** A fetch that answers from a list, and what it was sent. */
function answers(...list) {
    const sent = [];
    const send = async (url, init) => {
        sent.push({ url, init });
        const next = list.shift();
        if (next instanceof Error) {
            throw next;
        }
        const { status = 200, body, headers = {} } = next;
        return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
    };
    return { send, sent };
}

const ROWS = { columns: ["Region", "Sales"], types: ["string", "number"], rowCount: 2, data: [["N", "S"], [1, 2]], requestId: "Ab3_xY9-k2Q" };
const request = /** @type {any} */ (serverRequestOf(base, "")).request;

test("a token about to expire is renewed before it is sent; a 401 asks once more and tries again once", async () => {
    let calls = 0;
    const give = () => async () => ({ token: `t${++calls}`, expiresAt: new Date(Date.now() + 300_000).toISOString() });
    const held = { current: { token: "old", expiresAt: Date.now() + 5_000 } };
    const a = answers({ body: ROWS });
    const ok = await fetchRows(request, { getToken: give, held, fetch: a.send });
    assert.equal(ok.ok, true);
    assert.equal(a.sent[0].init.headers.authorization, "Bearer t1", "the old one was not sent");
    assert.equal(a.sent[0].url, "https://reports.example.com/api/v1/sources/records");
    const b = answers({ status: 401, body: { code: "INVALID_TOKEN", expired: true } }, { body: ROWS });
    assert.equal((await fetchRows(request, { getToken: give, held, fetch: b.send })).ok, true);
    assert.deepEqual(b.sent.map((s) => s.init.headers.authorization), ["Bearer t1", "Bearer t2"]);
    const c = answers({ status: 401, body: { code: "INVALID_TOKEN" } }, { status: 401, body: { code: "INVALID_TOKEN" } });
    const ended = await fetchRows(request, { getToken: give, held, fetch: c.send });
    assert.deepEqual(ended, { ok: false, failure: { state: "expired", status: 401, host: "reports.example.com", code: "INVALID_TOKEN" } });
    assert.equal(c.sent.length, 2, "no third try");
});

test("answers that are not the rows: refused, the link's level, a request that does not fit, too large, busy, broken off, no answer", async () => {
    const held = () => ({ current: { token: "t", expiresAt: null } });
    const run = async (...list) => /** @type {any} */ (await fetchRows(request, { getToken: () => async () => "t", held: held(), fetch: answers(...list).send })).failure;
    assert.equal((await run({ status: 403, body: { code: "NOT_ALLOWED", requestId: "r1" } })).state, "refused");
    assert.equal((await run({ status: 404, body: { code: "NOT_FOUND" } })).state, "refused");
    assert.equal((await run({ status: 400, body: { code: "INVALID_INPUT" } })).state, "unfit");
    assert.equal((await run({ status: 422, body: { code: "DATA_MISMATCH" } })).state, "unfit");
    assert.deepEqual(await run({ status: 413, body: { code: "LIMIT_EXCEEDED", maxRows: 50000, requestId: "r2" } }), { state: "large", status: 413, host: "reports.example.com", code: "LIMIT_EXCEEDED", requestId: "r2", maxRows: 50000 });
    assert.deepEqual(await run({ status: 503, body: { code: "BUSY" }, headers: { "retry-after": "2" } }), { state: "busy", status: 503, host: "reports.example.com", code: "BUSY", retryAfter: 2 });
    assert.deepEqual(await run({ status: 200, body: '{"columns":["a"],"types":["string"],"data":[["x"' }), { state: "unreachable", host: "reports.example.com", status: 200, cut: true });
    assert.deepEqual(await run(new TypeError("fetch failed")), { state: "unreachable", host: "reports.example.com" });
    assert.equal((await run({ status: 500, body: { code: "INTERNAL" } })).state, "unreachable");
    // the page's exchange refused: its problem says why
    const refusedLink = await fetchRows(request, { getToken: () => async () => Promise.reject(Object.assign(new Error("no"), { problem: { status: 403, code: "NOT_ALLOWED", linkAccess: "refused", requestId: "r3" } })), held: { current: null } });
    assert.deepEqual(refusedLink, { ok: false, failure: { state: "linkRefused", status: 403, host: "reports.example.com", code: "NOT_ALLOWED", requestId: "r3" } });
    // a link whose level is not valid, or a sign-in too large for a token: their own states, not "refused" or "large"
    assert.equal(failureOf(403, { code: "NOT_ALLOWED", linkAccess: "invalid" }, "h").state, "linkInvalid");
    assert.equal(failureOf(413, { code: "LIMIT_EXCEEDED", limit: "token" }, "h").state, "signInLarge");
    // the page's sign-in step failed without saying why: not the report server's fault, and no host to name
    const noBackend = await fetchRows(request, { getToken: () => async () => Promise.reject(new TypeError("fetch failed")), held: { current: null } });
    assert.deepEqual(/** @type {any} */ (noBackend).failure, { state: "signIn", host: "" });
    assert.equal(failureOf(401, null, "h").state, "expired");
});

test("an aborted read rejects and calls nothing more", async () => {
    const controller = new AbortController();
    controller.abort();
    let asked = 0;
    await assert.rejects(fetchRows(request, { getToken: () => async () => (asked++, "t"), held: { current: null }, signal: controller.signal }), { name: "AbortError" });
    assert.equal(asked, 1);
});

test("the states' words: the limit and the time in the report's locale, the support line with the code and the request", () => {
    const at = new Date("2026-11-28T10:42:00").getTime();
    assert.deepEqual(stateWords({ state: "large", code: "LIMIT_EXCEEDED", requestId: "q3Zr8mT0aXw", maxRows: 50000, host: "h" }, de, { locale: "de-DE" }), {
        title: "Zu viele Daten für einen Bericht",
        text: "Dieser Bericht hätte mehr als 50.000 Zeilen, ein Bericht zeigt höchstens 50.000. Die Person, die ihn geteilt hat, kann einen Link für weniger Daten schicken, etwa für einen Kunden oder einen Monat.",
        action: null,
        support: "Für den IT-Support: LIMIT_EXCEEDED, Anfrage q3Zr8mT0aXw"
    });
    assert.equal(stateWords({ state: "large", code: "LIMIT_EXCEEDED", maxCells: 10, host: "h" }, en, { locale: "en-US" }).text, en.large.textValues);
    const expired = stateWords({ state: "expired", code: "INVALID_TOKEN", host: "h" }, en, { locale: "en-US" });
    assert.deepEqual([expired.action, expired.support], ["reload", "For IT support: INVALID_TOKEN"]);
    // getToken() gave nothing: no code to quote
    assert.equal(stateWords({ state: "expired", host: "h" }, en, { locale: "en-US" }).support, null);
    const later = stateWords({ state: "unreachable", host: "reports.example.com" }, en, { locale: "en-GB", shownAt: at });
    assert.equal(later.text, "The data could not be refreshed because the report server cannot be reached. The report still shows the data from 10:42.");
    assert.equal(later.support, null);
    assert.equal(stateWords({ state: "unreachable", host: "reports.example.com" }, en, { locale: "en-US" }).support, "For IT support: no answer from reports.example.com");
    assert.equal(stateWords({ state: "unreachable", host: "" }, en, { locale: "en-US" }).support, null);
    // the server said how long to wait
    assert.equal(stateWords({ state: "busy", code: "BUSY", retryAfter: 2, host: "h" }, de, { locale: "de-DE" }).text, "Gerade laden viele Berichte. In 2 Sekunden erneut versuchen. Passiert es wieder, dem IT-Support Bescheid geben.");
    assert.equal(stateWords({ state: "busy", code: "BUSY", host: "h" }, en, { locale: "en-US" }).text, en.busy.text);
    const signIn = stateWords({ state: "signIn", host: "" }, en, { locale: "en-US" });
    assert.deepEqual([signIn.title, signIn.action, signIn.support], [en.signIn.title, "reload", null]);
    assert.equal(stateWords({ state: "linkInvalid", code: "NOT_ALLOWED", requestId: "r", host: "h" }, en, { locale: "en-US" }).text, en.linkInvalid.text);
});

test("a busy server is asked again on its own only when it said how long to wait, and only for a wait up to AUTO_RETRY_MAX", () => {
    const now = 1_000_000;
    assert.equal(retryAtOf({ state: "busy", host: "h", retryAfter: 10 }, now), now + 10_000);
    assert.equal(retryAtOf({ state: "busy", host: "h", retryAfter: AUTO_RETRY_MAX }, now), now + AUTO_RETRY_MAX * 1000);
    // a longer wait, none given (or a date, which failureOf does not read): Try again only
    assert.equal(retryAtOf({ state: "busy", host: "h", retryAfter: AUTO_RETRY_MAX + 1 }, now), null);
    assert.equal(retryAtOf({ state: "busy", host: "h" }, now), null);
    assert.equal(failureOf(503, { code: "BUSY", retryAfter: "Fri, 27 Nov 2026 10:00:00 GMT" }, "h").retryAfter, undefined);
    // 0: one second, not at once
    assert.equal(retryAtOf({ state: "busy", host: "h", retryAfter: 0 }, now), now + 1000);
    // only busy waits for the server
    assert.equal(retryAtOf({ state: "unreachable", host: "h", retryAfter: 5 }, now), null);
});

test("busy with the automatic try: the seconds left are shown, the wait is said once", () => {
    const failure = { state: /** @type {const} */ ("busy"), code: "BUSY", host: "h", retryAfter: 10, retryAt: 1 };
    const w = stateWords(failure, en, { locale: "en-US", left: 7 });
    assert.equal(w.text, "Many reports are loading at the moment. Trying again in 7 s.");
    assert.equal(w.said, "Many reports are loading at the moment. The report tries again in 10 seconds.");
    assert.equal(w.action, "retry");
    assert.equal(stateWords(failure, de, { locale: "de-DE", left: 3 }).text, "Gerade laden viele Berichte. Neuer Versuch in 3 s.");
    // without the automatic try: the server's wait as before, nothing said apart
    assert.equal(stateWords({ ...failure, retryAt: undefined }, en, { locale: "en-US" }).said, undefined);
});

test("the server's texts write IT-Support with a plain hyphen", () => {
    assert.doesNotMatch(JSON.stringify([en, de]), /\u2011/);
});

test("the server's texts: English and German have the same keys and placeholders", () => {
    assert.deepEqual(keys(de), keys(en));
    const holes = (t) => keys(t).map((k) => `${k}:${(k.split(".").reduce((o, p) => o[p], t).match(/\{\w+\}/g) ?? []).sort().join("")}`);
    assert.deepEqual(holes(de), holes(en));
});

test("a server over http that is not this machine gets one console warning; this machine gets none", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const read = (base) => fetchRows({ ...request, base }, { getToken: () => async () => "t", held: { current: null }, fetch: answers({ status: 403, body: {} }).send });
    await read("http://reports.example.com");
    await read("http://reports.example.com");
    await read("http://127.0.0.1:8080");
    await read("https://reports.example.com");
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[0]), /http: the browser token crosses the network in clear text/);
});
