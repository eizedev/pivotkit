/*
 * The colours of a report on paper and on screen: the --pk-* tokens of pivotkit-react's styles.css
 * that a printed report uses, with the same names and values (a kept copy: test/tokens.test.js
 * compares them with styles.css, so a change there fails here until it is made here too). The chart of
 * an SVG and a report is drawn with the light ones; a host passes its own as `tokens`.
 */

/** The light theme: print, and a screen in light mode. */
export const LIGHT_TOKENS = Object.freeze({
    "--pk-surface": "#ffffff",
    "--pk-surface-2": "#f6f7f9",
    "--pk-surface-raised": "#ffffff",
    "--pk-text": "#1a1d23",
    "--pk-muted": "#5a6270",
    "--pk-border": "#dde1e7",
    "--pk-border-strong": "#c3c9d2",
    "--pk-grid": "#edf0f3",
    "--pk-total": "#eef1f5",
    "--pk-total-strong": "#e9edf3",
    "--pk-shadow": "0 1px 2px rgb(16 24 40 / 0.06), 0 4px 12px rgb(16 24 40 / 0.08)",
    "--pk-heat-low": "#eaf1fb",
    "--pk-heat-high": "#2a78d6",
    "--pk-scale-low": "var(--pk-heat-low)",
    "--pk-scale-high": "var(--pk-heat-high)",
    "--pk-chart-1": "#2a78d6",
    "--pk-chart-2": "#eb6834",
    "--pk-chart-3": "#1baf7a",
    "--pk-chart-4": "#eda100",
    "--pk-chart-5": "#e87ba4",
    "--pk-chart-6": "#008300",
    "--pk-chart-7": "#6250d6",
    "--pk-chart-8": "#e34948"
});

/** The dark theme, for a report read on a screen in dark mode (never printed: print is light). */
export const DARK_TOKENS = Object.freeze({
    "--pk-surface": "#16181d",
    "--pk-surface-2": "#1c1f25",
    "--pk-surface-raised": "#22262d",
    "--pk-text": "#e8eaef",
    "--pk-muted": "#a3aab7",
    "--pk-border": "#2f343e",
    "--pk-border-strong": "#454c58",
    "--pk-grid": "#23272e",
    "--pk-total": "#21252d",
    "--pk-total-strong": "#252a33",
    "--pk-shadow": "0 1px 2px rgb(0 0 0 / 0.4), 0 4px 12px rgb(0 0 0 / 0.3)",
    "--pk-heat-low": "#1d2735",
    "--pk-heat-high": "#3987e5",
    "--pk-scale-low": "var(--pk-heat-low)",
    "--pk-scale-high": "var(--pk-heat-high)",
    "--pk-chart-1": "#3987e5",
    "--pk-chart-2": "#d95926",
    "--pk-chart-3": "#199e70",
    "--pk-chart-4": "#c98500",
    "--pk-chart-5": "#d55181",
    "--pk-chart-6": "#008300",
    "--pk-chart-7": "#9085e9",
    "--pk-chart-8": "#e66767"
});

/** The font weights, the same in both themes: pivotkit-react's scale (test/tokens.test.js compares them). */
export const WEIGHT_TOKENS = Object.freeze({
    "--pk-weight-normal": "400",
    "--pk-weight-medium": "500",
    "--pk-weight-strong": "600",
    "--pk-weight-bold": "700"
});

/**
 * The corners the report draws, the same in both themes: the chart's card, as pivotkit-react's tooltip
 * (test/tokens.test.js compares them).
 */
export const SHAPE_TOKENS = Object.freeze({
    "--pk-radius-card": "8px"
});

/**
 * The report's font sizes, the same in both themes: its text (--pk-font-size, 14 px, the report's own
 * default: pivotkit-react's follows the page, at least 14 px, and its Export menu passes it in px),
 * secondary text (--pk-small, pivotkit-react's: the details, never below 14 px), the title (20 px at a
 * 14 px text) and the printed text, in pt on paper: the table and, for a very wide table, the smaller
 * size (PRINT_WIDE.small, never below 7 pt). A host passes its own as `tokens`.
 */
export const SIZE_TOKENS = Object.freeze({
    "--pk-font-size": "14px",
    "--pk-small": "max(14px, 0.93em)",
    "--pk-report-title-size": "calc(var(--pk-font-size) * 10 / 7)",
    "--pk-print-size": "10pt",
    "--pk-print-small": "7pt"
});

