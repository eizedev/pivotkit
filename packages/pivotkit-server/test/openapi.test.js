// The OpenAPI document: valid OpenAPI 3.1, the committed copy (docs/openapi.json) what the code
// generates, every route in it answered by the server, each example accepted by the input schema and
// its output by the output schema, and the served copy as the operator configures it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Validator } from "@cfworker/json-schema";
import { checkInput } from "pivotkit-report/operations";
import { openApiDocument, REST_ROUTES } from "pivotkit-server/rest";
import { presentedInput, presentedOutput } from "pivotkit-server/internal";
import { RECORDS_INPUT, RECORDS_OUTPUT } from "../src/records.js";
import { TOKEN, call, restServer, workspace } from "./helpers.js";

const META = JSON.parse(readFileSync(new URL("./fixtures/openapi-3.1-schema.json", import.meta.url), "utf8"));

/** Every $ref of a document resolves inside it. */
function unresolved(doc) {
    const missing = [];
    const walk = (node) => {
        if (Array.isArray(node)) {
            node.forEach(walk);
        } else if (node && typeof node === "object") {
            for (const [key, value] of Object.entries(node)) {
                if (key === "$ref" && typeof value === "string") {
                    const target = value.replace(/^#\//, "").split("/").reduce((at, part) => at?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
                    if (target === undefined) {
                        missing.push(value);
                    }
                } else {
                    walk(value);
                }
            }
        }
    };
    walk(doc);
    return missing;
}

test("the document is OpenAPI 3.1 for each sign-in, and every $ref resolves inside it", () => {
    const issuer = { issuer: "https://id.example.com", authorization_endpoint: "https://id.example.com/authorize", token_endpoint: "https://id.example.com/token" };
    for (const options of [{}, { auth: { mode: "none" } }, { auth: { mode: "oauth", issuer: "https://id.example.com", toolScopes: { render_view: ["pivotkit:render"] } }, issuer, requiredScopes: ["pivotkit"], publicUrl: "https://pk.example.com/" }, { auth: { mode: "oauth", issuer: "https://id.example.com" } }, { offers: { params: true, data: true } }]) {
        const doc = openApiDocument(options);
        const result = new Validator(META, "2020-12", false).validate(doc);
        assert.ok(result.valid, JSON.stringify(result.errors.slice(0, 5)));
        assert.deepEqual(unresolved(doc), []);
    }
    const oauth = openApiDocument({ auth: { mode: "oauth", issuer: "https://id.example.com", toolScopes: { render_view: ["pivotkit:render"] } }, issuer, requiredScopes: ["pivotkit"], publicUrl: "https://pk.example.com/" });
    assert.equal(oauth.components.securitySchemes.oauth.flows.authorizationCode.tokenUrl, issuer.token_endpoint);
    assert.deepEqual(oauth.paths["/api/v1/views/render"].post.security, [{ oauth: ["pivotkit", "pivotkit:render"] }]);
    assert.deepEqual(oauth.paths["/api/v1/views/render"].post["x-pivotkit-scopes"], ["pivotkit:render"]);
    assert.equal(oauth.servers[0].url, "https://pk.example.com");
    assert.equal(openApiDocument({ auth: { mode: "none" } }).components.securitySchemes, undefined);
    // the check itself finds a broken document
    const broken = openApiDocument();
    delete broken.info.title;
    broken.paths["/api/v1/sources"].get.responses = "none";
    assert.equal(new Validator(META, "2020-12", false).validate(broken).valid, false);
});

test("docs/openapi.json is what openApiDocument() makes (run node scripts/openapi.js after a change)", () => {
    const committed = JSON.parse(readFileSync(new URL("../../../docs/openapi.json", import.meta.url), "utf8"));
    assert.deepEqual(committed, openApiDocument());
});

test("every example passes its input check and its output schema; the view schema is pivotkit-core's", () => {
    const doc = openApiDocument();
    for (const route of REST_ROUTES) {
        if (route.answer === "records") {
            // the rows route is no operation of the table: its own schemas (records.js)
            assert.doesNotThrow(() => checkInput(RECORDS_INPUT, route.example.input), route.id);
            const result = new Validator(/** @type {any} */ (structuredClone(RECORDS_OUTPUT)), "2020-12", false).validate(route.example.output);
            assert.ok(result.valid, `${route.id}: ${JSON.stringify(result.errors.slice(0, 3))}`);
            continue;
        }
        assert.doesNotThrow(() => checkInput(presentedInput(route.operation, { files: false }), route.example.input), route.id);
        if (route.answer === "json") {
            const result = new Validator(/** @type {any} */ (presentedOutput(route.operation)), "2020-12", false).validate(route.example.output);
            assert.ok(result.valid, `${route.id}: ${JSON.stringify(result.errors.slice(0, 3))}`);
        }
    }
    const view = JSON.parse(readFileSync(new URL(import.meta.resolve("pivotkit-core/schema/view-2.json")), "utf8"));
    assert.deepEqual(Object.keys(doc.components.schemas.View.properties), Object.keys(view.properties));
    for (const def of Object.keys(view.$defs)) {
        assert.ok(doc.components.schemas[`View_${def}`], def);
    }
    // the view inside an input: validated by the bundled schema
    const input = { ...doc.components.schemas.ValidateViewInput, components: doc.components };
    const withComponents = new Validator(/** @type {any} */ ({ ...input, $id: "https://x.example/doc" }), "2020-12", false);
    assert.ok(withComponents.validate({ source: "sales", view: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] } }).valid);
});

