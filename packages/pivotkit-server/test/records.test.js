// The rows route (POST /api/v1/sources/records, record 0015): the rows of one source for a signed-in
// person whose profile names the source in `records`, only fields at show, in the columnar shape
// pivotkit-core's encode() reads, written in pieces. Off by default; every caller without a person
// (a static or signed token, a server without sign-in, an OAuth token without a subject) is refused.
// Persons here sign in with an external issuer's token (record 0014) or an OAuth token of a local
// issuer; the data has a marker in every field below show, so a test can look for it in the bytes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { encode } from "pivotkit-core";
import { checkConfig, createContext, validateOptions } from "pivotkit-server";
import { createRestHandler } from "pivotkit-server/rest";
import { BIN, TOKEN, call, factsOf, restServer, workspace } from "./helpers.js";

/** Orders with one field per level: Region, Sales and OrderDate show, Product values, Team summary, Customer hide. */
const CSV = ["Region,Product,Team,Customer,Sales,OrderDate", "North,VALUESMARKA,SUMMARYMARKA,HIDDENMARKA,10,2025-11-05", "South,VALUESMARKB,SUMMARYMARKB,HIDDENMARKB,20.5,2026-09-01", "North,VALUESMARKA,SUMMARYMARKC,HIDDENMARKC,5,2026-10-01", "West,VALUESMARKB,SUMMARYMARKA,HIDDENMARKD,7,2026-10-20", ",VALUESMARKA,SUMMARYMARKB,HIDDENMARKE,,2024-12-31"].join("\n") + "\n";

/** What no answer, error or log line may hold: the values of every field below show. */
const MARKS = /VALUESMARK|SUMMARYMARK|HIDDENMARK/;

const PSU = Object.freeze({ issuer: "psu", typ: "psu+jwt", kid: "psu-2026-11" });

/** The profiles: staff reads the rows of sales; narrow too, with Region only; plain has no right. */
const PROFILES = Object.freeze({
    staff: { records: ["sales"], fields: { Region: "show", Sales: "show", OrderDate: "show", Product: "values" } },
    narrow: { records: ["sales"], fields: { Region: "show" } },
    plain: { fields: { Region: "show", Sales: "show" } }
});

/** An Ed25519 pair of the external issuer. */
function pair() {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return { privateKey, publicPem: publicKey.export({ type: "spki", format: "pem" }).toString() };
}

/** A token as the external issuer mints it for a person (sub null: none). */
function mint(privateKey, { sub = "alice@example.com", profile = "staff" } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ jti: `psu-${Math.random().toString(16).slice(2, 10)}`, profile, ...(sub === null ? {} : { sub }) })
        .setProtectedHeader({ alg: "EdDSA", kid: PSU.kid, typ: PSU.typ })
        .setIssuer(PSU.issuer)
        .setIssuedAt(now)
        .setExpirationTime(now + 600)
        .sign(privateKey);
}

/**
 * A workspace and the options of a server with the sales source, the profiles, a static token (ops,
 * profile staff), signed tokens and the external issuer; `extra` is laid over them.
 */
function setup(extra = {}, files = { "sales.csv": CSV }) {
    const keys = pair();
    const dir = workspace(files);
    mkdirSync(join(dir, "keys"));
    writeFileSync(join(dir, "keys", "psu.pub"), keys.publicPem);
    const options = {
        sources: { sales: { file: "data/sales.csv", policy: { fields: { Customer: "hide" } } }, ...(extra.sources ?? {}) },
        policy: { profiles: { ...PROFILES, ...(extra.profiles ?? {}) } },
        auth: { mode: "token", tokens: [{ name: "ops", env: "OPS", profile: "staff" }], signedTokens: { dir: "signed" }, externalIssuers: [{ issuer: PSU.issuer, typ: PSU.typ, scopes: ["pivotkit:read"], profiles: Object.keys({ ...PROFILES, ...(extra.profiles ?? {}) }), profile: "staff", keys: [{ kid: PSU.kid, publicKey: { file: "keys/psu.pub" } }] }] },
        ...(extra.rest ? { rest: extra.rest } : {}),
        ...(extra.top ?? {}),
        baseDir: dir
    };
    return { ...keys, dir, options };
}

