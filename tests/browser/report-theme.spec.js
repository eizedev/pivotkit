// #370: the default HTML report, and templates that set colours of their own or pin a theme
// (data-pk-theme), in a light and a dark system theme, on screen and in print. Rendered by
// pivotkit-report in the test process with a table, a colour scale, data bars and a chart, then
// opened as a page of its own: every text meets WCAG AA (4.5:1) against what is drawn behind it (a
// data bar blended over its cell, a chart's texts on its card), each part of the page (body, header,
// row header, totals, text, the chart's card) takes the theme's colour with no light and dark mixed,
// paper is light on white, and a colour scale runs from the surface towards its strong end in both
// themes (expectReportColours in report-contrast.js).
import * as echarts from "echarts";
import { DARK_TOKENS, DEFAULT_TEMPLATE, LIGHT_TOKENS, render } from "pivotkit-report";
import { expect, test } from "./fixtures.js";
import { CASES, ROWS, VIEWS, expectReportColours, measure, rgb } from "./report-contrast.js";

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
            test(`${templateName === "default" ? "the default report" : `a template with ${templateName}`}, ${scheme} system theme, ${media}: each part in the theme's colour, every text 4.5:1 on what is behind it, a scale from the surface outwards`, async ({ page }) => {
                await page.emulateMedia({ colorScheme: scheme, media });
                // paper is light whatever the system's theme; the screen follows it unless the root says
                const dark = media === "screen" && (theme ?? scheme) === "dark";
                const light = { ...LIGHT_TOKENS, ...own };
                const tokens = dark ? { ...DARK_TOKENS, ...ownDark } : light;
                for (const [name, { view, rows, options, shows }] of Object.entries(CASES)) {
                    const report = await render(view, rows, { format: "html", echarts, template, now: "2026-11-13T10:00:00Z", ...options });
                    await page.setContent(report.text);
                    const seen = await page.evaluate(measure);
                    expect(seen.body, `${name}: the page's surface`).toBe(rgb(tokens["--pk-surface"]));
                    expect(seen.text, `${name}: the page's text`).toBe(rgb(tokens["--pk-text"]));
                    // paper: dark text on white, unless the template sets a surface of its own
                    if (media === "print" && !own["--pk-surface"]) expect(seen.body, `${name}: paper`).toBe("rgb(255, 255, 255)");
                    if (theme && media === "screen") {
                        expect(seen.colorScheme, `${name}: the root's colour scheme`).toBe(theme);
                    }
                    expectReportColours(seen, { name, tokens, light, dark, media, shows });
                }
            });
        }
    }
}

// a template's own colour for the notes wins over the report's, the note on the chart's card too: the
// report's rule for that note only keeps the dark screen's muted grey off the light card
test("a template's own .pk-report-note colour colours the note under a cut chart and under a cut table, on screen and on paper", async ({ page }) => {
    const template = DEFAULT_TEMPLATE.replace("{{style}}", "{{style}}<style>.pk-report-note{color:#7a1f1f}</style>");
    const { view, rows, options } = CASES.notes;
    for (const media of ["screen", "print"]) {
        await page.emulateMedia({ colorScheme: "light", media });
        const report = await render(view, rows, { format: "html", echarts, template, now: "2026-11-13T10:00:00Z", ...options });
        await page.setContent(report.text);
        const notes = await page.locator(".pk-report-note").evaluateAll((els) => els.map((e) => `${e.tagName.toLowerCase()}: ${getComputedStyle(e).color}`));
        expect(notes, media).toEqual(["figcaption: rgb(122, 31, 31)", "p: rgb(122, 31, 31)"]);
    }
});

// #385: a host's colours for a dark screen (darkTokens) over the dark theme's, as its light ones
// (tokens) over the light theme's; paper and a root that pins light keep the light ones, and a
// template's own dark rule wins over the host's. The colour scale's middle colour has no dark value
// of the theme's: a light one stays out of a dark screen.
test.describe("a host's dark colours (#385)", () => {
    const HOST = { "--pk-surface": "#fffaf0", "--pk-chart-1": "#c00000", "--pk-heat-high": "#b34700" };
    const HOST_DARK = { "--pk-surface": "#101418", "--pk-chart-1": "#ff7a7a", "--pk-heat-high": "#ff9933" };
    const CASES = [
        { name: "a dark screen", scheme: "dark", media: "screen", template: DEFAULT_TEMPLATE, expected: HOST_DARK },
        { name: "a light screen", scheme: "light", media: "screen", template: DEFAULT_TEMPLATE, expected: HOST },
        { name: "paper from a dark screen", scheme: "dark", media: "print", template: DEFAULT_TEMPLATE, expected: HOST },
        { name: 'a dark screen, root pins light (data-pk-theme="light")', scheme: "dark", media: "screen", template: TEMPLATES['data-pk-theme="light"'].template, expected: HOST },
        { name: "a dark screen, a template with its own dark surface", scheme: "dark", media: "screen", template: TEMPLATES["its own dark colours"].template, expected: { ...HOST_DARK, "--pk-surface": "#1b1712" } }
    ];
    for (const { name, scheme, media, template, expected } of CASES) {
        test(`${name}: the page takes ${expected === HOST ? "the host's light colours" : "the host's dark colours"}, every text 4.5:1`, async ({ page }) => {
            await page.emulateMedia({ colorScheme: scheme, media });
            for (const [viewName, view] of Object.entries(VIEWS)) {
                const report = await render(view, ROWS, { format: "html", echarts, template, tokens: HOST, darkTokens: HOST_DARK, now: "2026-11-13T10:00:00Z" });
                await page.setContent(report.text);
                const seen = await page.evaluate(measure);
                expect(seen.body, `${viewName}: the page's surface`).toBe(rgb(expected["--pk-surface"]));
                const tokens = await page.evaluate((names) => Object.fromEntries(names.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])), Object.keys(expected));
                expect(tokens, viewName).toEqual(expected);
                const low = seen.texts.filter((t) => t.ratio < 4.5).map((t) => `${t.text} on its ${t.on}: ${t.ratio.toFixed(2)}`);
                expect(low, `${viewName}: texts below 4.5:1`).toEqual([]);
            }
        });
    }

    test("the scale's middle colour: a host's light one stays out of a dark screen, its dark one is taken there", async ({ page }) => {
        const cells = async (options, scheme) => {
            await page.emulateMedia({ colorScheme: scheme, media: "screen" });
            const report = await render(VIEWS.scale, ROWS, { format: "html", now: "2026-11-13T10:00:00Z", ...options });
            await page.setContent(report.text);
            return page.evaluate(() => [...document.querySelectorAll(".pk-has-scale")].map((el) => getComputedStyle(el).backgroundColor));
        };
        const mid = { "--pk-scale-mid": "#ff00ff" };
        // light: the host's middle colour is drawn
        expect(await cells({ tokens: mid }, "light")).not.toEqual(await cells({}, "light"));
        // dark: a light middle colour changes nothing, a dark one does
        const plainDark = await cells({}, "dark");
        expect(await cells({ tokens: mid }, "dark")).toEqual(plainDark);
        expect(await cells({ tokens: mid, darkTokens: { "--pk-scale-mid": "#00aa00" } }, "dark")).not.toEqual(plainDark);
    });
});
