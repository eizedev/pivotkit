// #370: the default HTML report printed to a real PDF (Chromium's page.pdf, the engine of Chrome's and
// Edge's "Save as PDF"; Firefox and WebKit have no page.pdf in Playwright), from a light and a dark
// system theme: a report that fits a page is one page, every text of its table is in the PDF, the
// paper is light (the same fills from a dark system theme as from a light one, none of the dark
// theme's, a root's data-pk-theme="dark" included), the colour scale's and the totals' backgrounds
// are printed though the print default leaves backgrounds out (print-color-adjust), and a long table
// runs over several pages with its header row on each. pdf-read.js reads the PDF.
import * as echarts from "echarts";
import { DARK_TOKENS, DEFAULT_TEMPLATE, LIGHT_TOKENS, render } from "pivotkit-report";
import { expect, test } from "./fixtures.js";
import { readPdf } from "./pdf-read.js";
import { VIEWS, ROWS } from "./report-contrast.js";

test.skip(({ browserName }) => browserName !== "chromium", "page.pdf is Chromium's only");

/** A table with a colour scale, data bars, subtotals and a grand total. */
const TABLE = { rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale" } }, { field: "Price", agg: "sum", conditional: { type: "dataBar" } }] };
const CASES = { chart: VIEWS.chart, table: TABLE };
const NOW = "2026-11-13T10:00:00Z";
/** A4 as the print dialog takes it, the report's own @page size (landscape for a wide table) first. */
const PAPER = { format: "A4", preferCSSPageSize: true };

/** The 0-255 channels of a hex colour or a computed "rgb(...)" or "color(srgb ...)", as pdf-read.js gives fills. */
const channels = (c) => {
    if (c.startsWith("#")) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const n = c.match(/[\d.]+/g).slice(0, 3).map(Number);
    return c.startsWith("color(") ? n.map((v) => v * 255) : n;
};
/** Whether a PDF's fills hold a colour (Skia writes 4 decimals: a channel may be off by one). */
const holds = (fills, colour) => fills.some((f) => f.split(" ").map(Number).every((v, i) => Math.abs(v - channels(colour)[i]) <= 1));
const squeeze = (s) => s.replace(/\s+/g, "");

/** The report printed by Chromium in a system theme: the PDF read, and the texts of the table's cells. */
async function printed(page, html, colorScheme) {
    await page.emulateMedia({ colorScheme, media: null });
    await page.setContent(html);
    const cells = await page.locator(".pk-table th, .pk-table td").evaluateAll((els) => els.map((e) => e.textContent.trim()).filter(Boolean));
    const pdf = await page.pdf(PAPER);
    expect(pdf.subarray(0, 5).toString("latin1"), "a PDF").toBe("%PDF-");
    return { pdf: readPdf(pdf), cells };
}

for (const [name, view] of Object.entries(CASES)) {
    test(`the default report with a ${name}, printed to PDF from a light and a dark system theme: one page, the table's text, light paper`, async ({ page }) => {
        const report = await render(view, ROWS, { format: "html", echarts, now: NOW });
        const light = await printed(page, report.text, "light");
        const dark = await printed(page, report.text, "dark");
        for (const [scheme, { pdf, cells }] of Object.entries({ light, dark })) {
            expect(pdf.count, `${scheme}: pages`).toBe(1);
            expect(pdf.pages).toHaveLength(1);
            const text = squeeze(pdf.pages[0].text);
            expect(text, `${scheme}: the title`).toContain("Report");
            expect(cells.length).toBeGreaterThan(20);
            expect(cells.filter((c) => !text.includes(squeeze(c))), `${scheme}: table texts missing from the PDF`).toEqual([]);
            // paper: the light surface and text; no dark surface, text or total
            const fills = pdf.pages[0].fills;
            for (const token of ["--pk-surface", "--pk-text", "--pk-surface-2", "--pk-total-strong"]) expect(holds(fills, LIGHT_TOKENS[token]), `${scheme}: light ${token} printed`).toBe(true);
            const darkFills = ["--pk-surface", "--pk-surface-2", "--pk-text", "--pk-muted", "--pk-total", "--pk-total-strong"].filter((t) => holds(fills, DARK_TOKENS[t]));
            expect(darkFills, `${scheme}: dark colours on paper`).toEqual([]);
        }
        // a dark system theme prints what a light one prints
        expect(dark.pdf.pages[0].fills.toSorted(), "the same colours").toEqual(light.pdf.pages[0].fills.toSorted());
        expect(squeeze(dark.pdf.pages[0].text)).toBe(squeeze(light.pdf.pages[0].text));
    });
}

test("the default report printed to PDF: a colour scale's cells, subtotals and the grand total keep their backgrounds", async ({ page }) => {
    const report = await render(TABLE, ROWS, { format: "html", now: NOW });
    await page.emulateMedia({ colorScheme: "dark", media: "print" });
    await page.setContent(report.text);
    // the backgrounds as the page computes them for paper
    const backgrounds = await page.locator(".pk-has-scale, .pk-table .pk-sub, .pk-table .pk-grand").evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).backgroundColor))]);
    expect(backgrounds.length).toBeGreaterThan(5);
    const { pdf } = await printed(page, report.text, "dark");
    expect(backgrounds.filter((b) => !holds(pdf.pages[0].fills, b)), "backgrounds missing from the PDF").toEqual([]);
});

