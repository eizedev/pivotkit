// #369: the light values pivotkit-report reads from a print template's own CSS for the chart are the
// ones the browser computes for the report: each template below rendered, opened as a page, and
// getComputedStyle(.pk-report) compared with what the reader gives. A colour is compared as the page
// draws it (both put into `color` of a probe), so a var() or light-dark() is compared by its colour;
// a property the browser computes no value for (a cycle, `initial`) is the reader's default.
import { DEFAULT_TEMPLATE, LIGHT_TOKENS, render } from "pivotkit-report";
import { parseTemplate } from "pivotkit-report/template";
// internals on purpose: the test compares templateTheme(), which no entry exports, with the browser
import { templateTheme } from "../../packages/pivotkit-report/src/template-style.js";
import { BASE_TOKENS, REPORT_FONT, TOKEN_LENGTH, cleanTokens } from "../../packages/pivotkit-report/src/tokens.js";
import { expect, test } from "./fixtures.js";

/** tokens.js's parts, as render() passes them. */
const KIT = { base: BASE_TOKENS, font: REPORT_FONT, maxLength: TOKEN_LENGTH, clean: cleanTokens };

/** The default template with the template's own CSS before and after {{style}}. */
const wrap = (before, after) => DEFAULT_TEMPLATE.replace("{{style}}", `${before}{{style}}${after}`);

const TEMPLATES = {
    "after {{style}}": wrap("", "<style>:root{--brand:#7a1f5c;--pk-chart-1:var(--brand);--pk-surface:#fffdf7}</style>"),
    ":root before {{style}}: a property of its own counts, a report token not": wrap("<style>:root{--brand:#7a1f5c;--pk-chart-2:#010101}</style>", "<style>:root{--pk-chart-1:var(--brand)}</style>"),
    "a body property is not seen by :root": wrap("", "<style>body{--brand:#7a1f5c}:root{--pk-chart-1:var(--brand)}</style>"),
    ":root resolves its var() before .pk-report overrides it": wrap("", "<style>:root{--pk-chart-1:var(--pk-chart-2)}.pk-report{--pk-chart-2:#00aa55}</style>"),
    "a cycle is no value, its fallbacks too": wrap("", "<style>:root{--pk-chart-1:var(--b,#ff0000);--b:var(--pk-chart-1,#0000ff)}</style>"),
    "!important before {{style}}": wrap("<style>:root{--pk-chart-1:#123456 !important}</style>", ""),
    initial: wrap("", "<style>:root{--pk-chart-1:initial}</style>"),
    inherit: wrap("", "<style>.pk-report{--pk-chart-1:inherit}:root{--pk-chart-1:#abcdef}</style>"),
    "upper case selectors": wrap("", "<style>BODY{--pk-chart-1:#111111}:ROOT{--pk-chart-2:#222222}</style>"),
    "html under :root": wrap("", "<style>html{--brand:#336699;--pk-chart-2:#020202}:root{--pk-chart-1:var(--brand)}</style>"),
    "<!--> ends a comment": wrap("", "<!--><style>:root{--pk-chart-1:#445566}</style>-->"),
    "a font from var()": wrap("", "<style>:root{--f:Georgia, serif}.pk-report{font-family:var(--f)}</style>"),
    "the font shorthand": wrap("", "<style>.pk-report{font:16px/1.4 'Brand Sans', serif}</style>"),
    'media=""': wrap("", "<style media=''>:root{--pk-chart-1:#778899}</style>"),
    "@layer below the rest": wrap("", "<style>@layer t{.pk-report{--pk-chart-1:#987654} :root{--pk-chart-2:#030303}}</style>"),
    "type text/plain": wrap("", "<style type='text/plain'>:root{--pk-chart-1:#987654}</style>"),
    "stray text before a rule makes its selector invalid": wrap("", "<style>foo bar; :root{--pk-chart-1:#654321}</style>"),
    "/* inside a string": wrap("", "<style>.pk-report{--x:\"/*\"} :root{--pk-chart-1:#654321} /* */</style>"),
    "light-dark()": wrap("", "<style>:root{--pk-chart-1:light-dark(#111111,#eeeeee)}</style>"),
    "nested rules": wrap("", "<style>.pk-report{--pk-chart-1:#112233; & h1{color:red} --pk-chart-2:#445566}</style>"),
    "at-rules and other media left out": wrap("", "<style>@media (prefers-color-scheme: dark){:root{--pk-chart-1:#030303}}</style><style media='print'>:root{--pk-chart-1:#060606}</style>")
};

const KEYS = ["--pk-chart-1", "--pk-chart-2", "--pk-surface", "--pk-text"];
const font = (value) => value.replace(/["']/g, "").replace(/\s+/g, "");

for (const [name, template] of Object.entries(TEMPLATES)) {
    test(`a template's values for the chart are the page's: ${name}`, async ({ page }) => {
        const theme = templateTheme(parseTemplate(template), {}, KIT);
        await page.emulateMedia({ colorScheme: "light", media: "screen" });
        const report = await render({ rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }, [{ Region: "North", Units: 3 }], { format: "html", template, chart: false, now: "2026-11-13T10:00:00Z" });
        await page.setContent(report.text);
        const seen = await page.evaluate(({ keys, theme }) => {
            const report = document.querySelector(".pk-report");
            const style = getComputedStyle(report);
            const probe = document.createElement("i");
            report.append(probe);
            const colourOf = (value) => {
                probe.style.color = "";
                probe.style.color = value;
                return getComputedStyle(probe).color;
            };
            return {
                page: Object.fromEntries(keys.map((k) => [k, style.getPropertyValue(k).trim() ? colourOf(`var(${k})`) : null])),
                reader: Object.fromEntries(keys.map((k) => [k, colourOf(theme[k])])),
                font: style.fontFamily
            };
        }, { keys: KEYS, theme });
        for (const key of KEYS) {
            // no value on the page: the reader's default stands in
            const expected = seen.page[key] ?? (await page.evaluate((v) => { const i = document.createElement("i"); document.body.append(i); i.style.color = v; return getComputedStyle(i).color; }, LIGHT_TOKENS[key]));
            expect(seen.reader[key], key).toBe(expected);
        }
        expect(font(theme["font-family"])).toBe(font(seen.font));
    });
}
