// #370: the default HTML report, and templates that set colours of their own or pin a theme
// (data-pk-theme), in a light and a dark system theme, on screen and in print. Rendered by
// pivotkit-report in the test process with a table, a colour scale, data bars and a chart, then
// opened as a page of its own: every text meets WCAG AA (4.5:1) against what is drawn behind it (a
// data bar blended over its cell), the screen takes the theme's tokens, paper is light, and a colour
// scale runs from the surface towards its strong end in both themes.
import * as echarts from "echarts";
import { DARK_TOKENS, DEFAULT_TEMPLATE, LIGHT_TOKENS, render } from "pivotkit-report";
import { expect, test } from "./fixtures.js";
import { ROWS, VIEWS, measure, rgb } from "./report-contrast.js";

/**
 * Templates that set colours of their own: a plain :root rule after {{style}} (a page colour without
 * a dark counterpart: the report's dark tokens win on a dark screen), and a root that pins light or
 * asks for dark (data-pk-theme). `own`: the template's light values; `theme`: what the root asks for.
 */
const TEMPLATES = {
    default: { template: DEFAULT_TEMPLATE, own: {} },
    "its own surface": { template: DEFAULT_TEMPLATE.replace("{{style}}", "{{style}}<style>:root{--pk-surface:#fffaf0}</style>"), own: { "--pk-surface": "#fffaf0" } },
    "its own text": { template: DEFAULT_TEMPLATE.replace("{{style}}", "{{style}}<style>:root{--pk-text:#202020}</style>"), own: { "--pk-text": "#202020" } },
    // the docs' example (print-template.md, dark mode): its own light and dark surface
    "its own dark colours": {
        template: DEFAULT_TEMPLATE.replace("{{style}}", '{{style}}<style>:root{--pk-surface:#fffaf0}@media screen and (prefers-color-scheme: dark){:root:not([data-pk-theme="light"]){--pk-surface:#1b1712}}</style>'),
        own: { "--pk-surface": "#fffaf0" },
        ownDark: { "--pk-surface": "#1b1712" }
    },
    'data-pk-theme="light"': { template: DEFAULT_TEMPLATE.replace("<html ", '<html data-pk-theme="light" '), own: {}, theme: "light" },
    'data-pk-theme="dark"': { template: DEFAULT_TEMPLATE.replace("<html ", '<html data-pk-theme="dark" '), own: {}, theme: "dark" }
};

for (const [templateName, { template, own, ownDark = {}, theme }] of Object.entries(TEMPLATES)) {
    for (const scheme of ["light", "dark"]) {
        for (const media of ["screen", "print"]) {
            test(`${templateName === "default" ? "the default report" : `a template with ${templateName}`}, ${scheme} system theme, ${media}: the theme's tokens, every text 4.5:1 on what is behind it, a scale from the surface outwards`, async ({ page }) => {
                await page.emulateMedia({ colorScheme: scheme, media });
                // paper is light whatever the system's theme; the screen follows it unless the root says
                const dark = media === "screen" && (theme ?? scheme) === "dark";
                const tokens = dark ? { ...DARK_TOKENS, ...ownDark } : { ...LIGHT_TOKENS, ...own };
                for (const [name, view] of Object.entries(VIEWS)) {
                    const report = await render(view, ROWS, { format: "html", echarts, template, now: "2026-11-13T10:00:00Z" });
                    await page.setContent(report.text);
                    const seen = await page.evaluate(measure);
                    expect(seen.body, `${name}: the page's surface`).toBe(rgb(tokens["--pk-surface"]));
                    expect(seen.text, `${name}: the page's text`).toBe(rgb(tokens["--pk-text"]));
                    if (theme && media === "screen") {
                        expect(seen.colorScheme, `${name}: the root's colour scheme`).toBe(theme);
                    }
                    expect(seen.texts.length, name).toBeGreaterThan(10);
                    const low = seen.texts.filter((t) => t.ratio < 4.5).map((t) => `${t.text} on its ${t.on}: ${t.ratio.toFixed(2)}`);
                    expect(low, `${name}: texts below 4.5:1`).toEqual([]);
                    if (name === "scale") {
                        // the smallest value is the cell nearest the surface, the largest the one furthest from it
                        const distances = seen.scale.map((c) => c.distance);
                        expect(distances[0], "the low end").toBeLessThan(distances.at(-1));
                        expect(Math.min(...distances), "the low end is the nearest to the surface").toBe(distances[0]);
                    }
                }
            });
        }
    }
}