test("every route of the document is answered by the server (no 404 or 405), a method it does not give a path is 405, and paths it does not list are 404", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", link: "https://reports.example.com/" } }, policy: { results: true }, output: { dir: "out" }, baseDir: dir });
    try {
        const doc = openApiDocument();
        // as a client builds it: the server's URL, then the path
        const urlOf = (path) => `${new URL(doc.servers[0].url, server.url).href.replace(/\/$/, "")}${path.replace("{id}", "sales")}`;
        for (const [path, methods] of Object.entries(doc.paths)) {
            for (const [method, op] of Object.entries(methods)) {
                const url = urlOf(path);
                const example = op.requestBody?.content["application/json"].example;
                const res = await call(url, { method: method.toUpperCase(), body: example });
                assert.ok(![404, 405].includes(res.status), `${method} ${path}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
                assert.ok(res.status < 500, `${method} ${path}: ${res.status}`);
            }
        }
        assert.equal(Object.values(doc.paths).reduce((n, m) => n + Object.keys(m).length, 0), REST_ROUTES.length);
        // the server's side: a method the document does not give a path is 405, a path it does not
        // list is 404, so the server serves nothing under /api/v1 that the document lacks
        for (const [path, methods] of Object.entries(doc.paths)) {
            for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => !Object.hasOwn(methods, m.toLowerCase()))) {
                const res = await call(urlOf(path), { method, body: method === "GET" ? undefined : {} });
                assert.equal(res.status, 405, `${method} ${path}`);
            }
        }
        for (const path of ["", "/", "/admin", "/sources/sales/rows/extra", "/views", "/openapi.json"]) {
            for (const method of ["GET", "POST"]) {
                const res = await call(`${server.api}${path}`, { method, body: method === "GET" ? undefined : {} });
                assert.equal(res.status, 404, `${method} ${path}: ${res.status}`);
            }
        }
    } finally {
        await server.close();
    }
});

test("/openapi.json: for signed-in callers by default, for anyone with public, not at all with off; it names the server's address", async () => {
    const dir = workspace();
    const base = { sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir };
    const env = { env: { PIVOTKIT_TOKEN: TOKEN } };
    const auth = await restServer(base, env);
    try {
        assert.equal((await call(`${auth.url}/openapi.json`)).status, 401);
        const doc = await call(`${auth.url}/openapi.json`, { token: TOKEN });
        assert.equal(doc.status, 200);
        assert.equal(doc.data.servers[0].url, "https://pk.example.com");
        assert.equal(doc.data.components.securitySchemes.bearer.scheme, "bearer");
    } finally {
        await auth.close();
    }
    const open = await restServer({ ...base, rest: { openapi: "public" } }, env);
    try {
        assert.equal((await call(`${open.url}/openapi.json`)).status, 200);
    } finally {
        await open.close();
    }
    const off = await restServer({ ...base, rest: { openapi: "off" } }, env);
    try {
        assert.equal((await call(`${off.url}/openapi.json`, { token: TOKEN })).status, 404);
    } finally {
        await off.close();
    }
});

test("a 404 names the OpenAPI document's full address: under http.publicUrl, else at the server's root, never under /api/v1", async () => {
    const dir = workspace();
    const base = { sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, baseDir: dir };
    const env = { env: { PIVOTKIT_TOKEN: TOKEN } };
    // the misplaced document, an unknown route under /api/v1 and a path nobody serves: one answer
    const detailOf = async (extra) => {
        // without pivotkit-mcp's handler (enable: rest), so a path nobody serves reaches serve.js's own 404
        const server = await restServer({ ...base, ...extra }, env);
        try {
            const details = new Set();
            for (const url of [`${server.url}/api/v1/openapi.json`, `${server.api}/nothing`, `${server.url}/nothing`]) {
                const res = await call(url, { token: TOKEN });
                assert.equal(res.status, 404);
                details.add(res.data.detail);
            }
            assert.equal(details.size, 1, [...details].join("\n"));
            return [...details][0];
        } finally {
            await server.close();
        }
    };
    assert.equal(await detailOf({ http: { publicUrl: "https://pk.example.com/" } }), "no such route; the REST service is at https://pk.example.com/api/v1, its OpenAPI document at https://pk.example.com/openapi.json (not under /api/v1)");
    assert.equal(await detailOf({ rest: { openapi: "public" } }), "no such route; the REST service is at /api/v1, its OpenAPI document at /openapi.json, at the server's root (not under /api/v1)");
    // a document that is not served is not named
    assert.equal(await detailOf({ rest: { openapi: "off" } }), "no such route; the REST service is at /api/v1");
    // a public URL with a path does not start (#629): the server serves at the root of its host
    await assert.rejects(detailOf({ http: { publicUrl: "https://pk.example.com/reports/" } }), /http\.publicUrl \(or --public-url\): the address has a path/);
});

// #630: with pivotkit-mcp's handler beside REST, a path nobody serves reached the MCP handler, which
// answered a plain "not found"; it names the REST service and the OpenAPI document as serve.js's own 404
test("with MCP beside REST, a path nobody serves names the REST and OpenAPI addresses too", async () => {
    const dir = workspace();
    const options = { sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, http: { publicUrl: "https://pk.example.com/" }, baseDir: dir };
    const server = await restServer(options, { env: { PIVOTKIT_TOKEN: TOKEN }, enable: ["rest", "mcp"] });
    try {
        const want = "no such route; the REST service is at https://pk.example.com/api/v1, its OpenAPI document at https://pk.example.com/openapi.json (not under /api/v1)";
        for (const path of ["/nothing", "/.well-known/nothing", "/api/v1/openapi.json"]) {
            const res = await call(`${server.url}${path}`, { token: TOKEN });
            assert.equal(res.status, 404, path);
            assert.equal(res.data.code, "NOT_FOUND", path);
            assert.equal(res.data.detail, want, path);
            assert.match(res.headers.get("x-request-id") ?? "", /^[A-Za-z0-9_-]+$/, path);
        }
        // the MCP endpoint itself is still MCP's
        assert.notEqual((await call(`${server.url}/mcp`, { method: "POST", token: TOKEN, body: {} })).status, 404);
    } finally {
        await server.close();
    }
    // MCP without REST: the same problem as a server without MCP, with no address to name
    const alone = await restServer(options, { env: { PIVOTKIT_TOKEN: TOKEN }, enable: ["mcp"] });
    try {
        const res = await call(`${alone.url}/nothing`, { token: TOKEN });
        assert.deepEqual([res.status, res.data.code, res.data.detail], [404, "NOT_FOUND", "no such route"]);
    } finally {
        await alone.close();
    }
});

test("save is an input of POST /views/render, not of the file route", () => {
    const doc = openApiDocument();
    const schemaOf = (path) => {
        const ref = doc.paths[`/api/v1${path}`].post.requestBody.content["application/json"].schema.$ref.split("/").at(-1);
        return doc.components.schemas[ref];
    };
    assert.equal(schemaOf("/views/render").properties.save?.type, "boolean");
    assert.equal(schemaOf("/views/render/file").properties.save, undefined);
});
