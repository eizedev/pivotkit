// #369: a print template's own CSS is the one place of its design: the chart (an image drawn without
// a browser), its card and the cells' colour scales and data bars take the light values the template
// sets for the whole report, as the page applies them, and nothing the page does not apply.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TEMPLATE, LIGHT_TOKENS, render } from "pivotkit-report";
import { FIXED, SALES, echarts } from "./fixtures.js";

const BARS = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" }, display: "chart" };
const BAR_CELLS = { rows: ["Region"], values: [{ field: "Units", agg: "sum", conditional: { type: "dataBar" } }] };

/** The default template with the template's own CSS after {{style}} (and `before` ahead of it). */
const withCss = (after, before = "") => DEFAULT_TEMPLATE.replace("{{style}}", `${before}{{style}}${after}`);

/** A report with the chart inline, so its SVG can be read. */
const report = (template, options = {}) => render(BARS, SALES, { format: "html", echarts, chartEmbed: "inline", template, ...FIXED, ...options });

/** The fills of the chart's marks, the background left out. */
const fills = (html) => new Set([...html.matchAll(/<path [^>]*fill="(#[0-9a-f]{3,6})"/gi)].map((m) => m[1].toLowerCase()));
/** The chart's background (the first rect) and the card's background. */
const backgrounds = (html) => ({ svg: /<rect width="\d+" height="\d+" x="0" y="0" fill="([^"]+)"/.exec(html)?.[1], card: /\.pk-report-chart\{[^}]*background:([^;]+);/.exec(html)?.[1] });

test("the chart takes the template's colours: :root after {{style}}, var() of the template's own properties, !important", async () => {
    const r = await report(withCss("<style>:root{--brand:#7a1f5c;--pk-chart-1:#c0392b;--pk-chart-2:var(--brand) !important;--pk-surface:#fffdf7}</style>"));
    const marks = fills(r.text);
    assert.ok(marks.has("#c0392b") && marks.has("#7a1f5c"), [...marks].join(" "));
    assert.ok(!marks.has(LIGHT_TOKENS["--pk-chart-1"]), "not the default first colour");
    // the card around the image is the image's own background
    assert.deepEqual(backgrounds(r.text), { svg: "#fffdf7", card: "#fffdf7" });
});

test("body and .pk-report count anywhere, .pk-report over body over :root; a selector list; the font of .pk-report", async () => {
    const before = "<style>body{--pk-chart-1:#111111}</style>";
    const after = "<style>/* the report's design */ h1, .pk-report { --pk-chart-2: #00aa55; font-family: 'Brand Sans', sans-serif } :root{--pk-chart-1:#222222;--pk-chart-2:#333333}</style>";
    const r = await report(withCss(after, before));
    const marks = fills(r.text);
    // body's (before {{style}}) over :root's; .pk-report's over :root's although :root comes later
    assert.ok(marks.has("#111111") && marks.has("#00aa55"), [...marks].join(" "));
    assert.ok(!marks.has("#222222") && !marks.has("#333333"));
    assert.match(r.text, /<text [^>]*font-family="Brand Sans, sans-serif"/);
});

test("what the page does not apply is not read: :root before {{style}}, at-rules, other media, <style> in template, script or a comment", async () => {
    const before = "<style>:root{--pk-chart-1:#010101}</style><!-- <style>:root{--pk-chart-1:#020202}</style> -->";
    const after = [
        "<style>@media (prefers-color-scheme: dark){:root{--pk-chart-1:#030303}} @media print{:root{--pk-chart-1:#040404}} @supports (color: red){:root{--pk-chart-1:#050505}}</style>",
        '<style media="print">:root{--pk-chart-1:#060606}</style>',
        "<template><style>:root{--pk-chart-1:#070707}</style></template>",
        '<script type="text/plain"><style>:root{--pk-chart-1:#080808}</style></script>',
        "<style>.pk-table{--pk-chart-1:#090909} :root .x{--pk-chart-1:#0a0a0a}</style>"
    ].join("\n");
    const r = await report(withCss(after, before));
    const marks = fills(r.text);
    assert.ok(marks.has(LIGHT_TOKENS["--pk-chart-1"]), [...marks].join(" "));
    for (let i = 1; i <= 10; i++) assert.ok(!marks.has(`#${i.toString(16).padStart(2, "0").repeat(3)}`), String(i));
});

test("a value that is not safe or does not resolve keeps the default: url(), a cycle, an unknown var(), a long value", async () => {
    const css = `<style>:root{--pk-chart-1:url(https://example.com/x.png);--pk-chart-2:var(--loop);--loop:var(--pk-chart-2);--pk-chart-3:var(--nowhere);--pk-surface:#${"a".repeat(300)}}</style>`;
    const r = await report(withCss(css));
    const marks = fills(r.text);
    // the template's own <style> keeps its text; the chart and the report's rules do not take it
    assert.ok(!r.text.slice(r.text.indexOf("<figure")).includes("example.com"));
    assert.ok(marks.has(LIGHT_TOKENS["--pk-chart-1"]) && marks.has(LIGHT_TOKENS["--pk-chart-2"]), [...marks].join(" "));
    assert.deepEqual(backgrounds(r.text), { svg: LIGHT_TOKENS["--pk-surface"], card: LIGHT_TOKENS["--pk-surface"] });
});

test("light-dark() gives the chart its light colour; a var()'s fallback", async () => {
    const r = await report(withCss("<style>:root{--pk-chart-1:light-dark(#aa0000, #ff8888);--pk-chart-2:var(--nowhere, #123456)}</style>"));
    assert.ok(fills(r.text).has("#aa0000") && fills(r.text).has("#123456"), [...fills(r.text)].join(" "));
});

