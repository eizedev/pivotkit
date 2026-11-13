// The report's colours are a kept copy of pivotkit-react's tokens: the same names, the same values in
// both themes. A change in styles.css fails here until tokens.js follows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_THEME } from "pivotkit-core";
import { DARK_TOKENS, LIGHT_TOKENS, SHAPE_TOKENS, SIZE_TOKENS, WEIGHT_TOKENS, render } from "pivotkit-report";
import { SALES } from "./fixtures.js";

const css = readFileSync(new URL("../../pivotkit-react/src/styles.css", import.meta.url), "utf8");
/** The --pk-* declarations of the first rule whose selector is `selector`. */
function tokensOf(selector) {
    const start = css.indexOf(`${selector} {`);
    const block = css.slice(start, css.indexOf("}", start));
    return Object.fromEntries([...block.matchAll(/(--pk-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

test("the light and the dark tokens are pivotkit-react's, name for name", () => {
    const light = tokensOf(":where(.pk-root)");
    const dark = tokensOf(':where(.pk-root[data-pk-theme="dark"])');
    for (const [name, value] of Object.entries(LIGHT_TOKENS)) assert.equal(value, light[name], `light ${name}`);
    // the colour scale's tokens are declared once, in the light rule: they refer to the heat tokens of
    // either theme; every other dark token is declared in the dark rule
    const inherited = new Set(["--pk-scale-low", "--pk-scale-high"]);
    for (const [name, value] of Object.entries(DARK_TOKENS)) assert.equal(value, inherited.has(name) ? light[name] : dark[name], `dark ${name}`);
    for (const name of inherited) assert.equal(dark[name], undefined, `${name} is not declared again for dark`);
    assert.deepEqual(Object.keys(DARK_TOKENS), Object.keys(LIGHT_TOKENS));
    // the font weights: every step of the scale, the same values
    const weights = Object.fromEntries(Object.entries(light).filter(([name]) => name.startsWith("--pk-weight-")));
    assert.deepEqual(WEIGHT_TOKENS, weights);
    // the corners the report draws
    for (const [name, value] of Object.entries(SHAPE_TOKENS)) assert.equal(value, light[name], `shape ${name}`);
});

/**
 * A length token of the light block in px at the least font size, 14 px: its var()s followed, calc(),
 * max() and px worked out (only what styles.css writes for the sizes DEFAULT_THEME keeps). A chart
 * without a page (pivotkit-core alone, an SVG) is drawn at the sizes of the smallest report.
 */
function px(name, light, depth = 0) {
    assert.ok(depth < 5 && name in light, `${name} is declared`);
    const text = light[name]
        .replace(/var\((--pk-[a-z0-9-]+)\)/g, (_, ref) => `(${px(ref, light, depth + 1)})`)
        .replace(/(\d*\.?\d+)px/g, "$1")
        .replace(/(\d*\.?\d+)em/g, (_, n) => `(${n} * 14)`)
        .replace(/calc\(/g, "(")
        .replace(/max\(/g, "Math.max(");
    assert.match(text, /^[\d\s.()*/+,-]*$|Math\.max/, `${name}: ${light[name]}`);
    return Function(`return ${text}`)();
}

test("DEFAULT_THEME's chart sizes are the light tokens' at the least font size, 14 px", () => {
    const light = tokensOf(":where(.pk-root)");
    assert.equal(DEFAULT_THEME.titleSize, px("--pk-chart-title-size", light));
    assert.equal(DEFAULT_THEME.textSize, px("--pk-chart-text-size", light));
    assert.equal(DEFAULT_THEME.textSize, 14, "the chart's text at the 14 px minimum");
    assert.equal(DEFAULT_THEME.markRadius, px("--pk-radius-chart", light));
    assert.equal(DEFAULT_THEME.cardRadius, px("--pk-radius-card", light));
});

test("the HTML report draws its chart card with the corner token, and a host's corner reaches it", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" } };
    const r = await render(view, SALES, { format: "html", tokens: { "--pk-radius-card": "2px" } });
    const style = r.text.slice(r.text.indexOf("<style>"), r.text.indexOf("</style>"));
    assert.match(style, /\.pk-report-chart\{[^}]*border-radius:var\(--pk-radius-card\)/);
    assert.match(style, /--pk-radius-card:2px/);
});

test("the report's stylesheet takes its font weights from the tokens, and a host's weights reach it", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
    const r = await render(view, SALES, { format: "html", tokens: { "--pk-weight-strong": "500" } });
    const style = r.text.slice(r.text.indexOf("<style>"), r.text.indexOf("</style>"));
    assert.deepEqual(style.match(/font-weight:\s*[^;}]+/g)?.filter((d) => !/var\(--pk-weight-[a-z]+\)$/.test(d)) ?? [], [], "no literal weight");
    assert.match(style, /--pk-weight-strong:500/);
    assert.match(style, /--pk-weight-bold:700/);
});

// pivotkit-core's DEFAULT_THEME is the light theme's colours, for a workbook or a report without tokens (#212)
test("DEFAULT_THEME's colour scale and bar colour are the light heat tokens and --pk-chart-1", () => {
    const light = tokensOf(":where(.pk-root)");
    assert.deepEqual(DEFAULT_THEME.colorScale, [light["--pk-heat-low"], light["--pk-heat-high"]]);
    assert.equal(DEFAULT_THEME.dataBar, light["--pk-chart-1"]);
});

test("a host's tokens go into the report only as --pk-* names with plain values", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
    const r = await render(view, SALES, { format: "html", tokens: { "--pk-total": "#abcdef", "--pk-text": "red}body{display:none", color: "blue", "--pk-border": "url(https://x)" } });
    assert.match(r.text, /--pk-total:#abcdef/);
    assert.ok(!r.text.includes("red}body") && !r.text.includes("url(") && !r.text.includes("color:blue"));
    // a calc()'s * and / are kept; a comment, which could hide the rules after it, is not
    const sized = await render(view, SALES, { format: "html", tokens: { "--pk-report-title-size": "calc(var(--pk-font-size) * 2)", "--pk-print-size": "10pt /* x", "--pk-print-small": "x */ 7pt" } });
    assert.match(sized.text, /--pk-report-title-size:calc\(var\(--pk-font-size\) \* 2\)/);
    assert.ok(!sized.text.includes("/* x") && !sized.text.includes("x */"), "no comment");
});

test("a token calls no function that loads something: url(), image-set() and the like are left out", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
    const loading = { "--pk-surface": 'url("https://example.invalid/p.png")', "--pk-header-bg": "url(//example.invalid/p.png)", "--pk-border": 'image-set("a.png" 1x)', "--pk-total": 'src("a.png")', "--pk-text": "URL(x)", "--pk-muted": "rgb(1 2 3) url( 'x')" };
    const kept = { "--pk-accent": "rgb(10 20 30 / 50%)", "--pk-chart-1": "color-mix(in srgb, #123456 40%, white)", "--pk-shadow": "0 1px 2px rgba(0, 0, 0, 0.2)", "font-family": '"Segoe UI", sans-serif' };
    const r = await render(view, SALES, { format: "html", tokens: { ...loading, ...kept } });
    assert.ok(!/url\(|image-set|src\(/i.test(r.text), "no loading function");
    for (const [name, value] of Object.entries(kept)) if (name.startsWith("--pk-")) assert.ok(r.text.includes(`${name}:${value}`), name);
});

test("print: landscape from more than 8 columns, a smaller font from more than 16", async () => {
    const wide = (n) => Array.from({ length: n }, (_, i) => ({ Region: "North", Month: `M${String(i).padStart(2, "0")}`, Units: i }));
    const view = { rows: ["Region"], cols: ["Month"], values: [{ field: "Units", agg: "sum" }] };
    const narrow = await render(view, wide(4), { format: "html" });
    assert.match(narrow.text, /@page\{margin:12mm;\}/);
    const nine = await render(view, wide(8), { format: "html" });
    assert.match(nine.text, /@page\{margin:12mm;size:landscape;\}/);
    assert.ok(!nine.text.includes(".pk-table{font-size:"));
    const many = await render(view, wide(20), { format: "html" });
    assert.ok(many.text.includes(".pk-table{font-size:var(--pk-print-small)}"));
    assert.match(many.text, /thead\{display:table-header-group\}/);
    assert.match(many.text, /tr\{break-inside:avoid\}/);
});

// #220: the report's font sizes are tokens, so a host matches them as it matches its colours
test("the report's stylesheet takes its font sizes from the tokens, and a host's sizes reach it", async () => {
    const wide = Array.from({ length: 20 }, (_, i) => ({ Region: "North", Month: `M${String(i).padStart(2, "0")}`, Units: i }));
    const view = { rows: ["Region"], cols: ["Month"], values: [{ field: "Units", agg: "sum" }] };
    const sizes = { "--pk-font-size": "15px", "--pk-small": "14.5px", "--pk-report-title-size": "26px", "--pk-print-size": "11pt", "--pk-print-small": "8pt" };
    const r = await render(view, wide, { format: "html", tokens: sizes });
    const style = r.text.slice(r.text.indexOf("<style>"), r.text.indexOf("</style>"));
    const literal = [...style.matchAll(/(?<![\w-])(?:font-size|font):\s*([^;}]+)/g)].map((m) => m[0]).filter((d) => !/:\s*var\(--pk-[a-z-]+\)/.test(d));
    assert.deepEqual(literal, [], "no literal font size");
    for (const [name, value] of Object.entries(sizes)) assert.ok(style.includes(`${name}:${value}`), name);
    // the defaults: 14 px text, a 20 px title, details never below 14 px, 10 pt and 7 pt on paper
    const plain = await render(view, wide, { format: "html" });
    for (const [name, value] of Object.entries(SIZE_TOKENS)) assert.ok(plain.text.includes(`${name}:${value}`), name);
    assert.deepEqual(SIZE_TOKENS, { "--pk-font-size": "14px", "--pk-small": "max(14px, 0.93em)", "--pk-report-title-size": "calc(var(--pk-font-size) * 10 / 7)", "--pk-print-size": "10pt", "--pk-print-small": "7pt" });
    assert.match(plain.text, /\.pk-report-details\{[^}]*font-size:var\(--pk-small\)/);
    assert.match(plain.text, /\.pk-table\{font-size:var\(--pk-print-small\)\}/);
});
