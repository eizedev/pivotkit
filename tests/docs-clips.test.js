// The videos on the docs pages (docs/assets/clips/, recorded by scripts/docs-clips.js) follow one
// pattern, and their files exist. The strict build checks neither:
// - The build rewrites a <source src> as a link relative to the Markdown file, but leaves `poster` as it
//   is. The page is served one folder deeper (fields.md is use/fields/), so the poster takes one "../" more.
// - A clip plays only when asked: controls, no autoplay (WCAG 2.2.2), muted, nothing loaded before.
// - A caption says in words what the clip shows (WCAG 1.2.1), and the video names it as its description.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { filesUnder, root } from "./source-files.js";

const docs = join(root, "docs");
const FIGURE = /<figure\b[^>]*>([\s\S]*?)<\/figure>/g;
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}(?:="([^"]*)")?(?=[\\s>])`))?.[1] ?? (new RegExp(`\\b${name}(?=[\\s>=])`).test(tag) ? "" : undefined);

/** The folder a page is served from: use/fields.md is use/fields/, an index.md its own folder. */
const servedDir = (page) => (basename(page) === "index.md" ? dirname(page) : page.replace(/\.md$/, ""));

/** Every <figure> with a <video> in the docs, with its page. */
function clips() {
    return filesUnder(docs, (name) => name.endsWith(".md")).flatMap((page) =>
        [...readFileSync(page, "utf8").matchAll(FIGURE)].filter((m) => m[1].includes("<video")).map((m) => ({ page, figure: m[1], name: `${relative(root, page)}: ${m[1].match(/<source[^>]*src="([^"]*)"/)?.[1]}` }))
    );
}

test("the docs show at least one clip, so the checks below check something", () => {
    assert.ok(clips().length > 0);
});

for (const { page, figure, name } of clips()) {
    test(`a clip plays only when asked, with its caption: ${name}`, () => {
        const video = figure.match(/<video\b[^>]*>/)[0];
        for (const flag of ["controls", "muted", "playsinline"]) assert.equal(attr(video, flag), "", `<video> has ${flag}`);
        assert.equal(attr(video, "autoplay"), undefined, "no autoplay: the clip starts when the reader asks");
        assert.equal(attr(video, "preload"), "none", "nothing loads before the reader asks");
        assert.match(attr(video, "width") ?? "", /^\d+$/, "a width keeps the page from jumping");
        assert.match(attr(video, "height") ?? "", /^\d+$/, "a height keeps the page from jumping");
        const caption = figure.match(/<figcaption\b[^>]*\bid="([^"]+)"[^>]*>([^<]+)<\/figcaption>/);
        assert.ok(caption, "a <figcaption> with an id says what the clip shows");
        assert.equal(attr(video, "aria-describedby"), caption[1], "the video names its caption as its description");
    });

    test(`a clip's files exist where the built page looks for them: ${name}`, () => {
        const video = figure.match(/<video\b[^>]*>/)[0];
        const sources = [...figure.matchAll(/<source\b[^>]*>/g)].map((m) => m[0]);
        assert.ok(sources.length > 0, "the video names its file in a <source>");
        for (const source of sources) {
            assert.equal(attr(source, "type"), "video/webm");
            assert.ok(existsSync(resolve(dirname(page), attr(source, "src"))), `${attr(source, "src")} exists, relative to the Markdown file`);
        }
        const poster = attr(video, "poster");
        assert.ok(poster, "a poster: the still a reader sees before playing and with reduced motion");
        assert.ok(existsSync(resolve(servedDir(page), poster)), `${poster} exists, relative to the page as served`);
    });
}
