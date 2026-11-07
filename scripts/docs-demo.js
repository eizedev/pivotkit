// Copies the built playground and the web component example into docs/playground/, where the
// documentation site serves them as static files (the "Live demo" page embeds them). The browser test
// pages (dist/pages/) stay out; and pivotkit-core's view file schema into docs/schema/. Both are build
// output and not committed.
//
//   npm run build:playground && node scripts/docs-demo.js     (npm run docs:demo does both)
import { cp, rm, stat } from "node:fs/promises";

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
