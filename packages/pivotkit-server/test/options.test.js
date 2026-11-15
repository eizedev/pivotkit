// The options table composed from per-feature fragments (src/options/), the check-config sections
// (src/check/), and secret references: a key declared twice is an error when the table is composed,
// an unknown key is still refused, today's table and check-config text stay as they were.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, OPTION_KEYS, checkConfig, validateOptions } from "pivotkit-server";
import { FRAGMENTS, composeSlots } from "../src/options/index.js";
import { SLOTS, SECRET_REF } from "../src/options/shared.js";
import { SECTIONS, runSections } from "../src/check/index.js";
import { readSecret, secretFileWarning, SecretError } from "../src/secrets.js";
import { tempDir, workspace } from "./helpers.js";

/** An options table as a plain tree: a function (a custom check) as "fn". */
const treeOf = (schema) =>
    schema === null || typeof schema !== "object" ? (typeof schema === "function" ? "fn" : schema) : Array.isArray(schema) ? schema.map(treeOf) : Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, typeof v === "function" ? "fn" : treeOf(v)]));

test("options: the composed table is today's, in today's order, plus the shared source keys and the features' keys", () => {
    const before = JSON.parse(readFileSync(new URL("./fixtures/option-keys-before-fragments.json", import.meta.url), "utf8"));
    const expected = structuredClone(before);
    // HTTP sources (options/http.js): a source's http, before code's cacheShared (the fragments' order); httpSources last of the top keys
    // a backend's sign-in (#329): a source's http.auth and a backend's auth, secrets as references
    const auth = {
        object: {
            header: { object: { name: "string", prefix: "string", value: { custom: "fn" } } },
            clientCredentials: { object: { tokenUrl: "string", clientId: "string", clientSecret: { custom: "fn" }, assertion: { custom: "fn" }, scope: "string", audience: "string", resource: "string", intranet: "boolean" } },
            tokenExchange: { object: { tokenUrl: "string", clientId: "string", clientSecret: { custom: "fn" }, audience: "string", resource: "string", scope: "string", maxAgeSeconds: "integer", intranet: "boolean" } }
        }
    };
    const http = { object: { backend: "string", path: "string", url: "string", intranet: "boolean", query: { map: "string" }, headers: { map: "string" }, auth, rows: "string", format: { enum: ["json", "csv"] }, asOf: "string", paging: { custom: "fn" }, maxPages: "integer", maxBytes: "integer" } };
    Object.assign(expected.sources.map.object, { ttl: "integer", maxStale: "integer", timeMs: "integer", http, cacheShared: "boolean" });
    // data sent in the request (options/inline.js): a policy's data, after results; mcp.data; rest.data
    const withData = (policy) => Object.fromEntries(Object.entries(policy).flatMap(([k, v]) => (k === "results" ? [[k, v], ["data", "boolean"]] : [[k, v]])));
    expected.sources.map.object.policy.object = withData(expected.sources.map.object.policy.object);
    expected.files.object.policy.object = withData(expected.files.object.policy.object);
    expected.policy.object = withData(expected.policy.object);
    expected.policy.object.profiles.map.object = withData(expected.policy.object.profiles.map.object);
    expected.mcp.object.data = { or: [{ const: false }, { object: { rows: "integer", cells: "integer", bytes: "integer" } }] };
    expected.rest.object.data = { object: { maxBytes: "integer" } };
    expected.httpSources = { object: { enabled: "boolean", allowIpLiterals: "boolean", backends: { map: { object: { url: "string", intranet: "boolean", headers: { map: "string" }, auth, timeMs: "integer", maxBytes: "integer", ttl: "integer", maxStale: "integer" } } } } };
    // the load cache's size (options/code.js), after httpSources (the fragments' order)
    expected.sourceCache = { object: { maxMb: "integer" } };
    // download links (options/downloads.js)
    const secretRef = { custom: "fn" };
    expected.output.object.downloads = { object: { enabled: "boolean", expiresMinutes: "integer", bind: { enum: ["signIn", "once", "none"] }, key: secretRef, signIn: { object: { clientId: "string", clientSecret: secretRef, issuer: "string", scopes: "strings" } } } };
    // the operator's controls (options/operator.js): after the base's keys, in the fragment's order
    Object.assign(expected.auth.object, { groupsClaim: "string", groupsSeparator: "string", groupProfiles: { list: { object: { group: "string", profile: "string" } } }, defaultProfile: "string", offerSourceScopes: "boolean" });
    expected.audit = { object: { subject: { enum: ["off", "hash", "plain"] }, key: { custom: "fn" } } };
    // JSON.stringify compares the order too: the "known: ..." list of an unknown key prints it
    assert.equal(JSON.stringify(treeOf(OPTION_KEYS)), JSON.stringify(expected));
});

