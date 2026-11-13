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
    ["--pk-accent", "--pk-surface-raised"], ["--pk-accent", "--pk-surface-3"], ["--pk-muted", "--pk-note"]
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
