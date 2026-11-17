// Which toolbar buttons are in the toolbar and which in More, in English and German, at the desktop
// widths of issue #88 with the field list open and folded, without and with the Data button
// (allowImport, on in the playground unless ?import=off): a button moves into More only when the
// room left in the toolbar cannot hold it (measured with the texts shown), More is always there, and
// the toolbar stays on one line. Table, Chart and their settings are on the result, not here (#580).
import { expect, test } from "./fixtures.js";

const WIDTHS = [1000, 1280, 1440, 1920];
/** The buttons that can move, by the test id of their button and of their entry in More. */
const BUTTONS = { "start-over": "more-reset", views: "more-views" };
/** The same with the Data button. */
const WITH_DATA = { ...BUTTONS, data: "more-data" };

/** Waits until the report has its data and its toolbar has settled (it measures after the fonts). */
async function settled(page) {
    await page.locator('[data-testid="pivot-table"], [data-testid="pivot-chart"], [data-testid="empty-state"]').first().waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))));
}

/**
 * The width each movable button takes in the toolbar and the gap after it: read with every button in
 * the toolbar (a window 2560 px wide).
 */
async function buttonSizes(page, lang, query = "") {
    await page.setViewportSize({ width: 2560, height: 900 });
    await page.goto(`?data=sales&lang=${lang}${query}`);
    await settled(page);
    return page.locator(".pk-toolbar").evaluate((bar) => {
        const width = (id) => bar.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().width;
        return {
            gap: parseFloat(getComputedStyle(bar).columnGap),
            widths: Object.fromEntries(["start-over", "views", "data"].filter((id) => bar.querySelector(`[data-testid="${id}"]`)).map((id) => [id, width(id)]))
        };
    });
}

/** What the toolbar shows: the movable buttons in it, those in More, the free room, More's width. */
async function toolbarState(page, MOVABLE = BUTTONS) {
    const state = await page.locator(".pk-toolbar").evaluate((bar, movable) => {
        const shown = Object.keys(movable).filter((id) => bar.querySelector(`[data-testid="${id}"]`));
        // the middle of every part of the toolbar: one line when they all sit at the same height
        const middles = [...bar.children].filter((e) => e.getClientRects().length && !e.classList.contains("pk-grow")).map((e) => {
            const r = e.getBoundingClientRect();
            return r.top + r.height / 2;
        });
        return {
            shown,
            free: bar.querySelector(".pk-grow").getBoundingClientRect().width,
            more: bar.querySelector('[data-testid="more"]')?.getBoundingClientRect().width ?? 0,
            oneLine: Math.max(...middles) - Math.min(...middles) < 4 && bar.scrollWidth <= bar.clientWidth + 1
        };
    }, MOVABLE);
    // More is always there, Help its first entry
    expect(state.more).toBeGreaterThan(0);
    await page.getByTestId("more").click();
    const inMore = await page.locator(".pk-popover [data-testid^='more-']").evaluateAll((els) => els.map((e) => e.dataset.testid));
    await page.keyboard.press("Escape");
    expect(inMore[0]).toBe("more-help");
    return { ...state, inMore };
}

for (const [lang, query, MOVABLE] of [["en", "&import=off", BUTTONS], ["de", "&import=off", BUTTONS], ["en", "", WITH_DATA], ["de", "", WITH_DATA]]) {
    test(`${lang}${query ? ", with Data" : ""}: a button moves into More only when the room left cannot hold it`, async ({ page }) => {
        test.slow();
        const sizes = await buttonSizes(page, lang, query);
        const seen = {};
        for (const width of WIDTHS) {
            for (const fields of ["open", "folded"]) {
                await page.setViewportSize({ width, height: 900 });
                await page.goto(`?data=sales&lang=${lang}${query}`);
                await settled(page);
                // the field list keeps its state in the browser: set it either way
                const toggle = page.getByTestId(fields === "folded" ? "collapse-fields" : "expand-fields");
                if (await toggle.count()) {
                    await toggle.click();
                    await settled(page);
                }
                const at = `${width} px, field list ${fields}`;
                const s = await toolbarState(page, MOVABLE);
                seen[at] = s.shown;
                const hidden = Object.keys(MOVABLE).filter((id) => !s.shown.includes(id));
                // one line, unless even with every button in More it does not fit (then it wraps)
                expect(s.oneLine || s.shown.length === 0, `${at}: one line`).toBe(true);
                // every button is either in the toolbar or in More
                for (const id of hidden) expect(s.inMore, `${at}: ${id} in More`).toContain(MOVABLE[id]);
                // the room left: the free room (More stays either way)
                const room = s.free;
                for (const id of hidden) {
                    const need = sizes.widths[id] + sizes.gap;
                    // the toolbar keeps one px per part for rounding (text widths are fractional): at
                    // most one per part of a toolbar of up to 12 parts
                    expect(room, `${at}: ${id} (${Math.round(need)} px) would fit in ${Math.round(room)} px`).toBeLessThan(need + 12);
                }
            }
        }
        // the cases of issue #88 and #580: from 1280 px on, every button stays, in both languages,
        // with the field list open or folded
        for (const width of [1280, 1440, 1920]) {
            for (const fields of ["open", "folded"]) expect(seen[`${width} px, field list ${fields}`], `${width} px, ${fields}`).toEqual(Object.keys(MOVABLE));
        }
        // Views is the last to go: wherever any button besides it shows, Views does too; Data goes
        // before Start over (OVERFLOW_ORDER)
        for (const [at, shown] of Object.entries(seen)) {
            if (shown.length) expect(shown, at).toContain("views");
            if (MOVABLE === WITH_DATA && shown.includes("data")) expect(shown, at).toContain("start-over");
        }
    });
}

test("showing the chart and picking another chart type never moves a toolbar button", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto("?data=sales&lang=de");
    await settled(page);
    const before = (await toolbarState(page, WITH_DATA)).shown;
    await page.getByTestId("show-chart").click();
    await page.getByTestId("view-settings").click();
    await page.getByTestId("chart-horizontal").click();
    await expect(page.getByTestId("chart-summary")).toContainText(/^Liegende Balken/);
    await settled(page);
    expect((await toolbarState(page, WITH_DATA)).shown).toEqual(before);
});
