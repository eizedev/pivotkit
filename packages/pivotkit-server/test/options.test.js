// The options table composed from per-feature fragments (src/options/), the check-config sections
// (src/check/), and secret references: a key declared twice is an error when the table is composed,
// an unknown key is still refused, today's table stays as it was; check-config's layout (check/format.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { ConfigError, OPTION_KEYS, checkConfig, validateOptions } from "pivotkit-server";
import { FRAGMENTS, composeSlots } from "../src/options/index.js";
import { SLOTS, SECRET_REF } from "../src/options/shared.js";
import { SECTIONS, runSections } from "../src/check/index.js";
import { heading, plain, problem, render, warning, wrap } from "../src/check/format.js";
import { readSecret, secretFileWarning, SecretError } from "../src/secrets.js";
import { OTHER_TOKEN, TOKEN, factsOf, tempDir, workspace } from "./helpers.js";

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
    Object.assign(expected.sources.map.object, { ttl: "integer", maxStale: "integer", timeMs: "integer", http, cacheShared: "boolean", perPerson: "boolean" });
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
    // how long a schedule draft may wait for approval (config.js), after maxAgeDays
    expected.output.object.draftMaxAgeDays = "integer";
    // download links (options/downloads.js)
    const secretRef = { custom: "fn" };
    expected.output.object.downloads = { object: { enabled: "boolean", expiresMinutes: "integer", bind: { enum: ["signIn", "once", "none"] }, key: secretRef, allowInsecureUrl: "boolean", signIn: { object: { clientId: "string", clientSecret: secretRef, issuer: "string", scopes: "strings", tokenUrl: "string" } } } };
    // the operator's controls (options/operator.js): after the base's keys, in the fragment's order
    Object.assign(expected.auth.object, { groupsClaim: "string", groupsSeparator: "string", groupProfiles: { list: { object: { group: "string", profile: "string" } } }, defaultProfile: "string", offerSourceScopes: "boolean" });
    expected.audit = { object: { subject: { enum: ["off", "hash", "plain"] }, key: { custom: "fn" } } };
    // the upload target (options/upload.js): a header is a text or a secret reference with a prefix
    const headers = { map: { or: ["string", { object: { prefix: "string", value: secretRef } }] } };
    expected.output.object.upload = { object: { url: "string", headers, link: "string", expiresAt: "string", presign: { object: { url: "string", headers, uploadUrl: "string", uploadHeaders: "string", link: "string", expiresAt: "string", allowOrigins: "strings" } }, linkOrigins: "strings", method: { enum: ["PUT", "POST"] }, timeMs: "integer", maxBytes: "integer", keepLocal: "boolean", bind: { enum: ["none", "once", "signIn"] }, intranet: "boolean" } };
    // the issuer's requests (options/issuer.js): an issuer on a loopback or private address
    expected.auth.object.intranet = "boolean";
    // the public client pivotkit login signs in with (options/issuer.js): rest.signIn, after the base's rest keys and inline's data
    expected.rest.object.signIn = { object: { clientId: "string" } };
    // a token's file pivotkit makes where it is missing (state.js): create, after file
    const token = expected.auth.object.tokens.list.object;
    expected.auth.object.tokens.list.object = Object.fromEntries(Object.entries(token).flatMap(([k, v]) => (k === "file" ? [[k, v], ["create", "boolean"]] : [[k, v]])));
    // the log (options/log.js): a level alone, as before, or its level, format and addresses; the
    // key moves from config.js to its fragment, so it comes last
    delete expected.log;
    const levels = { enum: ["debug", "info", "warn", "error", "off"] };
    expected.log = { or: [levels, { object: { level: levels, format: { enum: ["auto", "text", "json"] }, address: { enum: ["on", "off"] } } }] };
    // a static token's expiry (config.js, last of a token's keys) and the signed tokens (options/signed.js, the last fragment)
    expected.auth.object.tokens.list.object.expires = "string";
    expected.auth.object.signedTokens = { object: { dir: "string", maxDays: "integer" } };
    // tokens other systems issue (options/external.js, after signed)
    expected.auth.object.externalIssuers = { list: { object: { issuer: "string", typ: "string", maxMinutes: "integer", scopes: "strings", profiles: "strings", profile: "string", keys: { list: { object: { kid: "string", publicKey: secretRef } } } } } };
    // the rows route (options/records.js, after external): a policy's records after data, rest.records, a source's records
    const withRecords = (policy) => Object.fromEntries(Object.entries(policy).flatMap(([k, v]) => (k === "data" ? [[k, v], ["records", "strings"]] : [[k, v]])));
    expected.sources.map.object.policy.object = withRecords(expected.sources.map.object.policy.object);
    expected.files.object.policy.object = withRecords(expected.files.object.policy.object);
    expected.policy.object = withRecords(expected.policy.object);
    expected.policy.object.profiles.map.object = withRecords(expected.policy.object.profiles.map.object);
    expected.rest.object.records = { object: { maxRows: "integer", maxCells: "integer", concurrency: "integer", idleMs: "integer" } };
    expected.sources.map.object.records = { object: { maxRows: "integer" } };
    // named views (options/views.js, the last fragment): a source's views and viewsDir
    Object.assign(expected.sources.map.object, { views: { custom: "fn" }, viewsDir: "string" });
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
    // every feature's fragment has its check section of the same name; the others are the core's
    // (check/index.js), in the order check-config prints them
    const names = SECTIONS.map((s) => s.name);
    for (const f of FRAGMENTS.slice(1)) {
        assert.ok(names.includes(f.name), f.name);
    }
    assert.deepEqual(names, ["sources", "views", "http", "code", "inline", "output", "downloads", "upload", "access", "credentials", "signed", "external", "issuer", "operator", "profiles", "records", "rest", "log"]);
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

