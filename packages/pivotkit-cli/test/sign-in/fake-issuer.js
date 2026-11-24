// A fake pivotkit-server (its sign-in metadata) and a fake issuer on one loopback port for the tests
// of pivotkit login, token and logout, and what those tests share: the secrets that must never show,
// the environment of a run, the token file, main() in this process and waits recorded instead of slept.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { main } from "pivotkit-cli";
import { signInMeans } from "../../src/sign-in.js";

export const DEVICE_CODE = "DEVICE-CODE-SECRET-5d1c";
export const USER_CODE = "WDJB-MJHT";
export const ACCESS = ["ACCESS-ONE-a1b2c3", "ACCESS-TWO-d4e5f6", "ACCESS-THREE-g7h8", "ACCESS-FOUR-i9j0"];
export const REFRESH = ["REFRESH-ONE-9f8e7d", "REFRESH-TWO-6c5b4a", "REFRESH-THREE-3a2b1c", "REFRESH-FOUR-0d9e8f"];
export const CLIENT = "pivotkit-cli";
export const RAW = "ISSUER-TEXT-MARKER-77aa";

/**
 * A fake pivotkit-server (its sign-in metadata) and a fake issuer on one loopback port. `plan`
 * changes what each part answers; the requests are kept.
 */
export async function fakeIssuer(plan = {}) {
    const requests = [];
    const state = { polls: 0, refreshes: 0, valid: new Set([REFRESH[0]]) };
    let origin = "";
    const send = (res, status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
    };
    const server = createServer((req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const body = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
            requests.push({ method: req.method, url: req.url, body, userAgent: req.headers["user-agent"] });
            if (plan.hook?.({ req, res, body, origin, state, send })) {
                return;
            }
            const issuer = plan.issuer ?? `${origin}/issuer`;
            if (req.url === "/.well-known/oauth-protected-resource/api/v1") {
                if (plan.prm === 404) {
                    res.writeHead(404, { "content-type": "application/problem+json" });
                    res.end(JSON.stringify({ code: "NOT_FOUND", status: 404, detail: "no such route" }));
                    return;
                }
                return send(res, 200, { resource: plan.resource ?? `${origin}/api/v1`, authorization_servers: [`${origin}/issuer`], scopes_supported: ["pivotkit.read"], resource_name: "pivotkit REST", ...(plan.published ? { pivotkit_client_id: plan.published } : {}) });
            }
            if (req.url === "/.well-known/oauth-authorization-server/issuer" && plan.firstAddress) {
                // a provider with OpenID Connect discovery only: the first address answers otherwise
                if (plan.firstAddress === "redirect") {
                    res.writeHead(302, { location: `${origin}/elsewhere` });
                    return res.end();
                }
                res.writeHead(404, { "content-type": "text/html" });
                return res.end("<html>not found</html>");
            }
            if (req.url === "/.well-known/oauth-authorization-server/issuer" || (plan.firstAddress && req.url === "/issuer/.well-known/openid-configuration")) {
                return send(res, 200, { issuer, token_endpoint: `${origin}/token`, ...(plan.noDevice ? {} : { device_authorization_endpoint: plan.deviceEndpoint ?? `${origin}/device` }), scopes_supported: ["openid", "offline_access", "pivotkit.read"], ...(plan.revocation ? { revocation_endpoint: `${origin}/revoke` } : {}) });
            }
            if (req.url === "/revoke") {
                state.valid.delete(body.token);
                return send(res, 200, {});
            }
            if (req.url === "/device") {
                return send(res, 200, { device_code: DEVICE_CODE, user_code: USER_CODE, verification_uri: plan.verifyUri?.(origin) ?? `${origin}/activate`, expires_in: plan.expiresIn ?? 600, interval: plan.interval ?? 1 });
            }
            if (req.url === "/token" && body.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
                state.polls++;
                if (plan.deny) {
                    return send(res, 400, { error: "access_denied", error_description: RAW });
                }
                const slowDowns = plan.slowDown === true ? 1 : (plan.slowDown ?? 0);
                if (state.polls <= slowDowns) {
                    return send(res, 400, { error: "slow_down" });
                }
                if (plan.pending || state.polls < slowDowns + 2) {
                    return send(res, 400, { error: "authorization_pending", error_description: RAW });
                }
                return send(res, 200, { access_token: ACCESS[0], token_type: "Bearer", expires_in: 3600, ...(plan.noRefresh ? {} : { refresh_token: REFRESH[0] }) });
            }
            if (req.url === "/token" && body.grant_type === "refresh_token") {
                // rotation: each refresh token works once and the answer carries the next one
                if (!state.valid.has(body.refresh_token)) {
                    return send(res, 400, { error: "invalid_grant", error_description: RAW });
                }
                state.valid.delete(body.refresh_token);
                state.refreshes++;
                const next = REFRESH[state.refreshes];
                state.valid.add(next);
                return send(res, 200, { access_token: ACCESS[state.refreshes], token_type: "Bearer", expires_in: 3600, refresh_token: next });
            }
            send(res, 404, { error: "not_found" });
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, url: `${origin}/api/v1`, requests, state, close: () => new Promise((resolve) => server.closeAllConnections() || server.close(resolve)) };
}

/** No token, refresh token, device code or issuer text in what the CLI wrote. */
export function assertClean(result) {
    for (const [name, text] of [["stdout", result.stdout], ["stderr", result.stderr]]) {
        for (const secret of [DEVICE_CODE, ...REFRESH, RAW]) {
            assert.ok(!text.includes(secret), `${name} holds ${secret}`);
        }
    }
}

/** The environment of a run whose sign-ins live in `dir`. */
export const envOf = (dir, more = {}) => ({ XDG_CONFIG_HOME: dir, APPDATA: dir, ...more });

/** The one token file of a sign-in directory. */
export function tokenFile(dir) {
    const files = readdirSync(join(dir, "pivotkit", "tokens"));
    assert.equal(files.length, 1);
    return join(dir, "pivotkit", "tokens", files[0]);
}

/** Runs main() in this process with sign-ins in `dir`, and `env` over the environment of envOf. */
export async function inProcess(args, dir, env = {}) {
    const out = [];
    const err = [];
    const code = await main(args, { stdin: (async function* () {})(), stdout: { write: (c) => out.push(String(c)) }, stderr: { write: (c) => err.push(String(c)) }, env: { ...envOf(dir), ...env }, cwd: dir });
    return { code, stdout: out.join(""), stderr: err.join("") };
}

/** Runs a test with the waits recorded instead of slept. */
export async function withWaits(work) {
    const sleep = signInMeans.sleep;
    const waits = [];
    signInMeans.sleep = async (ms) => void waits.push(ms);
    try {
        return await work(waits);
    } finally {
        signInMeans.sleep = sleep;
    }
}
