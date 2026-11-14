// CORS: off by default (a browser's request is refused), an allowed origin gets its preflight
// answered before authentication and its answers marked for it, never "*".
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOptions } from "pivotkit-server";
import { BY_REGION, TOKEN, call, restServer, workspace } from "./helpers.js";

const APP = "https://app.example.com";

test("without rest.cors.origins a request with an Origin is refused, also a preflight", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir });
    try {
        const res = await call(`${server.api}/sources`, { headers: { origin: APP } });
        assert.equal(res.status, 403);
        assert.equal(res.data.code, "FORBIDDEN_ORIGIN");
        assert.equal(res.headers.get("access-control-allow-origin"), null);
        const preflight = await call(`${server.api}/views/validate`, { method: "OPTIONS", headers: { origin: APP, "access-control-request-method": "POST" } });
        assert.equal(preflight.status, 403);
        // a program sends no Origin: it works
        assert.equal((await call(`${server.api}/sources`)).status, 200);
    } finally {
        await server.close();
    }
});

test("an allowed origin: the preflight is answered before authentication; answers, errors included, carry that origin, never *", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, auth: { mode: "token" }, rest: { cors: { origins: [APP] } }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const preflight = await call(`${server.api}/views/validate`, { method: "OPTIONS", headers: { origin: APP, "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type" } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get("access-control-allow-origin"), APP);
        assert.match(preflight.headers.get("access-control-allow-headers"), /authorization/);
        const unauthorized = await call(`${server.api}/sources`, { headers: { origin: APP } });
        assert.equal(unauthorized.status, 401);
        assert.equal(unauthorized.headers.get("access-control-allow-origin"), APP, "the browser may read why");
        assert.match(unauthorized.headers.get("access-control-expose-headers"), /www-authenticate/);
        const ok = await call(`${server.api}/views/validate`, { token: TOKEN, headers: { origin: APP }, body: { source: "sales", view: BY_REGION } });
        assert.equal(ok.status, 200);
        assert.equal(ok.headers.get("access-control-allow-origin"), APP);
        assert.equal(ok.headers.get("vary"), "Origin");
        const other = await call(`${server.api}/sources`, { token: TOKEN, headers: { origin: "https://app.example.com.evil.example" } });
        assert.equal(other.status, 403);
        const nullOrigin = await call(`${server.api}/sources`, { token: TOKEN, headers: { origin: "null" } });
        assert.equal(nullOrigin.status, 403);
    } finally {
        await server.close();
    }
});

test("rest.cors.origins takes exact origins only: no *, no path, no other scheme", () => {
    for (const origin of ["*", "https://app.example.com/", "https://app.example.com/path", "app.example.com", "file://x", "null"]) {
        assert.throws(() => validateOptions({ rest: { cors: { origins: [origin] } } }), /rest\.cors\.origins\[0\]/, origin);
    }
    assert.doesNotThrow(() => validateOptions({ rest: { cors: { origins: ["https://app.example.com", "http://localhost:5173"] } } }));
});
