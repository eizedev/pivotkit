// Copies the built playground and the web component example into docs/playground/, where the
// documentation site serves them as static files (the "Live demo" page embeds them). The browser test
// pages (dist/pages/) stay out. Also pivotkit-core's view file schema into docs/schema/, the social
// preview (assets/) into docs/assets/ for the Open Graph tags of overrides/main.html, and writes
// docs/robots.txt with the sitemap's address. All of it is build output and not committed.
//
//   npm run build:playground && node scripts/docs-demo.js     (npm run docs:demo does both)
import { copyFile, cp, rm, stat, writeFile } from "node:fs/promises";
import { siteUrl } from "./site-url.js";

const root = new URL("../", import.meta.url);
const from = new URL("examples/playground/dist/", root).pathname;
const to = new URL("docs/playground/", root).pathname;

try {
    await stat(`${from}index.html`);
} catch {
    console.error("examples/playground/dist/ is missing: run npm run build:playground first");
    process.exit(1);
}
await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true, filter: (src) => !src.startsWith(`${from}pages`) });
console.log("docs/playground/: the playground and the web component example");

// the view file's JSON Schema, published at https://pivotkit.eize.dev/schema/: pivotkit-core's own
// file (it ships in the package), the same bytes
const schemaFrom = new URL("packages/pivotkit-core/schema/", root).pathname;
const schemaTo = new URL("docs/schema/", root).pathname;
await rm(schemaTo, { recursive: true, force: true });
await cp(schemaFrom, schemaTo, { recursive: true });
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
