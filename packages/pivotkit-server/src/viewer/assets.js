/*
 * The viewer page's files: its own script and style (packages/pivotkit-server/viewer/) and the
 * built pivot-report element (pivotkit-element's dist/, installed next to pivotkit-server). The
 * list is made once, at start, from those two directories: a request names a file of the list or
 * gets 404, so no path of a request ever reaches the file system.
 *
 * The files' names carry no version, so a browser asks again on every use (no-cache) and gets 304
 * while the file is the same (its ETag, a digest of its bytes): after an upgrade it never mixes the
 * element's old chunks with new ones.
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fitsRange } from "../version-range.js";

/** The viewer's own files, next to src/. */
const OWN_DIR = fileURLToPath(new URL("../../viewer/", import.meta.url));

/** The types of the files served. */
const TYPES = Object.freeze({ ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" });

/** The headers of every file: checked again on every use, never sniffed, for this origin's pages only. */
const FILE_HEADERS = Object.freeze({ "cache-control": "no-cache", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin", "referrer-policy": "no-referrer" });

/** pivotkit-element's package.json where it is installed next to pivotkit-server, or null. */
function elementPackage() {
    try {
        return createRequire(import.meta.url).resolve("pivotkit-element/package.json");
    } catch {
        return null;
    }
}

/** Where pivotkit-element's built files are, or null when it is not installed. */
function elementDir() {
    const file = elementPackage();
    return file ? join(dirname(file), "dist") : null;
}

/**
 * Why the installed pivotkit-element cannot serve the page, or null: a version outside the range
 * pivotkit-server needs (its optional peer dependency) has a report that cannot read rows from the
 * server. Null too where it is not installed (viewerAssets' `ready` says that).
 * @param {string | null} [file]  its package.json (tests); the one installed next to pivotkit-server
 * @returns {string | null}
 */
export function elementProblem(file = elementPackage()) {
    const require = createRequire(import.meta.url);
    const needs = require("../../package.json").peerDependencies["pivotkit-element"];
    const version = file ? require(file).version : null;
    return version && fitsRange(needs, version) === false ? `pivotkit-element ${version} is installed, but the viewer page needs ${needs}: its report cannot read rows from the server; install a version in that range` : null;
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
        .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join("/"));
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
    /** @type {Map<string, Promise<{ bytes: Buffer, etag: string }>>} */
    const read = new Map();
    return {
        ready: elementFiles.includes("index.js") && list.has("viewer.js"),
        /**
         * @param {string} name  the path below /live/_/
         * @param {boolean} head
         * @param {string | null} [known]  the request's If-None-Match
         * @returns {Promise<Response | null>}
         */
        async answer(name, head, known = null) {
            const file = list.get(name);
            if (!file) {
                return null;
            }
            if (!read.has(name)) {
                read.set(name, readFile(file).then((bytes) => ({ bytes, etag: `"${createHash("sha256").update(bytes).digest("base64url").slice(0, 27)}"` })));
            }
            const { bytes, etag } = await /** @type {Promise<{ bytes: Buffer, etag: string }>} */ (read.get(name));
            if (known !== null && known.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
                return new Response(null, { status: 304, headers: { ...FILE_HEADERS, etag } });
            }
            const type = TYPES[/** @type {".js" | ".css"} */ (name.slice(name.lastIndexOf(".")))];
            return new Response(head ? null : new Uint8Array(bytes), { headers: { ...FILE_HEADERS, etag, "content-type": type, "content-length": String(bytes.length) } });
        }
    };
}
