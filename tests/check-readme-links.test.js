// scripts/check-readme-links.js finds the README links to the docs site, in Markdown and in HTML,
// and only those.
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteLinks } from "../scripts/check-readme-links.js";

test("a README's links to the site: [text](url) and href=\"url\", each once, no other site", () => {
    const text = [
        '<a href="https://pivotkit.example/demo/"><img src="docs/a.png"></a>',
        "[Limits](https://pivotkit.example/concepts/limits/#limits) and [again](https://pivotkit.example/concepts/limits/#limits)",
        "[npm](https://www.npmjs.com/package/pivotkit-core), <a href=\"https://pivotkit.example.org/x/\">other</a>"
    ].join("\n");
    assert.deepEqual(siteLinks(text, "https://pivotkit.example"), ["https://pivotkit.example/demo/", "https://pivotkit.example/concepts/limits/#limits"]);
});
