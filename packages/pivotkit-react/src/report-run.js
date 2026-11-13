/*
 * The Export menu's HTML report, chart as SVG and print: pivotkit-report's render() with ECharts' SVG
 * renderer registered next to the report's own chart parts (echarts.js, loaded by the caller). A chunk
 * of its own, loaded on the first of these exports (export-run.js), so neither the first load nor the
 * menus carry pivotkit-report.
 */

import { use as register } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { LIGHT_TOKENS, WEIGHT_TOKENS, render } from "pivotkit-report";

register([SVGRenderer]);

export { render };

/**
 * The report's own tokens for a file, from the report's computed style: its font weights in either
 * theme, and in the light theme the --pk-* colours a printed report uses (a host's brand colours go
 * along); no colours in the dark theme, whose colours are not made for paper (pivotkit-report's
 * light ones are used).
 * @param {HTMLElement | null} root
 * @returns {Record<string, string> | undefined}
 */
export function reportTokensOf(root) {
    if (!root) {
        return undefined;
    }
    const names = [...Object.keys(WEIGHT_TOKENS), ...(root.getAttribute("data-pk-theme") === "dark" ? [] : Object.keys(LIGHT_TOKENS))];
    const style = getComputedStyle(root);
    const tokens = Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value));
    return Object.keys(tokens).length ? tokens : undefined;
}
