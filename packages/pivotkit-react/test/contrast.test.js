// The default tokens of both themes meet WCAG 2.2 contrast: 4.5:1 for text, 3:1 for accents and
// focus rings against the surfaces they sit on. Read from the stylesheet that ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function tokens(selector) {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start !== -1, `no block ${selector}`);
    const block = css.slice(start, css.indexOf("}", start));
    return Object.fromEntries([...block.matchAll(/(--pk-[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}

const light = tokens(":where(.pk-root)");
const dark = { ...light, ...tokens(':where(.pk-root[data-pk-theme="dark"])') };

function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

const TEXT = [
    ["--pk-text", "--pk-surface"], ["--pk-text", "--pk-surface-2"], ["--pk-text", "--pk-surface-3"], ["--pk-text", "--pk-total-strong"],
    ["--pk-text", "--pk-drop"], ["--pk-muted", "--pk-surface"], ["--pk-muted", "--pk-surface-2"], ["--pk-muted", "--pk-surface-3"],
    ["--pk-accent-text", "--pk-accent"], ["--pk-accent", "--pk-accent-soft"], ["--pk-accent", "--pk-surface"], ["--pk-danger", "--pk-surface"],
    ["--pk-surface", "--pk-text"], ["--pk-text", "--pk-note"], ["--pk-muted", "--pk-surface-raised"], ["--pk-accent", "--pk-note"], ["--pk-danger", "--pk-surface-raised"], ["--pk-danger", "--pk-danger-soft"], ["--pk-text", "--pk-danger-soft"], ["--pk-warn", "--pk-surface"], ["--pk-warn", "--pk-surface-3"],
    // the "Learn more" link of a description, the "i" while hovered, the x of a tip
    ["--pk-accent", "--pk-surface-raised"], ["--pk-accent", "--pk-surface-3"], ["--pk-muted", "--pk-note"],
    // a subtotal's label and value, and a subtotal column's header (muted, as every header)
    ["--pk-text", "--pk-total"], ["--pk-muted", "--pk-total"], ["--pk-muted", "--pk-total-strong"]
];
const UI = [["--pk-focus", "--pk-surface"], ["--pk-focus", "--pk-surface-2"], ["--pk-drop-border", "--pk-surface-2"], ["--pk-drop-border", "--pk-surface"], ["--pk-type-number", "--pk-surface"], ["--pk-type-string", "--pk-surface"], ["--pk-type-date", "--pk-surface"], ["--pk-type-boolean", "--pk-surface"],
    // the edge of a menu's text fields and selects
    ["--pk-input-border", "--pk-surface"], ["--pk-input-border", "--pk-surface-raised"], ["--pk-input-border", "--pk-surface-2"],
    // the rule between a menu's groups: More's groups have no titles, the rule is all that tells them apart (#128)
    ["--pk-rule", "--pk-surface-raised"], ["--pk-rule", "--pk-surface"], ["--pk-rule", "--pk-surface-2"]];

for (const [name, theme] of [["light", light], ["dark", dark]]) {
    test(`${name} theme: text 4.5:1 and interface colours 3:1`, () => {
        for (const [fg, bg] of TEXT) {
            const ratio = contrast(theme[fg], theme[bg]);
            assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}`);
        }
        for (const [fg, bg] of UI) {
            const ratio = contrast(theme[fg], theme[bg]);
            assert.ok(ratio >= 3, `${fg} on ${bg}: ${ratio.toFixed(2)}`);
        }
    });
}

// the rule that tells a menu's groups apart is drawn in a colour of 3:1 on the menu's surface (#128,
// #205); the chart's Display settings are groups and levels too (#106), so they have no rule of their own
for (const selector of [".pk-section:not(:first-child)"]) {
    test(`${selector}: its rule 3:1 on the menu in both themes`, () => {
        const start = css.indexOf(`${selector} {`);
        assert.ok(start !== -1, `no block ${selector}`);
        const block = css.slice(start, css.indexOf("}", start));
        const token = block.match(/border-top:[^;]*var\((--pk-[\w-]+)\)/)?.[1];
        assert.ok(token, `${selector} draws no rule from a token`);
        for (const [name, theme] of [["light", light], ["dark", dark]]) {
            const ratio = contrast(theme[token], theme["--pk-surface-raised"]);
            assert.ok(ratio >= 3, `${name}: ${token} on --pk-surface-raised: ${ratio.toFixed(2)}`);
        }
    });
}

// the colour scales the Highlight menu offers (pivotkit-core's COLOR_SCALES): a cell's text reads on
// every step of each, in both themes. A cell mixes its colour into the surface (styles.css .pk-scaled:
// 48 % light, 30 % dark), every step between the scale's colours too.
test("the colour scales of the Highlight menu keep a cell's text 4.5:1 on every step, light and dark", async () => {
    const { COLOR_SCALES } = await import("pivotkit-core");
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    const mix = (a, b, t) => rgb(a).map((v, i) => v * t + rgb(b)[i] * (1 - t));
    const keys = Object.keys(COLOR_SCALES);
    assert.deepEqual(keys, ["blueOrange", "blueRed", "redGreen"]);
    for (const key of keys) {
        const colors = COLOR_SCALES[key];
        for (const [theme, share] of [[light, 0.48], [dark, 0.3]]) {
            for (let step = 0; step <= 20; step++) {
                const t = (step / 20) * (colors.length - 1);
                const i = Math.min(Math.floor(t), colors.length - 2);
                const cell = hex(mix(hex(mix(colors[i + 1], colors[i], t - i)), theme["--pk-surface"], share));
                const ratio = contrast(theme["--pk-text"], cell);
                assert.ok(ratio >= 4.5, `${key} at ${step / 20} in ${theme === light ? "light" : "dark"}: ${ratio.toFixed(2)}`);
            }
        }
    }
});
