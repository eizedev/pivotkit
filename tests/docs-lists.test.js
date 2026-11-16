// A list in the docs needs a blank line before it. Python-Markdown (zensical) lets no list interrupt a
// paragraph: a "- " or "1. " line right after a paragraph that is not a list item, such as an indented
// paragraph inside an item, becomes part of that paragraph's text. The strict build does not warn.
// A line right after a table becomes another table row. Inside a blockquote, the check reads the
// lines without their "> ". It does not follow a blockquote's lazy lines that have no "> ".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { filesUnder, root } from "./source-files.js";

const docs = join(root, "docs");

const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+\S/;
const FENCE = /^\s*(`{3,}|~{3,})/;
// Lines that are a block of their own, so the next line starts a new block: a heading, an
// admonition's or a content tab's title, an HTML line or a rule.
const OWN_BLOCK = /^\s*(?:#|!!!|\?\?\?|===|<|(?:-{3,}|\*{3,}|_{3,})\s*$)/;
const QUOTE = /^\s*(?:>\s?)+/;

/**
 * The list items of a Markdown text that follow a paragraph or a table row without a blank line, as
 * 1-based line numbers. Code fences are skipped.
 * @param {string} text
 * @returns {number[]}
 */
function swallowedListItems(text) {
    const found = [];
    let fence = null;
    /** The first line of the paragraph the previous line belongs to, or null after a block's end. */
    let paragraphStart = null;
    const lines = text.split("\n");
    // Front matter is YAML between two "---" lines, not Markdown.
    const bodyStart = lines[0] === "---" ? lines.indexOf("---", 1) + 1 : 0;
    lines.forEach((source, index) => {
        if (index < bodyStart) return;
        const line = source.replace(QUOTE, "");
        const marker = line.match(FENCE)?.[1];
        if (fence) {
            if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
            return;
        }
        if (marker) {
            fence = marker;
            paragraphStart = null;
            return;
        }
        if (!line.trim() || OWN_BLOCK.test(line)) {
            paragraphStart = null;
            return;
        }
        if (LIST_ITEM.test(line)) {
            if (paragraphStart !== null && !LIST_ITEM.test(paragraphStart)) found.push(index + 1);
            paragraphStart = line;
            return;
        }
        paragraphStart ??= line;
    });
    return found;
}

/** Each case: a Markdown text and the line numbers swallowedListItems reports. */
const CASES = [
    { name: "a list right after a paragraph", lines: ["Intro:", "- item"], found: [2] },
    { name: "a numbered list right after a paragraph", lines: ["Intro:", "1. item"], found: [2] },
    { name: "a list after a blank line", lines: ["Intro:", "", "- item", "1. item"], found: [] },
    { name: "an item with a wrapped line and a nested list", lines: ["- item", "  wrapped", "    - nested"], found: [] },
    {
        name: "an item after an indented paragraph in the item above",
        lines: ["- item", "", "    Indented paragraph", "- next item"],
        found: [4],
    },
    { name: "a list right after a heading", lines: ["## Heading", "- item"], found: [] },
    { name: "a list in a code fence", lines: ["Text", "```", "text", "- in code", "```"], found: [] },
    { name: "a list in an admonition", lines: ["!!! note", "    - item", "    1. numbered"], found: [] },
    { name: "a list in a content tab", lines: ['=== "A"', "    - item", "    - item"], found: [] },
    { name: "a list after a table", lines: ["| a | b |", "| --- | --- |", "| 1 | 2 |", "", "- item"], found: [] },
    // Python-Markdown takes the line as another table row.
    { name: "a list right after a table", lines: ["| a | b |", "| --- | --- |", "- item"], found: [3] },
    { name: "a list right after a paragraph in a blockquote", lines: ["> Intro:", "> - item"], found: [2] },
    { name: "a list in a blockquote after a blank line", lines: ["> Intro:", ">", "> - item"], found: [] },
    { name: "front matter", lines: ["---", "title: Page", "hide:", "  - toc", "---"], found: [] },
    // Flagged on purpose: the page shows it as text, but the source reads like a list. Rewrap the line.
    { name: "a wrapped line that starts with a number and a dot", lines: ["Since version", "2. it works"], found: [2] },
];

for (const { name, lines, found } of CASES) {
    test(`swallowedListItems: ${name}`, () => {
        assert.deepEqual(swallowedListItems(lines.join("\n")), found);
    });
}

test("every list in the docs starts after a blank line", () => {
    // docs/playground/ is the built live demo, not pages.
    const pages = filesUnder(docs, (name) => name.endsWith(".md")).filter(
        (path) => !relative(docs, path).startsWith("playground"),
    );
    assert.ok(pages.length > 10, "no docs pages found");
    const problems = pages.flatMap((path) =>
        swallowedListItems(readFileSync(path, "utf8")).map((line) => `${relative(root, path)}:${line}`),
    );
    assert.deepEqual(problems, [], "add a blank line before these list items");
});