test("options: a key declared twice is an error when the table is composed, naming both places", () => {
    const base = { top: {}, source: { file: "string" }, http: {}, policy: {}, auth: { issuer: "string" }, mcp: {}, rest: {}, output: {} };
    const a = { name: "http", KEYS: { auth: { groupsClaim: "string" } }, validate() {} };
    const b = { name: "operator", KEYS: { auth: { groupsClaim: "string" } }, validate() {} };
    assert.throws(() => composeSlots(base, [a, b]), /options\/http\.js and options\/operator\.js both declare auth\.groupsClaim/);
    // a fragment that declares a key of the base
    assert.throws(() => composeSlots(base, [{ name: "inline", KEYS: { auth: { issuer: "string" } }, validate() {} }]), /config\.js and options\/inline\.js both declare auth\.issuer/);
    assert.throws(() => composeSlots(base, [{ name: "inline", KEYS: { source: { file: "string" } }, validate() {} }]), /both declare sources\.<id>\.file/);
    // a slot that does not exist
    assert.throws(() => composeSlots(base, [{ name: "upload", KEYS: { downloads: { x: "string" } }, validate() {} }]), /options\/upload\.js: no slot "downloads"/);
    // the inputs stay as they were
    const merged = composeSlots(base, [a]);
    assert.deepEqual(merged.auth, { issuer: "string", groupsClaim: "string" });
    assert.deepEqual(base.auth, { issuer: "string" });
    assert.deepEqual(a.KEYS.auth, { groupsClaim: "string" });
});

test("options: every fragment has frozen keys in known slots and a validate; each feature fragment has its check section", () => {
    assert.equal(FRAGMENTS[0].name, "base");
    for (const f of FRAGMENTS) {
        assert.ok(Object.isFrozen(f.KEYS), f.name);
        assert.equal(typeof f.validate, "function", f.name);
        for (const slot of Object.keys(f.KEYS)) {
            assert.ok(SLOTS.includes(slot), `${f.name}: ${slot}`);
        }
    }
    assert.deepEqual(
        SECTIONS.map((s) => s.name),
        FRAGMENTS.slice(1).map((f) => f.name)
    );
});

test("options: an unknown key is still refused with the name meant, also for keys no fragment declares yet", () => {
    const load = async () => [];
    assert.throws(() => validateOptions({ sources: { s: { load, tll: 60 } } }), /sources\.s: unknown key "tll"; did you mean "ttl"\?/);
    assert.throws(() => validateOptions({ auth: { subjectClam: "oid" } }), /auth: unknown key "subjectClam"; did you mean "subjectClaim"\?/);
    // (httpSources is options/http.js's now: a misspelling of it is still refused with the name meant)
    assert.throws(() => validateOptions({ httpSource: { enabled: true } }), /unknown key "httpSource"; did you mean "httpSources"\?/);
    assert.throws(() => validateOptions({ httpSources: { allowPrivate: true } }), /httpSources: unknown key "allowPrivate"/);
    assert.throws(() => validateOptions({ output: { downloads: { enabeld: true } } }), /output\.downloads: unknown key "enabeld"; did you mean "enabled"\?/);
    assert.throws(() => validateOptions({ sources: { s: { load, ttl: -1 } } }), /sources\.s\.ttl: must be a whole number/);
});

test("options: params, ttl, maxStale and timeMs belong to a code source; a field's description has at most 500 characters", () => {
    const file = "data/sales.csv";
    for (const key of ["ttl", "maxStale", "timeMs"]) {
        assert.throws(() => validateOptions({ sources: { s: { file, [key]: 60 } } }), new RegExp(`sources\\.s\\.${key}: only a code source \\(load\\) takes ${key}`));
    }
    assert.throws(() => validateOptions({ sources: { s: { file, params: { x: { type: "string" } } } } }), /sources\.s\.params: only a code source \(load\) takes params/);
    assert.throws(() => validateOptions({ sources: { s: { load: async () => [], timeMs: 0 } } }), /sources\.s\.timeMs: must be 1 or more/);
    assert.throws(() => validateOptions({ sources: { s: { file, fields: { Region: { description: "x".repeat(501) } } } } }), /sources\.s\.fields\.Region\.description: at most 500 characters/);
    assert.ok(validateOptions({ sources: { s: { load: async () => [], params: { team: { type: "string", enum: ["a", "b"] } }, ttl: 60, maxStale: 0, timeMs: 20_000, fields: { Region: { description: "x".repeat(500) } } } }, auth: { subjectClaim: "oid" } }));
    // a ConfigError, as every other option's
    assert.throws(() => validateOptions({ sources: { s: { file, ttl: 1 } } }), ConfigError);
});

