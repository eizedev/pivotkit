// #370: the HTML report's colours meet WCAG AA in both themes, read from the stylesheet a report is
// written with: the light tokens of its :root, the dark ones of its dark-screen rule, how much of a
// colour scale and of a data bar each cell mixes over its surface, and each scale cell's own colour or
// place. Its text (4.5:1) on every surface it draws, on every step of a theme's scale and on a data
// bar. tests/browser/report-theme.spec.js measures the drawn page in three engines; this test fails
// as soon as the stylesheet loses a rule or a token the browser test relies on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "pivotkit-report";
import { FIXED, SALES } from "./fixtures.js";

const VIEW = { rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale" } }, { field: "Price", agg: "sum", conditional: { type: "dataBar" } }] };
const html = (await render(VIEW, SALES, { format: "html", ...FIXED })).text;
const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];

/** A rule's declarations as name and value; `selector` as written in the stylesheet. */
const declarationsOf = (selector) => {
    const at = css.indexOf(`${selector}{`);
    assert.ok(at !== -1, `the stylesheet has no rule ${selector}`);
    const block = css.slice(at + selector.length + 1, css.indexOf("}", at));
    return Object.fromEntries(block.split(";").map((d) => d.split(":")).filter(([name]) => name.startsWith("--")).map(([name, ...rest]) => [name, rest.join(":")]));
};
/** The one number a pattern finds in the stylesheet. */
const numberOf = (pattern, what) => {
    const m = pattern.exec(css);
    assert.ok(m, `the stylesheet has no ${what}`);
    return Number(m[1]) / 100;
};

const light = declarationsOf(":root");
const dark = { ...light, ...declarationsOf('@media screen and (prefers-color-scheme:dark){:root:not([data-pk-theme="light"])') };
const forcedDark = { ...light, ...declarationsOf('@media screen{:root[data-pk-theme="dark"]') };
const SCALE_LIGHT = numberOf(/\.pk-td\.pk-has-scale\{background:color-mix\(in srgb,var\(--pk-cell-bg\) (\d+)%,var\(--pk-surface\)\)\}/, "light scale mix");
const darkMix = (root) => numberOf(new RegExp(`${root.replace(/[[\]().:"]/g, "\\$&")} \\.pk-td\\.pk-has-scale\\{background:color-mix\\(in srgb,var\\(--pk-cell-dark,var\\(--pk-cell-bg\\)\\) (\\d+)%,var\\(--pk-surface\\)\\)\\}`), `dark scale mix for ${root}`);
const SCALE_DARK = darkMix(':root:not([data-pk-theme="light"])');
const BAR = numberOf(/color-mix\(in srgb,var\(--pk-bar-color,var\(--pk-chart-1\)\) (\d+)%,transparent\)/, "data bar mix");

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** color-mix(in srgb, a p, b): the sRGB channels mixed. */
const mix = (a, p, b) => a.map((v, i) => v * p + b[i] * (1 - p));
const luminance = (rgb) => rgb.map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
/** A token's colour, its var() followed. */
const color = (tokens, name) => {
    const ref = /^var\((--pk-[\w-]+)\)$/.exec(tokens[name]);
    return ref ? color(tokens, ref[1]) : rgbOf(tokens[name]);
};

/** The scale cells of the report: their light colour, and their half and place for a dark screen. */
const cells = [...html.matchAll(/class="pk-td pk-num pk-has-scale pk-scale-(lo|hi) (pk-c\d+)"/g)].map(([, half, name]) => {
    const rule = declarationsOf(`.${name}`);
    return { half, p: parseFloat(rule["--pk-p"]) / 100, bg: rule["--pk-cell-bg"] };
});

test("the stylesheet: a theme's scale cell carries its half and place, and the dark colour is one rule per half", () => {
    assert.ok(cells.length >= 4 && cells.every((c) => c.p >= 0 && c.p <= 1 && /^#[0-9a-f]{6}$/.test(c.bg)), JSON.stringify(cells));
    assert.ok(cells.some((c) => c.half === "lo") && cells.some((c) => c.half === "hi"));
    const mid = "var(--pk-scale-mid,color-mix(in srgb,var(--pk-scale-low),var(--pk-scale-high)))";
    assert.equal(declarationsOf(".pk-scale-lo")["--pk-cell-dark"], `color-mix(in srgb,${mid} var(--pk-p),var(--pk-scale-low))`);
    assert.equal(declarationsOf(".pk-scale-hi")["--pk-cell-dark"], `color-mix(in srgb,var(--pk-scale-high) var(--pk-p),${mid})`);
    // a dark screen by the system's theme and by the root's data-pk-theme="dark" alike
    assert.deepEqual(forcedDark, dark);
    assert.equal(darkMix(':root[data-pk-theme="dark"]'), SCALE_DARK);
    // paper: no dark rule outside a screen
    assert.ok(!/@media (?!screen)[^{]*\{:root[^{]*\{--pk-surface/.test(css));
});

/** A theme scale's dark colour at a cell's half and place, as the .pk-scale-lo and -hi rules mix it. */
const darkScale = (tokens, half, p) => {
    const low = color(tokens, "--pk-scale-low");
    const high = color(tokens, "--pk-scale-high");
    const mid = mix(low, 0.5, high);
    return half === "lo" ? mix(mid, p, low) : mix(high, p, mid);
};

for (const [name, tokens] of Object.entries({ light, dark })) {
    test(`${name} theme: the report's text 4.5:1 on every surface, scale step and data bar it draws`, () => {
        const failures = [];
        const check = (what, fg, bg) => {
            const ratio = contrast(fg, bg);
            if (ratio < 4.5) failures.push(`${what}: ${ratio.toFixed(2)}`);
        };
        const text = color(tokens, "--pk-text");
        const surface = color(tokens, "--pk-surface");
        for (const name of ["--pk-surface", "--pk-surface-2", "--pk-total", "--pk-total-strong"]) {
            check(`--pk-text on ${name}`, text, color(tokens, name));
            check(`--pk-text on a data bar over ${name}`, text, mix(color(tokens, "--pk-chart-1"), BAR, color(tokens, name)));
        }
        check("--pk-muted on --pk-surface", color(tokens, "--pk-muted"), surface);
        check("--pk-muted on --pk-surface-2", color(tokens, "--pk-muted"), color(tokens, "--pk-surface-2"));
        if (name === "light") {
            for (const cell of cells) check(`a cell of ${cell.bg}`, text, mix(rgbOf(cell.bg), SCALE_LIGHT, surface));
        } else {
            // the report's cells, and every step of both halves
            for (const cell of cells) check(`a cell at ${cell.half} ${cell.p}`, text, mix(darkScale(tokens, cell.half, cell.p), SCALE_DARK, surface));
            for (const half of ["lo", "hi"]) {
                for (let step = 0; step <= 20; step++) check(`the scale at ${half} ${step / 20}`, text, mix(darkScale(tokens, half, step / 20), SCALE_DARK, surface));
            }
        }
        assert.deepEqual(failures, []);
    });
}

test("dark theme: any colour a view gives its scale stays readable under the light text", () => {
    // a view's own colours are light-theme colours; on a dark screen the cell takes the dark mix of them
    for (const hex of ["#ffffff", "#ffff00", "#00ff00", "#00ffff", "#ff0000", "#0000ff", "#eaf1fb"]) {
        const ratio = contrast(color(dark, "--pk-text"), mix(rgbOf(hex), SCALE_DARK, color(dark, "--pk-surface")));
        assert.ok(ratio >= 4.5, `${hex}: ${ratio.toFixed(2)}`);
    }
});
