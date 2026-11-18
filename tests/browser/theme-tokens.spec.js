// A host matches every visual value to its design through --pk-* tokens (docs/reference/theming.md):
// corners, the code font, the focus ring and the chart's title, text and marks (#216, #221); and the
// files a person exports (workbook, HTML report) take the host's light colours and font sizes, from a
// dark report too, in React and inside pivotkit-element (#217, #220); the HTML report also takes the
// host's dark colours for a dark screen (#385).
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { chipMenu, expect, test, toolbar } from "./fixtures.js";

/** A host's theme keyed on the theme the report shows: light colours, and dark ones for the dark theme. */
const HOST_THEME = (selector) => `
${selector} { --pk-heat-low: #fff5e6; --pk-heat-high: #b34700; --pk-scale-mid: #ffcc00; --pk-chart-1: #6b2fa0; --pk-weight-strong: 550; --pk-font-size: 15px; --pk-report-title-size: 1.6em; }
${selector}[data-pk-theme="dark"] { --pk-heat-low: #331a00; --pk-heat-high: #ff9933; --pk-scale-mid: #553300; --pk-chart-1: #c58cf2; }`;

/** The colour scale's and the data bars' colours of a downloaded workbook, as #rrggbb, low to high. */
async function workbookColours(download) {
    const sheet = strFromU8(unzipSync(await readFile(await download.path()))["xl/worksheets/sheet1.xml"]);
    const scale = sheet.match(/<colorScale>(.*?)<\/colorScale>/)?.[1] ?? "";
    return [...scale.matchAll(/<color rgb="FF([0-9A-F]{6})"\/>/g)].map((m) => `#${m[1].toLowerCase()}`);
}

/**
 * The focus ring of a button reached by keyboard: Shift+Tab from the text field to the level's Back;
 * in WebKit focused directly after a key, since Safari's Tab skips buttons unless the user turns that on.
 */
async function focusRing(page, browserName) {
    if (browserName === "webkit") {
        await page.keyboard.press("End");
        await page.getByTestId("level-back").focus();
    } else {
        await page.keyboard.press("Shift+Tab");
    }
    await expect(page.getByTestId("level-back")).toBeFocused();
    return page.getByTestId("level-back").evaluate((el) => (el.matches(":focus-visible") ? getComputedStyle(el).outlineWidth : "not visible"));
}

/** The :root rule of an HTML report: the tokens it was written with. */
const rootRule = (html) => html.match(/<style>:root\{([^}]*)\}/)[1];

/**
 * An HTML report without its rules of a dark screen's tokens (the host's dark colours, #385): what
 * paper and a light screen are drawn with.
 */
