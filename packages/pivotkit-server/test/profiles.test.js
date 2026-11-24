// Policy profiles: one view run for two callers differs only where their profiles differ; a field
// the source hides stays hidden in every profile; downloads only for a profile with results: true,
// whatever the view uses, with headers that keep a browser from running the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolvePolicy, levelOf } from "pivotkit-server/policy";
import { profileOf } from "pivotkit-server/internal";
import { BY_REGION, OTHER_TOKEN, SALES_CSV, TOKEN, call, restServer, workspace } from "./helpers.js";

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
        const strip = (d) => ({ ...d, withheld: undefined, summary: undefined, output: undefined, message: undefined, requestId: undefined });
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
        const off = await call(`${server.api}/views/render/file`, { body: { source: "secret", view: BY_REGION, format: "json" } });
        assert.equal(off.status, 403);
        assert.equal(off.data.detail, "this server gives no files for this source; the operator allows them with results: true in the server's or the source's policy");
    } finally {
        await server.close();
    }
});

test("the file route's 403 speaks of a token only to a caller that sent one: without sign-in it names the policy", async () => {
    const dir = workspace();
    const open = await restServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        const refused = await call(`${open.api}/views/render/file`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(refused.status, 403);
        assert.equal(refused.data.code, "NOT_ALLOWED");
        assert.equal(refused.data.detail, "this server gives no files for this source; the operator allows them with results: true in the server's or the source's policy");
    } finally {
        await open.close();
    }
    const tokens = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const refused = await call(`${tokens.api}/views/render/file`, { token: TOKEN, body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(refused.status, 403);
        assert.equal(refused.data.detail, "your token may not download files; ask the operator for a token whose profile has results: true");
    } finally {
        await tokens.close();
    }
});

test("profiles in the configuration: an unknown profile name and a default of hide are refused with what to do", async () => {
    const { validateOptions } = await import("pivotkit-server");
    assert.throws(() => validateOptions({ policy: { profiles: { analyst: {} } }, auth: { mode: "token", tokens: [{ name: "a", env: "A", profile: "analys" }] } }), /auth\.tokens\[0\]\.profile: no profile "analys" in policy\.profiles; did you mean "analyst"\?/);
    assert.throws(() => validateOptions({ policy: { profiles: { closed: { default: "hide" } } } }), /policy\.profiles\.closed\.default: "hide" would drop every field/);
    assert.throws(() => validateOptions({ auth: { scopeProfiles: { "pivotkit:x": "nope" } } }), /auth\.scopeProfiles\.pivotkit:x: no profile "nope"/);
    assert.throws(() => validateOptions({ sources: { s: { file: "x.csv", policy: { profiles: {} } } } }), /unknown key "profiles"/);
});

test("hide holds for a repeated header the reader renamed and for a name in another Unicode form, also under a profile that shows by default", async () => {
    const nfd = "Gro\u0308\u00DFe";
    const dir = workspace({ "hr.csv": `Name,Email,Region,email ,${nfd}\nAnn,a@example.invalid,North,a2@example.invalid,180\nBen,b@example.invalid,South,b2@example.invalid,170\n` });
    const server = await restServer(
        { sources: { hr: { file: "data/hr.csv", policy: { fields: { Email: "hide", "Gr\u00F6\u00DFe": "hide" } } } }, policy: { profiles: { open: { default: "show", results: true } } }, auth: { mode: "token", tokens: [{ name: "open", env: "T", profile: "open" }] }, baseDir: dir },
        { env: { T: TOKEN } }
    );
    try {
        const described = await call(`${server.api}/sources/hr`, { token: TOKEN });
        assert.deepEqual(described.data.fields.map((f) => f.name), ["Name", "Region"]);
        assert.equal(described.data.hiddenFields, 3);
        const file = await call(`${server.api}/views/render/file`, { token: TOKEN, body: { source: "hr", view: { rows: ["Name", "Region"], values: [{ agg: "count" }] }, format: "csv" } });
        assert.equal(file.status, 200);
        assert.ok(!new TextDecoder().decode(file.data).includes("example.invalid"));
    } finally {
        await server.close();
    }
});

test("rows: false keeps the source's row count, and the kept rows, out of a render's summary too", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show", rows: false } } }, rest: { inline: true }, baseDir: dir });
    try {
        const res = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv" } });
        assert.equal(res.status, 200);
        assert.equal(res.data.summary.sourceRows, undefined);
        assert.equal(res.data.summary.keptRows, undefined, "without a filter the kept rows are all of them");
        assert.equal((await call(`${server.api}/sources/sales`)).data.rows, null);
    } finally {
        await server.close();
    }
});

