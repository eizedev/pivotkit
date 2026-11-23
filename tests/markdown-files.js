// The Markdown files of this repository that the repository checks read, defined once: the pages of
// the docs site, and the files a reader takes as the current state. Changelogs and decision records
// keep history, so the current-state checks leave them out.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { filesUnder, root } from "./source-files.js";

/** The docs site's source; docs/playground/ is the built live demo, not pages. */
export const DOCS = join(root, "docs");

/** A path relative to `base`, with forward slashes. */
const posix = (base, path) => relative(base, path).split(sep).join("/");

/**
 * The pages of the docs site, relative to docs/ ("use/filters.md").
 * @param {string} [docs]
 * @returns {string[]}
 */
export function sitePages(docs = DOCS) {
    return filesUnder(docs, (name) => name.endsWith(".md"))
        .map((path) => posix(docs, path))
        .filter((path) => !path.startsWith("playground/"))
        .sort();
}

/**
 * Every AGENTS.md of the repository at `dir`, relative to it: from git where `dir` is a checkout,
 * else from a walk outside build output.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function agentsFiles(dir = root) {
    // the ceiling keeps git from answering for a repository that only encloses dir
    const git = spawnSync("git", ["ls-files", "--", "AGENTS.md", "**/AGENTS.md"], { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) } });
    if (git.status === 0) return git.stdout.split("\n").filter(Boolean).sort();
    return filesUnder(dir, (name) => name === "AGENTS.md").map((path) => posix(dir, path)).sort();
}

/**
 * The Markdown a reader takes as the current state, relative to the root: the READMEs of the root
 * and the workspaces, every AGENTS.md, the root's guides and the docs pages outside docs/decisions/.
 * @returns {string[]}
 */
export function currentStateDocs() {
    const workspaces = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces;
    const guides = ["README.md", "CONTRIBUTING.md", "PRODUCT.md", "RELEASING.md", "SECURITY.md"];
    const files = [
        ...guides,
        ...agentsFiles(),
        ...workspaces.map((w) => `${w}/README.md`),
        ...sitePages().filter((path) => !path.startsWith("decisions/")).map((path) => `docs/${path}`)
    ];
    return [...new Set(files)].filter((path) => existsSync(join(root, path)));
}