test("options: the docker example configuration still validates", () => {
    const example = JSON.parse(readFileSync(new URL("../../../docker/pivotkit.example.json", import.meta.url), "utf8"));
    assert.ok(validateOptions(example));
});

test("check sections: problems are counted, warnings are not, and New in this version lists only what a section says applies", async () => {
    const sections = [
        { name: "one", section: async () => ({ lines: ["One: on", "  PROBLEM: one is broken", "  warning: one looks odd"], problems: 1, upgrade: ["one changed"] }) },
        { name: "two", section: async () => ({ lines: [], problems: 0, upgrade: [] }) },
        { name: "three", section: async () => ({ lines: ["Three: off"], problems: 0, upgrade: ["three changed"] }) }
    ];
    const seen = [];
    const out = await runSections([{ name: "spy", section: async (...args) => (seen.push(args), { lines: [], problems: 0, upgrade: [] }) }, ...sections], { a: 1 }, "registry", { http: true });
    assert.deepEqual(seen[0], [{ a: 1 }, "registry", { http: true }]);
    assert.deepEqual(out, { lines: ["One: on", "  PROBLEM: one is broken", "  warning: one looks odd", "Three: off"], problems: 1, upgrade: ["one changed", "three changed"] });
    const none = await runSections(sections.slice(1, 2), {}, null, {});
    assert.deepEqual(none, { lines: [], problems: 0, upgrade: [] });
});

test("check-config: today's configurations print exactly what they printed before, plus each feature's own section and its note in New in this version", async () => {
    const dir = workspace({ "sales.csv": "Region,Product,Customer,Sales\nNorth,A,Alice,10\nSouth,B,Bob,20\n" });
    const options = {
        sources: { sales: { file: "data/sales.csv", title: "Sales", scopes: ["sales:read"], policy: { default: "show", fields: { Customer: "hide" } } }, gone: { file: "data/missing.csv" }, code: { load: async () => [] } },
        output: { dir: "out" },
        policy: { profiles: { analyst: { default: "show", results: true } } },
        auth: { mode: "token", tokens: [{ name: "bot", env: "BOT_TOKEN", scopes: ["sales:read", "typo:scope"], profile: "analyst" }] },
        rest: { cors: { origins: ["https://app.example.com"] } }
    };
    const result = await checkConfig({ ...options, baseDir: dir }, { http: true, env: { BOT_TOKEN: "x".repeat(40) }, name: "pivotkit-server", rest: true });
    const golden = readFileSync(new URL("./fixtures/check-config-before-fragments.txt", import.meta.url), "utf8");
    // what this version adds for this configuration, each said once and nothing else: data sent in the
    // request (check/inline.js), the download links, and the code sources' section, since the configuration has one
    // download links (check/downloads.js): where links would point, and that these closed sources
    // (a hidden field, the default summary) get none with static tokens
    const delivery = ["Delivery:", "  downloads: on, links http://127.0.0.1:3333/downloads/<token>, expire after 60 minutes", "  closed (a field not shown for someone): sales (Customer hide), gone (fields summary by default), code (fields summary by default)", "  reports over closed sources (sales, gone, code): no links (the file is kept; the person asks you for it); set output.downloads.signIn for links only the person can open"];
    const inline = ["", "Data in the request: MCP on, up to 500 rows / 5000 cells / 256 KiB (built-in cap); REST off (no policy or profile has data: true)"];
    const code = [
        "Code sources (1):",
        "  code: load up to 30000 ms, loaded on every call; data per caller; last good data up to 3600 s after a transient failure",
        "  Kept loads of code and HTTP sources: at most 256 MiB in all, tables up to 64 MiB per person or shared source (sourceCache.maxMb); a larger table loads on every call"
    ];
    const upgrade = [
        "",
        "New in this version (what changes with this configuration; https://pivotkit.eize.dev/getting-started/upgrading/):",
        '  - MCP clients may send a small table of their own with source "inline:" (up to 500 rows / 5000 cells / 256 KiB); no exposure policy applies to it; mcp.data: false switches it off',
        "  - Code sources: load gets (params, { caller, signal }) and is aborted after timeMs (default 30000 ms); a failing load answers SOURCE_UNAVAILABLE (502), not INTERNAL; data is kept per caller unless cacheShared; after a transient failure last good data up to maxStale (default 3600 s) stands in"
    ];
    const expected = golden.replace("\n\n1 problem: see NOT FOUND above.\n", `\n${[...inline, ...delivery, ...code].join("\n")}\n\n1 problem: see NOT FOUND above.\n${upgrade.join("\n")}\n`);
    assert.notEqual(expected, golden);
    assert.equal(result.text.split(dir).join("<dir>"), expected);
    assert.equal(result.problems, 1);
});

