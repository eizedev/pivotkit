// The growth guards of scripts/growth.js: how they read ESLint, knip and the docs, and how a ratchet
// compares with its baseline. CI runs the guards themselves (.github/workflows/ci.yml).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS_LIMITS, DOCS_TOTAL_MARGIN, FUNCTION_LIMITS, GUARD_NAMES, compareCounts, compareLists, compareTotal, docsLimit, docsPages, formatBaseline, measureDocs, measureFunctions, parseFunctionMessage, parseKnipReport } from "../scripts/growth.js";
import { tempDir } from "./temp-dir.js";

test("the installed ESLint's messages give each function's name and numbers", async () => {
    const dir = tempDir("growth-eslint");
    mkdirSync(join(dir, "packages/a/src"), { recursive: true });
    writeFileSync(join(dir, "eslint.config.js"), "export default [{}];\n");
    const statements = (n) => Array.from({ length: n }, (_, i) => `    if (x > ${i}) x -= 1;`).join("\n");
    writeFileSync(join(dir, "packages/a/src/index.js"), [
        // a disable comment does not hide a function from the guard
        "// eslint-disable-next-line max-lines-per-function, complexity",
        `export function long(x) {\n${statements(FUNCTION_LIMITS.lines + 5)}\n    return x;\n}`,
        `export const small = (x) => x + 1;`,
        `export const branched = (x) => {\n${statements(FUNCTION_LIMITS.complexity + 1)}\n    return x;\n};`,
    ].join("\n"));
    const found = await measureFunctions(dir);
    // the head, the statements, the return and the closing brace
    assert.deepEqual(found.lines, { "packages/a/src/index.js Function 'long'": [FUNCTION_LIMITS.lines + 5 + 3] });
    // one path plus one per if; complexity names an arrow function without its variable
    assert.deepEqual(found.complexity, {
        "packages/a/src/index.js Function 'long'": [FUNCTION_LIMITS.lines + 5 + 1],
        "packages/a/src/index.js Arrow function": [FUNCTION_LIMITS.complexity + 2],
    });
});

test("a message in other words fails instead of counting nothing", () => {
    assert.deepEqual(parseFunctionMessage({ ruleId: "complexity", message: "Method 'x' has a complexity of 30. Maximum allowed is 25." }), { metric: "complexity", name: "Method 'x'", value: 30 });
    assert.throws(() => parseFunctionMessage({ ruleId: "complexity", message: "Method 'x' is too complex (30)." }), /unexpected ESLint message/);
    assert.throws(() => parseFunctionMessage({ ruleId: "no-undef", message: "'x' is not defined." }), /unexpected ESLint message/);
});

test("compareCounts: growth and new offenders fail as grown, shrinking and going as stale", () => {
    const baseline = { "a.js f": [200], "a.js g": [150], "a.js Arrow function": [300, 130] };
    assert.deepEqual(compareCounts(baseline, baseline, "lines"), { grew: [], stale: [] });
    const { grew, stale } = compareCounts(baseline, { "a.js f": [210], "a.js Arrow function": [300, 130], "b.js h": [121] }, "lines");
    assert.deepEqual(grew, ["a.js f: 210 lines, baseline 200", "b.js h: 121 lines, new"]);
    assert.deepEqual(stale, ["a.js g: 150 lines in the baseline, now within the limit"]);
    assert.deepEqual(compareCounts(baseline, { ...baseline, "a.js f": [190] }, "lines").stale, ["a.js f: 190 lines, baseline 200"]);
});

test("compareCounts: anonymous functions of one file compare by their sorted numbers, not by position", () => {
    const baseline = { "a.js Arrow function": [300, 130] };
    // a third one appeared between them: one more offender, the others unchanged
    assert.deepEqual(compareCounts(baseline, { "a.js Arrow function": [300, 200, 130] }, "lines"), { grew: ["a.js Arrow function: 200 lines, new"], stale: [] });
    // the smaller one grew
    assert.deepEqual(compareCounts(baseline, { "a.js Arrow function": [300, 140] }, "lines"), { grew: ["a.js Arrow function: 140 lines, baseline 130"], stale: [] });
    assert.deepEqual(compareCounts(baseline, { "a.js Arrow function": [300, 130] }, "lines"), { grew: [], stale: [] });
});

test("compareLists and compareTotal", () => {
    assert.deepEqual(compareLists(["a.js exports x", "b.js files"], ["a.js exports x", "c.js exports y"]), { grew: ["c.js exports y"], stale: ["b.js files: gone"] });
    const margin = 10 * DOCS_TOTAL_MARGIN;
    assert.deepEqual(compareTotal(1000, 1000 + margin), { grew: [], stale: [] });
    assert.equal(compareTotal(1000, 1000 + margin + 1).grew.length, 1);
    assert.equal(compareTotal(1000, 1000 - margin - 1).stale.length, 1);
});

test("parseKnipReport lists files, exports and duplicates and refuses another shape", () => {
    const report = {
        issues: [
            { file: "src/a.js", owners: ["@x"], files: [{ name: "src/a.js" }], exports: [{ name: "b", line: 1 }, { name: "a", line: 2 }], types: [], duplicates: [] },
            { file: "src/i.js", owners: [], files: [], exports: [], duplicates: [[{ name: "reader" }, { name: "default" }]] },
        ],
    };
    assert.deepEqual(parseKnipReport(JSON.stringify(report)), ["src/a.js exports a", "src/a.js exports b", "src/a.js files", "src/i.js duplicates reader=default"]);
    assert.throws(() => parseKnipReport(JSON.stringify({ files: [] })), /no issues list/);
});

test("docs pages count their lines by kind; a folder without a limit fails", () => {
    const dir = tempDir("growth-docs");
    mkdirSync(join(dir, "use"));
    mkdirSync(join(dir, "playground"));
    writeFileSync(join(dir, "use/long.md"), "x\n".repeat(DOCS_LIMITS.use + 1));
    writeFileSync(join(dir, "use/short.md"), "x\ny");
    writeFileSync(join(dir, "index.md"), "x\n");
    writeFileSync(join(dir, "playground/built.md"), "x\n".repeat(1000));
    const pages = docsPages(dir);
    assert.deepEqual(pages, { "docs/use/long.md": DOCS_LIMITS.use + 1, "docs/use/short.md": 2, "docs/index.md": 1 });
    assert.deepEqual(measureDocs(pages), { pages: { "docs/use/long.md": [DOCS_LIMITS.use + 1] }, totalLines: DOCS_LIMITS.use + 4 });
    assert.throws(() => docsLimit("docs/new-kind/page.md"), /docs\/new-kind\/ has no line limit/);
});

test("every docs page of the repository has a kind with a limit", () => {
    for (const page of Object.keys(docsPages())) assert.ok(docsLimit(page) > 0, page);
});

test("the committed baseline is sorted, one entry per line, as --update writes it", () => {
    const text = readFileSync(new URL("../scripts/growth-baseline.json", import.meta.url), "utf8");
    assert.equal(formatBaseline(JSON.parse(text)), text, "scripts/growth-baseline.json was edited by hand: run node scripts/growth.js --update");
});

test("CI's test job runs every guard in a step of its own", () => {
    const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    for (const name of GUARD_NAMES) assert.match(ci, new RegExp(`^ {8}run: node scripts/growth\\.js ${name}$`, "m"), `ci.yml runs no step "node scripts/growth.js ${name}"`);
});
