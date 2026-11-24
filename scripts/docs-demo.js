// Copies the built playground and the web component example into docs/playground/, where the
// documentation site serves them as static files (the "Live demo" page embeds them). The browser test
// pages (dist/pages/) stay out. Also pivotkit-core's view file schema into docs/schema/, the social
// preview (assets/) into docs/assets/ for the Open Graph tags of overrides/main.html, and writes
// docs/robots.txt with the sitemap's address. All of it is build output and not committed.
//
//   npm run build:playground && node scripts/docs-demo.js     (npm run docs:demo does both)
import { copyFile, cp, rm, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isMain } from "./is-main.js";
import { siteUrl } from "./site-url.js";

const root = new URL("../", import.meta.url);

/**
 * Whether a path under the playground's dist/ goes to the site: everything but the browser test
 * pages, the folder pages/ and what is in it. A file whose name only starts with "pages" goes.
 * @param {string} from  the dist/ directory, ending in a separator
 * @param {string} src  a path cp() hands its filter
 */
export const isSitePath = (from, src) => src !== `${from}pages` && !src.startsWith(`${from}pages${sep}`);

/**
 * Copies pivotkit-core's schema/ into `to`, the same bytes: the site publishes them at
 * https://pivotkit.eize.dev/schema/.
 * @param {string} to  a directory; replaced
 */
export async function copySchemas(to) {
    await rm(to, { recursive: true, force: true });
    await cp(fileURLToPath(new URL("packages/pivotkit-core/schema/", root)), to, { recursive: true });
}

if (isMain(import.meta.url)) {
    const from = fileURLToPath(new URL("examples/playground/dist/", root));
    const to = fileURLToPath(new URL("docs/playground/", root));
    try {
        await stat(`${from}index.html`);
    } catch {
        console.error("examples/playground/dist/ is missing: run npm run build:playground first");
        process.exit(1);
    }
    await rm(to, { recursive: true, force: true });
    await cp(from, to, { recursive: true, filter: (src) => isSitePath(from, src) });
    console.log("docs/playground/: the playground and the web component example");

    await copySchemas(join(fileURLToPath(root), "docs", "schema"));
    console.log("docs/schema/: the view file schema of pivotkit-core");

    // the image a link to the site shows (og:image), made in eizedev/brand and kept in assets/ only
    await copyFile(new URL("assets/social-preview.png", root), new URL("docs/assets/social-preview.png", root));
    console.log("docs/assets/social-preview.png: the social preview");

    // the example files with stable addresses (https://pivotkit.eize.dev/assets/examples/sales.csv): the
    // data and views `pivotkit example` writes, built from the playground's data (scripts/examples.js)
    const { buildExamples, writeExamples } = await import("./examples.js");
    await writeExamples(new URL("docs/assets/examples/", root), await buildExamples());
    console.log("docs/assets/examples/: the example data and views");

    // every page may be crawled; the sitemap is the one Zensical writes
    await writeFile(new URL("docs/robots.txt", root), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl()}/sitemap.xml\n`);
    console.log("docs/robots.txt: points at the sitemap");
}
