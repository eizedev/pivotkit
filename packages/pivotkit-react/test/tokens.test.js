// Every colour, font weight, corner radius, font family and focus-ring or inset-ring geometry of the
// stylesheet comes from a --pk-* token, so a host matches its corporate design by setting tokens
// (docs/reference/theming.md), never by overriding selectors. Literals are allowed only in the token
// blocks, :where(.pk-root) and its dark theme. Shapes are no theme values: 0, a 50% circle, a 999px pill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

/** The selectors whose rules declare the tokens' defaults (also inside @media). */
const TOKEN_BLOCKS = new Set([":where(.pk-root)", ':where(.pk-root[data-pk-theme="dark"])']);

/** CSS Color 4's named colours; transparent, currentColor and the system colours (forced colours) are not literals. */
const NAMED_COLOURS = new Set(
    `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
    cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
    darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
    darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
    firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
    hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
    lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
    lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
    mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
    midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
    palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
    rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
    slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
    whitesmoke yellow yellowgreen`.split(/\s+/)
);

/**
 * The declarations of a stylesheet with the selector of the rule they are in.
 * @param {string} text
 * @returns {Array<{ selector: string, prop: string, value: string, line: number }>}
 */
function declarations(text) {
    const source = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    /** @type {string[]} */
    const stack = [];
    const out = [];
    let start = 0;
    const lineAt = (i) => source.slice(0, i).split("\n").length;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (ch === '"' || ch === "'") {
            // to the closing quote, past escaped characters (content: "\"")
            let end = i + 1;
            while (end < source.length && source[end] !== ch) {
                end += source[end] === "\\" ? 2 : 1;
            }
            assert.ok(end < source.length, `a string that never closes, line ${lineAt(i)}`);
            i = end;
            continue;
        }
        if (ch === "{") {
            stack.push(source.slice(start, i).trim().replace(/\s+/g, " "));
            start = i + 1;
        } else if (ch === ";" || ch === "}") {
            const decl = source.slice(start, i);
            const colon = decl.indexOf(":");
            if (colon !== -1 && stack.length && !stack.at(-1).startsWith("@")) {
                const offset = start + decl.search(/\S/);
                out.push({ selector: stack.at(-1), prop: decl.slice(0, colon).trim(), value: decl.slice(colon + 1).trim(), line: lineAt(offset) });
            }
            if (ch === "}") {
                stack.pop();
            }
            start = i + 1;
        }
    }
    return out;
}

/**
 * What in a stylesheet sets a colour or a font weight by a literal outside the token blocks.
 * @param {string} text
 * @returns {string[]}  one line per finding: line, selector, declaration
 */