/** The server of setup()'s options on a free port. */
async function serverOf(extra = {}, files = undefined) {
    const s = setup(extra, files);
    const server = await restServer(s.options, { env: { OPS: TOKEN } });
    return { ...s, server, person: (how) => mint(s.privateKey, how) };
}

/** A rows request: the status, headers, raw text and body. */
async function rows(server, token, body) {
    const response = await fetch(`${server.api}/sources/records`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, data: JSON.parse(text) };
}

/** The columns of an answer as encode() reads them: per column its type and each row's value as the engine keeps it. */
function encoded(answer) {
    const data = encode({ columns: answer.columns, types: answer.types, data: answer.data });
    return Object.fromEntries(data.columns.map((c) => [c.name, { type: c.type, values: Array.from(c.codes, (code) => (code < 0 ? null : c.dict[code])) }]));
}

test("the route answers the show fields only, as encode() reads them, and names the others in withheld", async () => {
    const { server, person } = await serverOf();
    try {
        const answer = await rows(server, await person(), { source: "sales" });
        assert.equal(answer.status, 200, answer.text);
        assert.deepEqual(answer.data.columns, ["Region", "Sales", "OrderDate"]);
        assert.deepEqual(answer.data.types, ["string", "number", "date"]);
        assert.equal(answer.data.rowCount, 5);
        assert.deepEqual(answer.data.withheld, ["Product", "Team"]);
        assert.match(answer.data.dataAsOf, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
        assert.match(answer.data.requestId, /^[A-Za-z0-9_-]+$/);
        assert.equal(answer.headers.get("x-request-id"), answer.data.requestId);
        // the engine reads the answer as it reads the file's shown columns
        const fromFile = encode({ columns: ["Region", "Sales", "OrderDate"], data: [["North", "South", "North", "West", ""], [10, 20.5, 5, 7, null], ["2025-11-05", "2026-09-01", "2026-10-01", "2026-10-20", "2024-12-31"]] });
        const want = Object.fromEntries(fromFile.columns.map((c) => [c.name, { type: c.type, values: Array.from(c.codes, (code) => (code < 0 ? null : c.dict[code])) }]));
        assert.deepEqual(encoded(answer.data), want);
        assert.doesNotMatch(answer.text, MARKS);
        assert.doesNotMatch(answer.text, /Customer/i, "a hidden field is never named");
    } finally {
        await server.close();
    }
});

test("a field at values, summary or hide never appears, also when fields or a view names it; no error names a hidden field", async () => {
    const { server, person } = await serverOf();
    try {
        const token = await person();
        // a hidden field answers as an unknown one does, and neither is named
        const hidden = await rows(server, token, { source: "sales", fields: ["Region", "Customer"] });
        const unknown = await rows(server, token, { source: "sales", fields: ["Region", "Nobody"] });
        assert.equal(hidden.status, 400);
        assert.equal(hidden.data.code, "INVALID_INPUT");
        assert.equal(unknown.status, 400);
        assert.equal(hidden.data.detail, unknown.data.detail);
        assert.doesNotMatch(hidden.text, /Customer|HIDDENMARK/i);
        // a field below show: NOT_ALLOWED, its name in detail and notShown, never a value
        for (const field of ["Team", "Product"]) {
            const below = await rows(server, token, { source: "sales", fields: ["Region", field] });
            assert.equal(below.status, 403, below.text);
            assert.equal(below.data.code, "NOT_ALLOWED");
            assert.deepEqual(below.data.notShown, [field]);
            assert.match(below.data.detail, new RegExp(field));
            assert.doesNotMatch(below.text, MARKS);
        }
        // a view says which fields it needs: the same answers
        const viewHidden = await rows(server, token, { source: "sales", view: { rows: ["Customer"], values: [{ field: "Sales", agg: "sum" }] } });
        assert.equal(viewHidden.status, 400, viewHidden.text);
        assert.match(viewHidden.data.detail, /the view has errors or names a field you may not read/);
        assert.doesNotMatch(viewHidden.text, /Customer|HIDDENMARK/i);
        const viewBelow = await rows(server, token, { source: "sales", view: { rows: ["Region"], cols: ["Team"], values: [{ field: "Sales", agg: "sum" }] } });
        assert.equal(viewBelow.status, 403, viewBelow.text);
        assert.deepEqual(viewBelow.data.notShown, ["Team"]);
        // a view of shown fields: its fields, and every row (its filters are no permission)
        const view = await rows(server, token, { source: "sales", view: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }], filters: [{ field: "Region", type: "in", items: ["North"] }] } });
        assert.equal(view.status, 200, view.text);
        assert.deepEqual(view.data.columns, ["Region", "Sales"]);
        assert.equal(view.data.rowCount, 5);
        const fields = await rows(server, token, { source: "sales", fields: ["sales", "Region"] });
        assert.equal(fields.status, 200);
        assert.deepEqual(fields.data.columns, ["Sales", "Region"], "in the order asked, as the data spells them");
        for (const answer of [hidden, unknown, viewHidden, viewBelow, view, fields]) {
            assert.doesNotMatch(answer.text, MARKS);
        }
        assert.doesNotMatch(JSON.stringify(server.log), MARKS);
    } finally {
        await server.close();
    }
});

