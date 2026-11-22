// The report's theme (theme.js): which theme applies, and the chart's theme from the --pk-* tokens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartThemeFrom, resolveTheme } from "../src/theme.js";

test("theme: an explicit theme wins, then <html data-theme>, then the system", () => {
    assert.equal(resolveTheme("dark", "light", false), "dark");
    assert.equal(resolveTheme("auto", "dark", false), "dark");
    assert.equal(resolveTheme("auto", "light", true), "light");
    assert.equal(resolveTheme("auto", null, true), "dark");
    assert.equal(resolveTheme(undefined, "unknown", false), "light");
});

test("the chart theme comes from the --pk-* tokens", () => {
    const tokens = { "--pk-chart-1": " #111111", "--pk-chart-2": "#222222", "--pk-muted": "#555", "--pk-border": "#ddd", "--pk-heat-low": "#eee", "--pk-heat-high": "#00f", "font-family": "Inter" };
    const theme = chartThemeFrom({ getPropertyValue: (n) => tokens[n] ?? "" });
    assert.deepEqual(theme.colors, ["#111111", "#222222"]);
    assert.deepEqual([theme.textColor, theme.gridColor, theme.fontFamily], ["#555", "#ddd", "Inter"]);
    assert.deepEqual(theme.heatmapColors, ["#eee", "#00f"]);
    // the chart's title and group labels take --pk-weight-strong; a keyword or no token leaves the core's default
    assert.equal(chartThemeFrom({ getPropertyValue: (n) => ({ ...tokens, "--pk-weight-strong": " 520" })[n] ?? "" }).strongWeight, 520);
    assert.equal(chartThemeFrom({ getPropertyValue: (n) => ({ ...tokens, "--pk-weight-strong": "bold" })[n] ?? "" }).strongWeight, undefined);
    assert.equal(chartThemeFrom({ getPropertyValue: (n) => ({ ...tokens, "--pk-weight-strong": "5000" })[n] ?? "" }).strongWeight, undefined);
    assert.equal(theme.strongWeight, undefined);
});
