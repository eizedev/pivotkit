// scripts/docs-demo.js copies the built playground to the docs site without the browser test pages:
// the folder pages/ and what is in it stay out, a file whose name only starts with "pages" goes.
// The schema copy it makes is checked in view-file-schema.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, sep } from "node:path";
import { isSitePath } from "../scripts/docs-demo.js";

test("the site gets the playground without its pages/ folder", () => {
    const from = `${join("repo", "examples", "playground", "dist")}${sep}`;
    assert.equal(isSitePath(from, from), true);
    assert.equal(isSitePath(from, `${from}index.html`), true);
    assert.equal(isSitePath(from, `${from}pages.html`), true);
    assert.equal(isSitePath(from, `${from}pages-extra${sep}a.js`), true);
    assert.equal(isSitePath(from, `${from}pages`), false);
    assert.equal(isSitePath(from, `${from}pages${sep}host.html`), false);
});