test("NOT_ALLOWED without the right, and for every caller without a person", async () => {
    const { server, person, options } = await serverOf();
    try {
        const refused = async (token, why) => {
            const answer = await rows(server, token, { source: "sales" });
            assert.equal(answer.status, 403, `${why}: ${answer.text}`);
            assert.equal(answer.data.code, "NOT_ALLOWED", why);
            assert.doesNotMatch(answer.text, MARKS);
            return answer;
        };
        // a person whose profile does not name the source: the same answer for a source that is not there
        const plain = await refused(await person({ profile: "plain" }), "a profile without records");
        assert.equal((await refused(await person({ profile: "plain" }), "again")).data.detail, plain.data.detail);
        const missing = await rows(server, await person({ profile: "plain" }), { source: "nowhere" });
        assert.equal(missing.status, 403);
        assert.equal(missing.data.detail, plain.data.detail, "a source that is not there answers alike");
        // a static token whose profile names the source: no person
        await refused(TOKEN, "a static token");
        // a signed token of the server, with that profile
        const issued = spawnSync(process.execPath, [BIN, "token", "issue", "--config", writeConfig(options), "--profile", "staff", "--json"], { encoding: "utf8" });
        assert.equal(issued.status, 0, issued.stderr);
        await refused(JSON.parse(issued.stdout).token, "a signed token");
    } finally {
        await server.close();
    }
    // a server without sign-in: no person either
    const dir = workspace({ "sales.csv": CSV });
    const local = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, baseDir: dir });
    try {
        const answer = await rows(local, null, { source: "sales" });
        assert.equal(answer.status, 403);
        assert.equal(answer.data.code, "NOT_ALLOWED");
    } finally {
        await local.close();
    }
});

/** The options as a configuration file in their directory (for the token command). */
function writeConfig(options) {
    const file = join(options.baseDir, "pivotkit.json");
    writeFileSync(file, `${JSON.stringify({ ...options, baseDir: undefined }, null, 2)}\n`);
    return file;
}

// ---------------------------------------------------------------------------------------------
// OAuth: a token of the configured issuer with a subject is a person; one without is not

const REST_RESOURCE = "https://pk.example.com/api/v1";
let issuer;
let issuerServer;
let rsa;

