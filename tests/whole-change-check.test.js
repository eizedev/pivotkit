// scripts/whole-change-check.js: which changes need the description's whole-change check, what counts
// as one, and who is exempt. The workflow that runs it is checked in tests/workflows.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check, exemption, inScope, sectionText } from "../scripts/whole-change-check.js";

const template = readFileSync(new URL("../.github/PULL_REQUEST_TEMPLATE.md", import.meta.url), "utf8");
const pr = (body, files = ["docs/use/fields.md"], more = {}) => check({ body, title: "docs: fields", author: "someone", files, ...more });

test("docs, READMEs, root Markdown, package sources and scripts need the check; the rest does not", () => {
    const needed = ["docs/use/fields.md", "docs/reference/view-file.md", "README.md", "packages/pivotkit-core/README.md", "AGENTS.md", "CONTRIBUTING.md", "packages/pivotkit-core/src/engine.js", "scripts/growth.js"];
    const not = ["docs/openapi.json", "packages/pivotkit-core/test/engine.test.js", "packages/pivotkit-core/package.json", "packages/pivotkit-core/CHANGELOG.md", "tests/ci.test.js", ".github/workflows/ci.yml", "package-lock.json"];
    assert.deepEqual(inScope([...needed, ...not]), needed);
});

test("the template as it is fails: its prompts are a comment", () => {
    assert.equal(sectionText(template), "");
    assert.equal(pr(template).ok, false);
});

test("the template with an answer under the heading passes", () => {
    const filled = template.replace(/(## Whole-change check\s*<!--[\s\S]*?-->)/, "$1\n\nfields.md: read whole; moved the folded details to filters.md.");
    assert.equal(pr(filled).ok, true);
});

test("a missing, empty or only-comment section fails, and the message says what to add", () => {
    for (const body of [null, undefined, "", "## Summary\n\nText.", "## Whole-change check\n\n## Test plan\n\nRan it.", "## Whole-change check\n<!-- later -->\n", "## Whole-change check\n\n- [ ]\n"]) {
        const result = pr(body);
        assert.equal(result.ok, false, JSON.stringify(body));
        assert.match(result.message, /docs\/use\/fields\.md/);
        assert.match(result.message, /"## Whole-change check" section with text/);
        assert.match(result.message, /PULL_REQUEST_TEMPLATE\.md/);
    }
});

test("the section ends at the next heading of level 1 or 2, not at a sub-heading", () => {
    assert.equal(sectionText("## Whole-change check\r\nRead it whole.\r\n## Test plan\r\nRan."), "Read it whole.");
    assert.equal(sectionText("## Summary\n\nx\n\n## Whole-change check\n\n### Docs\nRead it whole."), "### Docs\nRead it whole.");
    assert.equal(sectionText("# Title\n## whole-change check ##\nok\n# Next"), "ok");
    // a heading inside a comment or within a line does not count
    assert.equal(sectionText("<!-- ## Whole-change check\nnot here -->"), null);
    assert.equal(sectionText("Text about ## Whole-change check"), null);
    // a heading inside a code fence is text
    assert.equal(sectionText("```\n## Whole-change check\nfake\n```"), null);
    assert.equal(sectionText("## Whole-change check\n```\n## not a heading\n```\nRead it whole.\n## Test plan"), "```\n## not a heading\n```\nRead it whole.");
});

test("an unclosed comment hides the rest, as GitHub renders it", () => {
    assert.equal(sectionText("## Whole-change check\n<!-- started\nhidden text"), "");
});

test("a pull request without docs or code passes without the check", () => {
    const result = pr("", ["package-lock.json", "tests/ci.test.js"]);
    assert.deepEqual(result, { ok: true, message: "Whole-change check: not needed, no docs or code changed." });
});

test("Dependabot and release pull requests are exempt; other titles and authors are not", () => {
    assert.equal(exemption({ author: "dependabot[bot]", title: "build(deps): Bump x" }), "a Dependabot pull request");
    for (const title of ["chore(release): pivotkit 0.10.0", "chore(pivot): release Pivot 0.10.1", "chore(release)!: pivotkit 1.0.0", "chore: release pivotkit 0.8.1"]) {
        assert.equal(exemption({ author: "someone", title }), "a release pull request", title);
    }
    for (const [author, title] of [["dependabot", "x"], ["someone", "docs(release): findings of the release review"], ["someone", "feat: release notes page"], ["someone", "chore: released files"], ["someone", "chore(release): fold the unreleased entries into the 0.9.0 sections"], ["someone", "chore(docs): release notes page"]]) {
        assert.equal(exemption({ author, title }), null, `${author} ${title}`);
    }
    assert.equal(pr("", ["scripts/growth.js"], { author: "dependabot[bot]" }).ok, true);
    assert.equal(pr("", ["scripts/growth.js"], { title: "chore(release): pivotkit 0.10.0" }).ok, true);
});
