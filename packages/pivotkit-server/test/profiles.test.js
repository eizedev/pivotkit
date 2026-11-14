// Policy profiles: one view run for two callers differs only where their profiles differ; a field
// the source hides stays hidden in every profile; downloads only for a profile with results: true,
// whatever the view uses, with headers that keep a browser from running the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { resolvePolicy, levelOf } from "pivotkit-server/policy";
import { profileOf } from "pivotkit-server";
import { BY_REGION, OTHER_TOKEN, TOKEN, call, restServer, workspace } from "./helpers.js";

const THIRD_TOKEN = "a-third-test-token-that-is-long-enough-42424242";

/** Sales with Customer hidden, Region shown, the rest summary; an analyst profile and a download profile. */
async function profileServer(extra = {}) {
    const dir = workspace();
    const server = await restServer(
        {
            sources: { sales: { file: "data/sales.csv", policy: { fields: { Region: "show", Customer: "hide" } } } },
            policy: { profiles: { analyst: { default: "show", fields: { Customer: "show" } }, export: { results: true } } },
            auth: { mode: "token", tokens: [{ name: "plain", env: "T1" }, { name: "analyst", env: "T2", profile: "analyst" }, { name: "exporter", env: "T3", profile: "export" }] },
            output: { dir: "out" },
            baseDir: dir,
            ...extra
        },
        { env: { T1: TOKEN, T2: OTHER_TOKEN, T3: THIRD_TOKEN } }
    );
    return { server, dir };
}

test("resolvePolicy: a profile is laid over the source's policy, and what the source hides stays hidden", () => {
    const base = { fields: { Region: "show", Customer: "hide" } };
    const plain = resolvePolicy({}, base);
    const analyst = resolvePolicy({}, base, { default: "show", fields: { Customer: "show", Notes: "summary" } });
    assert.equal(levelOf(plain, "Sales"), "summary");
    assert.equal(levelOf(analyst, "Sales"), "show");
    assert.equal(levelOf(analyst, "customer"), "hide", "a profile cannot show a hidden field");
    assert.equal(levelOf(analyst, "Notes"), "summary");
    assert.equal(plain.results, false);
    assert.equal(resolvePolicy({}, base, { results: true }).results, true);
    // a source hiding everything by default: a profile's default cannot open it, a field it names stays hidden
    const closed = resolvePolicy({}, { default: "hide", fields: { Region: "summary" } }, { default: "show", fields: { Sales: "show" } });
    assert.equal(levelOf(closed, "Sales"), "hide");
    assert.equal(levelOf(closed, "Other"), "hide");
    assert.equal(levelOf(closed, "Region"), "show");
    // a profile may close more than the source
    assert.equal(levelOf(resolvePolicy({}, base, { fields: { Region: "hide" } }), "Region"), "hide");
});

test("profileOf: a token's own profile, else the OAuth client's, else the one profile its scopes name; two different ones give none", () => {
    const auth = { clientProfiles: { "report-bot": "analyst" }, scopeProfiles: { "pivotkit:export": "export", "pivotkit:analyst": "analyst" } };
    assert.equal(profileOf(auth, { token: "", clientId: "t", scopes: [], expiresAt: 0, extra: { profile: "export" } }), "export");
    assert.equal(profileOf(auth, { token: "", clientId: "report-bot", scopes: [], expiresAt: 0, extra: {} }), null, "a static token's name is not an OAuth client id");
    assert.equal(profileOf(auth, { token: "jwt", clientId: "report-bot", scopes: ["pivotkit:export"], expiresAt: 0 }), "analyst");
    assert.equal(profileOf(auth, { token: "jwt", clientId: "other", scopes: ["pivotkit:export"], expiresAt: 0 }), "export");
    assert.equal(profileOf(auth, { token: "jwt", clientId: "other", scopes: ["pivotkit:export", "pivotkit:analyst"], expiresAt: 0 }), null);
    assert.equal(profileOf(auth, undefined), null);
});

