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

/** Number of categorical chart colours (--pk-chart-1 ... --pk-chart-8). */
export const CHART_COLORS = 8;

/**
 * The ECharts theme of pivotkit-core's toEChartsOption from the computed style of the report's root.
 * @param {{ getPropertyValue(name: string): string }} style  getComputedStyle(root)
 */
export function chartThemeFrom(style) {
    const v = (name) => style.getPropertyValue(name).trim();
    const colors = [];
    for (let i = 1; i <= CHART_COLORS; i++) {
        const c = v(`--pk-chart-${i}`);
        if (c) {
            colors.push(c);
        }
    }
    const theme = {
        colors,
        textColor: v("--pk-muted") || undefined,
        axisColor: v("--pk-border") || undefined,
        gridColor: v("--pk-grid") || v("--pk-border") || undefined,
        fontFamily: v("font-family") || undefined,
        backgroundColor: "transparent"
    };
    // a number for ECharts; a host's keyword (bold) or an empty token keeps the core's default
    const strong = Number(v("--pk-weight-strong"));
    if (strong > 0) {
        theme.strongWeight = strong;
    }
    const low = v("--pk-heat-low");
    const high = v("--pk-heat-high");
    if (low && high) {
        theme.heatmapColors = [low, high];
    }
    return theme;
}
