// A host's --pk-* tokens that change after the chart's first draw, without a theme switch (#1000): a
// stylesheet that loads late, a <style> added later or written into (a CSS-in-JS library), in the page
// and in a shadow root. The chart draws again in the new tokens, as a fresh render with them draws it.
import { expect, test } from "../fixtures.js";
import { chartOf, inChart, mountReport, ROWS, VIEW } from "./report.js";

/** A host's colours: the first series and the chart's text. */
const LATE = ".pk-root { --pk-chart-1: #8a2be2; --pk-muted: #6b1d1d; }";

/** What the chart drew with: its palette and the colour of its axis names. */
const drawnColours = (chartEl) =>
    inChart(chartEl, (chart) => {
        const option = chart.getOption();
        const axis = [option.xAxis, option.yAxis].flat().find((a) => a?.type === "category");
        return { palette: option.color, axisText: axis?.axisLabel?.color ?? null };
    });

/** Mounts the bar chart in light, waits for its first draw, then returns it. */
async function firstDraw(page) {
    await page.goto("pages/host.html");
    await mountReport(page, { id: "late-report", rows: ROWS, view: { ...VIEW, chart: { type: "bar" } }, theme: "light", height: 480 });
    const chartEl = await chartOf(page, "late-report", "bar");
    expect((await drawnColours(chartEl)).palette[0]).not.toBe("#8a2be2");
    return chartEl;
}

/** The chart draws again in the late tokens, and as a report mounted with them from the start. */
async function expectRedrawn(page, chartEl) {
    await expect.poll(async () => (await drawnColours(chartEl)).palette[0]).toBe("#8a2be2");
    const late = await drawnColours(chartEl);
    expect(late.axisText).toBe("#6b1d1d");
    await mountReport(page, { id: "late-report", rows: ROWS, view: { ...VIEW, chart: { type: "bar" } }, theme: "light", height: 480 });
    expect(late).toEqual(await drawnColours(await chartOf(page, "late-report", "bar")));
}

test("a stylesheet that loads after the first draw: the chart draws again in its tokens", async ({ page }) => {
    let release;
    const held = new Promise((done) => (release = done));
    // the stylesheet's answer waits until the chart has drawn
    await page.route("**/late-tokens.css", async (route) => {
        await held;
        await route.fulfill({ contentType: "text/css", body: LATE });
    });
    const chartEl = await firstDraw(page);
    await page.evaluate(() => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "late-tokens.css";
        document.head.append(link);
    });
    release();
    await expectRedrawn(page, chartEl);
});

test("a <style> added after the first draw: the chart draws again in its tokens", async ({ page }) => {
    const chartEl = await firstDraw(page);
    await page.evaluate((css) => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
    }, LATE);
    await expectRedrawn(page, chartEl);
});

test("a <style> written into after the first draw, as a CSS-in-JS library appends its rules: the chart draws again", async ({ page }) => {
    const chartEl = await firstDraw(page);
    // a library's sheet, empty at first; the chart checks it and keeps its colours
    await page.evaluate(() => {
        const style = document.createElement("style");
        style.id = "library-sheet";
        style.textContent = "/* empty */";
        document.head.append(style);
    });
    await expect.poll(() => page.evaluate(() => document.getElementById("library-sheet").sheet !== null)).toBe(true);
    expect((await drawnColours(chartEl)).palette[0]).not.toBe("#8a2be2");
    // then the rules come as text into it
    await page.evaluate((css) => document.getElementById("library-sheet").append(document.createTextNode(css)), LATE);
    await expectRedrawn(page, chartEl);
});

test("an element holding a stylesheet removed after the first draw: the chart draws again without its tokens", async ({ page }) => {
    await page.goto("pages/host.html");
    await page.evaluate((css) => {
        const wrap = document.createElement("div");
        wrap.id = "theme-wrap";
        wrap.innerHTML = `<style>${css}</style>`;
        document.body.append(wrap);
    }, LATE);
    await mountReport(page, { id: "late-report", rows: ROWS, view: { ...VIEW, chart: { type: "bar" } }, theme: "light", height: 480 });
    const chartEl = await chartOf(page, "late-report", "bar");
    expect((await drawnColours(chartEl)).palette[0]).toBe("#8a2be2");
    await page.evaluate(() => document.getElementById("theme-wrap").remove());
    await expect.poll(async () => (await drawnColours(chartEl)).palette[0]).not.toBe("#8a2be2");
});

test("inside a shadow root: a <style> added there, then its text changed, draws the chart again each time", async ({ page }) => {
    await page.goto("pages/shadow.html");
    await page.getByRole("tab", { name: "Chart" }).click();
    const palette = async () => (await page.evaluate(() => window.__chartOption()))?.palette?.[0] ?? null;
    await expect.poll(palette).not.toBeNull();
    expect(await palette()).not.toBe("#8a2be2");
    await page.evaluate((css) => {
        const style = document.createElement("style");
        style.id = "late-tokens";
        style.textContent = css;
        document.getElementById("shadow-host").shadowRoot.append(style);
    }, LATE);
    await expect.poll(palette).toBe("#8a2be2");
    await page.evaluate(() => {
        document.getElementById("shadow-host").shadowRoot.getElementById("late-tokens").firstChild.data = ".pk-root { --pk-chart-1: #2e8b57; }";
    });
    await expect.poll(palette).toBe("#2e8b57");
});

test("a stylesheet removed after the first draw (it fires no load): the chart draws again without its tokens", async ({ page }) => {
    await page.goto("pages/host.html");
    await page.evaluate((css) => {
        const style = document.createElement("style");
        style.id = "host-theme";
        style.textContent = css;
        document.head.append(style);
    }, LATE);
    await mountReport(page, { id: "late-report", rows: ROWS, view: { ...VIEW, chart: { type: "bar" } }, theme: "light", height: 480 });
    const chartEl = await chartOf(page, "late-report", "bar");
    const before = await drawnColours(chartEl);
    expect(before.palette[0]).toBe("#8a2be2");
    await page.evaluate(() => document.getElementById("host-theme").remove());
    await expect.poll(async () => (await drawnColours(chartEl)).palette[0]).not.toBe("#8a2be2");
    const after = await drawnColours(chartEl);
    await mountReport(page, { id: "late-report", rows: ROWS, view: { ...VIEW, chart: { type: "bar" } }, theme: "light", height: 480 });
    expect(after).toEqual(await drawnColours(await chartOf(page, "late-report", "bar")));
});
