// The license texts of the packages an esbuild bundle contains, as one text: what a package that
// bundles third-party code ships as dist/THIRD_PARTY_LICENSES.txt (pivotkit-xlsx).
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * The package directories (node_modules/<name> or node_modules/@scope/<name>) of the bundled inputs.
 * @param {import("esbuild").Metafile} metafile
 */
export function bundledPackages(metafile) {
    const dirs = new Set();
    for (const input of Object.keys(metafile.inputs)) {
        const m = /^(.*node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/.exec(input);
        if (m) dirs.add(m[1]);
    }
    return [...dirs].sort();
}

/**
 * The license and notice files of the bundled packages, one entry per name and version.
 * @param {import("esbuild").Metafile} metafile
 * @param {string} base  the build's working directory (metafile paths are relative to it)
 * @param {string} intro  the first lines: who bundles what
 * @param {string[]} [vendored]  directories (relative to `base`) of packages a bundled package carries a copy of
 *   in its own files, so the bundle holds their code without importing them (read-excel-file's saxen)
 */
export async function thirdPartyLicenses(metafile, base, intro, vendored = []) {
    const parts = [intro, ""];
    const seen = new Set();
    for (const dir of [...bundledPackages(metafile), ...vendored]) {
        const abs = resolve(base, dir);
        const meta = JSON.parse(await readFile(join(abs, "package.json"), "utf8"));
        const id = `${meta.name}@${meta.version}`;
        if (seen.has(id)) continue;
        seen.add(id);
        parts.push("=".repeat(78), `${meta.name} ${meta.version} (${meta.license})`, "=".repeat(78), "");
        const files = [];
        for (const entry of await readdir(abs, { withFileTypes: true })) {
            if (!/^(licen[cs]es?|notice|copying)/i.test(entry.name)) continue;
            if (entry.isFile()) files.push(entry.name);
            else if (entry.isDirectory()) files.push(...(await readdir(join(abs, entry.name))).map((f) => join(entry.name, f)));
        }
        if (files.length === 0) throw new Error(`${meta.name}: no license file to bundle`);
        for (const f of files.sort()) parts.push(`--- ${f} ---`, "", (await readFile(join(abs, f), "utf8")).trim(), "");
    }
    return parts.join("\n");
}
