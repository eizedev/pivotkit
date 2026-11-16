// check-config's "New in this version": the changes of this release an existing installation
// notices, only where the configuration has them, each with the anchor of its upgrading section.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConfig } from "pivotkit-server";
import { factsOf, workspace } from "./helpers.js";

const UPGRADING = "https://pivotkit.eize.dev/getting-started/upgrading/";

/** The "New in this version" notes as [text, anchor] pairs, unwrapped. */
async function newIn(options, runtime) {
    const dir = workspace();
    const { text } = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, ...options, baseDir: dir }, { env: {}, ...runtime });
    const block = factsOf(text).split("\nNew in this version:\n")[1] ?? "";
    const lines = block.split("\n").filter(Boolean);
    const notes = [];
    for (let i = 0; i < lines.length; i += 2) {
        assert.match(lines[i], /^ {2}\S/, block);
        assert.ok(lines[i + 1]?.startsWith(`    -> ${UPGRADING}#`), block);
        notes.push([lines[i].trim(), lines[i + 1].slice(`    -> ${UPGRADING}#`.length)]);
    }
    return notes;
}

/** A source hidden by default with the fields it shows listed: closed before 0.8, open now. */
const HIDES = { file: "data/sales.csv", policy: { default: "hide", fields: { Region: "show", Sales: "show" } } };

test("New in this version: the 0.2.0 notes are gone; each note links to its own section", async () => {
    const notes = await newIn({ sources: { sales: HIDES }, http: { host: "0.0.0.0" }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] } }, { http: true, env: { BOT: "x".repeat(40) } });
    assert.deepEqual(notes, [
        ["schedule drafts take at most half of output.maxMb (output.draftMaxAgeDays lets waiting drafts expire)", "draft-quota"],
        ["a source hidden by default whose listed fields are shown counts as open for links (sales)", "hidden-open"],
        ["at most 32 connections per address (http.maxConnectionsPerAddress)", "per-address"]
    ]);
});

test("New in this version: the per-address note only off loopback without either setting", async () => {
    const has = async (http) => (await newIn({ http }, { http: true, env: {} })).some(([, anchor]) => anchor === "per-address");
    assert.equal(await has({}), false, "loopback only: no client is bounded per address");
    assert.equal(await has({ trustProxy: true, host: "0.0.0.0" }), false);
    assert.equal(await has({ maxConnectionsPerAddress: 64, host: "0.0.0.0" }), false);
    assert.equal((await newIn({}, { http: false })).some(([, anchor]) => anchor === "per-address"), false, "stdio");
});

test("New in this version: the hidden-field note only for open sources that hide a field, where reports get links", async () => {
    const anchors = async (options, runtime) => (await newIn(options, runtime)).map(([, anchor]) => anchor);
    assert.ok((await anchors({ sources: { sales: HIDES } }, { http: true })).includes("hidden-open"));
    assert.ok(!(await anchors({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" } } } }, { http: true })).includes("hidden-open"), "every field shown: open as before");
    assert.ok(!(await anchors({ sources: { sales: { file: "data/sales.csv", policy: { default: "show", fields: { Customer: "hide" } } } } }, { http: true })).includes("hidden-open"), "show everything except one field: closed as before");
    assert.ok(!(await anchors({ sources: { sales: { file: "data/sales.csv" } } }, { http: true })).includes("hidden-open"), "closed");
    assert.ok(!(await anchors({ sources: { sales: HIDES } }, { http: false })).includes("hidden-open"), "stdio without output.baseUrl: no links");
    assert.ok((await anchors({ sources: { sales: HIDES }, output: { dir: "out", baseUrl: "https://files.example.com/" } }, { http: false })).includes("hidden-open"));
});

test("New in this version: the draft note wherever reports and drafts are written", async () => {
    assert.ok((await newIn({}, { http: false })).some(([, anchor]) => anchor === "draft-quota"));
    const dir = workspace();
    const { text } = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, baseDir: dir }, { env: {}, http: false });
    assert.doesNotMatch(text, /New in this version/, "no output directory, nothing new applies");
    // only sources bound to a person: no source takes a draft, so the note does not apply
    const bound = { http: { url: "https://platform.example.com/v1/{customer}/vms", rows: "/items" }, params: { customer: { type: "string", claim: "customer", required: true, pattern: "^[a-z0-9-]{1,40}$" } }, policy: { default: "hide" } };
    const notes = await newIn({ sources: { mine: bound }, auth: { mode: "oauth", issuer: "https://auth.example.com/", resource: "https://reports.example.com/mcp" } }, { http: false });
    assert.ok(!notes.some(([, anchor]) => anchor === "draft-quota"), JSON.stringify(notes));
});