/**
 * The report's font: the system's, as the screen's report inherits from most hosts. Without quotes
 * (names of several words are valid unquoted): ECharts 6.1 writes a font into an SVG's style attribute
 * without escaping its quotes, which would end the attribute.
 */
export const REPORT_FONT = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif";

/**
 * A token value is written into CSS only when it holds no character that could end the rule, and no
 * comment (a calc()'s * and / are kept apart from each other).
 */
const SAFE_VALUE = /^(?![\s\S]*(\/\*|\*\/))[#\w\s.,%()/*+-]*$/;
/**
 * The CSS functions a token may call: colours, a shadow's lengths and other tokens. Any other, url(),
 * image-set() or src() among them, could load a resource where a report loads none.
 */
const SAFE_FUNCTIONS = new Set(["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "light-dark", "calc", "min", "max", "clamp", "var"]);

/**
 * Whether a value (its quoted strings left out) is plain and calls only SAFE_FUNCTIONS. A line break
 * (LF, CR, FF) is refused before the strings are left out: inside a CSS string it ends the string, so
 * what follows would be read as CSS; and url( is refused anywhere, also inside a string.
 */
function safeValue(value) {
    if (/[\n\r\f]|url\(/i.test(value)) return false;
    const plain = value.replace(/"[^"\\<>{};]*"/g, "");
    return SAFE_VALUE.test(plain) && [...plain.matchAll(/([\w-]*)\(/g)].every((m) => SAFE_FUNCTIONS.has(m[1].toLowerCase()));
}

/** The values every report starts from: the light theme, the weights, corners and sizes, the font. */
const BASE_TOKENS = Object.freeze({ ...LIGHT_TOKENS, ...WEIGHT_TOKENS, ...SHAPE_TOKENS, ...SIZE_TOKENS, "font-family": REPORT_FONT });

/** The characters of a token's value at most (a host's and a template's). */
const TOKEN_LENGTH = 200;

/** A resolved value longer than this is dropped (a chain of var()s could grow it without bound). */
const RESOLVED_LENGTH = 1000;

/**
 * Custom properties with their var() replaced, as a browser computes them: a var() takes the named
 * property's value, else its fallback (`var(--brand, #c00)`). A property whose var() names nothing
 * known, or that refers to itself, is left out. Each property is resolved once (memoized), so the
 * work is linear in the text.
 * @param {Record<string, string>} props
 * @returns {Record<string, string>}
 */
export function resolveVars(props) {
    /** @type {Map<string, string | null>} */
    const done = new Map();
    const resolving = new Set();
    /** @param {string} name  @returns {string | null} */
    const valueOf = (name) => {
        if (done.has(name)) {
            return /** @type {string | null} */ (done.get(name));
        }
        if (!Object.hasOwn(props, name) || resolving.has(name)) {
            return null;
        }
        resolving.add(name);
        const value = substitute(props[name]);
        resolving.delete(name);
        done.set(name, value);
        return value;
    };
    /** @param {string} value  @returns {string | null} */
    const substitute = (value) => {
        let out = "";
        let i = 0;
        for (;;) {
            const at = value.slice(i).search(/\bvar\(/i);
            if (at === -1) {
                out += value.slice(i);
                return out.length <= RESOLVED_LENGTH ? out : null;
            }
            out += value.slice(i, i + at);
            const open = i + at + 4;
            // the var()'s arguments up to its closing parenthesis
            let depth = 1;
            let j = open;
            while (j < value.length && depth > 0) {
                depth += value[j] === "(" ? 1 : value[j] === ")" ? -1 : 0;
                j++;
            }
            if (depth > 0) {
                return null;
            }
            const args = value.slice(open, j - 1);
            const comma = args.indexOf(",");
            const name = (comma === -1 ? args : args.slice(0, comma)).trim();
            const found = /^--[\w-]+$/.test(name) ? valueOf(name) : null;
            const fallback = comma === -1 ? null : substitute(args.slice(comma + 1).trim());
            const replaced = found ?? fallback;
            if (replaced === null || out.length + replaced.length > RESOLVED_LENGTH) {
                return null;
            }
            out += replaced;
            i = j;
        }
    };
    /** @type {Record<string, string>} */
    const out = {};
    for (const name of Object.keys(props)) {
        const value = name.startsWith("--") ? valueOf(name) : props[name];
        if (value !== null) {
            out[name] = value;
        }
    }
    return out;
}

/**
 * The light values a report draws its chart and its cells' colours with: the defaults, the host's
 * `tokens` over them, a template's own (template-style.js) over those, var() resolved and every value
 * checked (cleanTokens); a value that does not resolve or is not safe keeps the default.
 * @param {Record<string, string>} [tokens]  the host's
 * @param {Record<string, string>} [own]  the template's (templateTokens)
 * @returns {Record<string, string>}
 */
export function reportTokens(tokens = {}, own = {}) {
    // the template's values are held to the host's length before they are resolved
    const owned = Object.fromEntries(Object.entries(own).filter(([, value]) => typeof value === "string" && value.length <= TOKEN_LENGTH));
    const resolved = resolveVars({ ...BASE_TOKENS, ...cleanTokens(tokens), ...owned });
    for (const name of Object.keys(resolved)) {
        resolved[name] = lightOf(resolved[name]);
    }
    return { ...BASE_TOKENS, ...cleanTokens(resolved) };
}

/**
 * A value with every light-dark(light, dark) replaced by its light colour: the chart and the cells'
 * colours are drawn light, and ECharts reads no light-dark(). A call that is not closed is kept as it
 * is (cleanTokens checks it).
 * @param {string} value
 */
function lightOf(value) {
    let out = value;
    for (let at = out.search(/\blight-dark\(/i); at !== -1; at = out.search(/\blight-dark\(/i)) {
        const open = at + "light-dark(".length;
        let depth = 1;
        let comma = -1;
        let j = open;
        for (; j < out.length && depth > 0; j++) {
            depth += out[j] === "(" ? 1 : out[j] === ")" ? -1 : 0;
            if (out[j] === "," && depth === 1 && comma === -1) {
                comma = j;
            }
        }
        if (depth > 0 || comma === -1) {
            return value;
        }
        out = out.slice(0, at) + out.slice(open, comma).trim() + out.slice(j);
    }
    return out;
}

/**
 * Tokens as a style the chart's code reads (getPropertyValue).
 * @param {Record<string, string>} tokens  reportTokens()
 * @returns {{ getPropertyValue(name: string): string }}
 */
export function tokenStyle(tokens) {
    // the chart's font without quotes (see REPORT_FONT)
    const all = { ...tokens, "font-family": (tokens["font-family"] ?? REPORT_FONT).replace(/["']/g, "") };
    return { getPropertyValue: (name) => (Object.hasOwn(all, name) ? all[name] : "") };
}

/**
 * The host's tokens that may go into CSS: --pk-* names (and font-family) with plain values that call
 * no function but SAFE_FUNCTIONS; others are left out.
 * @param {Record<string, string>} tokens
 */
export function cleanTokens(tokens) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [name, value] of Object.entries(tokens ?? {})) {
        if ((/^--pk-[a-z0-9-]+$/.test(name) || name === "font-family") && typeof value === "string" && value.length <= TOKEN_LENGTH && safeValue(value)) {
            out[name] = value.trim();
        }
    }
    return out;
}

/** A colour a table cell and a workbook take: #rgb or #rrggbb. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The colours of a colour scale and of data bars whose view names none, from the host's tokens over
 * the light ones, as the report on screen resolves them: the scale --pk-scale-low, the host's
 * --pk-scale-mid and --pk-scale-high (by default the heat tokens), the bars --pk-chart-1. A value
 * that is no plain hex colour (another token is followed) keeps pivotkit-core's default.
 * @param {Record<string, string>} [tokens]
 * @returns {{ colorScale?: string[], dataBar?: string }}
 */
export function conditionalColors(tokens = {}) {
    const all = { ...LIGHT_TOKENS, ...cleanTokens(tokens) };
    const resolve = (/** @type {string} */ name, depth = 0) => {
        const value = Object.hasOwn(all, name) ? all[name] : "";
        const ref = /^var\((--pk-[a-z0-9-]+)\)$/.exec(value);
        return ref && depth < 4 ? resolve(ref[1], depth + 1) : HEX_COLOR.test(value) ? value : null;
    };
    const [low, mid, high, bar] = ["--pk-scale-low", "--pk-scale-mid", "--pk-scale-high", "--pk-chart-1"].map((name) => resolve(name));
    return {
        ...(low && high ? { colorScale: mid ? [low, mid, high] : [low, high] } : {}),
        ...(bar ? { dataBar: bar } : {})
    };
}

/** Tokens as CSS declarations. */
export const declarations = (tokens) =>
    Object.entries(tokens)
        .filter(([name]) => name.startsWith("--pk-"))
        .map(([name, value]) => `${name}:${value}`)
        .join(";");