test("options: the docker example configurations still validate", () => {
    for (const name of ["pivotkit.example.json", "pivotkit.secrets.example.json"]) {
        const example = JSON.parse(readFileSync(new URL(`../../../docker/${name}`, import.meta.url), "utf8"));
        assert.ok(validateOptions(example), name);
    }
});

test("check sections: each section's items in its order; problems first under the verdict, then the warnings named by their heading, New in this version one per line with its link", async () => {
    const sections = [
        { name: "one", section: async () => ({ items: [heading("One: on"), warning("one looks odd"), plain("a fact"), problem("one is broken", { effect: "the server starts; one answers ONE_BROKEN" })], upgrade: [{ text: "one changed", anchor: "one" }] }) },
        { name: "two", section: async () => ({ items: [], upgrade: [] }) },
        { name: "three", section: async () => ({ items: [heading("Three: off"), problem("three needs a key", { stops: true })], upgrade: [{ text: "three changed", anchor: "three" }] }) }
    ];
    const seen = [];
    const out = await runSections([{ name: "spy", section: async (...args) => (seen.push(args), { items: [], upgrade: [] }) }, ...sections], { a: 1 }, "registry", { http: true });
    assert.deepEqual(seen[0], [{ a: 1 }, "registry", { http: true }]);
    assert.deepEqual(out.upgrade, [{ text: "one changed", anchor: "one" }, { text: "three changed", anchor: "three" }]);
    const page = render("pivotkit-server", out.sections, out.upgrade, "https://example.com/upgrading/");
    assert.deepEqual(page.text.split("\n"), [
        "pivotkit-server: the server does not start with this configuration.",
        "2 problems, 1 warning.",
        "",
        // the one that stops the start first, each with what it does
        "PROBLEM: three needs a key -> the server does not start",
        "PROBLEM: one is broken -> the server starts; one answers ONE_BROKEN",
        "",
        // then the warnings, named by their heading
        "WARNING (One): one looks odd",
        "",
        "One: on",
        "  a fact",
        "",
        "Three: off",
        "",
        // one change per line, each with its own section of the upgrading page
        "New in this version:",
        "  one changed",
        "    -> https://example.com/upgrading/#one",
        "  three changed",
        "    -> https://example.com/upgrading/#three",
        ""
    ]);
    assert.deepEqual([page.problems, page.warnings, page.stops], [2, 1, 1]);
    // only problems that do not stop the start: the server starts, and the verdict says so
    assert.match(render("pivotkit-server", [out.sections[1]], [], "u").text, /^pivotkit-server: the server starts, but not everything will work\.\n1 problem, 1 warning\.\n/);
    const none = await runSections(sections.slice(1, 2), {}, null, {});
    assert.deepEqual(render("x", none.sections, none.upgrade, "u").text, "x: the configuration is valid.\n0 problems, 0 warnings.\n");
});

