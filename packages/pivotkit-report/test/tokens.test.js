// The report's colours are a kept copy of pivotkit-react's tokens: the same names, the same values in
// both themes. A change in styles.css fails here until tokens.js follows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DARK_TOKENS, LIGHT_TOKENS, render } from "pivotkit-report";
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
    // a token the dark rule does not declare again is the light rule's (the colour scale's, which
    // refer to the heat tokens of either theme)
    for (const [name, value] of Object.entries(DARK_TOKENS)) assert.equal(value, dark[name] ?? light[name], `dark ${name}`);
    assert.deepEqual(Object.keys(DARK_TOKENS), Object.keys(LIGHT_TOKENS));
});

test("a host's tokens go into the report only as --pk-* names with plain values", async () => {
    const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
    const r = await render(view, SALES, { format: "html", tokens: { "--pk-total": "#abcdef", "--pk-text": "red}body{display:none", color: "blue", "--pk-border": "url(https://x)" } });
    assert.match(r.text, /--pk-total:#abcdef/);
    assert.ok(!r.text.includes("red}body") && !r.text.includes("url(") && !r.text.includes("color:blue"));
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
    assert.ok(!nine.text.includes(".pk-table{font-size:7pt}"));
    const many = await render(view, wide(20), { format: "html" });
    assert.ok(many.text.includes(".pk-table{font-size:7pt}"));
    assert.match(many.text, /thead\{display:table-header-group\}/);
    assert.match(many.text, /tr\{break-inside:avoid\}/);
});
