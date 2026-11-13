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
    "--pk-total": "#f4f6f9",
    "--pk-total-strong": "#e9edf3",
    "--pk-shadow": "0 1px 2px rgb(16 24 40 / 0.06), 0 4px 12px rgb(16 24 40 / 0.08)",
    "--pk-heat-low": "#eaf1fb",
    "--pk-heat-high": "#2a78d6",
    "--pk-scale-low": "#f8696b",
    "--pk-scale-mid": "#ffeb84",
    "--pk-scale-high": "#63be7b",
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
    "--pk-total": "#1d2128",
    "--pk-total-strong": "#252a33",
    "--pk-shadow": "0 1px 2px rgb(0 0 0 / 0.4), 0 4px 12px rgb(0 0 0 / 0.3)",
    "--pk-heat-low": "#1d2735",
    "--pk-heat-high": "#3987e5",
    "--pk-scale-low": "#c2413f",
    "--pk-scale-mid": "#b39a2e",
    "--pk-scale-high": "#3f9a5c",
    "--pk-chart-1": "#3987e5",
    "--pk-chart-2": "#d95926",
    "--pk-chart-3": "#199e70",
    "--pk-chart-4": "#c98500",
    "--pk-chart-5": "#d55181",
    "--pk-chart-6": "#008300",
    "--pk-chart-7": "#9085e9",
    "--pk-chart-8": "#e66767"
});

/**
 * The report's font: the system's, as the screen's report inherits from most hosts. Without quotes
 * (names of several words are valid unquoted): ECharts 6.1 writes a font into an SVG's style attribute
 * without escaping its quotes, which would end the attribute.
 */
export const REPORT_FONT = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif";

/** A token value is written into CSS only when it holds no character that could end the rule. */
const SAFE_VALUE = /^[#\w\s.,%()/+-]*$/;

/**
 * The tokens as a style the chart's code reads (getPropertyValue), the host's over the light ones.
 * @param {Record<string, string>} [tokens]
 * @returns {{ getPropertyValue(name: string): string }}
 */
export function tokenStyle(tokens = {}) {
    const all = { ...LIGHT_TOKENS, "font-family": REPORT_FONT, ...cleanTokens(tokens) };
    // the chart's font without quotes (see REPORT_FONT)
    all["font-family"] = all["font-family"].replace(/["']/g, "");
    return { getPropertyValue: (name) => (Object.hasOwn(all, name) ? all[name] : "") };
}

/**
 * The host's tokens that may go into CSS: --pk-* names (and font-family) with plain values; others are left out.
 * @param {Record<string, string>} tokens
 */
export function cleanTokens(tokens) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [name, value] of Object.entries(tokens ?? {})) {
        if ((/^--pk-[a-z0-9-]+$/.test(name) || name === "font-family") && typeof value === "string" && value.length <= 200 && SAFE_VALUE.test(value.replace(/"[^"\\<>{};]*"/g, ""))) {
            out[name] = value.trim();
        }
    }
    return out;
}

/** Tokens as CSS declarations. */
export const declarations = (tokens) =>
    Object.entries(tokens)
        .filter(([name]) => name.startsWith("--pk-"))
        .map(([name, value]) => `${name}:${value}`)
        .join(";");
