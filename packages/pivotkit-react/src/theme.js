/*
 * Light or dark: theme "auto" follows the host page, first `<html data-theme="light|dark">` (as
 * PowerShell Universal sets it), then the system's prefers-color-scheme. The chart reads its colours
 * from the same CSS custom properties as the table, so a host that overrides --pk-* tokens themes both.
 */

/**
 * The theme to show.
 * @param {"auto" | "light" | "dark" | undefined} wanted  the theme prop
 * @param {string | null | undefined} htmlTheme  the value of <html data-theme>
 * @param {boolean} prefersDark  matchMedia("(prefers-color-scheme: dark)").matches
 * @returns {"light" | "dark"}
 */
export function resolveTheme(wanted, htmlTheme, prefersDark) {
    if (wanted === "light" || wanted === "dark") {
        return wanted;
    }
    if (htmlTheme === "light" || htmlTheme === "dark") {
        return htmlTheme;
    }
    return prefersDark ? "dark" : "light";
}

/** The chart's colours from the --pk-* tokens: pivotkit-core's, the same for an SVG and a printed report. */
export { CHART_COLORS, chartThemeFrom } from "pivotkit-core";
