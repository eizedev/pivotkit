// Cell values, field names and titles are untrusted: in the HTML report and in the SVG they stay text,
// and an SVG that holds anything a chart does not draw is refused (cleanSvg).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError } from "pivotkit-core";
import { cleanSvg, render } from "pivotkit-report";
import { FIXED, HOSTILE, HOSTILE_ROWS, bodyCells, echarts, startTags, svgTexts } from "./fixtures.js";

const VIEW = { rows: ["Region"], values: [{ field: HOSTILE[1], agg: "sum" }, { field: "Units", agg: "sum" }], display: "chart", chart: { type: "bar" } };
const ALLOWED_HTML = new Set(["html", "head", "meta", "title", "style", "body", "main", "header", "h1", "p", "figure", "img", "table", "thead", "tbody", "tr", "th", "td", "dl", "dt", "dd", "figcaption"]);

test("HTML: hostile cells, field names and the title stay text; no element or attribute comes from them", async () => {
    const r = await render(VIEW, HOSTILE_ROWS, { format: "html", echarts, title: HOSTILE[0], description: HOSTILE[2], ...FIXED });
    for (const tag of startTags(r.text.replace(/<style>[\s\S]*?<\/style>/, ""))) {
        assert.ok(ALLOWED_HTML.has(tag.name), `element <${tag.name}>`);
        assert.ok(!tag.attributes.some((a) => a.startsWith("on")), `an event attribute on <${tag.name}>`);
    }
    // the cells read back as they were written, the placeholder text not filled
    const labels = bodyCells(r.text).map((c) => c[0]);
    for (const text of HOSTILE.slice(0, 4)) assert.ok(labels.includes(text), text);
    assert.match(r.text, /<title>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/);
    assert.match(r.text, /<p class="pk-report-description">\{\{title\}\}<\/p>/);
    assert.match(r.text, /<th scope="col" class="pk-th">Sum of &quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;<\/th>/);
});

test("SVG: hostile category and series names are text nodes; no script, handler, foreign object or link", async () => {
    const r = await render(VIEW, HOSTILE_ROWS, { format: "svg", echarts, ...FIXED });
    const tags = startTags(r.text);
    assert.equal(tags[0].name, "svg");
    for (const tag of tags) {
        assert.ok(!["script", "foreignobject", "style", "iframe", "a"].includes(tag.name), `element <${tag.name}>`);
        assert.ok(!tag.attributes.some((a) => a.startsWith("on") || a === "style" || a === "href" || a === "xlink:href"), `attributes of <${tag.name}>: ${tag.attributes}`);
    }
    const texts = svgTexts(r.text);
    // ECharts cuts a long category name; the name is a text node, read back as written
    assert.ok(texts.includes("<script>alert(1)</scr..."), "the category name is a text node");
    assert.ok(texts.includes('Sum of "><img src=x onerror=alert(1)>'), "the series name is a text node");
    // a control character XML does not allow would make the whole SVG unreadable: it is left out
    assert.ok(texts.includes("]8;;http://xESC"));
    // eslint-disable-next-line no-control-regex
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(r.text));
    assert.ok(!r.text.includes("]]><svg"), "a CDATA end stays escaped");
});

test("cleanSvg refuses what a chart never draws, and turns style attributes into presentation attributes", () => {
    const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${inner}</svg>`;
    const refuses = (inner, reason) => assert.throws(() => cleanSvg(svg(inner)), (e) => e instanceof PivotkitError && e.details.reason.includes(reason), inner);
    refuses("<script>alert(1)</script>", "<script>");
    refuses('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>', "<foreignObject>");
    refuses('<rect onload="alert(1)"/>', "event attribute");
    refuses('<rect ONCLICK="x"/>', "event attribute");
    refuses('<image href="javascript:alert(1)"/>', "link");
    refuses('<image xlink:href="https://example.com/x.png"/>', "link");
    refuses('<rect fill="url(https://example.com/x)"/>', "address");
    refuses("<text>a < b</text>", "markup");
    refuses("<text>a & b</text>", "escaped");
    refuses("<a><text>x</text></a>", "<a>");
    assert.throws(() => cleanSvg('<svg xmlns="http://www.w3.org/2000/svg"><g>'), (e) => e.details.reason.includes("not closed"));
    const clean = cleanSvg(svg('<text style="font-size:12px;font-family:Arial;cursor:pointer;fill:url(https://x)" x="1">a &amp; b</text><style>.x:hover{}</style><rect fill="url(#g1)"/>'));
    assert.equal(clean, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text x="1" font-size="12px" font-family="Arial">a &amp; b</text><rect fill="url(#g1)"></rect></svg>'.replace("<rect fill=\"url(#g1)\"></rect>", '<rect fill="url(#g1)"/>'));
});
