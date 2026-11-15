// Builds dist/ of pivotkit-xlsx for pages without a bundler (the web component with an import map or
// a script tag): dist/index.js is the plugin's descriptor; the reader, with read-excel-file, fflate and
// the part of pivotkit-core/import it uses, is a chunk loaded on the first workbook. A bundler uses
// src/ through the package's exports instead. Writes dist/THIRD_PARTY_LICENSES.txt.
//
//   node build.js          build
//   node build.js --size   build, print the gzip size of the descriptor and the reader, fail above SIZE_BUDGET_KIB
import * as esbuild from "esbuild";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { thirdPartyLicenses } from "../../scripts/third-party-licenses.js";
import { isMain } from "../../scripts/is-main.js";

const here = fileURLToPath(new URL(".", import.meta.url));
/** saxen as installed for read-excel-file: its license covers the copy read-excel-file carries. */
const SAXEN = dirname(createRequire(fileURLToPath(import.meta.resolve("read-excel-file/package.json"))).resolve("saxen/package.json"));

/**
 * The most each part may be, gzip, in KiB, with a little room: the descriptor, and the reader with
 * read-excel-file, fflate's inflate, the XML guard (xml.js) and the table of pivotkit-core/import.
 * Measured 0.2 and 30.6 on a Mac, Node 26, when set; the reader 31.4 after the count of shared
 * strings and formats and the markup inside rows (#237, #238), and CI's Node 24 measures about
 * 0.2 KiB more than Node 26, so the reader's budget went from 31.5 to 32. The pre-parse filter
 * that reads a sheet as the parser does (GHSA-c6vh-q36c-92r3) measures 32.0 on the Mac and 32.2 in
 * CI, so the reader's budget is 33.
 */
export const SIZE_BUDGET_KIB = { plugin: 0.5, reader: 33 };

/** @type {import("esbuild").BuildOptions} */
export const options = {
    absWorkingDir: here,
    entryPoints: { index: "src/index.js" },
    outdir: "dist",
    bundle: true,
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    format: "esm",
    platform: "browser",
    // the browsers pivotkit supports (pivotkit-react's build)
    target: ["es2022", "chrome111", "firefox113", "safari16.4"],
    minify: true,
    legalComments: "none",
    metafile: true,
    logLevel: "warning"
};

export async function build() {
    await rm(join(here, "dist"), { recursive: true, force: true });
    const result = await esbuild.build(options);
    await writeFile(
        join(here, "dist/THIRD_PARTY_LICENSES.txt"),
        // read-excel-file carries its own copy of saxen (modules/saxen/parser.js)
        await thirdPartyLicenses(result.metafile, here, "pivotkit-xlsx's dist/ bundles the following packages. Their license texts follow; pivotkit-core is part of pivotkit (MIT, see LICENSE).", [SAXEN])
    );
    return result.metafile;
}

/** Bytes and gzip bytes of the descriptor, and of the reader with the chunks it imports (not the CSV and JSON readers of pivotkit-core/import, which it never loads). */
export async function sizes(metafile) {
    const closure = (file, seen = new Set()) => {
        if (seen.has(file)) return seen;
        seen.add(file);
        for (const imp of metafile.outputs[file]?.imports ?? []) if (imp.kind === "import-statement") closure(imp.path, seen);
        return seen;
    };
    const reader = Object.keys(metafile.outputs).find((f) => /[\\/]reader-[^\\/]+\.js$/.test(f));
    const out = {};
    for (const [part, files] of [["plugin", closure("dist/index.js")], ["reader", closure(reader)]]) {
        let raw = 0;
        let gzip = 0;
        for (const file of files) {
            const bytes = await readFile(join(here, file));
            raw += bytes.length;
            gzip += gzipSync(bytes, { level: 9 }).length;
        }
        out[part] = { raw, gzip };
    }
    return out;
}

if (isMain(import.meta.url)) {
    const metafile = await build();
    if (process.argv.includes("--size")) {
        const kib = (n) => (n / 1024).toFixed(1);
        let over = false;
        for (const [part, { raw, gzip }] of Object.entries(await sizes(metafile))) {
            const budget = SIZE_BUDGET_KIB[part];
            console.log(`${part.padEnd(7)} ${kib(raw).padStart(7)} KiB, gzip ${kib(gzip).padStart(6)} KiB (budget ${budget} KiB)`);
            if (gzip / 1024 > budget) over = true;
        }
        if (over) {
            console.error("over the size budget (SIZE_BUDGET_KIB in build.js)");
            process.exit(1);
        }
    }
}
