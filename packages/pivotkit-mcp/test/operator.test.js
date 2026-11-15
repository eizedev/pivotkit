// The operator's controls over MCP (#331), with the SDK's client against a local issuer: a person's
// groups choose the policy profile, a token without its groups is refused with 403 (not a sign-in
// challenge), the sources' scopes are offered in the metadata and named by an empty list_sources'
// hint (the client checks the structured result against the tool's output schema), and the person is
// logged only as the operator's audit setting says.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { call, httpClient, httpServer, workspace } from "./helpers.js";

const RESOURCE = "https://mcp.example.com/mcp";
let issuer;
let issuerServer;
let key;

before(async () => {
    key = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    issuerServer = createServer((req, res) => {
        res.writeHead(req.url === "/.well-known/openid-configuration" || req.url === "/jwks" ? 200 : 404, { "content-type": "application/json" });
        res.end(req.url === "/jwks" ? JSON.stringify({ keys: [jwk] }) : JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], code_challenge_methods_supported: ["S256"] }));
    });
    await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${issuerServer.address().port}`;
});
after(() => new Promise((resolve) => issuerServer.close(resolve)));

/** A signed access token of the person "ana" for the MCP endpoint. */
const token = (claims = {}) => new SignJWT({ scope: "pivotkit", client_id: "desktop-client", ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience(RESOURCE).setSubject("ana").setIssuedAt().setExpirationTime("5m").sign(key.privateKey);

async function oauthServer(auth = {}, more = {}, env = {}) {
    const server = await httpServer(
        {
            sources: { sales: { file: "data/sales.csv", policy: { default: "summary" } }, vms: { file: "data/sales.csv", scopes: ["pivotkit:vms"] } },
            policy: { profiles: { finance: { default: "show" } } },
            auth: { mode: "oauth", issuer, resource: RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"], ...auth },
            baseDir: workspace(),
            ...more
        },
        { env }
    );
    return server;
}

test("groups choose the profile; a token whose groups are elsewhere gets 403 access_denied, never a sign-in challenge", async () => {
    const server = await oauthServer({ groupProfiles: [{ group: "finance", profile: "finance" }] });
    try {
        const finance = await httpClient(server.url, { token: await token({ groups: ["finance"] }) });
        const described = await call(finance.client, "describe_source", { source: "sales" });
        assert.equal(described.data.fields.find((f) => f.name === "Customer")?.level, "show");
        await finance.close();
        const none = await httpClient(server.url, { token: await token({ groups: [] }) });
        assert.equal((await call(none.client, "describe_source", { source: "sales" })).data.fields.find((f) => f.name === "Customer")?.level, "summary");
        await none.close();
        const overage = await fetch(server.url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${await token({ hasgroups: true })}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) });
        assert.equal(overage.status, 403);
        assert.equal(overage.headers.get("www-authenticate"), null);
        assert.ok(server.log.some((l) => l.event === "refused" && l.status === 403 && l.client === "desktop-client"), JSON.stringify(server.log));
        assert.deepEqual(await overage.json(), { error: "access_denied", error_description: "your sign-in does not carry your groups; ask the operator" });
    } finally {
        await server.close();
    }
});

test("the metadata offers the sources' scopes; an empty list_sources names them in its hint", async () => {
    const server = await oauthServer({ requiredScopes: [], offerSourceScopes: true }, { sources: { vms: { file: "data/sales.csv", scopes: ["pivotkit:vms"] } } });
    try {
        const prm = await (await fetch(server.url.replace("/mcp", "/.well-known/oauth-protected-resource/mcp"))).json();
        assert.deepEqual(prm.scopes_supported, ["pivotkit:vms"]);
        const { client, close } = await httpClient(server.url, { token: await token() });
        const listed = await call(client, "list_sources");
        assert.equal(listed.isError, false);
        assert.deepEqual(listed.data.sources, []);
        assert.equal(listed.data.hint, "No source is available with your current sign-in. This server offers the scopes: pivotkit:vms. Sign in with one of them, or ask the operator.");
        // an empty list does not ask the model to call describe_source
        assert.equal(listed.text.split("\n")[0], `0 sources. ${listed.data.hint}`);
        await close();
    } finally {
        await server.close();
    }
});

test("audit hash: a call line names the person as a keyed hash; groups and the subject itself never", async () => {
    const server = await oauthServer({ groupProfiles: [{ group: "finance", profile: "finance" }] }, { audit: { subject: "hash", key: { env: "AUDIT_KEY" } } }, { AUDIT_KEY: "the-audit-key-of-enough-length" });
    try {
        const { client, close } = await httpClient(server.url, { token: await token({ groups: ["finance"] }) });
        await call(client, "describe_source", { source: "sales" });
        await close();
        const line = server.log.find((l) => l.event === "call" && l.tool === "describe_source");
        assert.equal(line?.subject, createHmac("sha256", "the-audit-key-of-enough-length").update(JSON.stringify([issuer, "ana"])).digest("hex").slice(0, 16));
        const text = JSON.stringify(server.log);
        assert.ok(!text.includes('"ana"') && !text.includes("finance"), text);
    } finally {
        await server.close();
    }
});
