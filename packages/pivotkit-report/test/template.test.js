// The print template's check: placeholders in text and in the allowed attributes only, everything
// else refused before anything is rendered, and what is filled in escaped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError } from "pivotkit-core";
import { DEFAULT_TEMPLATE, REPORT_CSP, render } from "pivotkit-report";
import { ATTRIBUTES, PLACEHOLDERS, TEMPLATE_LIMIT, escapeHtml, fillTemplate, parseTemplate } from "pivotkit-report/template";
import { FIXED, SALES } from "./fixtures.js";

const refused = (source, reason) =>
    assert.throws(() => parseTemplate(source), (e) => e instanceof PivotkitError && e.code === "INVALID_TEMPLATE" && e.details.reason === reason, `${reason}: ${source}`);

test("allowed: text content, <title>, the allowed attributes and a meta description's content", () => {
    const t = parseTemplate('<html lang="{{lang}}" dir=\'{{dir}}\'><head><title>{{title}} - {{source}}</title><meta name="description" content="{{summary}}">{{style}}</head><body><p title="{{filters}}" class="x {{dir}}">{{rows}}</p>{{table}}</body></html>');
    assert.deepEqual(t.names.sort(), ["dir", "filters", "lang", "rows", "source", "style", "summary", "table", "title"]);
    const out = fillTemplate(t, { lang: "en", dir: "ltr", title: "A & B", source: "<x>", summary: '"q"', style: "<style>p{}</style>", filters: "'f'", rows: "3 rows", table: "<table></table>" });
    assert.equal(out, '<html lang="en" dir=\'ltr\'><head><title>A &amp; B - &lt;x&gt;</title><meta name="description" content="&quot;q&quot;"><style>p{}</style></head><body><p title="&#39;f&#39;" class="x ltr">3 rows</p><table></table></body></html>');
    for (const attr of ATTRIBUTES) {
        assert.doesNotThrow(() => parseTemplate(`<p ${attr}="{{title}}">`), attr);
    }
});

test("refused: every place where filled-in text could become markup, a link or code", () => {
    refused("<!-- {{title}} -->", "comment");
    refused("<!doctype {{title}}>", "markup");
    refused("<script>var t = '{{title}}';</script>", "rawText");
    refused("<style>p::before{content:'{{title}}'}</style>", "rawText");
    refused("<SCRIPT type=module>{{title}}</SCRIPT >", "rawText");
    for (const raw of ["xmp", "iframe", "noembed", "noframes", "noscript", "plaintext", "template"]) refused(`<${raw}>{{title}}</${raw}>`, "rawText");
    for (const attr of ["href", "src", "srcset", "style", "onclick", "onload", "srcdoc", "action", "formaction", "data", "ping", "xlink:href", "id", "name", "content", "http-equiv", "value"]) {
        refused(`<a ${attr}="{{title}}">x</a>`, "attribute");
    }
    refused('<meta name="keywords" content="{{title}}">', "attribute");
    refused('<meta http-equiv="refresh" content="0;url={{source}}">', "attribute");
    refused("<p title={{title}}>", "unquoted");
    refused("<p {{title}}>", "attributeName");
    refused('<p data-{{title}}="x">', "attributeName");
    refused("<{{title}}>", "tagName");
    refused("</{{title}}>", "tagName");
    refused('<p title="{{table}}">', "markupInText");
    refused("<title>{{table}}</title>", "markupInText");
    refused("<textarea>{{chart}}</textarea>", "markupInText");
    refused("<p>{{title</p>", "unclosed");
    refused("<p>{{ti{{tle}}</p>", "unclosed");
    refused("<p>\u0000</p>", "nul");
});

test("an unknown placeholder names the closest one; spaces inside the braces are fine", () => {
    assert.throws(() => parseTemplate("<p>{{titel}}</p>"), (e) => e.details.reason === "unknownPlaceholder" && e.details.suggestion === "title" && /did you mean \{\{title\}\}\?/.test(e.message));
    assert.throws(() => parseTemplate("<p>{{xyzzy}}</p>"), (e) => e.details.reason === "unknownPlaceholder" && e.details.suggestion === undefined);
    assert.deepEqual(parseTemplate("<p>{{ title }}</p>").names, ["title"]);
    // braces that are no placeholder stay text
    assert.equal(fillTemplate(parseTemplate("<p>a }} b { c</p>"), {}), "<p>a }} b { c</p>");
});

test("a template over TEMPLATE_LIMIT characters throws LIMIT_EXCEEDED; the message names the line", () => {
    assert.throws(() => parseTemplate(" ".repeat(TEMPLATE_LIMIT + 1)), (e) => e.code === "LIMIT_EXCEEDED" && e.details.limit === "template");
    assert.throws(() => parseTemplate("<p>\n\n<script>{{title}}</script>"), (e) => e.details.line === 3 && /line 3/.test(e.message));
});

test("the default template: its Content-Security-Policy first in <head>, no script, every placeholder known", () => {
    const head = DEFAULT_TEMPLATE.slice(DEFAULT_TEMPLATE.indexOf("<head>") + 6).trimStart();
    assert.ok(head.startsWith(`<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">`));
    assert.ok(!/<script/i.test(DEFAULT_TEMPLATE));
    assert.match(REPORT_CSP, /default-src 'none'.*img-src data:.*base-uri 'none'; form-action 'none'/);
    const t = parseTemplate(DEFAULT_TEMPLATE);
    assert.ok(t.names.every((n) => Object.hasOwn(PLACEHOLDERS, n)));
});

test("render() checks a template before any work, and fills a host's template", async () => {
    await assert.rejects(render({ rows: ["Region"] }, SALES, { format: "html", template: "<a href='{{source}}'>x</a>" }), (e) => e.code === "INVALID_TEMPLATE");
    const r = await render({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }, SALES, { format: "html", template: "<h1>{{title}}</h1><p>{{rows}}</p>{{table}}", title: "<b>Sales</b>", ...FIXED });
    assert.ok(r.text.startsWith("<h1>&lt;b&gt;Sales&lt;/b&gt;</h1><p>8 rows</p><table class=\"pk-table\">"));
});

test("escapeHtml escapes the five characters that can end a text or an attribute", () => {
    assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
});
