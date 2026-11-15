// The upload target (output.upload): a written report goes to the operator's store and the result
// shows the store's link. A store over https on loopback (a certificate made per run with openssl, as
// http-sources.test.js does; the names resolve to 127.0.0.1 through a lookup of the test's own)
// plays a presign service, a bucket and a plain PUT/POST store. Checked: which report goes there
// (never one over a closed source to links anyone can open, never a draft), what the presign service
// and the store get (the operator's credentials only at the presign address), the addresses and
// headers taken from answers, the time and the two slots, and that a failure answers UPLOAD_FAILED
// with a fixed text and the request id, alike on REST and MCP, with no presigned address, token or
// answer body on the log.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, hkdfSync } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { platform } from "node:process";
import { createServer } from "node:https";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { OperationError } from "pivotkit-report/operations";
import { callerOf, checkConfig, present, serverTextOf, validateOptions } from "pivotkit-server";
import { createGuardedFetch } from "../src/sources/fetch.js";
import { checkedAddress, expiryOf, fillTemplate, nameSlug, uploadMeans } from "../src/upload.js";
import { deliver, NO_LINK_NOTE, storeFor } from "../src/delivery.js";
import { createDownloadHandler, subkeysOf } from "../src/downloads.js";
import { createContext } from "../src/context.js";
import { withRequestId } from "../src/request-id.js";
import { BY_REGION, SALES_CSV, call, restServer, tempDir, workspace } from "./helpers.js";

/** The store's credential: an environment variable, as an operator gives it. */
const STORE_TOKEN = "STORE-TOKEN-must-never-leave-the-presign-request";
process.env.PIVOTKIT_TEST_STORE_TOKEN = STORE_TOKEN;

/** The download links' key, which the person's binding is made with. */
const DL_KEY = "a-download-key-for-upload-tests-that-is-long-enough-0123";

/** A part of every presigned address that must never reach a caller or the log. */
const SIGNATURE = "PRESIGNED-SIGNATURE-0123456789";

/** What the store answers per method and path, set by each test; and what it was asked. */
let routes = new Map();
/** @type {Array<{ method: string, path: string, host: string, headers: import("node:http").IncomingHttpHeaders, body: Buffer }>} */
let asked = [];
/** How many uploads the bucket holds open right now, and the most at once. */
let open = 0;
let mostOpen = 0;
let server;
let port = 0;
/** Names that resolve elsewhere than loopback: a cloud metadata address, a private one. */
const ADDRESSES = { "meta.example.test": "169.254.169.254", "private.example.test": "10.0.0.1" };
let cert;

before(async () => {
    const dir = tempDir();
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "2", "-subj", "/CN=store.example.test", "-addext", "subjectAltName=DNS:store.example.test,DNS:bucket.example.test,DNS:files.example.test,DNS:evil.example.test"], { stdio: "ignore" });
    cert = readFileSync(join(dir, "cert.pem"));
    server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
        const url = new URL(req.url ?? "/", "https://x");
        const chunks = [];
        open++;
        mostOpen = Math.max(mostOpen, open);
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const entry = { method: req.method ?? "", path: url.pathname + url.search, host: String(req.headers.host ?? "").split(":")[0], headers: req.headers, body: Buffer.concat(chunks) };
            asked.push(entry);
            const route = routes.get(`${req.method} ${url.pathname}`) ?? routes.get(`${req.method} *`);
            const done = () => {
                open--;
            };
            res.on("close", done);
            if (!route) {
                res.writeHead(404, { "content-type": "application/json" });
                res.end(JSON.stringify({ error: "STORE-BODY-MARKER no such route" }));
                return;
            }
            route(entry, res);
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    uploadMeans.fetch = createGuardedFetch({
        ca: cert,
        lookup: (host, options, callback) => {
            const address = ADDRESSES[host] ?? "127.0.0.1";
            callback(null, options?.all ? [{ address, family: 4 }] : address, 4);
        }
    });
});

after(() => server.close());

beforeEach(() => {
    routes = new Map();
    asked = [];
    open = 0;
    mostOpen = 0;
});

const origin = (host) => `https://${host}.example.test:${port}`;

/** A JSON answer. */
const json = (body, status = 200, headers = {}) => (_entry, res) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
};

/** The presign service as a store's is: it names an address in the bucket, a header for it and the link. */
function presignRoute(more = {}) {
    let n = 0;
    return (entry, res) => {
        n++;
        if (entry.headers.authorization !== `Bearer ${STORE_TOKEN}`) {
            json({ error: "STORE-BODY-MARKER not signed in" }, 401)(entry, res);
            return;
        }
        const expires = new Date(Date.now() + 3_600_000);
        json({ uploadUrl: `${origin("bucket")}/b/report-${n}?X-Sig=${SIGNATURE}`, headers: { "x-amz-meta-origin": "pivotkit" }, downloadUrl: `${origin("files")}/f/report-${n}?sig=${SIGNATURE}`, expiresAt: expires.toISOString(), ...more })(entry, res);
    };
}

/** The bucket: takes the body, answers 200. */
const bucket = (status = 200) => json({ ok: true }, status);

/** A source whose fields are all shown, and one with a hidden field. */
const SOURCES = {
    open: { file: "data/sales.csv", policy: { default: "show" } },
    closed: { file: "data/sales.csv", policy: { default: "show", fields: { Customer: "hide" } } }
};

/** The options of a store reached by presigning. */
const presignOptions = (upload = {}, more = {}) => ({
    sources: SOURCES,
    output: {
        dir: "out",
        upload: {
            presign: { url: `${origin("store")}/presign`, headers: { authorization: { prefix: "Bearer ", value: { env: "PIVOTKIT_TEST_STORE_TOKEN" } } }, uploadUrl: "/uploadUrl", uploadHeaders: "/headers", link: "/downloadUrl", expiresAt: "/expiresAt", allowOrigins: [origin("bucket")] },
            linkOrigins: [origin("files")],
            intranet: true,
            ...upload
        },
        ...more
    }
});

/** A context over a workspace; its log kept as parsed lines. */
async function contextOf(options) {
    const dir = workspace();
    const log = [];
    const context = await createContext({ ...options, baseDir: dir }, { stderr: { write: (t) => log.push(...String(t).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))) } });
    return { context, dir, log, files: () => readdirSync(join(dir, "out")).filter((n) => !n.startsWith(".")) };
}

