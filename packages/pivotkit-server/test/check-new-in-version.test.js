// check-config's "New in this version": the changes of this release an existing installation
// notices, only where the configuration has them, each with the anchor of its upgrading section.
// options.test.js checks the block's layout. This release has no note; the notes of 0.3 are gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConfig } from "pivotkit-server";
import { workspace } from "./helpers.js";

/** check-config's text for a configuration over one CSV source, with an output directory. */
async function textOf(options, runtime) {
    const dir = workspace();
    const { text } = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, ...options, baseDir: dir }, { env: {}, ...runtime });
    return text;
}

/** A source hidden by default with the fields it shows listed: closed in pivotkit-server 0.2.0, open since 0.3.0. */
const HIDES = { file: "data/sales.csv", policy: { default: "hide", fields: { Region: "show", Sales: "show" } } };

test("New in this version: the 0.3 notes are gone, where each of them applied", async () => {
    // each configuration printed 0.3.0's notes: drafts, inline results, open hidden sources, per-address
    const configs = [
        [{ sources: { sales: HIDES }, http: { host: "0.0.0.0" }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] } }, { http: true, env: { BOT: "x".repeat(40) } }],
        [{ sources: { sales: HIDES }, output: { dir: "out", baseUrl: "https://files.example.com/" } }, { http: false }],
        [{}, { http: false }]
    ];
    for (const [options, runtime] of configs) {
        const text = await textOf(options, runtime);
        assert.match(text, /^Output: out$/m, "the output section ran");
        assert.doesNotMatch(text, /New in this version/, text);
        assert.doesNotMatch(text, /#(draft-quota|results-0-8|hidden-open|per-address)\b/, text);
    }
});