test("check-config: a section's problem is counted with the others and its upgrade lines close the text", async () => {
    const dir = workspace();
    const section = { name: "demo", section: async () => ({ lines: ["Demo: on", "  PROBLEM: demo needs a key"], problems: 1, upgrade: ["Demo links are on by default for this server"] }) };
    const result = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir }, { http: false, sections: [section] });
    assert.equal(result.problems, 1);
    const lines = result.text.trimEnd().split("\n");
    assert.match(lines[0], /would not start with it as it is/);
    const total = lines.findIndex((l) => /^1 problem: see PROBLEM above\.$/.test(l));
    assert.ok(total > lines.indexOf("Demo: on"), result.text);
    assert.deepEqual(lines.slice(total + 1), ["", "New in this version (what changes with this configuration; https://pivotkit.eize.dev/getting-started/upgrading/):", "  - Demo links are on by default for this server"]);
});

test("secrets: a reference is exactly one of env or file", () => {
    for (const bad of [{}, { env: "" }, { env: "A", file: "b" }, { env: "A", value: "x" }, "literal", null, ["A"]]) {
        assert.ok(SECRET_REF.custom(bad).length, JSON.stringify(bad));
    }
    assert.deepEqual(SECRET_REF.custom({ env: "PIVOTKIT_KEY" }), []);
    assert.deepEqual(SECRET_REF.custom({ file: "secrets/key" }), []);
});

test("secrets: read on every use (rotation), one trailing newline trimmed, CR, LF and NUL refused, the value never in an error", async () => {
    const dir = tempDir();
    const file = join(dir, "key");
    writeFileSync(file, "first-secret-value\n");
    const options = { baseDir: dir };
    assert.equal(await readSecret({ file: "key" }, options), "first-secret-value");
    writeFileSync(file, "second-secret-value\r\n");
    assert.equal(await readSecret({ file: "key" }, options), "second-secret-value", "rotated without a restart");
    assert.equal(await readSecret({ env: "K" }, options, { K: "from-env\n" }), "from-env");
    for (const [text, why] of [
        ["two\nlines\n", /line break/],
        ["carriage\rreturn", /line break/],
        ["nul\u0000byte", /NUL/],
        ["\n", /empty/]
    ]) {
        writeFileSync(file, text);
        const error = await readSecret({ file: "key" }, options).catch((e) => e);
        assert.ok(error instanceof SecretError, text);
        assert.match(error.message, why);
        assert.match(error.message, /the file key/);
        for (const part of text.split(/[\r\n]/).flatMap((p) => p.split(String.fromCharCode(0))).filter((p) => p.length > 2)) {
            assert.ok(!error.message.includes(part), `the value is not in the message: ${error.message}`);
        }
    }
    const missing = await readSecret({ env: "NOT_SET" }, options, {}).catch((e) => e);
    assert.match(missing.message, /\$NOT_SET is not set/);
    const noFile = await readSecret({ file: "nope" }, options).catch((e) => e);
    assert.match(noFile.message, /the file nope cannot be read \(no such file\)/);
    assert.ok(!noFile.message.includes(dir), "no full path");
});

test("secrets: check-config warns of a secret file other users can read (a static token's file too), never of one only the owner reads", { skip: process.platform === "win32" && "file modes" }, async () => {
    const dir = workspace();
    const open = join(dir, "open-token");
    const closed = join(dir, "closed-token");
    writeFileSync(open, `${"o".repeat(40)}\n`);
    writeFileSync(closed, `${"c".repeat(40)}\n`);
    chmodSync(open, 0o644);
    chmodSync(closed, 0o600);
    assert.equal(await secretFileWarning({ file: "open-token" }, { baseDir: dir }), "warning: the file open-token can be read by other users of this machine (mode 644); make it readable by the server's user only (chmod 600)");
    assert.equal(await secretFileWarning({ file: "closed-token" }, { baseDir: dir }), null);
    assert.equal(await secretFileWarning({ env: "X" }, { baseDir: dir }), null);
    assert.equal(await secretFileWarning({ file: "missing" }, { baseDir: dir }), null, "a missing file is said elsewhere");
    const result = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "open", file: "open-token" }, { name: "closed", file: "closed-token" }] }, baseDir: dir }, { http: true });
    assert.match(result.text, /\n {2}warning: the token open's file open-token can be read by other users of this machine \(mode 644\)/);
    assert.doesNotMatch(result.text, /closed-token can be read/);
    assert.equal(result.problems, 0, "a warning, not a problem");
});
