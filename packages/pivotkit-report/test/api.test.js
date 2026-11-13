import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as report from "pivotkit-report";
import * as template from "pivotkit-report/template";

test("the package exports its documented entry points and nothing else", () => {
    assert.deepEqual(Object.keys(report).sort(), ["CHART_SIZE", "DARK_TOKENS", "DEFAULT_TEMPLATE", "LIGHT_TOKENS", "RENDER_FORMATS", "REPORT_CSP", "REPORT_ISSUE_CODES", "REPORT_LIMITS", "REPORT_TEXTS", "SHAPE_TOKENS", "SIZE_TOKENS", "WEIGHT_TOKENS", "cleanSvg", "render"]);
    assert.deepEqual(Object.keys(template).sort(), ["ATTRIBUTES", "PLACEHOLDERS", "TEMPLATE_LIMIT", "escapeHtml", "fillTemplate", "parseTemplate"]);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(pkg.exports), [".", "./template", "./package.json"]);
    assert.equal(report.REPORT_LIMITS.template, template.TEMPLATE_LIMIT);
});

test("the sources import nothing Node has and browsers do not: no node: modules, no echarts", () => {
    for (const file of ["index.js", "render.js", "svg.js", "template.js", "html-table.js", "report-css.js", "tokens.js", "texts.js", "default-template.js"]) {
        const text = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
        for (const [, spec] of text.matchAll(/^(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm)) {
            assert.ok(spec.startsWith(".") || spec.startsWith("pivotkit-core"), `${file} imports ${spec}`);
        }
    }
});