const CSV = new TextEncoder().encode("Region,Sales\nNorth,15\nSouth,20\n");
const FILE = Object.freeze({ bytes: CSV, mediaType: "text/csv;charset=utf-8", extension: "csv", name: "Sales by region" });
const MCP_HOW = Object.freeze({ caller: { scopes: null, client: "local", profile: null }, surface: /** @type {const} */ ("mcp"), policy: /** @type {any} */ ({}) });

/** A delivery's error, or null. */
const failureOf = (promise) => promise.then(() => null, (e) => e);

test("options: one way to the store, https:// origins, credentials only as secret references, the template's placeholders", () => {
    const base = { sources: SOURCES, output: { dir: "out" } };
    const refused = (upload, message, more = {}) => assert.throws(() => validateOptions({ ...base, output: { ...base.output, ...more, upload } }), message);
    refused({}, /output\.upload: give exactly one of url .* or presign/);
    refused({ url: "https://store.example.com/r/{id}", presign: { url: "https://store.example.com/p", uploadUrl: "/u", link: "/l" } }, /exactly one of/);
    refused({ presign: { url: "http://store.example.com/p", uploadUrl: "/u", link: "/l" } }, /presign\.url: an https:\/\/ address/);
    refused({ presign: { url: "https://user:pw@store.example.com/p", uploadUrl: "/u", link: "/l" } }, /without user name or password/);
    refused({ presign: { url: "https://store.example.com/p", link: "/l" } }, /presign\.uploadUrl: the JSON Pointer/);
    refused({ presign: { url: "https://store.example.com/p", uploadUrl: "uploadUrl", link: "/l" } }, /presign\.uploadUrl: a JSON Pointer/);
    refused({ presign: { url: "https://store.example.com/p", uploadUrl: "/u", link: "/l" }, link: "/x" }, /output\.upload\.link: with presign, set it in output\.upload\.presign\.link/);
    refused({ presign: { url: "https://store.example.com/p", uploadUrl: "/u", link: "/l", allowOrigins: ["https://bucket.example.com/path"] } }, /allowOrigins\[0\]: an https:\/\/ origin/);
    refused({ presign: { url: "https://store.example.com/p", uploadUrl: "/u", link: "/l" }, linkOrigins: ["http://files.example.com"] }, /linkOrigins\[0\]: an https:\/\/ origin/);
    // a credential is never a text in the configuration
    refused({ presign: { url: "https://store.example.com/p", uploadUrl: "/u", link: "/l", headers: { authorization: "Bearer abc" } } }, /headers\.authorization: looks like a credential; give it as \{ "prefix"/);
    refused({ url: "https://store.example.com/r/{id}", headers: { "x-api-key": "abc" } }, /headers\.x-api-key: looks like a credential/);
    refused({ url: "https://store.example.com/r/{id}", headers: { host: "other.example.com" } }, /headers\.host: this header is set by the connection/);
    refused({ url: "https://store.example.com/r/{id}", headers: { "x-note": "a\r\nb" } }, /headers\.x-note: a value without line breaks/);
    refused({ url: "https://store.example.com/r/{id}", headers: { authorization: { prefix: "Bearer ", value: "the-token" } } }, /must be a reference to a secret|must be a text/);
    // the template: only {id}, {name} and {format}, and never in the host
    refused({ url: "https://store.example.com/r/{user}" }, /\{user\} is not a placeholder/);
    refused({ url: "https://{name}.example.com/r/{id}" }, /the host written out/);
    refused({ url: "http://store.example.com/r/{id}" }, /an https:\/\/ address/);
    refused({ url: "https://store.example.com/r/{id}#x" }, /without a fragment/);
    refused({ url: "https://store.example.com/r/{id}", method: "POST" }, /output\.upload\.link: a POST names the stored report/);
    refused({ url: "https://store.example.com/r/{id}", headers: { authorization: { prefix: "Bearer " } } }, /headers\.authorization\.value: the secret reference is missing/);
    // a query may hold a signature (an Azure SAS token): such an address is never shown as the link
    refused({ url: "https://acct.blob.core.example.com/reports/{id}.{format}?sv=2026-01-01&sig=SAS-SECRET" }, /output\.upload\.link: an address with a query is not shown as the link/);
    refused({ url: "https://store.example.com/r/{id}", method: "PATCH" }, /method: must be one of PUT, POST/);
    refused({ url: "https://store.example.com/r/{id}", timeMs: 500 }, /timeMs: from 1000 to 600000/);
    refused({ url: "https://store.example.com/r/{id}", bind: "anyone" }, /bind: must be one of none, once, signIn/);
    // one link per report: the store's or the web server's at output.baseUrl
    refused({ url: "https://store.example.com/r/{id}" }, /next to output\.baseUrl: choose one/, { baseUrl: "https://files.example.com/" });
    assert.throws(() => validateOptions({ sources: SOURCES, output: { upload: { url: "https://store.example.com/r/{id}" } } }), /output\.upload: needs output\.dir/);
    validateOptions({ ...base, output: { dir: "out", upload: { url: "https://store.example.com/reports/{id}/{name}.{format}", headers: { authorization: { prefix: "Bearer ", value: { file: "secrets/store" } }, "x-bucket": "reports" } } } });
});

test("the template's values: a random id, the report's name as a safe slug, the format", () => {
    assert.equal(nameSlug("Sales by region (Q3/2026)"), "Sales-by-region-Q3-2026");
    assert.equal(nameSlug("../../etc/passwd"), "etc-passwd");
    assert.equal(nameSlug(".."), "report");
    assert.equal(nameSlug("Übersicht Größe"), "Ubersicht-Gro-e");
    assert.equal(nameSlug("x".repeat(200)).length, 80);
    assert.equal(nameSlug("日本"), "report");
    assert.equal(fillTemplate("https://s.example.com/r/{id}/{name}.{format}?n={name}", { id: "AbC_-1", name: "a b/c", format: "xlsx" }), "https://s.example.com/r/AbC_-1/a-b-c.xlsx?n=a-b-c");
});

test("an address from an answer: https://, on the list, no user name, no control characters, at most 2048 characters", () => {
    const list = ["https://files.example.com"];
    assert.equal(checkedAddress("https://files.example.com/f/1?sig=x", list, 2048)?.href, "https://files.example.com/f/1?sig=x");
    assert.equal(checkedAddress("http://files.example.com/f/1", list, 2048), null);
    assert.equal(checkedAddress("https://evil.example.com/f/1", list, 2048), null);
    assert.equal(checkedAddress("https://files.example.com.evil.example/f/1", list, 2048), null);
    assert.equal(checkedAddress("https://user@files.example.com/f/1", list, 2048), null);
    // URL itself would drop the tab and the line break and pass the address
    assert.equal(checkedAddress("https://files.example.com/f/\t1", list, 2048), null);
    assert.equal(checkedAddress("https://files.example.com/f/1\n", list, 2048), null);
    assert.equal(checkedAddress("javascript:alert(1)", list, 2048), null);
    assert.equal(checkedAddress(42, list, 2048), null);
    const long = `https://files.example.com/${"a".repeat(2048 - 26)}`;
    assert.equal(long.length, 2048);
    assert.ok(checkedAddress(long, list, 2048));
    assert.equal(checkedAddress(`${long}a`, list, 2048), null);
    // a relative Location is the store's own
    assert.equal(checkedAddress("/f/2", list, 2048, "https://files.example.com/upload")?.href, "https://files.example.com/f/2");
});

test("an expiry from an answer: a future time in one form, else none", () => {
    const now = Date.UTC(2026, 10, 15, 8, 0, 0);
    assert.equal(expiryOf("2026-11-15T08:59:59+01:00", now), null);
    assert.equal(expiryOf("2026-11-15T10:30:00.987Z", now), "2026-11-15T10:30:00Z");
    assert.equal(expiryOf(now / 1000 + 3600, now), "2026-11-15T09:00:00Z");
    assert.equal(expiryOf("tomorrow <script>", now), null);
    assert.equal(expiryOf("2030-01-01T00:00:00Z", now), null);
    assert.equal(expiryOf(null, now), null);
});

test("which report goes to the store: open sources; closed ones only to bound links, on REST only with results; never a draft", () => {
    const none = { bind: /** @type {const} */ ("none") };
    const signIn = { bind: /** @type {const} */ ("signIn") };
    const how = { closed: false, surface: /** @type {const} */ ("mcp"), results: false, draft: false };
    assert.equal(storeFor(null, how), false);
    assert.equal(storeFor(none, how), true);
    assert.equal(storeFor(none, { ...how, closed: true }), false);
    // signIn: only for a caller with an issuer and subject the store can check (as the server's own sign-in links)
    assert.equal(storeFor(signIn, { ...how, closed: true }), false);
    assert.equal(storeFor(signIn, { ...how, closed: true, signedIn: true }), true);
    assert.equal(storeFor({ bind: "once" }, { ...how, closed: true }), true);
    assert.equal(storeFor(signIn, { ...how, closed: true, signedIn: true, surface: "rest" }), false);
    assert.equal(storeFor(signIn, { ...how, closed: true, signedIn: true, surface: "rest", results: true }), true);
    assert.equal(storeFor(none, { ...how, draft: true }), false);
});

test("presigned: the presign service gets the report's facts and the credential, the bucket the file with the service's headers and none of the credential; the result shows the store's link", async () => {
    routes.set("POST /presign", presignRoute());
    routes.set("PUT /b/report-1", bucket());
    const { context, files, log } = await contextOf(presignOptions());
    try {
        const out = await withRequestId("Up1oad_Id00", () => deliver(context, FILE, { ...MCP_HOW, sourceClosed: false }));
        assert.match(String(out?.url), new RegExp(`^${origin("files")}/f/report-1\\?sig=`));
        assert.match(String(out?.expiresAt), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        assert.equal(out?.bound, "none");
        assert.equal(out?.filename, "Sales by region.csv");
        assert.match(String(out?.note), /^Open the link in your browser; it works until \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\.$/);
        // the file stays in the output directory (keepLocal) under its plain name: no built-in link's prefix
        assert.deepEqual(files(), ["Sales by region.pivotkit-out.csv"]);
        const [presign, put] = asked;
        assert.deepEqual([presign.method, presign.host, presign.path], ["POST", "store.example.test", "/presign"]);
        assert.equal(presign.headers.authorization, `Bearer ${STORE_TOKEN}`);
        assert.equal(presign.headers["content-type"], "application/json");
        assert.deepEqual(JSON.parse(presign.body.toString("utf8")), { filename: "Sales by region.csv", mediaType: "text/csv;charset=utf-8", bytes: CSV.length, sha256: createHash("sha256").update(CSV).digest("hex") });
        assert.deepEqual([put.method, put.host], ["PUT", "bucket.example.test"]);
        assert.equal(put.headers.authorization, undefined, "the operator's credential goes to the presign address only");
        assert.ok(!JSON.stringify(put.headers).includes(STORE_TOKEN));
        assert.equal(put.headers["x-amz-meta-origin"], "pivotkit");
        assert.equal(put.headers["content-type"], "text/csv;charset=utf-8");
        assert.equal(put.headers["content-length"], String(CSV.length));
        assert.deepEqual(new Uint8Array(put.body), CSV);
        const said = log.find((l) => l.message === "report uploaded");
        assert.equal(said?.requestId, "Up1oad_Id00");
        assert.ok(!JSON.stringify(log).includes(SIGNATURE));
    } finally {
        await context.close();
    }
});

test("a report over a closed source never goes to a store whose links anyone can open: no request at all, the server's own delivery", async () => {
    routes.set("POST /presign", presignRoute());
    routes.set("PUT *", bucket());
    const { context, files } = await contextOf(presignOptions());
    try {
        const out = await deliver(context, FILE, { ...MCP_HOW, sourceClosed: true });
        assert.equal(out?.url, undefined);
        assert.equal(out?.note, NO_LINK_NOTE);
        assert.equal(asked.length, 0);
        // a source whose state is not known counts as closed
        await deliver(context, FILE, { ...MCP_HOW, sourceClosed: undefined });
        assert.equal(asked.length, 0);
        assert.equal(files().length, 2);
    } finally {
        await context.close();
    }
});

test("bound store links (signIn): a report over a closed source goes there for a signed-in person, with their binding (never the subject); without a subject, a REST program without results, a draft: not uploaded", async () => {
    routes.set("POST /presign", presignRoute());
    routes.set("PUT *", bucket());
    process.env.PIVOTKIT_TEST_DL_KEY = DL_KEY;
    const { context } = await contextOf(presignOptions({ bind: "signIn" }, { downloads: { key: { env: "PIVOTKIT_TEST_DL_KEY" } } }));
    // the route's state holds the key the binding is made with (HTTP serving creates it)
    createDownloadHandler(context);
    const person = { ...MCP_HOW, caller: { ...MCP_HOW.caller, issuer: "https://auth.example.com/", subject: "alice-1234" } };
    try {
        const anonymous = await deliver(context, FILE, { ...MCP_HOW, sourceClosed: true });
        assert.equal(anonymous?.url, undefined, "no subject: the server's own delivery");
        assert.equal(anonymous?.note, NO_LINK_NOTE);
        assert.equal(asked.length, 0);
        const out = await deliver(context, FILE, { ...person, sourceClosed: true });
        assert.equal(out?.bound, "signIn");
        assert.match(String(out?.note), /^Open the link in your browser and sign in at the store; it works until /);
        assert.equal(asked.length, 2);
        const sent = JSON.parse(asked[0].body.toString("utf8"));
        // HMAC of [issuer, subject] under the key's own HKDF subkey for this purpose, separate from the links' keys
        const uploadKey = Buffer.from(hkdfSync("sha256", Buffer.from(DL_KEY, "utf8"), Buffer.alloc(0), "pivotkit downloads: upload binding v1", 32));
        assert.equal(sent.subject, createHmac("sha256", uploadKey).update(JSON.stringify(["https://auth.example.com/", "alice-1234"])).digest("base64url"));
        const keys = subkeysOf(Buffer.from(DL_KEY, "utf8"));
        assert.notDeepEqual(keys.upload, keys.subject);
        // the same person's next report carries the same binding
        await deliver(context, FILE, { ...person, sourceClosed: true });
        assert.equal(JSON.parse(asked[2].body.toString("utf8")).subject, sent.subject);
        assert.ok(!asked[0].body.toString("utf8").includes("alice-1234"));
        const rest = await deliver(context, FILE, { ...person, surface: "rest", policy: /** @type {any} */ ({ results: false }), sourceClosed: true });
        assert.equal(rest?.url, undefined);
        assert.equal(asked.length, 4);
        const program = await deliver(context, FILE, { ...person, surface: "rest", policy: /** @type {any} */ ({ results: true }), sourceClosed: true });
        assert.equal(program?.bound, "signIn");
        assert.equal(asked.length, 6);
        const draft = await deliver(context, { ...FILE, extension: "report.json", mediaType: "application/json" }, { ...MCP_HOW, sourceClosed: false, draft: true });
        assert.equal(draft?.url, undefined);
        assert.equal(asked.length, 6);
    } finally {
        await context.close();
    }
});

/** Delivers FILE over an open source and returns the error (an OperationError) and the context's log. */
async function failing(upload = {}, more = {}) {
    const { context, files, log } = await contextOf(presignOptions(upload, more));
    try {
        const error = await failureOf(withRequestId("Fai1ed_Id00", () => deliver(context, FILE, { ...MCP_HOW, sourceClosed: false })));
        return { error, log, files: files(), code: log.find((l) => l.upload)?.upload };
    } finally {
        await context.close();
    }
}

test("a presign answer that is not followed: an address off allowOrigins, http://, a credential or a line break in its headers, a link off linkOrigins, an answer over 64 KiB", async () => {
    const cases = [
        [{ uploadUrl: `${origin("evil")}/b/x?X-Sig=${SIGNATURE}` }, "UPLOAD_URL_ORIGIN"],
        [{ uploadUrl: `http://bucket.example.test:${port}/b/x` }, "UPLOAD_URL_SCHEME"],
        [{ uploadUrl: `${origin("bucket")}/b/\nx` }, "UPLOAD_URL_CHARS"],
        [{ uploadUrl: undefined }, "UPLOAD_URL_MISSING"],
        [{ headers: { authorization: "Bearer stolen" } }, "UPLOAD_HEADERS"],
        [{ headers: { Cookie: "a=b" } }, "UPLOAD_HEADERS"],
        [{ headers: { "x-amz-meta-a": "x\r\nset-cookie: a=b" } }, "UPLOAD_HEADERS"],
        [{ headers: { "proxy-authorization": "x" } }, "UPLOAD_HEADERS"],
        // the body's type and encoding are the report's; proxy headers are not the store's to set
        [{ headers: { "content-type": "text/html" } }, "UPLOAD_HEADERS"],
        [{ headers: { "Content-Encoding": "gzip" } }, "UPLOAD_HEADERS"],
        [{ headers: { expect: "100-continue" } }, "UPLOAD_HEADERS"],
        [{ headers: { "x-forwarded-for": "10.0.0.1" } }, "UPLOAD_HEADERS"],
        [{ headers: { forwarded: "for=10.0.0.1" } }, "UPLOAD_HEADERS"],
        [{ downloadUrl: `${origin("evil")}/f/1?sig=${SIGNATURE}` }, "LINK_ORIGIN"],
        [{ downloadUrl: `https://user@files.example.test:${port}/f/1` }, "LINK_USERINFO"],
        [{ downloadUrl: `${origin("files")}/f/${"a".repeat(2100)}` }, "LINK_LENGTH"],
        [{ downloadUrl: 42 }, "LINK_MISSING"],
        [{ padding: "x".repeat(65_536) }, "PRESIGN_TOO_LARGE"]
    ];
    for (const [more, code] of cases) {
        routes.set("POST /presign", presignRoute(more));
        routes.set("PUT *", bucket());
        asked = [];
        const { error, log, files, code: logged } = await failing();
        assert.ok(error instanceof OperationError, code);
        assert.deepEqual([error.code, error.status, error.details?.retryable, error.details?.requestId], ["UPLOAD_FAILED", 502, false, "Fai1ed_Id00"], code);
        // the caller gets a fixed text; the code is the operator's, on the log
        assert.equal(error.message, "the report could not be stored");
        assert.equal(logged, code);
        // nothing went to an address the answer named off the list
        assert.ok(!asked.some((a) => a.host === "evil.example.test"), code);
        if (code.startsWith("UPLOAD_URL") || code === "UPLOAD_HEADERS" || code === "PRESIGN_TOO_LARGE") {
            assert.equal(asked.filter((a) => a.method === "PUT").length, 0, code);
        }
        // the file stays in the output directory; the log says the code, never the answer
        assert.equal(files.length, 1, code);
        const warned = log.find((l) => l.upload === code);
        assert.equal(warned?.requestId, "Fai1ed_Id00", code);
        assert.ok(!JSON.stringify(log).includes(SIGNATURE), code);
        assert.ok(!JSON.stringify(log).includes("stolen"), code);
    }
});

test("the store's own refusals and failures: a code each, retryable where trying again may work; a PUT is tried once more after a 503, a POST never", async () => {
    // the presign service refuses (its body never shown)
    routes.set("POST /presign", json({ error: "STORE-BODY-MARKER denied" }, 403));
    let r = await failing();
    assert.deepEqual([r.code, r.error.details.retryable], ["PRESIGN_403", false]);
    assert.ok(!JSON.stringify(r.log).includes("STORE-BODY-MARKER"));
    // the secret cannot be read: never sent without it
    asked = [];
    r = await failing({ presign: { ...presignOptions().output.upload.presign, headers: { authorization: { prefix: "Bearer ", value: { env: "PIVOTKIT_TEST_NOT_SET" } } } } });
    assert.deepEqual([r.code, asked.length], ["SECRET", 0]);
    // the bucket fails once with 503: a PUT is tried again and stored
    routes.set("POST /presign", presignRoute());
    let puts = 0;
    routes.set("PUT *", (entry, res) => (++puts === 1 ? json({ error: "busy" }, 503) : bucket())(entry, res));
    const { context } = await contextOf(presignOptions());
    try {
        const out = await deliver(context, FILE, { ...MCP_HOW, sourceClosed: false });
        assert.match(String(out?.url), /\/f\/report-1\?/);
        assert.equal(puts, 2);
    } finally {
        await context.close();
    }
    // twice 503: retryable for the person, two tries only
    puts = 0;
    routes.set("PUT *", (entry, res) => {
        puts++;
        json({ error: "busy" }, 503)(entry, res);
    });
    r = await failing();
    assert.deepEqual([r.code, r.error.details.retryable, puts], ["STORE_503", true, 2]);
    // a POST store is never tried twice
    routes.set("POST /r", json({ error: "busy" }, 503));
    asked = [];
    r = await failing({ presign: undefined, linkOrigins: undefined, url: `${origin("store")}/r?id={id}`, method: "POST", link: "/url" });
    assert.deepEqual([r.code, asked.filter((a) => a.method === "POST").length], ["STORE_503", 1]);
});

test("loopback and private addresses only with intranet: the store on loopback is refused before any request", async () => {
    routes.set("POST /presign", presignRoute());
    const r = await failing({ intranet: false });
    assert.equal(r.code, "PRESIGN_REFUSED_ADDRESS");
    assert.equal(asked.length, 0);
});

test("timeMs is presign and upload together", async () => {
    const slow = (route) => (entry, res) => setTimeout(() => route(entry, res), 700);
    routes.set("POST /presign", slow(presignRoute()));
    routes.set("PUT *", slow(bucket()));
    const started = Date.now();
    const r = await failing({ timeMs: 1000 });
    assert.equal(r.code, "TIMEOUT");
    assert.equal(r.error.details.retryable, true);
    assert.ok(Date.now() - started < 2500, "one budget, not one per request");
});

test("at most two uploads at once: the third waits for a slot", async () => {
    routes.set("POST /presign", presignRoute());
    /** @type {Array<() => void>} */
    const held = [];
    routes.set("PUT *", (entry, res) => held.push(() => bucket()(entry, res)));
    const { context } = await contextOf(presignOptions());
    try {
        const three = [1, 2, 3].map(() => deliver(context, FILE, { ...MCP_HOW, sourceClosed: false }));
        const until = async (check) => {
            for (let i = 0; i < 200 && !check(); i++) {
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        };
        await until(() => held.length === 2);
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.equal(held.length, 2, "two uploads in the bucket");
        assert.equal(asked.filter((a) => a.method === "POST").length, 2, "the third has not even presigned");
        held.shift()?.();
        await until(() => held.length === 2);
        held.splice(0).forEach((go) => go());
        const out = await Promise.all(three);
        assert.equal(new Set(out.map((o) => o?.url)).size, 3);
    } finally {
        await context.close();
    }
});

test("keepLocal false: the local copy is removed once the store has it, and kept when the upload fails", async () => {
    routes.set("POST /presign", presignRoute());
    routes.set("PUT *", bucket());
    const { context, files, log } = await contextOf(presignOptions({ keepLocal: false }));
    try {
        const out = await deliver(context, FILE, { ...MCP_HOW, sourceClosed: false });
        assert.ok(out?.url);
        assert.equal(out?.path, undefined);
        assert.deepEqual(files(), []);
        routes.set("PUT *", bucket(500));
        await assert.rejects(deliver(context, FILE, { ...MCP_HOW, sourceClosed: false }), /^OperationError: the report could not be stored$/);
        assert.equal(log.findLast((l) => l.upload)?.upload, "STORE_500");
        assert.deepEqual(files(), ["Sales by region.pivotkit-out.csv"]);
    } finally {
        await context.close();
    }
});

test("an address template: a PUT's link is the address; a POST's from its answer or a relative Location; the operator's headers go to the store", async () => {
    routes.set("PUT *", bucket(201));
    let r = await contextOf({ sources: SOURCES, output: { dir: "out", upload: { url: `${origin("store")}/reports/{id}/{name}.{format}`, headers: { authorization: { prefix: "Bearer ", value: { env: "PIVOTKIT_TEST_STORE_TOKEN" } }, "x-bucket": "reports" }, intranet: true } } });
    try {
        const out = await deliver(r.context, { ...FILE, name: "Sales / by region" }, { ...MCP_HOW, sourceClosed: false });
        assert.match(String(out?.url), new RegExp(`^${origin("store")}/reports/[A-Za-z0-9_-]{22}/Sales-by-region\\.csv$`));
        assert.equal(out?.expiresAt, undefined);
        assert.equal(out?.note, "Open the link in your browser.");
        assert.equal(asked[0].headers.authorization, `Bearer ${STORE_TOKEN}`);
        assert.equal(asked[0].headers["x-bucket"], "reports");
    } finally {
        await r.context.close();
    }
    routes.set("POST /upload", (entry, res) => {
        res.writeHead(201, { location: "/files/abc" });
        res.end();
    });
    asked = [];
    r = await contextOf({ sources: SOURCES, output: { dir: "out", upload: { url: `${origin("store")}/upload?id={id}&name={name}`, method: "POST", link: "header:location", intranet: true } } });
    try {
        const out = await deliver(r.context, FILE, { ...MCP_HOW, sourceClosed: false });
        assert.equal(out?.url, `${origin("store")}/files/abc`);
        assert.match(asked[0].path, /^\/upload\?id=[A-Za-z0-9_-]{22}&name=Sales-by-region$/);
    } finally {
        await r.context.close();
    }
    // a Location to another origin is not shown
    routes.set("POST *", (entry, res) => {
        res.writeHead(201, { location: `${origin("evil")}/files/abc` });
        res.end();
    });
    r = await contextOf({ sources: SOURCES, output: { dir: "out", upload: { url: `${origin("store")}/upload/{id}`, method: "POST", link: "header:location", intranet: true } } });
    try {
        await assert.rejects(deliver(r.context, FILE, { ...MCP_HOW, sourceClosed: false }), /could not be stored/);
        assert.equal(r.log.findLast((l) => l.upload)?.upload, "LINK_ORIGIN");
    } finally {
        await r.context.close();
    }
});

test("UPLOAD_FAILED on REST and MCP: a fixed text with the request id; no presigned address, token or answer body in an answer or the log, also at debug", async () => {
    routes.set("POST /presign", presignRoute());
    routes.set("PUT *", json({ error: "STORE-BODY-MARKER bucket full" }, 507));
    const dir = workspace({ "sales.csv": SALES_CSV });
    const s = await restServer({ ...presignOptions(), baseDir: dir, log: "debug" }, { enable: ["rest", "mcp"] });
    const client = new Client({ name: "upload-failed", version: "1.0.0" });
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`)));
        const rest = await call(`${s.api}/views/render`, { body: { source: "open", view: BY_REGION, format: "csv" } });
        assert.deepEqual([rest.status, rest.data.code, rest.data.detail, rest.data.retryable], [502, "UPLOAD_FAILED", serverTextOf("UPLOAD_FAILED"), false]);
        assert.match(rest.data.requestId, /^[A-Za-z0-9_-]{11}$/);
        const mcp = await client.callTool({ name: "render_view", arguments: { source: "open", view: BY_REGION, format: "xlsx" } });
        assert.equal(mcp.isError, true);
        const text = String(/** @type {any} */ (mcp.content)[0].text);
        assert.match(text, /^UPLOAD_FAILED: the report was made but could not be stored; give the operator the request id \(source open; trying again will not help; request id [A-Za-z0-9_-]{11}\)$/);
        // the log names the same id as the answer
        assert.ok(s.log.some((l) => l.upload === "STORE_507" && l.requestId === rest.data.requestId));
        const everything = JSON.stringify([rest.data, mcp, s.log]);
        for (const secret of [SIGNATURE, STORE_TOKEN, "STORE-BODY-MARKER", "bucket.example.test", "/b/report-"]) {
            assert.ok(!everything.includes(secret), secret);
        }
        // and when the store takes it: the store's link in the result and the MCP resource_link
        routes.set("PUT *", bucket());
        const ok = await call(`${s.api}/views/render`, { body: { source: "open", view: BY_REGION, format: "csv" } });
        assert.equal(ok.status, 200);
        assert.match(ok.data.output.url, new RegExp(`^${origin("files")}/f/report-\\d\\?sig=`));
        assert.equal(ok.data.output.bound, "none");
        const linked = await client.callTool({ name: "render_view", arguments: { source: "open", view: BY_REGION, format: "csv" } });
        const link = /** @type {any[]} */ (linked.content).find((c) => c.type === "resource_link");
        assert.match(link?.uri, new RegExp(`^${origin("files")}/f/report-\\d\\?sig=`));
        assert.match(String(link?.name), /\.csv$/);
    } finally {
        await client.close();
        await s.close();
    }
});

test("REST and MCP over a closed source with bind none: nothing goes to the store; a template store's link through MCP, without an expiry", async () => {
    routes.set("PUT *", bucket(201));
    const dir = workspace({ "sales.csv": SALES_CSV });
    const s = await restServer({ sources: SOURCES, output: { dir: "out", upload: { url: `${origin("store")}/reports/{id}/{name}.{format}`, intranet: true } }, baseDir: dir }, { enable: ["rest", "mcp"] });
    const client = new Client({ name: "upload-closed", version: "1.0.0" });
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`${s.url}/mcp`)));
        const rest = await call(`${s.api}/views/render`, { body: { source: "closed", view: BY_REGION, format: "csv" } });
        assert.equal(rest.status, 200);
        assert.equal(rest.data.output.url, undefined);
        const mcp = await client.callTool({ name: "render_view", arguments: { source: "closed", view: BY_REGION, format: "csv" } });
        assert.ok(!(/** @type {any[]} */ (mcp.content)).some((c) => c.type === "resource_link"));
        assert.equal(/** @type {any} */ (mcp.structuredContent)?.output?.url, undefined);
        assert.equal(asked.length, 0, "a closed report never reaches a store whose links anyone can open");
        const open = await client.callTool({ name: "render_view", arguments: { source: "open", view: BY_REGION, format: "csv" } });
        const output = /** @type {any} */ (open.structuredContent)?.output;
        assert.match(String(output?.url), new RegExp(`^${origin("store")}/reports/[A-Za-z0-9_-]{22}/`));
        assert.deepEqual([output?.bound, output?.expiresAt, output?.note], ["none", undefined, "Open the link in your browser."]);
        const link = /** @type {any[]} */ (open.content).find((c) => c.type === "resource_link");
        assert.equal(link?.uri, output?.url);
        assert.equal(asked.length, 1);
    } finally {
        await client.close();
        await s.close();
    }
});

test("check-config: where reports go and which go there", async () => {
    const dir = workspace();
    const result = await checkConfig({ ...presignOptions(), baseDir: dir }, { http: true, env: {} });
    assert.match(result.text, new RegExp(`Upload:\\n  target: presigned via ${origin("store")}/presign \\(uploads to ${origin("bucket")}\\), PUT, up to 1024 MiB, 30 s, may reach loopback and private addresses \\(intranet\\)`));
    assert.match(result.text, new RegExp(`  reports over open sources \\(open\\): store links \\(bind none, as you declared it; pivotkit does not check the store\\), from ${origin("files")}`));
    assert.match(result.text, / {2}reports over closed sources \(closed\) and reports over data sent in requests \(inline:\): not uploaded \(the store's links work for anyone who has them\); no link/);
    assert.match(result.text, / {2}schedule drafts are not uploaded/);
    // the downloads section leaves open sources to the upload section
    assert.doesNotMatch(result.text, /reports over open sources \(open\): plain links/);
    assert.match(result.text, /PROBLEM: output\.upload\.presign\.headers\.authorization: \$PIVOTKIT_TEST_STORE_TOKEN is not set/);
    const once = await checkConfig({ ...presignOptions({ bind: "once", maxBytes: 52_428_800, timeMs: 30_000 }), baseDir: dir }, { http: true, env: { PIVOTKIT_TEST_STORE_TOKEN: "x" }, rest: true });
    assert.match(once.text, /up to 50 MiB, 30 s/);
    assert.match(once.text, /reports over closed sources \(closed\) and reports over data sent in requests \(inline:\): store links \(bind once: you declared that each link works once\).*; REST programs get them only with results: true/);
    assert.match(once.text, /warning: one-time store links/);
    assert.doesNotMatch(once.text, /subject binding/);
    const signIn = await checkConfig({ ...presignOptions({ bind: "signIn" }), baseDir: dir }, { http: true, env: { PIVOTKIT_TEST_STORE_TOKEN: "x" } });
    assert.match(signIn.text, /warning: output\.downloads\.key is not set: the subject binding the presign service receives changes on every restart and differs between replicas; set output\.downloads\.key/);
    const keyed = await checkConfig({ ...presignOptions({ bind: "signIn" }, { downloads: { key: { env: "K" } } }), baseDir: dir }, { http: true, env: { PIVOTKIT_TEST_STORE_TOKEN: "x", K: DL_KEY } });
    assert.doesNotMatch(keyed.text, /subject binding/);
    assert.doesNotMatch(once.text, /PROBLEM/);
    assert.ok(existsSync(join(dir, "data", "sales.csv")));
    // an address's query is not printed: it may hold a signature
    const sas = await checkConfig({ sources: SOURCES, output: { dir: "out", upload: { url: "https://acct.blob.core.example.com/reports/{id}.{format}?sv=2026-01-01&sig=SAS-SECRET", link: "header:location" } }, baseDir: dir }, { http: true, env: {} });
    assert.match(sas.text, /target: https:\/\/acct\.blob\.core\.example\.com\/reports\/\{id\}\.\{format\}\?\.\.\., PUT/);
    assert.ok(!sas.text.includes("SAS-SECRET"));
});

/** The file descriptors this process has open (macOS and Linux). */
const openFds = () => readdirSync(platform === "linux" ? "/proc/self/fd" : "/dev/fd").length;

test("a refused or timed-out upload closes its file: the count of open files stays flat", { skip: platform === "win32" }, async () => {
    /** @type {import("node:http").ServerResponse[]} */
    const unanswered = [];
    // accepts and never answers: the upload times out (its connections are closed before counting)
    routes.set("PUT *", (_entry, res) => unanswered.push(res));
    const cases = [
        ["metadata address", { url: `https://meta.example.test:${port}/r/{id}` }, "STORE_REFUSED_ADDRESS"],
        ["private address without intranet", { url: `https://private.example.test:${port}/r/{id}`, intranet: false }, "STORE_REFUSED_ADDRESS"],
        ["an IP address as the host", { url: `https://127.0.0.1:${port}/r/{id}` }, "STORE_IP_LITERAL"],
        ["no answer", { url: `${origin("store")}/r/{id}`, timeMs: 1000 }, "TIMEOUT"]
    ];
    for (const [what, upload, code] of cases) {
        const { context, log } = await contextOf({ sources: SOURCES, output: { dir: "out", upload: { intranet: true, ...upload } } });
        try {
            const before = openFds();
            const tries = code === "TIMEOUT" ? 3 : 20;
            for (let i = 0; i < tries; i++) {
                await assert.rejects(deliver(context, FILE, { ...MCP_HOW, sourceClosed: false }), /could not be stored/);
            }
            // the store's side of the timed-out connections, then a moment for closed streams to close their files
            unanswered.splice(0).forEach((res) => res.destroy());
            await new Promise((resolve) => setTimeout(resolve, 300));
            assert.equal(log.findLast((l) => l.upload)?.upload, code, what);
            assert.ok(openFds() - before < tries, `${what}: ${openFds() - before} more open files after ${tries} uploads`);
        } finally {
            await context.close();
        }
    }
});

test("the slot queue is capped: an upload beyond 32 waiting ones fails at once, retryable", async () => {
    routes.set("POST /presign", presignRoute());
    /** @type {Array<() => void>} */
    const held = [];
    let hold = true;
    routes.set("PUT *", (entry, res) => (hold ? held.push(() => bucket()(entry, res)) : bucket()(entry, res)));
    const { context, log } = await contextOf(presignOptions());
    try {
        const waiting = Array.from({ length: 34 }, () => deliver(context, FILE, { ...MCP_HOW, sourceClosed: false }));
        for (let i = 0; i < 200 && held.length < 2; i++) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        const started = Date.now();
        const refused = await failureOf(withRequestId("Queue_Full0", () => deliver(context, FILE, { ...MCP_HOW, sourceClosed: false })));
        assert.ok(Date.now() - started < 1000, "refused at once, not after timeMs");
        assert.deepEqual([refused?.code, refused?.details?.retryable], ["UPLOAD_FAILED", true]);
        assert.equal(log.find((l) => l.requestId === "Queue_Full0" && l.upload)?.upload, "TIMEOUT");
        hold = false;
        held.splice(0).forEach((go) => go());
        assert.equal((await Promise.all(waiting)).filter((o) => o?.url).length, 34);
    } finally {
        await context.close();
    }
});

test("a POST presign whose connection drops is not tried again", async () => {
    routes.set("POST /presign", (entry, res) => res.socket?.destroy());
    const r = await failing();
    assert.equal(r.code, "PRESIGN_NETWORK");
    assert.equal(r.error.details.retryable, true);
    assert.equal(asked.filter((a) => a.path === "/presign").length, 1);
});

test("the presign request gets what is left of timeMs after waiting for a slot, not all of it", async () => {
    let presigns = 0;
    let gaveUp = false;
    const sign = presignRoute();
    routes.set("POST /presign", (entry, res) => {
        presigns++;
        if (presigns < 3) {
            sign(entry, res);
            return;
        }
        // the third presign answers after 800 ms: by then its upload's time (1500 ms, 1000 of them waiting) is up
        let closed = false;
        res.on("close", () => {
            closed = true;
        });
        setTimeout(() => {
            gaveUp = closed;
            if (!closed) {
                sign(entry, res);
            }
        }, 800);
    });
    routes.set("PUT *", (entry, res) => setTimeout(() => bucket()(entry, res), 1000));
    const { context, log } = await contextOf(presignOptions({ timeMs: 1500 }));
    try {
        const three = [1, 2, 3].map((n) => failureOf(withRequestId(`Budget_Id0${n}`, () => deliver(context, FILE, { ...MCP_HOW, sourceClosed: false }))));
        const errors = await Promise.all(three);
        assert.deepEqual(errors.map((e) => e?.code ?? null), [null, null, "UPLOAD_FAILED"]);
        assert.equal(log.find((l) => l.requestId === "Budget_Id03" && l.upload)?.upload, "TIMEOUT");
        await new Promise((resolve) => setTimeout(resolve, 400));
        assert.equal(gaveUp, true, "the presign request was ended at the deadline");
    } finally {
        await context.close();
    }
});

test("keepLocal false: a 2xx with a link that is not shown keeps the local copy (the store has an orphan)", async () => {
    routes.set("POST /presign", presignRoute({ downloadUrl: `${origin("evil")}/f/1` }));
    routes.set("PUT *", bucket());
    const r = await failing({ keepLocal: false });
    assert.equal(r.code, "LINK_ORIGIN");
    assert.equal(asked.filter((a) => a.method === "PUT").length, 1, "the store took the report");
    assert.deepEqual(r.files, ["Sales by region.pivotkit-out.csv"]);
});

test("check-config: a target on a loopback, private or IP address without intranet is a problem, as the upload would refuse it", async () => {
    const dir = workspace();
    const local = await checkConfig({ sources: SOURCES, output: { dir: "out", upload: { url: "https://localhost:8443/r/{id}" } }, baseDir: dir }, { http: true, env: {} });
    assert.match(local.text, /PROBLEM: output\.upload\.url: localhost resolves to (127\.0\.0\.1|::1), a loopback or private address, which uploads refuse without output\.upload\.intranet: true/);
    const literal = await checkConfig({ sources: SOURCES, output: { dir: "out", upload: { url: "https://10.1.2.3/r/{id}" } }, baseDir: dir }, { http: true, env: {} });
    assert.match(literal.text, /PROBLEM: output\.upload\.url: 10\.1\.2\.3 is an IP address, which uploads refuse; name the server/);
    const intranet = await checkConfig({ sources: SOURCES, output: { dir: "out", upload: { url: "https://localhost:8443/r/{id}", intranet: true } }, baseDir: dir }, { http: true, env: {} });
    assert.doesNotMatch(intranet.text, /PROBLEM/);
    // {id} is part of every template: refused at start, and so by check-config
    await assert.rejects(checkConfig({ sources: SOURCES, output: { dir: "out", upload: { url: "https://store.example.com/r/{name}.{format}" } }, baseDir: dir }, { http: true, env: {} }), /output\.upload\.url: \{id\} is missing/);
});

/** Sources whose data belongs to one person though every field is shown: a claim-bound code source; and an open one. */
const ROWS = [
    { Region: "North", Team: "a", Sales: 10 },
    { Region: "South", Team: "b", Sales: 20 }
];
const OAUTH = Object.freeze({ mode: "oauth", issuer: "https://auth.example.test/", resource: "https://pivotkit.example.test/mcp" });
const PERSONAL = {
    shown: { load: async () => ROWS, policy: { default: "show" } },
    team: { load: async () => ROWS, policy: { default: "show" }, params: { team: { type: "string", required: true, claim: "team", pattern: "^[a-z0-9-]{1,40}$" } } }
};

test("bind none: one person's data never goes to the store: data sent in the request, a claim-bound source with every field shown; an open source does", async () => {
    routes.set("PUT *", bucket(201));
    const { context } = await contextOf({ sources: PERSONAL, auth: OAUTH, output: { dir: "out", upload: { url: `${origin("store")}/reports/{id}/{name}.{format}`, intranet: true } } });
    const ana = callerOf("oauth", { token: "jwt", clientId: "claude", scopes: [], expiresAt: 0, extra: { subject: "ana", issuer: OAUTH.issuer, groups: [], claims: { team: "a" } } });
    try {
        const open = await present(context, "render_view", { source: "shown", view: BY_REGION, format: "csv" }, ana, { surface: "mcp" });
        assert.match(String(open.result.output?.url), new RegExp(`^${origin("store")}/reports/`));
        assert.equal(asked.length, 1);
        const team = await present(context, "render_view", { source: "team", view: BY_REGION, format: "csv" }, ana, { surface: "mcp" });
        assert.equal(team.result.output?.url, undefined);
        assert.equal(team.result.output?.note, NO_LINK_NOTE);
        const data = { columns: ["Region", "Sales"], rows: [["North", 10], ["South", 20]], rowCount: 2 };
        const inline = await present(context, "render_view", { source: "inline:", data, view: BY_REGION, format: "csv", name: "Mine" }, ana, { surface: "mcp" });
        assert.equal(inline.result.output?.url, undefined);
        assert.equal(inline.result.output?.note, NO_LINK_NOTE);
        assert.equal(asked.length, 1, "neither report reached the store");
    } finally {
        await context.close();
    }
});

test("check-config's Upload section names per-person sources and data sent in requests as the Delivery section does", async () => {
    const dir = workspace();
    const options = { sources: { ...PERSONAL, sales: { file: "data/sales.csv" } }, auth: OAUTH, output: { dir: "out", upload: { url: "https://store.example.com/reports/{id}/{name}.{format}" } }, baseDir: dir };
    const text = (await checkConfig(options, { http: true, env: {} })).text;
    const upload = text.slice(text.indexOf("Upload:"));
    assert.match(upload, /^ {2}per person \(counted as closed\): team \(a parameter bound to a claim\), data sent in requests \(inline:\)$/m);
    assert.match(upload, /^ {2}reports over closed sources \(team, sales\) and reports over data sent in requests \(inline:\): not uploaded \(the store's links work for anyone who has them\)/m);
    assert.match(upload, /^ {2}reports over open sources \(shown\): store links/m);
    const bound = (await checkConfig({ ...options, output: { dir: "out", upload: { ...options.output.upload, bind: "once" } } }, { http: true, env: {} })).text;
    assert.match(bound.slice(bound.indexOf("Upload:")), /^ {2}reports over closed sources \(team, sales\) and reports over data sent in requests \(inline:\): store links \(bind once/m);
});

test("a presign answer that is no JSON object (an array, a text, null, not JSON) is PRESIGN_ANSWER, as the docs say", async () => {
    const answers = [JSON.stringify([{ uploadUrl: `${origin("bucket")}/b/x?X-Sig=${SIGNATURE}` }]), JSON.stringify("text"), "null", "<html>"];
    for (const body of answers) {
        routes.set("POST /presign", (entry, res) => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(body);
        });
        routes.set("PUT *", bucket());
        asked = [];
        const { error, code } = await failing();
        assert.equal(error.code, "UPLOAD_FAILED", body);
        assert.equal(code, "PRESIGN_ANSWER", body);
        assert.equal(asked.filter((a) => a.method === "PUT").length, 0, body);
    }
});
