// Every colour and font weight of the stylesheet comes from a --pk-* token, so a host matches its
// corporate design by setting tokens (docs/reference/theming.md), never by overriding selectors.
// Literals are allowed only in the token blocks, :where(.pk-root) and its dark theme.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
            i = source.indexOf(ch, i + 1);
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
        if (TOKEN_BLOCKS.has(selector)) {
            continue;
        }
        // names of custom properties hold words such as "--pk-total", and strings are text, never colours
        const bare = value.replace(/--[\w-]+/g, "").replace(/"[^"]*"|'[^']*'/g, "");
        const words = bare.toLowerCase().match(/[a-z]+/g) ?? [];
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

test("the check finds literals outside the token blocks and nothing inside them", () => {
    const sample = `
        :where(.pk-root) { --pk-accent: #2b5fd9; --pk-weight-strong: 600; }
        @media (prefers-reduced-motion: reduce) { :where(.pk-root[data-pk-theme="dark"]) { --pk-text: white; } }
        .a { color: var(--pk-text); font-weight: var(--pk-weight-strong); background: color-mix(in srgb, var(--pk-danger) 5%, transparent); }
        .b { content: "red; }"; border: 1px solid CanvasText; white-space: nowrap; font: inherit; }
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

test("styles.css: colours and font weights only from --pk-* tokens outside the token blocks", () => {
    const found = literals(css);
    assert.deepEqual(found, [], `use a --pk-* token (docs/reference/theming.md) instead of:\n${found.join("\n")}`);
});

test("styles.css: every --pk-weight-* a rule uses is declared in the token block", () => {
    const declared = new Set(declarations(css).filter((d) => d.selector === ":where(.pk-root)").map((d) => d.prop));
    const used = new Set([...css.matchAll(/var\((--pk-weight-[a-z]+)\)/g)].map((m) => m[1]));
    assert.ok(used.size >= 4, "the rules use the weight scale");
    for (const name of used) {
        assert.ok(declared.has(name), `${name} is used but has no default in :where(.pk-root)`);
    }
});
