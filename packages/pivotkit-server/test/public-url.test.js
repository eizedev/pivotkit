// http.publicUrl is the origin clients reach the server at (#629): a path, a user name, a password, a
// query or a fragment is refused at start with the remedy, and every address the server names is
// built from the origin alone, also for options that skipped the check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openApiDocument } from "pivotkit-server/rest";
import { validateOptions, noRouteDetail, publicOriginOf, restAddressesOf, restResourceOf } from "../src/config.js";
import { tempDir } from "./helpers.js";

const SECRET = "s3cr3t-pw";

test("http.publicUrl with a path is refused at start, and the message names the remedy", () => {
    for (const publicUrl of ["https://example.com/reports", "https://example.com/reports/", "https://example.com/a/b"]) {
        assert.throws(() => validateOptions({ http: { publicUrl } }), (e) => {
            assert.equal(e.name, "ConfigError");
            assert.match(e.message, /^http\.publicUrl \(or --public-url\): the address has a path/);
            assert.match(e.message, /Write the origin only, such as https:\/\/reports\.example\.com/);
            assert.match(e.message, /a host name of its own/);
            assert.match(e.message, /\/mcp, \/\.well-known\/, \/api\/v1, \/openapi\.json, \/downloads\/ and \/, and \/icon\.png with branding\.icon$/);
            return true;
        }, publicUrl);
    }
});

test("http.publicUrl with a user name, a password, a query or a fragment is refused, and the message never repeats it", () => {
    for (const publicUrl of [`https://user:${SECRET}@example.com/`, "https://user@example.com", `https://example.com/?key=${SECRET}`, `https://example.com#${SECRET}`, "https://example.com/?"]) {
        assert.throws(() => validateOptions({ http: { publicUrl } }), (e) => {
            assert.equal(e.name, "ConfigError");
            assert.match(e.message, /^http\.publicUrl \(or --public-url\): no /);
            assert.ok(!e.message.includes(SECRET) && !e.message.includes("user@") && !e.message.includes("user:"), e.message);
            return true;
        }, publicUrl);
    }
});

test("http.publicUrl as an origin, with or without a trailing slash and a port, starts", () => {
    for (const publicUrl of ["https://reports.example.com", "https://reports.example.com/", "http://localhost:3333/", "https://[::1]:8443"]) {
        assert.doesNotThrow(() => validateOptions({ http: { publicUrl } }), publicUrl);
    }
});

// options that never passed validateOptions (a host's own code, a test): the addresses still hold the origin only
const UNCHECKED = { http: { publicUrl: `https://user:${SECRET}@pk.example.com/reports//?a=${SECRET}#c` } };

test("every address the server names from http.publicUrl is its origin, also without the check", () => {
    assert.equal(publicOriginOf(UNCHECKED), "https://pk.example.com");
    assert.equal(publicOriginOf({}), null);
    assert.deepEqual(restAddressesOf(UNCHECKED), { rest: "https://pk.example.com/api/v1", openapi: "https://pk.example.com/openapi.json" });
    assert.equal(noRouteDetail(UNCHECKED), "no such route; the REST service is at https://pk.example.com/api/v1, its OpenAPI document at https://pk.example.com/openapi.json (not under /api/v1)");
    assert.equal(restResourceOf(UNCHECKED), "https://pk.example.com/api/v1");
    assert.deepEqual(openApiDocument({ publicUrl: UNCHECKED.http.publicUrl }).servers, [{ url: "https://pk.example.com" }]);
});

test("auth.resource and rest.resource with a user name, password, query or fragment are refused; a path is fine", () => {
    const oauth = { mode: "oauth", issuer: "https://auth.example.com/" };
    for (const resource of [`https://user:${SECRET}@pk.example.com/mcp`, `https://pk.example.com/mcp?k=${SECRET}`, `https://pk.example.com/mcp#${SECRET}`]) {
        assert.throws(() => validateOptions({ auth: { ...oauth, resource } }), (e) => /^auth\.resource: no /.test(e.message) && !e.message.includes(SECRET), resource);
        assert.throws(() => validateOptions({ auth: { ...oauth, resource: "https://pk.example.com/mcp" }, rest: { resource } }), (e) => /^rest\.resource: no /.test(e.message) && !e.message.includes(SECRET), resource);
    }
    assert.doesNotThrow(() => validateOptions({ auth: { ...oauth, resource: "https://pk.example.com/mcp" }, rest: { resource: "https://pk.example.com/api/v1" } }));
});

test("the REST resource from auth.resource carries no user name or password", () => {
    assert.equal(restResourceOf({ auth: { resource: `https://user:${SECRET}@pk.example.com/mcp` } }), "https://pk.example.com/api/v1");
    // rest.resource is the operator's own value, as written
    assert.equal(restResourceOf({ rest: { resource: "https://api.example.com/pivotkit" } }), "https://api.example.com/pivotkit");
});

test("token new refuses a configuration whose http.publicUrl has a password or a query, and prints neither", async () => {
    const { credentialsCommand } = await import("../src/credentials.js");
    const dir = tempDir();
    writeFileSync(join(dir, "pivotkit.json"), JSON.stringify({ http: { publicUrl: `https://user:${SECRET}@reports.example.com/base?k=${SECRET}` } }));
    let out = "";
    let err = "";
    const io = { env: {}, cwd: dir, stdout: { write: (t) => (out += t) }, stderr: { isTTY: true, write: (t) => (err += t) } };
    const code = await credentialsCommand("token", ["new", "--file", "reports.token", "--config", "pivotkit.json"], io).catch((e) => e);
    assert.ok(!`${out}${err}${code?.message ?? ""}`.includes(SECRET), `${out}${err}${code?.message ?? ""}`);
    assert.notEqual(code, 0);
    assert.match(`${err}${code?.message ?? ""}`, /http\.publicUrl \(or --public-url\): no user name or password in the address/);
});
