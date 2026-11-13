// A host matches every visual value to its design through --pk-* tokens (docs/reference/theming.md):
// corners, the code font, the focus ring and the chart's title, text and marks (#216, #221); and the
// files a person exports (workbook, HTML report) take the host's light colours and font sizes, from a
// dark report too, in React and inside pivotkit-element (#217, #220).
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { TRACE_IN_PRINT_FRAME, chipMenu, expect, test, toolbar } from "./fixtures.js";

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

test.describe("exports from a dark report carry the host's light colours (#217)", () => {
    test.use({ ignoreConsole: [TRACE_IN_PRINT_FRAME] });

    test("React: the workbook and the HTML report get the light colours and --pk-scale-mid; the screen stays dark, nothing animates", async ({ page }) => {
        await page.goto("?data=sales&theme=dark");
        await page.addStyleTag({ content: HOST_THEME(".pk-root") });
        await chipMenu(page, "Sum of Revenue");
        await page.locator(".pk-chip-menu").getByTestId("cond-colorScale").click();
        await expect(page.locator(".pk-td.pk-has-scale").first()).toBeVisible();
        await page.keyboard.press("Escape");
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
        expect(html).not.toMatch(/#331a00|#ff9933|#553300|#c58cf2/);
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
        expect(html).not.toMatch(/#331a00|#ff9933|#553300|#c58cf2/);

        expect(await tickets.getAttribute("data-pk-theme")).toBe("dark");
        expect(await shown()).toBe("#331a00");
        expect(await page.evaluate(() => window.__runs)).toBe(0);
    });
});
