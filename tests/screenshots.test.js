// The docs' screenshots (docs/assets/screenshots): every picture is shown somewhere, comes as a light
// and a dark one, and is shown with alt text and the fragment that picks it for its theme
// (#only-light, #only-dark), so the site shows one of the two (AGENTS.md, "Pages and screenshots").
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { sitePages } from "./markdown-files.js";

const root = new URL("../", import.meta.url);
const DIR = "docs/assets/screenshots";
const entries = readdirSync(new URL(`${DIR}/`, root), { withFileTypes: true });
const IMAGE = /\.(png|webp|jpe?g|gif|svg|avif)$/i;
const files = entries.filter((e) => e.isFile() && IMAGE.test(e.name)).map((e) => e.name);

test("the folder holds screenshots only, no subfolders and no other files", () => {
    // a file the other checks skip could be shown nowhere or lack its partner unseen
    assert.deepEqual(entries.filter((e) => !e.isFile() || !IMAGE.test(e.name)).map((e) => e.name), []);
});
/** Every Markdown image of the docs and the READMEs that shows a screenshot: [file, alt, fragment, page]. */
const shown = [...sitePages().map((p) => `docs/${p}`), "README.md", ...readdirSync(new URL("packages/", root)).map((p) => `packages/${p}/README.md`)]
    .filter((page) => existsSync(new URL(page, root)))
    .flatMap((page) => [...readFileSync(new URL(page, root), "utf8").matchAll(/!\[([^\]]*)\]\(([^)\s]*assets\/screenshots\/([^)#\s]+))(#[\w-]+)?\)/g)].map((m) => ({ file: m[3], alt: m[1], fragment: m[4] ?? "", page })));

test("every screenshot is shown on a page", () => {
    const used = new Set(shown.map((s) => s.file));
    // the README's hero is a <picture> with srcset, not a Markdown image
    const readme = readFileSync(new URL("README.md", root), "utf8");
    assert.deepEqual(files.filter((f) => !used.has(f) && !readme.includes(f)), []);
});

test("every screenshot comes as a light and a dark one", () => {
    const pairs = new Map();
    for (const f of files) {
        const m = /^(.+)-(light|dark)\.\w+$/i.exec(f);
        assert.ok(m, `${f}: named <name>-light or <name>-dark`);
        pairs.set(m[1], [...(pairs.get(m[1]) ?? []), m[2]]);
    }
    assert.deepEqual([...pairs].filter(([, themes]) => themes.length !== 2).map(([name]) => name), []);
});

test("a shown screenshot exists, has alt text and on the docs site the fragment of its theme", () => {
    const wrong = shown
        .filter((s) => !existsSync(new URL(`${DIR}/${s.file}`, root)) || s.alt.trim() === "" || (s.page.startsWith("docs/") && s.fragment !== `#only-${/-(light|dark)\.\w+$/.exec(s.file)?.[1]}`))
        .map((s) => `${s.page}: ${s.file}${s.fragment}`);
    assert.deepEqual(wrong, []);
});
