// #370: the HTML report's colours meet WCAG AA in both themes: its text (4.5:1) on every surface it
// draws (the page, headers, subtotals, the grand total), on a colour scale of the theme across its
// whole range and on a data bar, each mixed as report-css.js mixes it. The tokens are the report's
// own (tokens.js, kept in step with pivotkit-react's by tokens.test.js); the browser test
// tests/browser/report-theme.spec.js measures the same on the drawn page in three engines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DARK_TOKENS, LIGHT_TOKENS, render } from "pivotkit-report";
import { BAR_MIX, SCALE_MIX } from "../src/report-css.js";
import { FIXED, SALES } from "./fixtures.js";

const THEMES = { light: LIGHT_TOKENS, dark: { ...LIGHT_TOKENS, ...DARK_TOKENS } };

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** color-mix(in srgb, a p%, b): the sRGB channels mixed. */
const mix = (a, p, b) => a.map((v, i) => v * p + b[i] * (1 - p));
const luminance = (rgb) => rgb.map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};

/** A token's colour, its var() followed. */
const color = (tokens, name) => {
    const value = tokens[name];
    const ref = /^var\((--pk-[\w-]+)\)$/.exec(value);
    return ref ? color(tokens, ref[1]) : rgbOf(value);
};

/** The theme's scale at t, as html-table.js's themeScale writes it: low, the middle, high. */
const scaleAt = (tokens, t) => {
    const low = color(tokens, "--pk-scale-low");
    const high = color(tokens, "--pk-scale-high");
    const mid = mix(low, 0.5, high);
    return t < 0.5 ? mix(mid, t * 2, low) : mix(high, (t - 0.5) * 2, mid);
};

for (const [name, tokens] of Object.entries(THEMES)) {
    test(`${name} theme: the report's text 4.5:1 on every surface, scale and data bar it draws`, () => {
        const failures = [];
        const check = (what, fg, bg) => {
            const ratio = contrast(fg, bg);
            if (ratio < 4.5) failures.push(`${what}: ${ratio.toFixed(2)}`);
        };
        const text = color(tokens, "--pk-text");
        const muted = color(tokens, "--pk-muted");
        const surfaces = ["--pk-surface", "--pk-surface-2", "--pk-total", "--pk-total-strong"];
        for (const surface of surfaces) {
            check(`--pk-text on ${surface}`, text, color(tokens, surface));
            // the data bar's colour over the cell: its text on the bar
            check(`--pk-text on --pk-chart-1 ${BAR_MIX}% over ${surface}`, text, mix(color(tokens, "--pk-chart-1"), BAR_MIX / 100, color(tokens, surface)));
        }
        // the description, the details and the "+" of a collapsed group
        check("--pk-muted on --pk-surface", muted, color(tokens, "--pk-surface"));
        check("--pk-muted on --pk-surface-2", muted, color(tokens, "--pk-surface-2"));
        // a colour scale of the theme, every step of it, as the cell mixes it over the surface
        for (let step = 0; step <= 20; step++) {
            const t = step / 20;
            check(`--pk-text on the scale at ${t}`, text, mix(scaleAt(tokens, t), SCALE_MIX[name] / 100, color(tokens, "--pk-surface")));
        }
        assert.deepEqual(failures, []);
    });
}

test("dark theme: any colour a view gives its scale stays readable under the light text", () => {
    // a view's own colours are light-theme colours; on a dark screen the cell takes SCALE_MIX.dark of them
    const dark = THEMES.dark;
    for (const hex of ["#ffffff", "#ffff00", "#00ff00", "#00ffff", "#ff0000", "#0000ff", "#eaf1fb"]) {
        const ratio = contrast(color(dark, "--pk-text"), mix(rgbOf(hex), SCALE_MIX.dark / 100, color(dark, "--pk-surface")));
        assert.ok(ratio >= 4.5, `${hex}: ${ratio.toFixed(2)}`);
    }
});

test("a theme's scale writes its dark-screen colour from the page's tokens; a view's own colours stay its own", async () => {
    const rules = async (conditional) => {
        const r = await render({ rows: ["Region"], values: [{ field: "Units", agg: "sum", conditional }] }, SALES, { format: "html", ...FIXED });
        return [...r.text.matchAll(/\.pk-c\d+\{([^}]*)\}/g)].map((m) => m[1]);
    };
    const theme = await rules({ type: "colorScale" });
    assert.equal(theme.length, 4);
    for (const rule of theme) assert.match(rule, /^--pk-cell-bg:#[0-9a-f]{6};--pk-cell-dark:color-mix\(in srgb, (var\(--pk-scale-(low|high)\)|var\(--pk-scale-mid, .*\)) \d+%, .*\)$/);
    for (const rule of await rules({ type: "colorScale", colors: ["#ff0000", "#00ff00"] })) assert.match(rule, /^--pk-cell-bg:#[0-9a-f]{6}$/);
});
