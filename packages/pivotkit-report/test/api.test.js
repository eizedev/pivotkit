import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as report from "pivotkit-report";
import * as template from "pivotkit-report/template";
import * as operations from "pivotkit-report/operations";

test("the package exports its documented entry points and nothing else", () => {
    assert.deepEqual(Object.keys(report).sort(), ["CHART_SIZE", "DARK_TOKENS", "DEFAULT_TEMPLATE", "LIGHT_TOKENS", "RENDER_FORMATS", "REPORT_CSP", "REPORT_ISSUE_CODES", "REPORT_LIMITS", "REPORT_TEXTS", "SHAPE_TOKENS", "SIZE_TOKENS", "WEIGHT_TOKENS", "cleanSvg", "render"]);
    assert.deepEqual(Object.keys(template).sort(), ["ATTRIBUTES", "PLACEHOLDERS", "TEMPLATE_LIMIT", "escapeHtml", "fillTemplate", "parseTemplate"]);
    assert.deepEqual(Object.keys(operations).sort(), ["FINDING_TEXT", "LAYOUT_NOTE_SEVERITY", "OPERATIONS", "OPERATION_ERRORS", "OPERATION_NAMES", "OperationError", "VIEW_GUIDE", "checkInput", "exampleViews", "findingOf", "findingText", "viewOfLayout"]);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), [".", "./template", "./operations", "./package.json"]);
    assert.equal(report.REPORT_LIMITS.template, template.TEMPLATE_LIMIT);
});

test("the sources import nothing Node has and browsers do not: no node: modules, no echarts", () => {
    // every source file, in folders too
    const files = readdirSync(new URL("../src/", import.meta.url), { recursive: true })
        .map((f) => f.replaceAll("\\", "/"))
        .filter((f) => f.endsWith(".js"));
    assert.ok(files.includes("operations.js") && files.includes("operations/errors.js"));
    for (const file of files) {
        const text = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
        for (const [, spec] of text.matchAll(/^(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm)) {
            assert.ok(spec.startsWith(".") || spec.startsWith("pivotkit-core"), `${file} imports ${spec}`);
        }
    }
});