before(async () => {
    rsa = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(rsa.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    issuerServer = createServer((req, res) => {
        const body = req.url === "/jwks" ? { keys: [jwk] } : req.url === "/.well-known/openid-configuration" ? { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] } : null;
        res.writeHead(body ? 200 : 404, { "content-type": "application/json" });
        res.end(body ? JSON.stringify(body) : "");
    });
    await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${issuerServer.address().port}`;
});
after(() => new Promise((resolve) => issuerServer.close(resolve)));

/** An access token of the local issuer for the REST resource (sub null: none). */
const oauthToken = (sub) => {
    const token = new SignJWT({ scope: "pivotkit", client_id: "host-app" }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience(REST_RESOURCE).setIssuedAt().setExpirationTime("5m");
    return (sub === null ? token : token.setSubject(sub)).sign(rsa.privateKey);
};

/** Waits until the server has loaded the issuer (readyz). */
async function ready(server) {
    for (let i = 0; i < 100 && (await call(`${server.url}/readyz`)).status !== 200; i++) {
        await new Promise((r) => setTimeout(r, 50));
    }
}

test("an OAuth token with a subject reads the rows; one without a subject is refused", async () => {
    const dir = workspace({ "sales.csv": CSV });
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { fields: { Customer: "hide" } } } }, policy: { profiles: PROFILES }, auth: { mode: "oauth", issuer, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"], defaultProfile: "staff" }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir });
    try {
        await ready(server);
        const ok = await rows(server, await oauthToken("ana"), { source: "sales" });
        assert.equal(ok.status, 200, ok.text);
        assert.deepEqual(ok.data.columns, ["Region", "Sales", "OrderDate"]);
        const none = await rows(server, await oauthToken(null), { source: "sales" });
        assert.equal(none.status, 403);
        assert.equal(none.data.code, "NOT_ALLOWED");
    } finally {
        await server.close();
    }
});

// ---------------------------------------------------------------------------------------------
// Parameters, limits and slots

test("a parameter bound to a claim, sent by the caller, answers INVALID_INPUT", async () => {
    const load = async (params) => [{ Region: "North", Team: params.team }];
    const dir = workspace({ "sales.csv": CSV });
    const server = await restServer({ sources: { mine: { load, params: { team: { type: "string", claim: "team", pattern: "^[a-z]+$" } }, policy: { default: "show" } } }, policy: { profiles: { staff: { records: ["mine"] } } }, auth: { mode: "oauth", issuer, resource: "https://pk.example.com/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"], defaultProfile: "staff" }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir });
    try {
        await ready(server);
        const answer = await rows(server, await oauthToken("ana"), { source: "mine", params: { team: "other" } });
        assert.equal(answer.status, 400, answer.text);
        assert.equal(answer.data.code, "INVALID_INPUT");
    } finally {
        await server.close();
    }
});

test("LIMIT_EXCEEDED for the server's rows, with its message", async () => {
    const { server, person } = await serverOf({ rest: { records: { maxRows: 4 } } });
    try {
        const answer = await rows(server, await person(), { source: "sales" });
        assert.equal(answer.status, 413, answer.text);
        assert.equal(answer.data.code, "LIMIT_EXCEEDED");
        assert.equal(answer.data.detail, "this source has too many rows to open here (5, the limit is 4); filter it with a parameter or ask the operator");
    } finally {
        await server.close();
    }
});

test("LIMIT_EXCEEDED for the server's cells, with its message", async () => {
    const { server, person } = await serverOf({ rest: { records: { maxCells: 10 } } });
    try {
        const token = await person();
        const answer = await rows(server, token, { source: "sales" });
        assert.equal(answer.status, 413, answer.text);
        assert.equal(answer.data.code, "LIMIT_EXCEEDED");
        assert.equal(answer.data.detail, "this answer has too many values to open here (15 cells, the limit is 10); ask for fewer fields, filter with a parameter or ask the operator");
        // fewer fields fit
        assert.equal((await rows(server, token, { source: "sales", fields: ["Region", "Sales"] })).status, 200);
    } finally {
        await server.close();
    }
});

test("LIMIT_EXCEEDED for a source's own row limit, with its message", async () => {
    const { server, person } = await serverOf({ sources: { sales: { file: "data/sales.csv", policy: { fields: { Customer: "hide" } }, records: { maxRows: 3 } } } });
    try {
        const answer = await rows(server, await person(), { source: "sales" });
        assert.equal(answer.status, 413, answer.text);
        assert.equal(answer.data.detail, "this source has too many rows to open here (5, the limit is 3); filter it with a parameter or ask the operator");
    } finally {
        await server.close();
    }
});

test("a source's row limit cannot be higher than the server's", async () => {
    const options = { sources: { sales: { file: "sales.csv", records: { maxRows: 60_000 } } } };
    assert.throws(() => validateOptions(options), /sources\.sales\.records\.maxRows: 60000 is above the server's limit rest\.records\.maxRows \(50000\)/);
    assert.throws(() => validateOptions({ ...options, rest: { records: { maxRows: 1000 } } }), /above the server's limit/);
    validateOptions({ ...options, rest: { records: { maxRows: 60_000 } } });
    // and the right is a profile's only
    assert.throws(() => validateOptions({ policy: { records: ["sales"] } }), /granted per profile/);
    assert.throws(() => validateOptions({ sources: { sales: { file: "sales.csv", policy: { records: ["sales"] } } } }), /granted per profile/);
});

/** A code source whose load waits for `gate`, one per test. */
function gated() {
    let open;
    const gate = new Promise((resolve) => (open = resolve));
    let started = 0;
    const load = async () => {
        started++;
        await gate;
        return [{ Region: "North", Sales: 1 }];
    };
    return { load, open: () => open(), started: () => started };
}

test("503 BUSY with Retry-After beyond the server's cap", async () => {
    const slow = gated();
    const { server, person } = await serverOf({ sources: { slow: { load: slow.load, policy: { default: "show" } } }, profiles: { staff: { ...PROFILES.staff, records: ["sales", "slow"] } }, rest: { records: { concurrency: 1 } } });
    try {
        const first = rows(server, await person({ sub: "ana" }), { source: "slow" });
        while (slow.started() === 0) {
            await new Promise((r) => setTimeout(r, 10));
        }
        const second = await rows(server, await person({ sub: "ben" }), { source: "sales" });
        assert.equal(second.status, 503, second.text);
        assert.equal(second.data.code, "BUSY");
        assert.ok(Number(second.headers.get("retry-after")) >= 1);
        slow.open();
        assert.equal((await first).status, 200);
        assert.equal((await rows(server, await person({ sub: "ben" }), { source: "sales" })).status, 200, "the slot is free again");
    } finally {
        slow.open();
        await server.close();
    }
});

test("503 BUSY with Retry-After for a second request of the same person", async () => {
    const slow = gated();
    const { server, person } = await serverOf({ sources: { slow: { load: slow.load, policy: { default: "show" } } }, profiles: { staff: { ...PROFILES.staff, records: ["sales", "slow"] } }, rest: { records: { concurrency: 4 } } });
    try {
        const first = rows(server, await person({ sub: "ana" }), { source: "slow" });
        while (slow.started() === 0) {
            await new Promise((r) => setTimeout(r, 10));
        }
        const again = await rows(server, await person({ sub: "ana" }), { source: "sales" });
        assert.equal(again.status, 503, again.text);
        assert.ok(Number(again.headers.get("retry-after")) >= 1);
        assert.equal((await rows(server, await person({ sub: "ben" }), { source: "sales" })).status, 200, "another person has a slot");
        slow.open();
        assert.equal((await first).status, 200);
    } finally {
        slow.open();
        await server.close();
    }
});

/** A REST handler in this process (no sockets), with setup()'s options. */
async function handlerOf(extra = {}, files = undefined) {
    const s = setup(extra, files);
    const lines = [];
    const context = await createContext({ log: "info", ...s.options }, { stderr: { write: (t) => lines.push(...String(t).trim().split("\n").map((l) => JSON.parse(l))) } });
    const rest = await createRestHandler(context, { env: { OPS: TOKEN }, loopback: true });
    const ask = async (token, body) => rest.fetch(new Request("http://127.0.0.1/api/v1/sources/records", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), { address: "127.0.0.1" });
    return { ...s, context, rest, lines, ask, person: (how) => mint(s.privateKey, how), close: () => context.close() };
}

/** A CSV of `n` rows of shown fields. */
const bigCsv = (n) => ["Region,Sales,OrderDate", ...Array.from({ length: n }, (_, i) => `Region ${i % 97},${i * 1.5},2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`)].join("\n") + "\n";

test("a stalled reader loses its slot after idleMs", async () => {
    const h = await handlerOf({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } }, rest: { records: { idleMs: 1000, concurrency: 1 } } }, { "sales.csv": bigCsv(30_000) });
    try {
        const token = await h.person({ sub: "ana" });
        const stalled = await h.ask(token, { source: "sales" });
        assert.equal(stalled.status, 200);
        // nobody reads: the slot holds, so the same person is busy
        assert.equal((await h.ask(token, { source: "sales" })).status, 503);
        // the stream ends with an error once the reader was idle too long, and the slot is free
        const reader = /** @type {ReadableStream} */ (stalled.body).getReader();
        await new Promise((r) => setTimeout(r, 1500));
        await assert.rejects(async () => {
            for (;;) {
                const { done } = await reader.read();
                if (done) {
                    break;
                }
            }
        });
        const next = await h.ask(token, { source: "sales" });
        assert.equal(next.status, 200);
        await next.body?.cancel();
        assert.ok(h.lines.some((l) => l.event === "records" && l.outcome === "error" && l.reason === "idle"), JSON.stringify(h.lines.filter((l) => l.event === "records")));
    } finally {
        await h.close();
    }
});

test("a large answer goes out in pieces", async () => {
    const h = await handlerOf({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } } }, { "sales.csv": bigCsv(40_000) });
    try {
        const response = await h.ask(await h.person(), { source: "sales" });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-length"), null, "streamed, no length known up front");
        const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
        const pieces = [];
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            pieces.push(value);
        }
        assert.ok(pieces.length > 4, `${pieces.length} pieces`);
        const largest = Math.max(...pieces.map((p) => p.length));
        const total = pieces.reduce((n, p) => n + p.length, 0);
        assert.ok(largest < total / 4, `the largest piece ${largest} of ${total} bytes`);
        const answer = JSON.parse(Buffer.concat(pieces).toString("utf8"));
        assert.equal(answer.rowCount, 40_000);
        assert.equal(answer.data[0].length, 40_000);
        assert.equal(answer.data[1][39_999], 39_999 * 1.5);
    } finally {
        await h.close();
    }
});

test("two people with different rights never get each other's rows", async () => {
    // a code source that loads each person's own rows
    const load = async (_params, { caller }) => [0, 1, 2].map((i) => ({ Region: `${caller.subject}-region-${i}`, Sales: i, Secret: `${caller.subject}-secret-${i}` }));
    const { server, person } = await serverOf({
        sources: { own: { load, perPerson: true, ttl: 60, policy: { default: "show", fields: { Secret: "hide" } } } },
        profiles: { staff: { records: ["own"], fields: { Region: "show", Sales: "show" } }, narrow: { records: ["own"], default: "summary", fields: { Region: "show" } } },
        rest: { records: { concurrency: 4 } }
    });
    try {
        const ana = await person({ sub: "ana", profile: "staff" });
        const ben = await person({ sub: "ben", profile: "narrow" });
        for (let round = 0; round < 3; round++) {
            const [a, b] = await Promise.all([rows(server, ana, { source: "own" }), rows(server, ben, { source: "own" })]);
            assert.equal(a.status, 200, a.text);
            assert.equal(b.status, 200, b.text);
            assert.deepEqual(a.data.columns, ["Region", "Sales"]);
            assert.deepEqual(b.data.columns, ["Region"]);
            assert.deepEqual(a.data.data[0], ["ana-region-0", "ana-region-1", "ana-region-2"]);
            assert.deepEqual(b.data.data[0], ["ben-region-0", "ben-region-1", "ben-region-2"]);
            assert.doesNotMatch(a.text, /ben|secret/);
            assert.doesNotMatch(b.text, /ana|secret/);
        }
    } finally {
        await server.close();
    }
});

test("the base headers on the answer and on every error, and Vary: Origin on a CORS answer", async () => {
    const origin = "https://host.example.com";
    const { server, person } = await serverOf({ rest: { cors: { origins: [origin] }, records: { maxRows: 4 } }, sources: { small: { file: "data/small.csv", policy: { default: "show" } } }, profiles: { staff: { ...PROFILES.staff, records: ["sales", "small"] } } }, { "sales.csv": CSV, "small.csv": "Region\nNorth\n" });
    try {
        const token = await person();
        const answers = {
            ok: await rows(server, token, { source: "small" }),
            "not allowed": await rows(server, await person({ profile: "plain" }), { source: "sales" }),
            "invalid input": await rows(server, token, { source: "sales", fields: ["Nobody"] }),
            "below show": await rows(server, token, { source: "sales", fields: ["Team"] }),
            "over a limit": await rows(server, token, { source: "sales" }),
            "no token": await rows(server, null, { source: "sales" })
        };
        const expected = { ok: 200, "not allowed": 403, "invalid input": 400, "below show": 403, "over a limit": 413, "no token": 401 };
        for (const [name, answer] of Object.entries(answers)) {
            assert.equal(answer.status, expected[name], `${name}: ${answer.text}`);
            assert.equal(answer.headers.get("cache-control"), "no-store", name);
            assert.equal(answer.headers.get("x-content-type-options"), "nosniff", name);
            assert.equal(answer.headers.get("referrer-policy"), "no-referrer", name);
            assert.match(answer.headers.get("content-type") ?? "", name === "ok" ? /^application\/json/ : /^application\/problem\+json/, name);
            assert.ok(answer.headers.get("x-request-id"), name);
        }
        const cors = await fetch(`${server.api}/sources/records`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, origin }, body: JSON.stringify({ source: "small" }) });
        assert.equal(cors.status, 200);
        assert.equal(cors.headers.get("access-control-allow-origin"), origin);
        assert.match(cors.headers.get("vary") ?? "", /Origin/);
        assert.equal(cors.headers.get("cache-control"), "no-store");
        assert.equal((await cors.json()).rowCount, 1);
    } finally {
        await server.close();
    }
});

test("GET /sources says per source whether the caller may read its rows", async () => {
    const { server, person } = await serverOf({ sources: { other: { file: "data/sales.csv", policy: { default: "show" } } } });
    try {
        const listed = async (token) => Object.fromEntries((await call(`${server.api}/sources`, { token })).data.sources.map((s) => [s.id, s.records]));
        assert.deepEqual(await listed(await person()), { sales: true, other: undefined });
        assert.deepEqual(await listed(await person({ profile: "plain" })), { sales: undefined, other: undefined });
        assert.deepEqual(await listed(TOKEN), { sales: undefined, other: undefined }, "a static token is no person");
    } finally {
        await server.close();
    }
});

test("the log line of a rows request: source, counts, profile and the person as audit.subject says; never a value", async () => {
    const { server, person } = await serverOf({ top: { audit: { subject: "plain" } } });
    try {
        assert.equal((await rows(server, await person({ sub: "ana@example.com" }), { source: "sales" })).status, 200);
        const line = await waitFor(() => server.log.find((l) => l.event === "records"));
        assert.equal(line.source, "sales");
        assert.equal(line.rows, 5);
        assert.equal(line.columns, 3);
        assert.equal(line.profile, "staff");
        assert.equal(line.subject, "ana@example.com");
        assert.equal(line.outcome, "ok");
        assert.equal(line.client, "psu");
        const text = JSON.stringify(server.log);
        assert.doesNotMatch(text, MARKS);
        assert.doesNotMatch(text, /North|South|2026-09-01/, "no value of a shown field either");
    } finally {
        await server.close();
    }
});

/** What `find` gives once it gives something (a line written when the answer's body ended). */
async function waitFor(find) {
    for (let i = 0; i < 100; i++) {
        const found = find();
        if (found) {
            return found;
        }
        await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("never came");
}

// ---------------------------------------------------------------------------------------------
// check-config

test("check-config lists per profile the sources it may read rows of and the fields that would leave", async () => {
    const { options } = setup();
    const out = await checkConfig(options, { http: true, env: { OPS: TOKEN }, rest: true });
    const text = factsOf(out.text);
    const section = text.split("Rows (REST): POST /api/v1/sources/records")[1]?.split("\n\n")[0] ?? "";
    assert.match(section, /at most 50,000 rows and 1,000,000 cells per answer, 2 at once, idle after 30 s/);
    assert.match(section, /profile staff: sales\n\s+sales: Region, Sales, OrderDate leave; Product, Team stay/);
    assert.match(section, /profile narrow: sales\n\s+sales: Region leave; Product, Team, Sales, OrderDate stay/);
    assert.doesNotMatch(section, /plain|Customer/, "a profile without the right, and a hidden field, are not listed");
});

test("check-config reports a problem for an unknown source id in records", async () => {
    const { options } = setup({ profiles: { staff: { ...PROFILES.staff, records: ["sales", "slaes"] } } });
    const out = await checkConfig(options, { http: true, env: { OPS: TOKEN }, rest: true });
    assert.match(factsOf(out.text), /PROBLEM: policy\.profiles\.staff\.records: no source "slaes"; did you mean "sales"\? -> the server starts; this entry grants nothing/);
});

test("check-config warns about a source with no show field and a profile whose default is show", async () => {
    // closed has none of the fields the profile shows
    const { options } = setup({ sources: { closed: { file: "data/other.csv" } }, profiles: { staff: { ...PROFILES.staff, records: ["sales", "closed"] }, wide: { default: "show", records: ["sales"] } } }, { "sales.csv": CSV, "other.csv": "Name,Amount\nx,1\n" });
    const text = factsOf((await checkConfig(options, { http: true, env: { OPS: TOKEN }, rest: true })).text);
    assert.match(text, /WARNING \(Rows\): policy\.profiles\.staff\.records: the source closed has no field at show for this profile, so its rows answer NOT_ALLOWED/);
    assert.match(text, /WARNING \(Rows\): policy\.profiles\.wide: the default is show and the profile reads rows, so a column a source gains later leaves too/);
});

test("check-config reports a problem when a static or signed token's profile has records", async () => {
    const { options } = setup();
    const text = factsOf((await checkConfig(options, { http: true, env: { OPS: TOKEN }, rest: true })).text);
    assert.match(text, /PROBLEM: auth\.tokens\[0\] \(ops\): its profile staff reads rows \(records\), but a static token is no person -> the server starts; it gets NOT_ALLOWED from POST \/api\/v1\/sources\/records/);
    // a signed token names its profile when it is issued: the register says which
    const issued = spawnSync(process.execPath, [BIN, "token", "issue", "--config", writeConfig(options), "--name", "laptop", "--profile", "narrow", "--json"], { encoding: "utf8" });
    assert.equal(issued.status, 0, issued.stderr);
    const id = JSON.parse(issued.stdout).id;
    const signed = factsOf((await checkConfig({ ...options, auth: { ...options.auth, tokens: [] } }, { http: true, env: {}, rest: true })).text);
    assert.match(signed, new RegExp(`PROBLEM: auth\\.signedTokens: the token ${id} \\(laptop\\) has the profile narrow, which reads rows \\(records\\), but a signed token is no person -> the server starts; it gets NOT_ALLOWED from POST /api/v1/sources/records`));
});
