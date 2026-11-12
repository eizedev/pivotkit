// Checks that every link to the documentation site in the package READMEs (and the root README)
// points at a page and heading anchor that exist in a built site. Published npm READMEs cannot be
// changed, so these paths and anchors are a contract: a page or heading they name keeps its address.
//
//   node scripts/check-readme-links.js site      # the directory `zensical build` wrote
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { siteUrl as readSiteUrl } from "./site-url.js";

const siteDir = process.argv[2];
if (!siteDir) {
    console.error("usage: node scripts/check-readme-links.js <built site directory>");
    process.exit(2);
}
const repo = new URL("..", import.meta.url);
const siteUrl = readSiteUrl();
const readmes = ["README.md", "packages/pivotkit-core/README.md", "packages/pivotkit-react/README.md", "packages/pivotkit-element/README.md"];
const escaped = siteUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const linkPattern = new RegExp(`\\]\\((${escaped}[^)\\s]*)\\)`, "g");

let checked = 0;
const problems = [];
for (const readme of readmes) {
    const text = readFileSync(new URL(readme, repo), "utf8");
    const urls = new Set([...text.matchAll(linkPattern)].map((m) => m[1]));
    for (const url of urls) {
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