const withoutDarkScreen = (html) => html.replace(/^@media screen[^{]*\{:root(?::not\(\[data-pk-theme="light"\]\)|\[data-pk-theme="dark"\])\{.*$/gm, "");

test.describe("a host's tokens for corners, the code font, the focus ring and the chart (#216)", () => {
    test("the default look: the corners, the code font and the ring widths of before", async ({ page, browserName }) => {
        await page.goto("?data=sales&theme=light");
        const radius = (selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
        expect(await radius(".pk-type")).toBe("6px");
        expect(await radius(".pk-handle")).toBe("5px");
        expect(await radius(".pk-btn")).toBe("7px");
        await toolbar(page, "views");
        await page.getByTestId("load-view").click();
        const text = page.getByTestId("load-view-text");
        await expect(text).toBeFocused();
        const look = await text.evaluate((el) => ({ font: getComputedStyle(el).fontFamily, shadow: getComputedStyle(el).boxShadow }));
        expect(look.font).toBe("ui-monospace, SFMono-Regular, Menlo, Consolas, monospace");
        expect(look.shadow).toMatch(/ 0px 0px 0px 3px$|^rgb\([^)]*\) 0px 0px 0px 3px/);
        expect(await focusRing(page, browserName)).toBe("2px");
    });

    test("a host's corners, code font and focus ring take effect", async ({ page, browserName }) => {
        await page.goto("?data=sales&theme=light");
        await page.addStyleTag({ content: '.pk-root { --pk-radius-sm: 14px; --pk-font-mono: "Courier New", monospace; --pk-focus-width: 4px; --pk-glow-width: 5px; }' });
        const radius = (selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
        // the small corners follow --pk-radius-sm: 4, 5 and 6 sevenths of it
        expect(await radius(".pk-btn")).toBe("14px");
        expect(await radius(".pk-type")).toBe("12px");
        expect(await radius(".pk-handle")).toBe("10px");
        await page.addStyleTag({ content: ".pk-root { --pk-radius-sm: 0px; }" });
        expect(await radius(".pk-type")).toBe("0px");
        expect(await radius(".pk-handle")).toBe("0px");
        await toolbar(page, "views");
        await page.getByTestId("load-view").click();
        const text = page.getByTestId("load-view-text");
        await expect(text).toBeFocused();
        const look = await text.evaluate((el) => ({ font: getComputedStyle(el).fontFamily, shadow: getComputedStyle(el).boxShadow }));
        // WebKit writes the family without its quotes
        expect(look.font).toMatch(/^"?Courier New"?, monospace$/);
        expect(look.shadow).toMatch(/ 0px 0px 0px 5px$|^rgb\([^)]*\) 0px 0px 0px 5px/);
        expect(await focusRing(page, browserName)).toBe("4px");
    });

    test("the chart's title and text size and the corners of its marks and tooltip come from the tokens, an em one resolved", async ({ page }) => {
        await page.goto("pages/host.html");
        await page.evaluate(async () => {
            const React = await import("react");
            const { createRoot } = await import("react-dom/client");
            const { PivotReport } = await import("pivotkit-react");
            const el = document.createElement("section");
            el.id = "brand-chart";
            document.body.append(el);
            const data = [{ City: "Berlin", Temperature: 10 }, { City: "Munich", Temperature: 15 }];
            const view = { rows: ["City"], values: [{ field: "Temperature", agg: "average" }], display: "chart", chart: { type: "bar", title: "Temperature" } };
            createRoot(el).render(React.createElement(PivotReport, { theme: "light", className: "brand", data, view, height: 520 }));
        });
        const chart = page.locator("#brand-chart").getByTestId("pivot-chart");
        await expect(chart.locator("canvas")).toBeVisible();
        const drawn = () =>
            chart.evaluate(async (el) => {
                const { getInstanceByDom } = await import("echarts/core");
                const option = getInstanceByDom(el).getOption();
                const text = [option.xAxis[0].axisLabel.fontSize, option.yAxis[0].axisLabel.fontSize, option.textStyle.fontSize];
                // to a tenth of a px: WebKit resolves lengths in 64ths of a px (14.875 for 14.88)
                return { title: option.title[0].textStyle.fontSize, text: text.every((t) => t === text[0]) ? Math.round(text[0] * 10) / 10 : text, bar: option.series[0].itemStyle.borderRadius, tooltip: /border-radius: ([^;]+);/.exec(option.tooltip[0].extraCssText)?.[1] };
            });
        // the default: a 16 px title and text of --pk-small (0.93em, at least 14 px) at the page's 16 px
        // font on both axes, 4 px bars, an 8 px tooltip
        await expect.poll(drawn).toEqual({ title: 16, text: 14.9, bar: [4, 4, 0, 0], tooltip: "8px" });
        // a brand: a title of 1.5em and text of 1em (of the report's font), square bars, a 2 px tooltip;
        // the chart draws again with the theme
        await page.addStyleTag({ content: ".brand { --pk-chart-title-size: 1.5em; --pk-chart-text-size: 1em; --pk-radius-chart: 0px; --pk-radius-card: 2px; }" });
        await page.evaluate(() => {
            document.querySelector("#brand-chart .pk-root").style.setProperty("font-size", "18px");
            window.dispatchEvent(new Event("resize"));
        });
        await chart.evaluate((el) => (el.style.width = `${el.clientWidth - 20}px`));
        await expect.poll(drawn).toEqual({ title: 27, text: 18, bar: [0, 0, 0, 0], tooltip: "2px" });
        // a corner that is no length keeps the default instead of becoming square
        await page.addStyleTag({ content: ".brand { --pk-radius-chart: rounded; }" });
        await chart.evaluate((el) => (el.style.width = `${el.clientWidth - 20}px`));
        await expect.poll(drawn).toEqual({ title: 27, text: 18, bar: [4, 4, 0, 0], tooltip: "2px" });
    });
});

test.describe("a heatmap's colours in a form ECharts cannot mix (#386)", () => {
    // oklch() and rgb() with spaces: ECharts' own parser reads neither and mixed them to black
    const LIGHT = { low: "oklch(0.96 0.02 250)", high: "rgb(178 34 34)" };
    const DARK = { low: "oklch(0.32 0.06 250)", high: "oklch(0.85 0.17 90)" };
    const css = `.heat-host .pk-root { --pk-heat-low: ${LIGHT.low}; --pk-heat-high: ${LIGHT.high}; }
.heat-host .pk-root[data-pk-theme="dark"] { --pk-heat-low: ${DARK.low}; --pk-heat-high: ${DARK.high}; }`;
    // revenue per region and category: the least is South's services (5), the most East's software (40)
    const data = [
        { Region: "North", Category: "Hardware", Revenue: 20 }, { Region: "North", Category: "Services", Revenue: 10 }, { Region: "North", Category: "Software", Revenue: 30 },
        { Region: "South", Category: "Hardware", Revenue: 15 }, { Region: "South", Category: "Services", Revenue: 5 }, { Region: "South", Category: "Software", Revenue: 25 },
        { Region: "East", Category: "Hardware", Revenue: 12 }, { Region: "East", Category: "Services", Revenue: 18 }, { Region: "East", Category: "Software", Revenue: 40 }
    ];

    for (const theme of ["light", "dark"]) {
        test(`${theme}: the cells show the host's colours, the least one in the low colour and the most in the high one`, async ({ page }) => {
            await page.goto("pages/host.html");
            await page.addStyleTag({ content: css });
            await page.evaluate(async ({ data, theme }) => {
                const React = await import("react");
                const { createRoot } = await import("react-dom/client");
                const { PivotReport } = await import("pivotkit-react");
                const el = document.createElement("section");
                el.id = "heat-chart";
                el.className = "heat-host";
                document.body.prepend(el);
                const view = { rows: ["Region"], cols: ["Category"], values: [{ field: "Revenue", agg: "sum" }], display: "chart", chart: { type: "heatmap", valueLabels: "off" } };
                createRoot(el).render(React.createElement(PivotReport, { theme, data, defaultView: view, height: 520 }));
            }, { data, theme });
            const chart = page.locator("#heat-chart").getByTestId("pivot-chart");
            await expect(chart.locator("canvas").first()).toBeVisible();
            // the colour drawn in the middle of a cell, as [r, g, b], once the chart has settled
            const cell = (region, category) =>
                chart.evaluate(async (el, { region, category }) => {
                    const { getInstanceByDom } = await import("echarts/core");
                    const instance = getInstanceByDom(el);
                    if (!instance.getZr().animation.isFinished()) {
                        return null;
                    }
                    const option = instance.getOption();
                    const [x, y] = instance.convertToPixel({ seriesIndex: 0 }, [option.xAxis[0].data.indexOf(category), option.yAxis[0].data.indexOf(region)]);
                    // the layers ECharts draws on (the cells have one of their own), one over the other
                    const layers = [...el.querySelectorAll("canvas")];
                    const scale = layers[0].width / layers[0].clientWidth;
                    const copy = document.createElement("canvas");
                    copy.width = layers[0].width;
                    copy.height = layers[0].height;
                    const ctx = copy.getContext("2d", { willReadFrequently: true });
                    for (const layer of layers) {
                        ctx.drawImage(layer, 0, 0);
                    }
                    const [r, g, b, a] = ctx.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
                    // not drawn yet
                    return a === 0 ? null : [r, g, b];
                }, { region, category });
            await expect.poll(async () => (await cell("South", "Services")) !== null && (await cell("East", "Software")) !== null).toBe(true);
            const [least, most] = [await cell("South", "Services"), await cell("East", "Software")];
            const sum = (c) => c[0] + c[1] + c[2];
            if (theme === "light") {
                // a pale blue and a firebrick red
                expect(Math.min(...least), String(least)).toBeGreaterThan(220);
                expect(least[2], String(least)).toBeGreaterThanOrEqual(least[0]);
                expect(most[0] - most[2], String(most)).toBeGreaterThan(100);
            } else {
                // a dark blue, not black, and a light yellow
                expect(sum(least), String(least)).toBeGreaterThan(90);
                expect(Math.max(...least), String(least)).toBeLessThan(110);
                expect(least[2] - least[0], String(least)).toBeGreaterThan(15);
                expect(Math.min(most[0], most[1]) - most[2], String(most)).toBeGreaterThan(80);
            }
            // the SVG of the Export menu (light, as paper) draws the cells in the host's light colours too
            const shownLight = await chart.evaluate(async (el) => {
                const { getInstanceByDom } = await import("echarts/core");
                return getInstanceByDom(el).getOption().visualMap[0].inRange.color;
            });
            await page.locator("#heat-chart").getByTestId("export").click();
            const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-svg").click()]);
            const svg = await readFile(await download.path(), "utf8");
            const fills = [...svg.matchAll(/<path d="M[^"]*" fill="([^"]+)"/g)].map((m) => m[1].toLowerCase());
            expect(fills.some((f) => /^(#000|#000000|rgb\(0,\s*0,\s*0\)|black)$/.test(f)), fills.join(" ")).toBe(false);
            if (theme === "light") {
                // the least and the largest cell: the scale's two ends, as the screen draws them
                const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")})`;
                expect(fills).toEqual(expect.arrayContaining(shownLight.map(rgb)));
                // the HTML report: the heat colours and the colour scale of its table (by default the
                // heat colours) as #rrggbb, which the report's table takes, not oklch()
                await page.locator("#heat-chart").getByTestId("export").click();
                const [report] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-html").click()]);
                const tokens = rootRule(await readFile(await report.path(), "utf8"));
                for (const [name, value] of [["--pk-heat-low", shownLight[0]], ["--pk-heat-high", shownLight[1]], ["--pk-scale-low", shownLight[0]], ["--pk-scale-high", shownLight[1]]]) {
                    expect(tokens).toContain(`${name}:${value}`);
                }
                expect(tokens).not.toContain("oklch(");
            }
        });
    }
});

test.describe("exports from a dark report carry the host's light colours (#217)", () => {
    test("React: the workbook and the HTML report get the light colours and --pk-scale-mid; the screen stays dark, nothing animates", async ({ page }) => {
        await page.goto("?data=sales&theme=dark");
        await page.addStyleTag({ content: HOST_THEME(".pk-root") });
        await chipMenu(page, "Sum of Revenue");
        await page.locator(".pk-chip-menu").getByTestId("cond-colorScale").click();
        await expect(page.locator(".pk-td.pk-has-scale").first()).toBeVisible();
        await page.keyboard.press("Escape");
        // the pointer off the table: the menu's entry may have been over a cell, and that cell's own
        // hover transition, when the pointer moves on, is not a run the theme reading starts
        await page.mouse.move(0, 0);
        // the cells' colours have come in (their transition ended)
        await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
        const root = page.locator(".pk-root");
        const screen = () => root.evaluate((el) => ({ theme: el.getAttribute("data-pk-theme"), low: getComputedStyle(el).getPropertyValue("--pk-heat-low").trim(), cell: getComputedStyle(el.querySelector(".pk-td.pk-has-scale")).backgroundColor }));
        const before = await screen();
        expect(before.theme).toBe("dark");
        expect(before.low).toBe("#331a00");
        // a transition started by reading the light theme would show as a run on the table's cells
        await page.evaluate(() => {
            window.__runs = 0;
            document.querySelector(".pk-root [data-testid='pivot-table']").addEventListener("transitionrun", () => window.__runs++, true);
        });

        await toolbar(page, "export");
        const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-xlsx").click()]);
        expect(await workbookColours(xlsx)).toEqual(["#fff5e6", "#ffcc00", "#b34700"]);

        await toolbar(page, "export");
        const [report] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-html").click()]);
        const html = await readFile(await report.path(), "utf8");
        const tokens = rootRule(html);
        expect(tokens).toContain("--pk-heat-low:#fff5e6");
        expect(tokens).toContain("--pk-heat-high:#b34700");
        expect(tokens).toContain("--pk-scale-mid:#ffcc00");
        expect(tokens).toContain("--pk-weight-strong:550");
        expect(tokens).toContain("--pk-surface:#ffffff");
        // the host's font sizes in px, as the report resolves them: its text, the secondary text
        // (0.93em of 15 px, at least 14 px), its title size for the HTML report (1.6em of 15 px) and the
        // chart's text (--pk-small)
        expect(tokens).toContain("--pk-font-size:15px");
        expect(tokens).toContain("--pk-small:14px");
        expect(tokens).toContain("--pk-report-title-size:24px");
        expect(tokens).toContain("--pk-chart-text-size:14px");
        // the dark colours only in the rules of a dark screen's tokens
        expect(withoutDarkScreen(html)).not.toMatch(/#331a00|#ff9933|#553300|#c58cf2/);
        // the table's cells in the report: the lowest value the host's low colour, the highest its high one
        // (a colour scale of three, so a value in the middle is the host's middle colour)
        expect(html).toMatch(/--pk-cell-bg:#fff5e6/);
        expect(html).toMatch(/--pk-cell-bg:#b34700/);

        expect(await screen()).toEqual(before);
        expect(await page.evaluate(() => window.__runs)).toBe(0);
    });

    test("pivotkit-element: tokens on the element reach the workbook and the HTML report from its dark theme", async ({ page }) => {
        await page.goto("pages/element-two.html");
        await page.addStyleTag({ content: HOST_THEME("pivot-report") });
        const tickets = page.locator("#tickets");
        await page.evaluate(() => {
            const el = document.getElementById("tickets");
            el.view = { ...el.view, values: el.view.values.map((v) => ({ ...v, conditional: { type: "colorScale", colors: [] } })) };
        });
        await expect(tickets.locator(".pk-td.pk-has-scale").first()).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.getElementById("tickets").shadowRoot.getAnimations().length)).toBe(0);
        expect(await tickets.getAttribute("data-pk-theme")).toBe("dark");
        await tickets.evaluate((el) => {
            window.__runs = 0;
            el.shadowRoot.querySelector("[data-testid='pivot-table']").addEventListener("transitionrun", () => window.__runs++, true);
        });
        const shown = () => tickets.evaluate((el) => getComputedStyle(el.shadowRoot.querySelector(".pk-root")).getPropertyValue("--pk-heat-low").trim());
        expect(await shown()).toBe("#331a00");

        await tickets.getByTestId("export").click();
        const [xlsx] = await Promise.all([page.waitForEvent("download"), tickets.getByTestId("export-xlsx").click()]);
        expect(await workbookColours(xlsx)).toEqual(["#fff5e6", "#ffcc00", "#b34700"]);

        await tickets.getByTestId("export").click();
        const [report] = await Promise.all([page.waitForEvent("download"), tickets.getByTestId("export-html").click()]);
        const html = await readFile(await report.path(), "utf8");
        const tokens = rootRule(html);
        expect(tokens).toContain("--pk-heat-low:#fff5e6");
        expect(tokens).toContain("--pk-scale-mid:#ffcc00");
        expect(tokens).toContain("--pk-font-size:15px");
        expect(tokens).toContain("--pk-report-title-size:24px");
        // the dark colours only in the rules of a dark screen's tokens
        expect(withoutDarkScreen(html)).not.toMatch(/#331a00|#ff9933|#553300|#c58cf2/);

        expect(await tickets.getAttribute("data-pk-theme")).toBe("dark");
        expect(await shown()).toBe("#331a00");
        expect(await page.evaluate(() => window.__runs)).toBe(0);
    });

});

test.describe("the HTML report carries the host's dark colours too (#385)", () => {
    // for a reader whose screen is dark, read from the report whichever theme it shows
    for (const theme of ["light", "dark"]) {
        test(`React: the HTML report from a ${theme} report shows the host's dark colours on a dark screen, its light ones on a light screen and on paper (#385)`, async ({ page, context }) => {
            await page.goto(`?data=sales&theme=${theme}`);
            await page.addStyleTag({ content: HOST_THEME(".pk-root") });
            await chipMenu(page, "Sum of Revenue");
            await page.locator(".pk-chip-menu").getByTestId("cond-colorScale").click();
            await expect(page.locator(".pk-td.pk-has-scale").first()).toBeVisible();
            await page.keyboard.press("Escape");
            // the pointer off the table, as above: a hovered cell's own transition is not counted
            await page.mouse.move(0, 0);
            await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
            const root = page.locator(".pk-root");
            const shown = () => root.evaluate((el) => ({ theme: el.getAttribute("data-pk-theme"), low: getComputedStyle(el).getPropertyValue("--pk-heat-low").trim() }));
            const before = await shown();
            expect(before.theme).toBe(theme);
            await page.evaluate(() => {
                window.__runs = 0;
                document.querySelector(".pk-root [data-testid='pivot-table']").addEventListener("transitionrun", () => window.__runs++, true);
            });

            await toolbar(page, "export");
            const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-html").click()]);
            const html = await readFile(await download.path(), "utf8");
            // the screen kept its theme, and nothing on it animated while the other theme was read
            expect(await shown()).toEqual(before);
            expect(await page.evaluate(() => window.__runs)).toBe(0);

            const report = await context.newPage();
            const NAMES = ["--pk-heat-low", "--pk-heat-high", "--pk-scale-mid", "--pk-chart-1"];
            const tokensOf = async (colorScheme, media) => {
                await report.emulateMedia({ colorScheme, media });
                await report.setContent(html);
                return report.evaluate((names) => names.map((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()), NAMES);
            };
            const LIGHT = ["#fff5e6", "#b34700", "#ffcc00", "#6b2fa0"];
            expect(await tokensOf("dark", "screen")).toEqual(["#331a00", "#ff9933", "#553300", "#c58cf2"]);
            expect(await tokensOf("light", "screen")).toEqual(LIGHT);
            expect(await tokensOf("dark", "print")).toEqual(LIGHT);
            await report.close();
        });
    }
});

test.describe("a host's tokens for the tabs, icon buttons, button frames and primary buttons (#604)", () => {
    /** Every token of #604 with a colour of its own, so each one shows where it lands. */
    const PART_TOKENS = {
        "--pk-tab-bg": "rgb(1, 2, 3)",
        "--pk-tab-text": "rgb(10, 20, 30)",
        "--pk-tab-selected-bg": "rgb(40, 50, 60)",
        "--pk-tab-selected-text": "rgb(70, 80, 90)",
        "--pk-icon-button-text": "rgb(100, 110, 120)",
        "--pk-icon-button-hover-bg": "rgb(130, 140, 150)",
        "--pk-button-border": "rgb(160, 170, 180)",
        "--pk-button-border-hover": "rgb(190, 200, 210)",
        "--pk-primary-bg": "rgb(200, 16, 46)",
        "--pk-primary-text": "rgb(255, 255, 254)",
        "--pk-primary-hover-bg": "rgb(150, 10, 30)"
    };
    const rule = (selector) => `${selector} { --pk-duration: 0ms; ${Object.entries(PART_TOKENS).map(([k, v]) => `${k}: ${v};`).join(" ")} }`;

    /** A part's colours as the browser draws them. */
    const colours = (locator) => locator.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color, border: getComputedStyle(el).borderTopColor }));

    /** What a CSS colour expression resolves to inside the report (its tokens, its theme). */
    const resolve = (page, expr) =>
        page.locator(".pk-root").first().evaluate((root, value) => {
            const probe = document.createElement("i");
            probe.style.backgroundColor = value;
            root.append(probe);
            const out = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return out;
        }, expr);

    /** The selected and the other tab, an icon button with hover, a framed button with hover, a primary button with hover. */
    async function parts(page, scope) {
        await scope.getByTestId("show-table").waitFor();
        // a dark report starts light for a frame: its colours are read once that transition has ended
        await page.waitForFunction(() => document.getAnimations().length === 0 && [...document.querySelectorAll("pivot-report")].every((el) => el.shadowRoot?.getAnimations().length === 0));
        const out = { selected: await colours(scope.getByTestId("show-table")), tab: await colours(scope.getByTestId("show-chart")) };
        const icon = scope.getByTestId("collapse-fields");
        out.icon = await colours(icon);
        await icon.hover();
        out.iconHover = await colours(icon);
        const button = scope.getByTestId("export");
        out.button = await colours(button);
        await button.hover();
        out.buttonHover = await colours(button);
        await page.mouse.move(1, 1);
        return out;
    }

    async function primary(page) {
        await toolbar(page, "views");
        await page.getByTestId("load-view").click();
        await page.getByTestId("load-view-text").fill("{}");
        const apply = page.getByTestId("load-view-apply");
        await expect(apply).toBeEnabled();
        const rest = await colours(apply);
        await apply.hover();
        return { rest, hover: await colours(apply) };
    }

    for (const theme of ["light", "dark"]) {
        test(`${theme}: the defaults are today's colours, from the general tokens`, async ({ page }) => {
            await page.goto(`?data=sales&lang=en&theme=${theme}`);
            await page.addStyleTag({ content: ".pk-root { --pk-duration: 0ms; }" });
            const p = await parts(page, page);
            const v = async (expr) => resolve(page, expr);
            expect(p.selected.bg).toBe(await v("var(--pk-surface)"));
            expect(p.selected.text).toBe(await v("var(--pk-accent)"));
            expect(p.tab.bg).toBe("rgba(0, 0, 0, 0)");
            expect(p.tab.text).toBe(await v("var(--pk-muted)"));
            expect(p.icon.text).toBe(await v("var(--pk-muted)"));
            expect(p.iconHover.bg).toBe(await v("var(--pk-surface-3)"));
            expect(p.button.border).toBe(await v("var(--pk-border)"));
            expect(p.buttonHover.border).toBe(await v("var(--pk-border-strong)"));
            const main = await primary(page);
            expect(main.rest.bg).toBe(await v("var(--pk-accent)"));
            expect(main.rest.border).toBe(await v("var(--pk-accent)"));
            expect(main.rest.text).toBe(await v("var(--pk-accent-text)"));
            expect(main.hover.bg).toBe(await v("color-mix(in srgb, var(--pk-accent) 88%, var(--pk-text))"));
        });
    }

    test("React: each token takes effect on its part, at rest and on hover", async ({ page }) => {
        await page.goto("?data=sales&lang=en&theme=light");
        await page.addStyleTag({ content: rule(".pk-root") });
        const p = await parts(page, page);
        expect(p.selected).toMatchObject({ bg: PART_TOKENS["--pk-tab-selected-bg"], text: PART_TOKENS["--pk-tab-selected-text"] });
        expect(p.tab).toMatchObject({ bg: PART_TOKENS["--pk-tab-bg"], text: PART_TOKENS["--pk-tab-text"] });
        expect(p.icon.text).toBe(PART_TOKENS["--pk-icon-button-text"]);
        expect(p.iconHover.bg).toBe(PART_TOKENS["--pk-icon-button-hover-bg"]);
        expect(p.button.border).toBe(PART_TOKENS["--pk-button-border"]);
        expect(p.buttonHover.border).toBe(PART_TOKENS["--pk-button-border-hover"]);
        const main = await primary(page);
        expect(main.rest).toEqual({ bg: PART_TOKENS["--pk-primary-bg"], text: PART_TOKENS["--pk-primary-text"], border: PART_TOKENS["--pk-primary-bg"] });
        expect(main.hover.bg).toBe(PART_TOKENS["--pk-primary-hover-bg"]);
    });

    test("pivotkit-element: the tokens set on the element reach the parts inside its shadow root", async ({ page }) => {
        await page.goto("pages/element-two.html");
        await page.addStyleTag({ content: rule("pivot-report") });
        const p = await parts(page, page.locator("#sales"));
        expect(p.selected).toMatchObject({ bg: PART_TOKENS["--pk-tab-selected-bg"], text: PART_TOKENS["--pk-tab-selected-text"] });
        expect(p.tab).toMatchObject({ bg: PART_TOKENS["--pk-tab-bg"], text: PART_TOKENS["--pk-tab-text"] });
        expect(p.icon.text).toBe(PART_TOKENS["--pk-icon-button-text"]);
        expect(p.iconHover.bg).toBe(PART_TOKENS["--pk-icon-button-hover-bg"]);
        expect(p.button.border).toBe(PART_TOKENS["--pk-button-border"]);
        expect(p.buttonHover.border).toBe(PART_TOKENS["--pk-button-border-hover"]);
        // the dark report takes them too: the element's own value wins over its dark defaults
        const dark = await parts(page, page.locator("#tickets"));
        expect(dark.selected).toMatchObject({ bg: PART_TOKENS["--pk-tab-selected-bg"], text: PART_TOKENS["--pk-tab-selected-text"] });
        expect(dark.button.border).toBe(PART_TOKENS["--pk-button-border"]);
    });

    test("forced colours: a host's tokens leave the system's frames in place", async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", "forced colours are emulated in Chromium only");
        await page.emulateMedia({ forcedColors: "active" });
        await page.goto("?data=sales&lang=en&theme=light");
        await page.addStyleTag({ content: rule(".pk-root") });
        await page.getByTestId("show-table").waitFor();
        const frame = (testId) => page.getByTestId(testId).evaluate((el) => ({ width: getComputedStyle(el).borderTopWidth, style: getComputedStyle(el).borderTopStyle }));
        expect(await frame("show-table")).toEqual({ width: "2px", style: "solid" });
        expect(await frame("export")).toEqual({ width: "1px", style: "solid" });
    });
});