test("one view under two profiles: the analyst sees the result's shape and the values; the plain token gets them withheld; the source's hidden field stays hidden", async () => {
    const { server } = await profileServer();
    try {
        const body = { source: "sales", view: BY_REGION, format: "csv" };
        const plain = await call(`${server.api}/views/render`, { token: TOKEN, body });
        const analyst = await call(`${server.api}/views/render`, { token: OTHER_TOKEN, body });
        assert.deepEqual(plain.data.withheld, ["rows", "columns", "bytes", "content"]);
        assert.equal(analyst.data.withheld, undefined);
        // North, South, West, the blank region and the total
        assert.deepEqual(analyst.data.summary, { rows: 5, columns: 2, sourceRows: 5, keptRows: 5, truncated: false });
        // only the policy's parts differ
        const strip = (d) => ({ ...d, withheld: undefined, summary: undefined, output: undefined, message: undefined });
        assert.deepEqual(strip(plain.data), strip(analyst.data));
        const plainFields = (await call(`${server.api}/sources/sales`, { token: TOKEN })).data.fields;
        const analystFields = (await call(`${server.api}/sources/sales`, { token: OTHER_TOKEN })).data.fields;
        assert.equal(plainFields.find((f) => f.name === "Sales").level, "summary");
        assert.equal(analystFields.find((f) => f.name === "Sales").level, "show");
        assert.equal(analystFields.find((f) => f.name === "Sales").min, 3);
        for (const fields of [plainFields, analystFields]) {
            assert.ok(!fields.some((f) => f.name === "Customer"), "hidden in every profile");
        }
        const customer = await call(`${server.api}/views/validate`, { token: OTHER_TOKEN, body: { source: "sales", view: { rows: ["Customer"], values: [{ agg: "count" }] } } });
        assert.equal(customer.data.valid, false);
    } finally {
        await server.close();
    }
});

test("the file route: 403 without results, the file with safe headers with it (also for a view whose fields are withheld), 422 with findings for a view with errors", async () => {
    const { server, dir } = await profileServer();
    try {
        const body = { source: "sales", view: BY_REGION, format: "csv", name: "Ümsatz \"Q3\"/x" };
        const refused = await call(`${server.api}/views/render/file`, { token: TOKEN, body });
        assert.equal(refused.status, 403);
        assert.equal(refused.data.code, "NOT_ALLOWED");
        const analystRefused = await call(`${server.api}/views/render/file`, { token: OTHER_TOKEN, body });
        assert.equal(analystRefused.status, 403, "seeing values is not downloading files");
        const res = await call(`${server.api}/views/render/file`, { token: THIRD_TOKEN, body });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("content-type"), "text/csv;charset=utf-8");
        assert.equal(res.headers.get("x-content-type-options"), "nosniff");
        assert.equal(res.headers.get("cache-control"), "no-store");
        assert.equal(res.headers.get("content-security-policy"), "sandbox; default-src 'none'");
        const disposition = res.headers.get("content-disposition");
        assert.match(disposition, /^attachment; filename="[^"\\/]*"; filename\*=UTF-8''/);
        assert.ok(!/\//.test(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])), "no path in the name");
        const text = new TextDecoder().decode(res.data);
        assert.match(text, /North.*15/s);
        assert.deepEqual(readdirSync(join(dir, "out")), [], "the file route writes nothing to the output directory");
        const html = await call(`${server.api}/views/render/file`, { token: THIRD_TOKEN, body: { source: "sales", view: BY_REGION, format: "html" } });
        assert.equal(html.status, 200);
        assert.match(html.headers.get("content-disposition"), /^attachment;/);
        const broken = await call(`${server.api}/views/render/file`, { token: THIRD_TOKEN, body: { source: "sales", view: { rows: ["Regoin"], values: [{ agg: "count" }] } } });
        assert.equal(broken.status, 422);
        assert.equal(broken.data.code, "VIEW_HAS_ERRORS");
        assert.equal(broken.data.findings[0].suggestion, "Region");
        const event = server.log.find((l) => l.event === "download");
        assert.equal(event.client, "exporter");
        assert.equal(event.format, "csv");
    } finally {
        await server.close();
    }
});

test("results: true as the server's policy lets every caller download; a source can switch it off for itself", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" }, secret: { file: "data/sales.csv", policy: { results: false } } }, policy: { results: true }, baseDir: dir });
    try {
        assert.equal((await call(`${server.api}/views/render/file`, { body: { source: "sales", view: BY_REGION, format: "json" } })).status, 200);
        assert.equal((await call(`${server.api}/views/render/file`, { body: { source: "secret", view: BY_REGION, format: "json" } })).status, 403);
    } finally {
        await server.close();
    }
});

test("profiles in the configuration: an unknown profile name and a default of hide are refused with what to do", async () => {
    const { validateOptions } = await import("pivotkit-server");
    assert.throws(() => validateOptions({ policy: { profiles: { analyst: {} } }, auth: { mode: "token", tokens: [{ name: "a", env: "A", profile: "analys" }] } }), /auth\.tokens\[0\]\.profile: no profile "analys" in policy\.profiles; did you mean "analyst"\?/);
    assert.throws(() => validateOptions({ policy: { profiles: { closed: { default: "hide" } } } }), /policy\.profiles\.closed\.default: "hide" would drop every field/);
    assert.throws(() => validateOptions({ auth: { scopeProfiles: { "pivotkit:x": "nope" } } }), /auth\.scopeProfiles\.pivotkit:x: no profile "nope"/);
    assert.throws(() => validateOptions({ sources: { s: { file: "x.csv", policy: { profiles: {} } } } }), /unknown key "profiles"/);
});