function literals(text) {
    const found = [];
    for (const { selector, prop, value, line } of declarations(text)) {
        // a token block declares the tokens' defaults; any other property there is checked as anywhere
        if (TOKEN_BLOCKS.has(selector) && prop.startsWith("--")) {
            continue;
        }
        // names of custom properties hold words such as "--pk-total", and strings are text, never colours;
        // a hyphenated name (an animation's "snow-fall") is one word
        const bare = value.replace(/--[\w-]+/g, "").replace(/"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/g, "");
        const words = bare.toLowerCase().match(/[a-z][a-z-]*/g) ?? [];
        const colour = /#[0-9a-f]{3,8}\b/i.test(bare) || /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(bare) || words.some((w) => NAMED_COLOURS.has(w));
        const weight =
            (prop === "font-weight" && !/^var\(--pk-weight-[a-z]+\)$/.test(value)) ||
            (prop === "font" && /\b(bold|bolder|lighter|normal|\d{3})\b/i.test(bare));
        if (colour || weight) {
            found.push(`${line}: ${selector} { ${prop}: ${value} }`);
        }
    }
    return found;
}

/** A shape, not a theme value: no corner, a circle, a pill; inherit. */
const SHAPES = new Set(["0", "50%", "999px", "inherit"]);
/** A length written as a literal (a number with a unit), not 0. */
const LENGTH = /(?<![\w.])(?:\d*\.)?\d+(?:px|em|rem|pt|ch|ex|vh|vw)\b/i;
/** Each top-level part of a value separated by spaces (calc() and var() stay whole). */
function parts(value) {
    const out = [];
    let depth = 0;
    let part = "";
    for (const ch of value) {
        depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
        if (/\s/.test(ch) && depth === 0) {
            if (part) out.push(part);
            part = "";
        } else {
            part += ch;
        }
    }
    return part ? [...out, part] : out;
}

/**
 * What in a stylesheet sets a corner radius, a font family or the geometry of a focus ring or an
 * inset ring by a literal outside the token blocks. A radius is a --pk-radius* token, a calc() of one
 * (a corner inside another: the outer one less the gap) or a shape; a font family a --pk-font* token
 * or inherit; an outline, its offset and a box-shadow take their lengths from tokens.
 * @param {string} text
 * @returns {string[]}  one line per finding: line, selector, declaration
 */
function geometry(text) {
    const found = [];
    for (const { selector, prop, value, line } of declarations(text)) {
        if (prop.startsWith("--")) {
            continue;
        }
        const radius = /^border(-[a-z]+)*-radius$/.test(prop) && !parts(value).every((p) => SHAPES.has(p) || /^var\(--pk-radius[a-z-]*\)$/.test(p) || /^calc\(.*var\(--pk-radius[a-z-]*\)/.test(p));
        const family = prop === "font-family" && !/^(inherit|var\(--pk-font[a-z-]*(,\s*inherit)?\))$/.test(value);
        const ring = /^(outline|outline-width|outline-offset|box-shadow)$/.test(prop) && LENGTH.test(value.replace(/var\(--[\w-]+\)/g, ""));
        if (radius || family || ring) {
            found.push(`${line}: ${selector} { ${prop}: ${value} }`);
        }
    }
    return found;
}

test("the geometry check finds radii, font families and ring lengths outside the token blocks", () => {
    const sample = `
        :where(.pk-root) { --pk-radius-xs: calc(var(--pk-radius-sm) * 4 / 7); --pk-font-mono: ui-monospace, monospace; --pk-focus-width: 2px; }
        .a { border-radius: var(--pk-radius-xs); outline: var(--pk-focus-width) solid var(--pk-focus); outline-offset: calc(-1 * var(--pk-focus-width)); }
        .b { border-radius: calc(var(--pk-radius) - 1px); border-radius: var(--pk-radius) var(--pk-radius) 0 0; border-radius: 50%; border-radius: 999px; border-radius: 0; }
        .c { font-family: var(--pk-font, inherit); font-family: var(--pk-font-mono); font-family: inherit; box-shadow: var(--pk-shadow); outline: none; outline: 0; }
        .d { box-shadow: inset 0 0 0 calc(var(--pk-ring-width) * 1.5) var(--pk-accent); }
        .e { border-radius: 4px; }
        .f { border-top-left-radius: 6px; }
        .g { font-family: ui-monospace, Menlo, monospace; }
        .h { outline: 2px solid var(--pk-focus); }
        .i { outline-offset: -2px; }
        .j { box-shadow: 0 0 0 3px var(--pk-accent-soft); }
        .k { border-radius: calc(4px + 1px); }
        .l { box-shadow: inset 0 0 0 1.5px var(--pk-accent); }
        .m { outline: var(--pk-focus-width, 2px) solid var(--pk-focus); }`;
    assert.deepEqual(
        geometry(sample).map((f) => f.replace(/^\d+: /, "")),
        [
            ".e { border-radius: 4px }",
            ".f { border-top-left-radius: 6px }",
            ".g { font-family: ui-monospace, Menlo, monospace }",
            ".h { outline: 2px solid var(--pk-focus) }",
            ".i { outline-offset: -2px }",
            ".j { box-shadow: 0 0 0 3px var(--pk-accent-soft) }",
            ".k { border-radius: calc(4px + 1px) }",
            ".l { box-shadow: inset 0 0 0 1.5px var(--pk-accent) }",
            ".m { outline: var(--pk-focus-width, 2px) solid var(--pk-focus) }"
        ]
    );
});

test("the check finds literals outside the token blocks and nothing inside them", () => {
    const sample = `
        :where(.pk-root) { --pk-accent: #2b5fd9; --pk-weight-strong: 600; color-scheme: light; }
        :where(.pk-root) { color: #123; }
        @media (prefers-reduced-motion: reduce) { :where(.pk-root[data-pk-theme="dark"]) { --pk-text: white; } }
        .a { color: var(--pk-text); font-weight: var(--pk-weight-strong); background: color-mix(in srgb, var(--pk-danger) 5%, transparent); }
        .b { content: "red; }"; border: 1px solid CanvasText; white-space: nowrap; font: inherit; }
        .b2 { content: "\\"" ; animation-name: snow-fall; }
        .c { font-weight: 600; }
        .d { color: #fff; }
        @media (min-width: 1px) { .e { box-shadow: 0 1px 2px rgb(0 0 0 / 0.1); } }
        .f { outline-color: Red; }
        .g { --pk-local: 1px; border-color: white; }
        .h { font: bold 1em sans-serif; }
        .i { font-weight: bold; }`;
    assert.deepEqual(
        literals(sample).map((f) => f.replace(/^\d+: /, "")),
        [
            ":where(.pk-root) { color: #123 }",
            ".c { font-weight: 600 }",
            ".d { color: #fff }",
            ".e { box-shadow: 0 1px 2px rgb(0 0 0 / 0.1) }",
            ".f { outline-color: Red }",
            ".g { border-color: white }",
            ".h { font: bold 1em sans-serif }",
            ".i { font-weight: bold }"
        ]
    );
});

test("a string that never closes fails the check instead of hanging it", () => {
    assert.throws(() => literals('.a { content: "abc; }'), /never closes/);
});

test("styles.css: colours and font weights only from --pk-* tokens outside the token blocks", () => {
    const found = literals(css);
    assert.deepEqual(found, [], `use a --pk-* token (docs/reference/theming.md) instead of:\n${found.join("\n")}`);
});

test("styles.css: corner radii, font families and ring geometry only from --pk-* tokens outside the token blocks", () => {
    const found = geometry(css);
    assert.deepEqual(found, [], `use a --pk-* token (docs/reference/theming.md) instead of:\n${found.join("\n")}`);
});

test("styles.css: every --pk-* token a rule uses is declared in the token block", () => {
    const declared = new Set(declarations(css).filter((d) => d.selector === ":where(.pk-root)").map((d) => d.prop));
    // tokens a host may add, or set by the report from code (a cell's colour, a bar's length)
    const optional = new Set(["--pk-font", "--pk-scale-mid"]);
    const used = new Set([...css.matchAll(/var\((--pk-[a-z0-9-]+)/g)].map((m) => m[1]));
    for (const name of used) {
        if (/^--pk-(radius|font-mono|focus-|ring-|chart-title|chart-text)/.test(name) && !optional.has(name)) {
            assert.ok(declared.has(name), `${name} is used but has no default in :where(.pk-root)`);
        }
    }
});

test("styles.css: every --pk-weight-* a rule uses is declared in the token block", () => {
    const declared = new Set(declarations(css).filter((d) => d.selector === ":where(.pk-root)").map((d) => d.prop));
    const used = new Set([...css.matchAll(/var\((--pk-weight-[a-z]+)\)/g)].map((m) => m[1]));
    assert.ok(used.size >= 4, "the rules use the weight scale");
    for (const name of used) {
        assert.ok(declared.has(name), `${name} is used but has no default in :where(.pk-root)`);
    }
});

/**
 * What a line of code sets as a literal: a colour, a font weight, a corner radius (other than a shape),
 * a font size (an option's, a default parameter's, a code-built stylesheet's, a text width estimated
 * at a fixed size) or a font family.
 * @param {string} line
 */
function codeLiteral(line) {
    return (
        /fontWeight\s*[:=]\s*["'`]?(\d|bold|bolder|lighter)/.test(line) ||
        /font-weight:\s*\d/.test(line) ||
        /["'`][^"'`]*(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/.test(line) ||
        /(borderRadius\s*[:=]|border-radius:)\s*[[("'`]*\s*(?!0\b|50%|999px)\d/.test(line) ||
        /fontSize\s*[:=]\s*["'`]?\d/.test(line) ||
        /(font-size|\bfont):\s*\d/.test(line) ||
        /String\([^)]*\)\.length\s*\*\s*\d|\b\d+\s*\*\s*(0\.55|CHAR_WIDTH)\b/.test(line) ||
        /setProperty\(\s*["'`](border(-[a-z]+)*-radius|font-size|font-family|outline(-width|-offset)?)["'`]\s*,\s*["'`][\w"']/.test(line) ||
        /font-family:\s*(?!var\(|inherit|\$)[\w"']/.test(line)
    );
}

test("the code check finds colours, weights, radii, font sizes and font families written as literals", () => {
    const bad = [
        'extraCssText: "border-radius: 8px;"',
        "itemStyle: { borderRadius: 4 }",
        "itemStyle: { borderRadius: [4, 4, 0, 0] }",
        "textStyle: { fontSize: 16 }",
        'tip.style.fontSize = "12px"',
        "function columnLabelLayout(names, width, fontSize = 12) {",
        "body{margin:0;font:14px/1.45 ${font}}",
        ".pk-report h1{font-size:20px}",
        "body{font-size:10pt}",
        "const labelWidth = (text) => String(text).length * 7;",
        "const longest = names.length * 12 * 0.55;",
        'textStyle: { fontSize: "16px" }',
        'el.style.setProperty("border-radius", "8px")',
        'css: "font-family: Menlo, monospace"',
        "fontWeight: 600",
        'color: "#fff"'
    ];
    const good = [
        'marker.style.borderRadius = "50%"', "borderRadius: s.stack ? 0 : r", "fontSize: theme.titleSize", 'css: "font-family: var(--pk-font-mono)"', "border-radius:var(--pk-radius-card)",
        "function columnLabelLayout(names, width, fontSize = DEFAULT_THEME.textSize) {", ".pk-report h1{font-size:var(--pk-report-title-size)}", "body{font:var(--pk-font-size)/1.45 ${font}}",
        "const longest = names.length * fontSize * CHAR_WIDTH;", "const bits = bytes.length * 8;"
    ];
    assert.deepEqual(bad.filter((l) => !codeLiteral(l)), []);
    assert.deepEqual(good.filter(codeLiteral), []);
});

test("styles set from code take colours, weights, radii and sizes from tokens too (the chart, its tooltip, the table's probe, the HTML report)", () => {
    const found = [];
    // pivotkit-report's tokens.js is its token block, a kept copy of this stylesheet's; pivotkit-core has
    // no tokens: its DEFAULT_THEME (defaults.js) is what a host without a stylesheet gets, kept in step with
    // the tokens by pivotkit-report's tokens.test.js, and its chartThemeFrom reads the tokens
    const kept = new Set(["pivotkit-report/src/tokens.js", "pivotkit-core/src/defaults.js"]);
    for (const dir of ["../src/", "../../pivotkit-element/src/", "../../pivotkit-report/src/", "../../pivotkit-core/src/"]) {
        const url = new URL(dir, import.meta.url);
        for (const name of readdirSync(url).filter((n) => /\.jsx?$/.test(n) && !kept.has(`${dir.replace(/^(\.\.\/)+/, "")}${n}`))) {
            // without comments: they name issues (#136) and colours in words
            const code = readFileSync(new URL(name, url), "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
            code.split("\n").forEach((line, i) => {
                if (codeLiteral(line)) {
                    found.push(`${dir}${name}:${i + 1}: ${line.trim()}`);
                }
            });
        }
    }
    assert.deepEqual(found, [], `use a --pk-* token (var(--pk-...) or theme.js) instead of:\n${found.join("\n")}`);
});
