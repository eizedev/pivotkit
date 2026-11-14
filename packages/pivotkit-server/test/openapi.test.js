// The OpenAPI document: valid OpenAPI 3.1, the committed copy (docs/openapi.json) what the code
// generates, every route in it answered by the server, each example accepted by the input schema and
// its output by the output schema, and the served copy as the operator configures it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Validator } from "@cfworker/json-schema";
import { checkInput } from "pivotkit-report/operations";
import { openApiDocument, REST_ROUTES } from "pivotkit-server/rest";
import { presentedInput, presentedOutput } from "pivotkit-server";
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
    for (const options of [{}, { auth: { mode: "none" } }, { auth: { mode: "oauth", issuer: "https://id.example.com", toolScopes: { render_view: ["pivotkit:render"] } }, issuer, requiredScopes: ["pivotkit"], publicUrl: "https://pk.example.com/" }, { auth: { mode: "oauth", issuer: "https://id.example.com" } }]) {
        const doc = openApiDocument(options);
        const result = new Validator(META, "2020-12", false).validate(doc);
        assert.ok(result.valid, JSON.stringify(result.errors.slice(0, 5)));
        assert.deepEqual(unresolved(doc), []);
    }
    const oauth = openApiDocument({ auth: { mode: "oauth", issuer: "https://id.example.com", toolScopes: { render_view: ["pivotkit:render"] } }, issuer, requiredScopes: ["pivotkit"], publicUrl: "https://pk.example.com/" });
    assert.equal(oauth.components.securitySchemes.oauth.flows.authorizationCode.tokenUrl, issuer.token_endpoint);
    assert.deepEqual(oauth.paths["/api/v1/views/render"].post.security, [{ oauth: ["pivotkit", "pivotkit:render"] }]);
    assert.deepEqual(oauth.paths["/api/v1/views/render"].post["x-pivotkit-scopes"], ["pivotkit:render"]);
    assert.equal(oauth.servers[0].url, "https://pk.example.com/api/v1");
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

test("every route of the document is answered by the server (no 404 or 405), and the server has no route the document lacks", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", link: "https://reports.example.com/" } }, policy: { results: true }, output: { dir: "out" }, baseDir: dir });
    try {
        const doc = openApiDocument();
        for (const [path, methods] of Object.entries(doc.paths)) {
            for (const [method, op] of Object.entries(methods)) {
                const url = `${server.url}${path.replace("{id}", "sales")}`;
                const example = op.requestBody?.content["application/json"].example;
                const res = await call(url, { method: method.toUpperCase(), body: example });
                assert.ok(![404, 405].includes(res.status), `${method} ${path}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
                assert.ok(res.status < 500, `${method} ${path}: ${res.status}`);
            }
        }
        assert.equal(Object.values(doc.paths).reduce((n, m) => n + Object.keys(m).length, 0), REST_ROUTES.length);
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
        assert.equal(doc.data.servers[0].url, "https://pk.example.com/api/v1");
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
