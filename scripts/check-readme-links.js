// Checks that every link to the documentation site in the package READMEs (and the root README)
// points at a page and heading anchor that exist in a built site. Published npm READMEs cannot be
// changed, so these paths and anchors are a contract: a page or heading they name keeps its address.
// A link counts in Markdown, [text](url), and in HTML, href="url".
//
//   node scripts/check-readme-links.js site      # the directory `zensical build` wrote
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMain } from "./is-main.js";
import { siteUrl as readSiteUrl } from "./site-url.js";

/**
 * The links to `siteUrl` in a README's text, each once.
 * @param {string} text
 * @param {string} siteUrl  without a trailing slash
 * @returns {string[]}
 */
export function siteLinks(text, siteUrl) {
    const escaped = siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // the site's address, then a path or an anchor: never a longer host name that starts the same
    const pattern = new RegExp(`\\]\\((${escaped}(?:[/#][^)\\s]*)?)\\)|href="(${escaped}(?:[/#][^"\\s]*)?)"`, "g");
    return [...new Set([...text.matchAll(pattern)].map((m) => m[1] ?? m[2]))];
}

if (isMain(import.meta.url)) {
    const siteDir = process.argv[2];
    if (!siteDir) {
        console.error("usage: node scripts/check-readme-links.js <built site directory>");
        process.exit(2);
    }
    const repo = new URL("..", import.meta.url);
    const siteUrl = readSiteUrl();
    const readmes = ["README.md", ...readdirSync(new URL("../packages/", import.meta.url)).sort().map((name) => `packages/${name}/README.md`)];
    let checked = 0;
    const problems = [];
    for (const readme of readmes) {
        for (const url of siteLinks(readFileSync(new URL(readme, repo), "utf8"), siteUrl)) {
            checked++;
            const [path, anchor] = url.slice(siteUrl.length).split("#");
            const file = join(siteDir, path.endsWith("/") || path === "" ? join(path, "index.html") : path);
            if (!existsSync(file)) {
                problems.push(`${readme}: no page for ${url}`);
                continue;
            }
            if (anchor && !readFileSync(file, "utf8").includes(`id="${anchor}"`)) problems.push(`${readme}: no anchor for ${url}`);
        }
    }
    console.log(`${checked} links to ${siteUrl} checked`);
    if (problems.length) {
        console.error(problems.join("\n"));
        process.exit(1);
    }
}