test("the template's colours over the host's tokens, as the page shows them; the host's where the template sets none", async () => {
    const r = await report(withCss("<style>:root{--pk-chart-1:#c0392b}</style>"), { tokens: { "--pk-chart-1": "#0000ff", "--pk-chart-2": "#00ff00" } });
    const marks = fills(r.text);
    assert.ok(marks.has("#c0392b") && marks.has("#00ff00") && !marks.has("#0000ff"), [...marks].join(" "));
});

test("data bars and colour scales of the table take the template's colours", async () => {
    const bars = await render(BAR_CELLS, SALES, { format: "html", template: withCss("<style>:root{--pk-chart-1:#c0392b}</style>"), ...FIXED });
    assert.match(bars.text, /--pk-bar-color:#c0392b/);
    const scale = await render({ rows: ["Region"], values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale" } }] }, SALES, { format: "html", template: withCss("<style>:root{--pk-scale-low:#ffffff;--pk-scale-high:#000000}</style>"), ...FIXED });
    const colours = [...scale.text.matchAll(/--pk-cell-bg:(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
    // grey from white to black: every channel the same
    assert.ok(colours.length >= 3 && colours.every((c) => c.slice(1, 3) === c.slice(3, 5) && c.slice(3, 5) === c.slice(5, 7)), colours.join(" "));
});

test("the default template has no CSS of its own: the chart in the default colours, the host's tokens apply", async () => {
    const plain = await report(DEFAULT_TEMPLATE);
    assert.ok(fills(plain.text).has(LIGHT_TOKENS["--pk-chart-1"]));
    const host = await report(DEFAULT_TEMPLATE, { tokens: { "--pk-chart-1": "#0000ff", "--pk-surface": "#fafafa" } });
    assert.ok(fills(host.text).has("#0000ff"));
    assert.deepEqual(backgrounds(host.text), { svg: "#fafafa", card: "#fafafa" });
});

test("a heatmap's colours ECharts cannot mix (oklch) keep the default; colours it only writes pass as they are", async () => {
    const css = "<style>:root{--pk-heat-high:oklch(0.55 0.2 30);--pk-chart-1:oklch(0.55 0.2 30)}</style>";
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
        const heatmap = { ...BARS, chart: { type: "heatmap" } };
        const svgOf = async (template) => (await render(heatmap, SALES, { format: "html", echarts, chartEmbed: "inline", template, ...FIXED })).text.match(/<svg[\s\S]*<\/svg>/)[0].replace(/ class="[^"]*"/g, "").replace(/zr\d+-/g, "zr-");
        // the scale is the default's (not mixed towards black), the same image as without the template's CSS
        assert.equal(await svgOf(withCss(css)), await svgOf(DEFAULT_TEMPLATE));
        const bars = await report(withCss(css));
        assert.ok(bars.text.includes('fill="oklch(0.55 0.2 30)"'));
    } finally {
        console.warn = warn;
    }
    assert.deepEqual(warnings, []);
});

test("hostile markup and CSS are read in linear time: 200,000 characters of unclosed tags or stray semicolons in well under a second", async () => {
    const tails = ["<style ".repeat(28_000), "<script ".repeat(25_000), "<template ".repeat(20_000), `<style>${" ".repeat(100_000)}${";".repeat(100_000)}</style>`];
    for (const tail of tails) {
        // after </html>, where no ">" follows: an unclosed tag must not be searched again from each start
        const template = DEFAULT_TEMPLATE + tail;
        const unit = tail.slice(0, 12);
        const start = performance.now();
        await render(BAR_CELLS, SALES, { format: "html", template, ...FIXED });
        const ms = performance.now() - start;
        assert.ok(ms < 1000, `${unit}: ${Math.round(ms)} ms`);
    }
});

test("a quoted string is a font's names only: in any other token, the host's or the template's, it keeps the default", async () => {
    const host = await report(DEFAULT_TEMPLATE, { tokens: { "--pk-chart-1": '"#c0392b"', "--pk-text": "x'y" } });
    assert.ok(fills(host.text).has(LIGHT_TOKENS["--pk-chart-1"]));
    assert.ok(!host.text.includes("x'y") && !host.text.includes("x&#39;y"));
    const own = await report(withCss(`<style>:root{--pk-muted:"a'b"} .pk-report{font-family:"Brand Sans", serif}</style>`));
    assert.match(own.text, /<text [^>]*fill="#5a6270"[^>]*font-family="Brand Sans, serif"/);
});

test("var() is resolved where the page resolves it: a :root property before {{style}}, a font from var(), :root before .pk-report", async () => {
    const r = await report(withCss("<style>:root{--pk-chart-2:var(--pk-chart-1)} .pk-report{--pk-chart-1:#00aa55;font-family:var(--f)} :root{--f:Georgia, serif}</style>", "<style>:root{--pk-chart-1:var(--brand);--brand:#7a1f5c}</style>"));
    const marks = fills(r.text);
    // --brand (before {{style}}, a property the report does not set) counts; --pk-chart-1 there does not;
    // --pk-chart-2 takes :root's --pk-chart-1, the report's, not .pk-report's
    assert.ok(marks.has("#00aa55") && marks.has(LIGHT_TOKENS["--pk-chart-1"]), [...marks].join(" "));
    assert.match(r.text, /<text [^>]*font-family="Georgia, serif"/);
});
