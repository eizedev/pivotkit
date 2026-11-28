/*
 * The viewer page's files: its own script and style (packages/pivotkit-server/viewer/) and the
 * built pivot-report element (pivotkit-element's dist/, installed next to pivotkit-server). The
 * list is made once, at start, from those two directories: a request names a file of the list or
 * gets 404, so no path of a request ever reaches the file system.
 */

import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The viewer's own files, next to src/. */
const OWN_DIR = fileURLToPath(new URL("../../viewer/", import.meta.url));

/** The types of the files served. */
const TYPES = Object.freeze({ ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" });

/** The headers of every file: cached for a while, never sniffed, for this origin's pages only. */
const FILE_HEADERS = Object.freeze({ "cache-control": "max-age=300", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", "referrer-policy": "no-referrer" });

/** Where pivotkit-element's built files are, or null when it is not installed or not built. */
function elementDir() {
    try {
        return join(dirname(createRequire(import.meta.url).resolve("pivotkit-element/package.json")), "dist");
    } catch {
        return null;
    }
}

/**
 * The .js and .css files of a directory and its subdirectories, by their path below it.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function filesOf(dir) {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((e) => e.isFile() && /\.(js|css)$/.test(e.name) && e.name !== "import-worker.js")
        .map((e) => join(e.parentPath, e.name).slice(dir.length + 1).split("\\").join("/"));
}

/**
 * The viewer's files: `ready` tells whether the element is there (the page cannot show a report
 * without it); `answer(name)` is a file's answer, or null for a name the list does not hold.
 * @param {{ ownDir?: string, elementDir?: string | null }} [where]  other directories (tests)
 */
export async function viewerAssets(where = {}) {
    const own = where.ownDir ?? OWN_DIR;
    const element = where.elementDir === undefined ? elementDir() : where.elementDir;
    /** @type {Map<string, string>} the published name and the file it is */
    const list = new Map();
    for (const name of await filesOf(own).catch(() => [])) {
        list.set(name, join(own, name));
    }
    const elementFiles = element ? await filesOf(element).catch(() => []) : [];
    for (const name of elementFiles) {
        list.set(`element/${name}`, join(/** @type {string} */ (element), name));
    }
    /** @type {Map<string, Promise<Buffer>>} */
    const read = new Map();
    return {
        ready: elementFiles.includes("index.js") && list.has("viewer.js"),
        /**
         * @param {string} name  the path below /live/_/
         * @param {boolean} head
         * @returns {Promise<Response | null>}
         */
        async answer(name, head) {
            const file = list.get(name);
            if (!file) {
                return null;
            }
            if (!read.has(name)) {
                read.set(name, readFile(file));
            }
            const bytes = await /** @type {Promise<Buffer>} */ (read.get(name));
            const type = TYPES[/** @type {".js" | ".css"} */ (name.slice(name.lastIndexOf(".")))];
            return new Response(head ? null : new Uint8Array(bytes), { headers: { ...FILE_HEADERS, "content-type": type, "content-length": String(bytes.length) } });
        }
    };
}
