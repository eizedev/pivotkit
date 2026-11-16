// A list in the docs needs a blank line before it. Python-Markdown (zensical) lets no list interrupt a
// paragraph: a "- " or "1. " line right after a paragraph that is not a list item, such as an indented
// paragraph inside an item, becomes part of that paragraph's text. The strict build does not warn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { filesUnder, root } from "./source-files.js";

const docs = join(root, "docs");

const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+\S/;
const FENCE = /^\s*(`{3,}|~{3,})/;
// Lines that are a block of their own, so the next line starts a new block: a heading, a table row,
// an admonition's title, an HTML line, a rule or front matter's fence.
const OWN_BLOCK = /^\s*(?:#|\||!!!|\?\?\?|<|(?:-{3,}|\*{3,}|_{3,})\s*$)/;

/**
 * The list items of a Markdown text that follow a paragraph without a blank line between, as
 * 1-based line numbers. Code fences are skipped.
 * @param {string} text
 * @returns {number[]}
 */
export function swallowedListItems(text) {
    const found = [];
    let fence = null;
    /** The first line of the paragraph the previous line belongs to, or null after a block's end. */
    let paragraphStart = null;
    const lines = text.split("\n");
    // Front matter is YAML between two "---" lines, not Markdown.
    const bodyStart = lines[0] === "---" ? lines.indexOf("---", 1) + 1 : 0;
    lines.forEach((line, index) => {
        if (index < bodyStart) return;
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

test("swallowedListItems finds a list item after a paragraph and nothing else", () => {
    const frontMatter = ["---", "title: Page", "hide:", "  - toc", "---"].join("\n");
    assert.deepEqual(swallowedListItems(frontMatter), []);
    const text = [
        "Intro:", // 1
        "- swallowed", // 2
        "", // 3
        "- item", // 4
        "  wrapped", // 5
        "    - nested", // 6
        "", // 7
        "    Indented paragraph", // 8
        "- swallowed too", // 9
        "", // 10
        "## Heading", // 11
        "- item", // 12
        "", // 13
        "```", // 14
        "text", // 15
        "- in code", // 16
        "```", // 17
        "!!! note", // 18
        "    - in a note", // 19
        "    1. numbered", // 20
    ].join("\n");
    assert.deepEqual(swallowedListItems(text), [2, 9]);
});

test("every list in the docs starts after a blank line", () => {
    const pages = filesUnder(docs, (name) => name.endsWith(".md")).filter(
        (path) => !relative(docs, path).startsWith("playground"),
    );
    assert.ok(pages.length > 10, "no docs pages found");
    const problems = pages.flatMap((path) =>
        swallowedListItems(readFileSync(path, "utf8")).map((line) => `${relative(root, path)}:${line}`),
    );
    assert.deepEqual(problems, [], "add a blank line before these list items");
});
