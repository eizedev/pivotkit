// Link parameters (#619, record 0016): create_link writes the values of the parameters a source lists
// in linkParams into the page's query string. The view stays in the fragment. A parameter bound to a
// claim never goes into a link, the server checks the values on every request, and list_sources
// (GET /sources) names the allowed names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkFragment } from "pivotkit-core/link";
import { ConfigError, callerOf, checkConfig, createContext, present, validateOptions } from "pivotkit-server";
import { TOKEN, call, factsOf, restServer } from "./helpers.js";

const LOCAL = callerOf("none", undefined);
const VIEW = { rows: ["Customer"], values: [{ field: "Open", agg: "sum" }] };
const PAGE = "https://reports.example.test/tickets";

/** Tickets of one customer: what a host's report page shows per customer. */
const load = async (params) => [
    { Customer: params.customer ?? "all", Region: params.region ?? "any", Open: 3 },
    { Customer: params.customer ?? "all", Region: params.region ?? "any", Open: 4 }
];

/** The declaration: a customer (a link may carry it), a page size, a tenant from the sign-in. */
const PARAMS = {
    customer: { type: "string", pattern: "^[A-Za-z0-9 &#+\\u00fc.-]{1,40}$", example: "acme" },
    size: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    region: { type: "string", enum: ["north", "south"] },
    tenant: { type: "string", pattern: "^[a-z0-9-]{1,20}$", claim: "tid" }
};

/** A source whose links may carry customer and size. */
const linked = (extra = {}) => ({ load, params: PARAMS, link: PAGE, linkParams: ["customer", "size"], policy: { default: "show" }, ...extra });

/** A claim-bound parameter needs sign-in with OAuth. */
const OAUTH = { mode: "oauth", issuer: "https://issuer.example", resource: "https://pk.example.test/mcp" };

const contextOf = (options) => createContext({ log: "off", auth: OAUTH, ...options });

/** A signed-in person with the tenant claim the source binds. */
const PERSON = callerOf("oauth", { token: "jwt", clientId: "app", scopes: ["pivotkit"], expiresAt: 0, extra: { subject: "ana", issuer: "https://issuer.example", claims: { tid: "t-1" } } });

const errorOf = (promise) =>
    promise.then(
        () => assert.fail("expected an error"),
        (e) => e
    );

/** The query of a link, decoded, as name and value pairs in order. */
const queryOf = (url) => [...new URL(url).searchParams];

