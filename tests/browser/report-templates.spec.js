// #368: the print templates `pivotkit example templates` writes (examples/report-templates/), each over
// a table with a colour scale, data bars and a chart, in a light and a dark system theme, on screen and
// in print, as a page of its own: Corporate is light everywhere (its own tokens) unless its root asks
// for dark, Minimal follows the system; every text, the header's and the footer's too, meets WCAG AA
// (4.5:1) against what is behind it, and a colour scale runs from the surface outwards.
import { readFileSync } from "node:fs";
import * as echarts from "echarts";
import { DARK_TOKENS, LIGHT_TOKENS, render } from "pivotkit-report";
import { expect, test } from "./fixtures.js";
import { CASES, ROWS, VIEWS, expectReportColours, measure, rgb } from "./report-contrast.js";

const read = (name) => readFileSync(new URL(`../../examples/report-templates/${name}`, import.meta.url), "utf8");
const corporate = read("corporate.template.html");

/** The colour tokens a template sets on its :root (Corporate sets every one the report uses), a var() of another followed. */
const ownTokens = (template) => {
    const declared = Object.fromEntries([.../:root \{([^}]*)\}/.exec(template)[1].matchAll(/(--pk-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    const resolve = (value) => /^var\((--pk-[\w-]+)\)$/.exec(value)?.[1] ?? null;
    return Object.fromEntries(Object.entries(declared).map(([name, value]) => [name, resolve(value) ? declared[resolve(value)] : value]).filter(([, value]) => /^#[0-9a-f]{6}$/i.test(value)));
};

const TEMPLATES = {
    Corporate: { template: corporate, own: ownTokens(corporate), theme: "light" },
    'Corporate with data-pk-theme="dark"': { template: corporate.replace('data-pk-theme="light"', 'data-pk-theme="dark"'), own: ownTokens(corporate), theme: "dark" },
    // the attribute taken out, as the template's docs offer: light or dark after the system
    "Corporate without data-pk-theme": { template: corporate.replace(' data-pk-theme="light"', ""), own: ownTokens(corporate) },
    Minimal: { template: read("minimal.template.html"), own: {} }
};

test("Corporate sets every colour token the report uses, and pins light", () => {
    const own = ownTokens(corporate);
    for (const name of Object.keys(LIGHT_TOKENS).filter((n) => LIGHT_TOKENS[n].startsWith("#"))) expect(own[name], name).toBeTruthy();
    expect(corporate).toMatch(/<html [^>]*data-pk-theme="light"/);
    expect(corporate).toMatch(/:root\[data-pk-theme="light"\] \{\s*color-scheme: light;/);
});

for (const [name, { template, own, theme }] of Object.entries(TEMPLATES)) {
    for (const scheme of ["light", "dark"]) {
        for (const media of ["screen", "print"]) {
            test(`${name}, ${scheme} system theme, ${media}: each part in its theme's colour, every text 4.5:1 on what is behind it`, async ({ page }) => {
                await page.emulateMedia({ colorScheme: scheme, media });
                const dark = media === "screen" && (theme ?? scheme) === "dark";
                // light: the template's own tokens over the report's; dark: the report's dark ones
                const light = { ...LIGHT_TOKENS, ...own };
                const tokens = dark ? DARK_TOKENS : light;
                for (const [viewName, { view, rows, options, shows }] of Object.entries(CASES)) {
                    const report = await render(view, rows, { format: "html", echarts, template, source: "sales.csv", now: "2026-11-13T10:00:00Z", ...options });
                    expect(report.ok).toBe(true);
                    await page.setContent(report.text);
                    const seen = await measure(page);
                    expect(seen.body, `${viewName}: the page's surface`).toBe(rgb(tokens["--pk-surface"]));
                    expect(seen.text, `${viewName}: the page's text`).toBe(rgb(tokens["--pk-text"]));
                    // paper: dark text on white (Corporate's surface is white too)
                    if (media === "print") expect(seen.body, `${viewName}: paper`).toBe("rgb(255, 255, 255)");
                    if (media === "screen") expect(seen.colorScheme, `${viewName}: colour scheme`).toBe(theme ?? (scheme === "dark" ? "dark" : "light dark"));
                    expectReportColours(seen, { name: `${name}, ${viewName}`, tokens, light, dark, media, shows });
                }
            });
        }
    }
}

test("Corporate: the header and the footer with the report's details; a part without a value is left out", async ({ page }) => {
    const withSource = await render(VIEWS.scale, ROWS, { format: "html", template: corporate, source: "sales.csv", now: "2026-11-13T10:00:00Z" });
    await page.setContent(withSource.text);
    await expect(page.locator(".co-header h1")).toHaveText("Report");
    await expect(page.locator(".co-internal")).toBeVisible();
    await expect(page.locator(".co-footer")).toContainText("Source sales.csv");
    await expect(page.locator(".co-footer")).toContainText("Generated Nov 13, 2026");
    // the footer shows the details: no second list of them
    await expect(page.locator(".pk-report-details")).toHaveCount(0);
    const without = await render(VIEWS.scale, ROWS, { format: "html", template: corporate, now: "2026-11-13T10:00:00Z" });
    await page.setContent(without.text);
    await expect(page.locator(".co-pair", { hasText: "Source" })).toBeHidden();
    await expect(page.locator(".co-pair", { hasText: "Generated" })).toBeVisible();
});

test("the chart takes Corporate's colours, and keeps the default's in Minimal", async () => {
    const svgFills = async (template) => {
        const r = await render(VIEWS.chart, ROWS, { format: "html", echarts, chartEmbed: "inline", template, now: "2026-11-13T10:00:00Z" });
        return new Set([...r.text.matchAll(/<path [^>]*fill="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase()));
    };
    const own = ownTokens(corporate);
    expect([...(await svgFills(corporate))]).toEqual(expect.arrayContaining([own["--pk-chart-1"], own["--pk-chart-2"], own["--pk-chart-3"]]));
    expect([...(await svgFills(read("minimal.template.html")))]).toEqual(expect.arrayContaining([LIGHT_TOKENS["--pk-chart-1"]]));
});
