// Copies the built playground and the web component example into docs/playground/, where the
// documentation site serves them as static files (the "Live demo" page embeds them). The browser test
// pages (dist/pages/) stay out. docs/playground/ is build output and not committed.
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