test("rows: false keeps the row count out of the HTML report too: its details and a print template's {{rows}}, with and without a filter", async () => {
    // 5 rows, 2 of them North; the counts would read "5", "2 of 5 rows" or "5 rows"
    const dir = workspace({ "sales.csv": SALES_CSV, "brand.html": "<!doctype html><html><head>{{style}}</head><body><p class=\"count\">[{{rows}}]</p>{{table}}{{details}}</body></html>" });
    const policy = { default: "show", rows: false };
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy }, branded: { file: "data/sales.csv", template: "data/brand.html", policy }, open: { file: "data/sales.csv", template: "data/brand.html", policy: { default: "show" } } }, policy: { results: true }, baseDir: dir });
    const html = async (source, view) => {
        const res = await call(`${server.api}/views/render/file`, { body: { source, view, format: "html" } });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        return new TextDecoder().decode(res.data);
    };
    const NORTH = { ...BY_REGION, filters: [{ field: "Region", type: "in", items: ["North"] }] };
    try {
        for (const view of [BY_REGION, NORTH]) {
            const report = await html("sales", view);
            assert.match(report, /<dl class="pk-report-details">/, "the details are there");
            assert.doesNotMatch(report, /<dt>Rows<\/dt>/, "no row count in the details");
            assert.doesNotMatch(report, /\b[25] of 5 rows\b|\b5 rows\b/);
            const branded = await html("branded", view);
            assert.match(branded, /<p class="count">\[\]<\/p>/, "{{rows}} is empty");
            assert.doesNotMatch(branded, /<dt>Rows<\/dt>|\b5 rows\b|of 5 rows/);
        }
        // where the policy shows it, the same template says it
        assert.match(await html("open", NORTH), /<p class="count">\[2 of 5 rows\]<\/p>/);
        assert.match(await html("open", BY_REGION), /<p class="count">\[5 rows\]<\/p>/);
    } finally {
        await server.close();
    }
});

test("rows: false of the server's policy keeps the row count out of a saved HTML report (/views/render) and a downloaded one", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, policy: { default: "show", rows: false, results: true }, output: { dir: "out" }, baseDir: dir });
    const NORTH = { ...BY_REGION, filters: [{ field: "Region", type: "in", items: ["North"] }] };
    try {
        for (const view of [BY_REGION, NORTH]) {
            const saved = await call(`${server.api}/views/render`, { body: { source: "sales", view, format: "html" } });
            assert.equal(saved.status, 200, JSON.stringify(saved.data));
            assert.equal(saved.data.summary.sourceRows, undefined);
            const name = saved.data.output?.name;
            assert.ok(name, JSON.stringify(saved.data));
            const file = readdirSync(join(dir, "out"), { recursive: true }).map(String).find((f) => f.endsWith(name));
            assert.ok(file, `the saved report ${name} is in the output directory`);
            const report = readFileSync(join(dir, "out", file), "utf8");
            assert.match(report, /<dl class="pk-report-details">/);
            assert.doesNotMatch(report, /<dt>Rows<\/dt>|\b5 rows\b|of 5\b/, "no row count in the saved report");
            const downloaded = await call(`${server.api}/views/render/file`, { body: { source: "sales", view, format: "html" } });
            assert.equal(downloaded.status, 200);
            assert.doesNotMatch(new TextDecoder().decode(downloaded.data), /<dt>Rows<\/dt>|\b5 rows\b|of 5\b/, "no row count in the downloaded report");
        }
    } finally {
        await server.close();
    }
});