test('a root that asks for dark (data-pk-theme="dark") still prints light', async ({ page }) => {
    const template = DEFAULT_TEMPLATE.replace("<html ", '<html data-pk-theme="dark" ');
    const report = await render(TABLE, ROWS, { format: "html", template, now: NOW });
    // the screen is dark, so the PDF below tests the rule for paper, not the system's theme
    await page.emulateMedia({ colorScheme: "light", media: "screen" });
    await page.setContent(report.text);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(`rgb(${channels(DARK_TOKENS["--pk-surface"]).join(", ")})`);
    for (const scheme of ["light", "dark"]) {
        const { pdf } = await printed(page, report.text, scheme);
        expect(holds(pdf.pages[0].fills, LIGHT_TOKENS["--pk-text"]), `${scheme}: light text colour`).toBe(true);
        expect(["--pk-surface", "--pk-text", "--pk-total-strong"].filter((t) => holds(pdf.pages[0].fills, DARK_TOKENS[t])), `${scheme}: dark colours on paper`).toEqual([]);
    }
});

test("a long table printed to PDF: several pages, the header row on each, every row once and in order", async ({ page }) => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ Item: `Item ${String(i + 1).padStart(3, "0")}`, Units: i + 1 }));
    const report = await render({ rows: ["Item"], values: [{ field: "Units", agg: "sum" }] }, rows, { format: "html", now: NOW });
    const { pdf } = await printed(page, report.text, "dark");
    expect(pdf.pages.length, "pages").toBeGreaterThan(1);
    expect(pdf.count).toBe(pdf.pages.length);
    for (const [i, p] of pdf.pages.entries()) expect(squeeze(p.text), `page ${i + 1}: the header row`).toContain("SumofUnits");
    const items = pdf.pages.flatMap((p) => [...squeeze(p.text).matchAll(/Item(\d{3})/g)].map((m) => Number(m[1])));
    expect(items).toEqual(rows.map((_, i) => i + 1));
    expect(squeeze(pdf.pages.at(-1).text)).toContain("GrandTotal");
});

test("combined table and chart printed to PDF stays light even in system dark mode with dark attribute (#988)", async ({ page }) => {
    const echarts = await import("echarts");
    const template = DEFAULT_TEMPLATE.replace("<html ", '<html data-pk-theme="dark" ');
    const both = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" }, display: "both" };
    const report = await render(both, ROWS, { format: "html", echarts, template, now: NOW });
    const { pdf } = await printed(page, report.text, "dark");
    expect(holds(pdf.pages[0].fills, LIGHT_TOKENS["--pk-text"])).toBe(true);
    expect(holds(pdf.pages[0].fills, DARK_TOKENS["--pk-surface"])).toBe(false);
    expect(holds(pdf.pages[0].fills, DARK_TOKENS["--pk-chart-1"])).toBe(false);
});