test("check-config layout: one fact per line, wrapped at 78 columns at spaces, a wrapped line four spaces further in than its fact; a long address stays whole", () => {
    const text = "reports over closed sources (sales, gone, code): no links (the file is kept; the person asks you for it)";
    assert.deepEqual(wrap(text, 2), ["  reports over closed sources (sales, gone, code): no links (the file is kept;", "      the person asks you for it)"]);
    for (const line of wrap(text.repeat(5), 2)) {
        assert.ok(line.length <= 78, line);
    }
    // a path longer than a line stands alone on its own line, never cut
    const path = `/${"x".repeat(90)}/reports`;
    assert.deepEqual(wrap(`at ${path} (will be created)`, 2), ["  at", `      ${path}`, "      (will be created)"]);
    // a fact under another is two spaces in, a wrapped line four: factsOf (the tests' reader) joins only the wrapped ones
    assert.equal(factsOf(["One:", ...wrap(text, 2), "    a child", ...wrap(text, 4)].join("\n")), ["One:", `  ${text}`, "    a child", `    ${text}`].join("\n"));
});

test("check-config: the whole text of a configuration of every kind of source, with a missing file, a token and a profile", async () => {
    const dir = workspace({ "sales.csv": "Region,Product,Customer,Sales\nNorth,A,Alice,10\nSouth,B,Bob,20\n" });
    const options = {
        sources: { sales: { file: "data/sales.csv", title: "Sales", scopes: ["sales:read"], policy: { default: "show", fields: { Customer: "hide" } } }, gone: { file: "data/missing.csv" }, code: { load: async () => [] } },
        output: { dir: "out" },
        policy: { profiles: { analyst: { default: "show", results: true } } },
        auth: { mode: "token", tokens: [{ name: "bot", env: "BOT_TOKEN", scopes: ["sales:read", "typo:scope"], profile: "analyst" }] },
        rest: { cors: { origins: ["https://app.example.com"] } }
    };
    const result = await checkConfig({ ...options, baseDir: dir }, { http: true, env: { BOT_TOKEN: TOKEN }, name: "pivotkit-server", rest: true });
    const golden = readFileSync(new URL("./fixtures/check-config.txt", import.meta.url), "utf8");
    // the paths are the system's own: "/" in the golden file stands for its separator
    assert.equal(result.text.split(dir).join("<dir>").replace(/<dir>\S*/g, (path) => path.split(sep).join("/")), golden);
    assert.deepEqual([result.problems, result.warnings, result.stops], [1, 2, 0]);
    // every line fits, but for a full path (one word, never cut)
    for (const line of result.text.split("\n").filter((l) => !l.includes(dir))) {
        assert.ok(line.length <= 78, line);
    }
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
    writeFileSync(open, `${TOKEN}\n`);
    writeFileSync(closed, `${OTHER_TOKEN}\n`);
    chmodSync(open, 0o644);
    chmodSync(closed, 0o600);
    assert.equal(await secretFileWarning({ file: "open-token" }, { baseDir: dir }), "the file open-token can be read by other users of this machine (mode 644); make it readable by the server's user only (chmod 600)");
    assert.equal(await secretFileWarning({ file: "closed-token" }, { baseDir: dir }), null);
    assert.equal(await secretFileWarning({ env: "X" }, { baseDir: dir }), null);
    assert.equal(await secretFileWarning({ file: "missing" }, { baseDir: dir }), null, "a missing file is said elsewhere");
    const result = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token", tokens: [{ name: "open", file: "open-token" }, { name: "closed", file: "closed-token" }] }, baseDir: dir }, { http: true });
    assert.match(factsOf(result.text), /\nWARNING \(Auth\): the token open's file open-token can be read by other users of this machine \(mode 644\)/);
    assert.doesNotMatch(factsOf(result.text), /closed-token can be read/);
    assert.equal(result.problems, 0, "a warning, not a problem");
    assert.equal(result.warnings, 1);
});
