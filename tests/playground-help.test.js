// The playground's "How do I…?" help (examples/playground/src/help-topics.js): each topic links to a
// docs page and a heading that exist, says everything in English and German, and finds its place in
// the report by test hooks, never by a class. The browser test (tests/browser/playground-help.spec.js)
// checks that the places are found in the rendered playground.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { HELP_LABELS, HELP_TOPICS, docsHref } from "../examples/playground/src/help-topics.js";

const docs = new URL("../docs/", import.meta.url);

/**
 * A heading's anchor as the docs site writes it: an explicit `{ #id }`, else Python-Markdown's toc
 * slug (ASCII letters, digits, "_" and "-"; spaces and dashes become one "-"; lower case). JavaScript's
 * \w is ASCII only, so other letters drop out as in Python-Markdown's ASCII encoding.
 * @param {string} line a Markdown heading line
 */
function anchorOf(line) {
    const explicit = line.match(/\{\s*#([\w-]+)[^}]*\}\s*$/);
    if (explicit) return explicit[1];
    const text = line.replace(/^#+\s*/, "").replace(/\s*\{[^}]*\}\s*$/, "");
    return text
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/g, "-");
}

/** The anchors of a page's headings, outside code blocks. */
function anchors(page) {
    let fenced = false;
    const found = new Set();
    for (const line of readFileSync(new URL(page, docs), "utf8").split("\n")) {
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
        else if (!fenced && /^#{1,6}\s/.test(line)) found.add(anchorOf(line));
    }
    return found;
}

test("the slug follows Python-Markdown's toc", () => {
    assert.equal(anchorOf("## Filter by values"), "filter-by-values");
    assert.equal(anchorOf("## Top N"), "top-n");
    assert.equal(anchorOf("## The row count under the result { #row-count }"), "row-count");
    assert.equal(anchorOf("## Quick choices for dates"), "quick-choices-for-dates");
    assert.equal(anchorOf("## 6. Switch to the chart"), "6-switch-to-the-chart");
});

test("every topic links to a docs page and heading that exist", () => {
    for (const topic of HELP_TOPICS) {
        const [page, anchor] = topic.docs.split("#");
        assert.ok(existsSync(new URL(page, docs)), `${topic.id}: docs/${page} does not exist`);
        if (anchor) assert.ok(anchors(page).has(anchor), `${topic.id}: docs/${page} has no heading #${anchor}`);
    }
});

test("every topic and label is in English and German", () => {
    assert.deepEqual(Object.keys(HELP_LABELS.de).sort(), Object.keys(HELP_LABELS.en).sort());
    for (const topic of HELP_TOPICS) {
        for (const key of ["question", "text"]) {
            for (const lang of ["en", "de"]) assert.ok(topic[key][lang]?.trim(), `${topic.id}: ${key} in ${lang}`);
        }
    }
    assert.equal(new Set(HELP_TOPICS.map((t) => t.id)).size, HELP_TOPICS.length, "topic ids are unique");
});

test("targets are test hooks and element names, never a class", () => {
    for (const topic of HELP_TOPICS) {
        assert.ok(topic.targets.length > 0, `${topic.id}: no target`);
        for (const selector of topic.targets) {
            // a class (.name) outside the quoted attribute values
            assert.doesNotMatch(selector.replace(/"[^"]*"/g, '""'), /\./, `${topic.id}: ${selector} uses a class`);
        }
    }
});

test("a docs link is relative on the docs site and absolute elsewhere", () => {
    const site = "https://docs.example";
    assert.equal(docsHref("use/filters.md#top-n", new URL("https://docs.example/playground/?data=weather"), site), "https://docs.example/use/filters/#top-n");
    assert.equal(docsHref("use/charts.md", new URL("https://preview.example/sub/playground/"), site), "https://preview.example/sub/use/charts/");
    assert.equal(docsHref("use/index.md", new URL("http://127.0.0.1:5173/"), site), "https://docs.example/use/");
    assert.equal(docsHref("learn.md#before-you-start", new URL("http://127.0.0.1:5173/?data=weather"), site), "https://docs.example/learn/#before-you-start");
});
