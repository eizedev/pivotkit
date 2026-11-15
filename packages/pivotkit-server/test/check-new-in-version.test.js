// check-config's "New in this version": the changes of this release an existing installation
// notices, each with the setting that switches it off, and only where the configuration has it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConfig } from "pivotkit-server";
import { factsOf, workspace } from "./helpers.js";

/** The "New in this version" line, unwrapped. */
async function newIn(options, runtime) {
    const dir = workspace();
    const { text } = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, ...options, baseDir: dir }, { env: {}, ...runtime });
    return factsOf(text).match(/^New in this version: ([^\n]*)$/m)?.[1] ?? "";
}

test("New in this version: the client's address in the log over HTTP and JSON start errors, with their off switches", async () => {
    const line = await newIn({}, { http: true });
    assert.match(line, /the client's IP address on the log's request lines \(log\.address: "off" leaves it out\)/);
    assert.match(line, /a start error as a JSON line where stderr is no terminal \(log\.format: "text" keeps the plain line\)/);
});

test("New in this version: no address note with log.address off or over stdio; no start-error note with the text format or over stdio", async () => {
    const off = await newIn({ log: { address: "off", format: "text" } }, { http: true });
    assert.doesNotMatch(off, /IP address/);
    assert.doesNotMatch(off, /start error/);
    const stdio = await newIn({}, { http: false });
    assert.doesNotMatch(stdio, /IP address/);
    // over stdio a start error goes to the client's own log of the server: no note
    assert.doesNotMatch(stdio, /start error/);
});

test("New in this version: /downloads/ answers without a token wherever the server serves it, also when no report gets a link yet", async () => {
    // a closed source and static tokens: no report gets a link, but the route is served
    const closed = await newIn({ auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] } }, { http: true, env: { BOT: "x".repeat(40) } });
    assert.match(closed, /download links under \/downloads\/, answered without a token \(the link is the credential; output\.downloads\.enabled: false switches them off\)/);
    const off = await newIn({ output: { dir: "out", downloads: { enabled: false } } }, { http: true });
    assert.doesNotMatch(off, /\/downloads/);
    const stdio = await newIn({}, { http: false });
    assert.doesNotMatch(stdio, /\/downloads/);
});

test("New in this version: an OAuth issuer on a LAN or cluster address needs auth.intranet", async () => {
    const line = await newIn({ auth: { mode: "oauth", issuer: "https://auth.example.com/", resource: "https://reports.example.com/mcp" } }, { http: true });
    assert.match(line, /a LAN issuer needs auth\.intranet: true/);
});