test("an allowed parameter lands in the page's query string; the view stays in the fragment", async () => {
    const context = await contextOf({ sources: { tickets: linked() } });
    try {
        const { result } = await present(context, "create_link", { source: "tickets", view: VIEW, params: { customer: "acme" } }, PERSON);
        assert.equal(result.ok, true, JSON.stringify(result.findings));
        assert.match(result.url, /^https:\/\/reports\.example\.test\/tickets\?customer=acme#pivot=1\./);
        assert.deepEqual(queryOf(result.url), [["customer", "acme"]], "a default (size) and a claim (tenant) stay out");
        // the fragment holds the view as before: the source's id, no params
        const fragment = linkFragment(new URL(result.url).hash, null);
        assert.ok(fragment?.startsWith("1."));
        // the value written again by the server: a number in a text is a number
        const sized = await present(context, "create_link", { source: "tickets", view: VIEW, params: { customer: "acme", size: "050" } }, PERSON);
        assert.deepEqual(queryOf(sized.result.url), [["customer", "acme"], ["size", "50"]]);
    } finally {
        await context.close();
    }
});

test("a value is encoded for the query and reads back as it was", async () => {
    const context = await contextOf({ sources: { tickets: linked() } });
    try {
        const value = "Smith & Sons #1+ü";
        const { result } = await present(context, "create_link", { source: "tickets", view: VIEW, params: { customer: value } }, PERSON);
        assert.equal(result.ok, true);
        const url = new URL(result.url);
        assert.equal(url.searchParams.get("customer"), value);
        assert.equal(url.search, `?customer=${encodeURIComponent(value)}`);
        assert.ok(url.hash.startsWith("#pivot=1."), "the # in the value does not start the fragment");
    } finally {
        await context.close();
    }
});

test("a query the page address already holds stays; a name the link sets replaces the same name there", async () => {
    const page = "https://reports.example.test/app?tab=open&customer=old&x=a%20b&customer=older#/reports/a?tab=2";
    const context = await contextOf({ sources: { tickets: linked({ link: page }) } });
    try {
        const { result } = await present(context, "create_link", { source: "tickets", view: VIEW, params: { customer: "acme" } }, PERSON);
        assert.equal(result.ok, true);
        const at = result.url.indexOf("#");
        assert.equal(result.url.slice(0, at), "https://reports.example.test/app?tab=open&x=a%20b&customer=acme", "other entries byte for byte, every customer replaced");
        assert.ok(result.url.slice(at).startsWith("#/reports/a?tab=2&pivot=1."), "the hash route stays, its ? is the fragment's");
        // no parameter given: the address exactly as configured, with the view added
        const plain = await present(context, "create_link", { source: "tickets", view: VIEW }, PERSON);
        assert.ok(plain.result.url.startsWith("https://reports.example.test/app?tab=open&customer=old&x=a%20b&customer=older#/reports/a?tab=2&pivot=1."));
    } finally {
        await context.close();
    }
});

test("the server refuses a parameter the list leaves out, an unknown one and a claim-bound one, and names the allowed ones", async () => {
    const context = await contextOf({ sources: { tickets: linked() } });
    try {
        for (const params of [{ region: "north" }, { customer: "acme", region: "north" }, { nothing: "x" }]) {
            const e = await errorOf(present(context, "create_link", { source: "tickets", view: VIEW, params }, PERSON));
            assert.equal(e.code, "INVALID_INPUT", JSON.stringify(params));
            assert.match(e.message, /a link to tickets may carry customer, size only/, JSON.stringify(params));
            assert.doesNotMatch(e.message, /tenant/, "a claim-bound name is never named");
        }
        const claimed = await errorOf(present(context, "create_link", { source: "tickets", view: VIEW, params: { tenant: "t-2" } }, PERSON));
        assert.equal(claimed.code, "INVALID_INPUT");
        assert.match(claimed.message, /params\.tenant is set by the server from your sign-in; leave it out/);
        // the other operations take every declared parameter, as before
        const described = await present(context, "describe_source", { source: "tickets", params: { region: "north" } }, PERSON);
        assert.ok(described.result.fields.length > 0);
    } finally {
        await context.close();
    }
});

test("the server checks the values with the source's rules on every request; a bad value gets no link", async () => {
    const context = await contextOf({ sources: { tickets: linked() } });
    try {
        for (const [params, why] of [
            [{ customer: "a/b" }, /params\.customer is not in the expected form/],
            [{ customer: "x".repeat(41) }, /params\.customer is not in the expected form/],
            [{ customer: "acme", size: 0 }, /params\.size must be at least 1/],
            [{ customer: "acme", size: "many" }, /params\.size must be a whole number/],
            [{ customer: 7 }, /params\.customer must be a text/]
        ]) {
            const e = await errorOf(present(context, "create_link", { source: "tickets", view: VIEW, params }, PERSON));
            assert.equal(e.code, "INVALID_INPUT", JSON.stringify(params));
            assert.match(e.message, why);
        }
    } finally {
        await context.close();
    }
});

test("a source the caller may not use answers the same with params as a missing one", async () => {
    const context = await contextOf({ sources: { tickets: linked({ scopes: ["tickets"] }) } });
    const stranger = callerOf("token", { token: "", clientId: "bot", scopes: [], expiresAt: 0, extra: {} });
    try {
        const missing = await errorOf(present(context, "create_link", { source: "nothing", view: VIEW, params: { region: "north" } }, stranger));
        const hidden = await errorOf(present(context, "create_link", { source: "tickets", view: VIEW, params: { region: "north" } }, stranger));
        assert.equal(hidden.code, missing.code);
        assert.equal(hidden.message.replace("tickets", "nothing"), missing.message);
    } finally {
        await context.close();
    }
});

test("without linkParams create_link works as before: the params are checked and read, the link carries none", async () => {
    const context = await contextOf({ sources: { tickets: { load, params: PARAMS, link: PAGE, policy: { default: "show" } } } });
    try {
        const { result } = await present(context, "create_link", { source: "tickets", view: VIEW, params: { customer: "acme", region: "north" } }, PERSON);
        assert.equal(result.ok, true);
        assert.match(result.url, /^https:\/\/reports\.example\.test\/tickets#pivot=1\./);
        const bad = await errorOf(present(context, "create_link", { source: "tickets", view: VIEW, params: { customer: "a/b" } }, PERSON));
        assert.equal(bad.code, "INVALID_INPUT");
    } finally {
        await context.close();
    }
});

test("linkParams in the configuration: only declared, unbound names of a source with a link; a required one listed", () => {
    validateOptions({ sources: { tickets: linked() }, auth: OAUTH });
    validateOptions({ sources: { tickets: linked({ linkParams: [] }) }, auth: OAUTH });
    const bad = [
        [{ linkParams: ["tenant"] }, /sources\.tickets\.linkParams: tenant is bound to the sign-in claim tid; a link never carries it/],
        [{ linkParams: ["customer", "nothing"] }, /sources\.tickets\.linkParams: nothing is not one of the source's params \(customer, size, region\)/],
        [{ linkParams: ["customer", "customer"] }, /sources\.tickets\.linkParams: customer is listed twice/],
        [{ link: undefined }, /sources\.tickets\.linkParams: only a source with a link takes linkParams \(sources\.tickets\.link\)/],
        [{ params: undefined }, /sources\.tickets\.linkParams: the source declares no params/],
        [{ params: { ...PARAMS, region: { type: "string", required: true } } }, /sources\.tickets\.linkParams: list region too: create_link needs every required parameter/],
        [{ linkParams: "customer" }, /sources\.tickets\.linkParams/]
    ];
    for (const [extra, why] of bad) {
        assert.throws(() => validateOptions({ sources: { tickets: linked(extra) }, auth: OAUTH }), (e) => e instanceof ConfigError && why.test(e.message), JSON.stringify(extra));
    }
});

test("list_sources and GET /sources name the parameters a link may carry", async () => {
    // a static token has no claims: the source over REST binds none
    const unbound = Object.fromEntries(Object.entries(PARAMS).filter(([, p]) => !("claim" in p)));
    const options = { sources: { tickets: linked({ params: unbound }), plain: { load, params: unbound, link: PAGE, policy: { default: "show" } } }, auth: { mode: "token" } };
    const context = await contextOf(options);
    try {
        const { result } = await present(context, "list_sources", {}, LOCAL);
        const byId = Object.fromEntries(result.sources.map((s) => [s.id, s]));
        assert.deepEqual(byId.tickets.linkParams, ["customer", "size"]);
        assert.equal("linkParams" in byId.plain, false, "no list, no key");
    } finally {
        await context.close();
    }
    const server = await restServer(options, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const listed = await call(`${server.api}/sources`, { token: TOKEN });
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.data.sources.find((s) => s.id === "tickets").linkParams, ["customer", "size"]);
        // the same rules over REST: an allowed one in the query, another refused with 400
        const made = await call(`${server.api}/views/link`, { token: TOKEN, body: { source: "tickets", view: VIEW, params: { customer: "acme" } } });
        assert.equal(made.status, 200, JSON.stringify(made.data));
        assert.equal(new URL(made.data.url).searchParams.get("customer"), "acme");
        const refused = await call(`${server.api}/views/link`, { token: TOKEN, body: { source: "tickets", view: VIEW, params: { region: "north" } } });
        assert.equal(refused.status, 400);
        assert.equal(refused.data.code, "INVALID_INPUT");
        assert.match(refused.data.detail, /may carry customer, size only; leave out params\."region"/);
    } finally {
        await server.close();
    }
});

test("check-config names the list under the source's link, and refuses a claim-bound name as the start does", async () => {
    const { text } = await checkConfig({ sources: { tickets: linked() }, auth: OAUTH });
    const facts = factsOf(text).split("\n").map((line) => line.trim());
    const at = facts.indexOf(`link: ${PAGE}`);
    assert.ok(at > 0, text);
    assert.equal(facts[at + 1], "link params, in the page's query string: customer, size");
    await assert.rejects(checkConfig({ sources: { tickets: linked({ linkParams: ["tenant"] }) }, auth: OAUTH }), (e) => e instanceof ConfigError && /tenant is bound to the sign-in claim tid/.test(e.message));
    await assert.rejects(createContext({ log: "off", sources: { tickets: linked({ linkParams: ["tenant"] }) }, auth: OAUTH }), ConfigError);
});
