// check-config's "New in this version": the changes of this release an existing installation
// notices, only where the configuration has them, each with the anchor of its section on the
// upgrading page. options.test.js checks the block's layout with stub sections; these tests run
// checkConfig with the real sections.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkConfig } from "pivotkit-server";
import { SECTIONS } from "../src/check/index.js";
import { workspace } from "./helpers.js";

/** The anchors of the upgrading page's headings ("## Title { #anchor }"). */
const UPGRADING_ANCHORS = new Set([...readFileSync(new URL("../../../docs/getting-started/upgrading.md", import.meta.url), "utf8").matchAll(/^#+ .*\{ #([\w-]+) \}$/gm)].map((m) => m[1]));

/** A source hidden by default with the fields it shows listed. */
const HIDES = { file: "data/sales.csv", policy: { default: "hide", fields: { Region: "show", Sales: "show" } } };

/** Configurations of several kinds: an open address with a token, a public output, the least. */
const CONFIGS = [
    [{ sources: { sales: HIDES }, http: { host: "0.0.0.0" }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT" }] } }, { http: true, env: { BOT: "x1y2".repeat(10) } }],
    [{ sources: { sales: HIDES }, output: { dir: "out", baseUrl: "https://files.example.com/" } }, { http: false }],
    [{}, { http: false }]
];

/** check-config's text for a configuration over one CSV source, with an output directory. */
async function textOf(options, runtime) {
    const dir = workspace();
    const { text } = await checkConfig({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, ...options, baseDir: dir }, { env: {}, ...runtime });
    return text;
}

test("New in this version: every note a real section gives links a section of the upgrading page", async () => {
    assert.ok(UPGRADING_ANCHORS.has("update"), "the upgrading page's anchors are read");
    for (const [options, runtime] of CONFIGS) {
        const notes = [];
        // each real section, its notes kept as it gives them
        const sections = SECTIONS.map(({ name, section }) => ({ name, section: async (...args) => {
            const said = await section(...args);
            notes.push(...said.upgrade);
            return said;
        } }));
        const text = await textOf(options, { ...runtime, sections });
        assert.match(text, /^Output: out$/m, "the output section ran");
        // no section gives a note in this version: none may appear by accident. A release that brings
        // one replaces this line by its expected notes; the loop below then checks their links
        assert.deepEqual(notes, [], "no section gives a note in this version");
        assert.doesNotMatch(text, /New in this version/);
        for (const note of notes) {
            assert.ok(UPGRADING_ANCHORS.has(note.anchor), `${note.text}: no heading #${note.anchor} on docs/getting-started/upgrading.md`);
            assert.ok(text.includes(`#${note.anchor}`), `${note.text}: printed with its link`);
        }
    }
});

test("New in this version: a section's note is printed after the sections with its link, without one when branding.docsUrl is null", async () => {
    const note = { name: "note", section: async () => ({ items: [], upgrade: [{ text: "reports are written with mode 0600", anchor: "next" }] }) };
    const text = await textOf({}, { http: false, sections: [...SECTIONS, note] });
    assert.match(text, /\nNew in this version:\n {2}reports are written with mode 0600\n {4}-> https:\/\/pivotkit\.eize\.dev\/getting-started\/upgrading\/#next\n$/);
    const own = await textOf({ branding: { docsUrl: null } }, { http: false, sections: [...SECTIONS, note] });
    assert.match(own, /\nNew in this version:\n {2}reports are written with mode 0600\n$/);
    // without a note, no block
    assert.doesNotMatch(await textOf({}, { http: false, sections: SECTIONS }), /New in this version/);
});
