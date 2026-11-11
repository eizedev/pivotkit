// Which toolbar buttons are in the toolbar and which in More, in English and German, at the desktop
// widths of issue #88 with the field list open and folded: a button moves into More only when the
// room left in the toolbar cannot hold it (measured with the texts shown, and the chart type's room
// for its longest type, so picking a type never moves a button), and the toolbar stays on one line.
import { expect, test } from "./fixtures.js";

const WIDTHS = [1000, 1280, 1440, 1920];
/** The buttons that can move, by the test id of their button and of their entry in More. */
const MOVABLE = { "start-over": "more-reset", layout: "more-layout", options: "more-options", "chart-type": "more-chart-type", views: "more-views" };

/** Waits until the report has its data and its toolbar has settled (it measures after the fonts). */
async function settled(page) {
    await page.locator('[data-testid="pivot-table"], [data-testid="pivot-chart"], [data-testid="empty-state"]').first().waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))));
}

/**
 * The width each movable button takes in the toolbar, the gap after it, and how much wider the chart
 * type's button is with its longest type than with the one shown: read with every button in the
 * toolbar (a window 2560 px wide).
 */
async function buttonSizes(page, lang) {
    await page.setViewportSize({ width: 2560, height: 900 });
    await page.goto(`?data=sales&lang=${lang}`);
    await settled(page);
    await page.getByTestId("chart-type").click();
    const names = await page.locator(".pk-chart-menu [data-testid^='chart-'] .pk-option-text").evaluateAll((els) => els.map((e) => e.firstChild.textContent));
    await page.keyboard.press("Escape");
    return page.locator(".pk-toolbar").evaluate((bar, types) => {
        const width = (id) => bar.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().width;
        const shown = bar.querySelector('[data-testid="chart-type"] .pk-btn-text');
        const ctx = document.createElement("canvas").getContext("2d");
        const s = getComputedStyle(shown);
        ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
        const longest = Math.max(...types.map((t) => ctx.measureText(t).width));
        return {
            gap: parseFloat(getComputedStyle(bar).columnGap),
            chartTypeReserve: longest - shown.getBoundingClientRect().width,
            widths: Object.fromEntries(["start-over", "layout", "options", "chart-type", "views"].map((id) => [id, width(id)]))
        };
    }, names);
}

/** What the toolbar shows: the movable buttons in it, those in More, the free room, More's width. */
async function toolbarState(page) {
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
            oneLine: Math.max(...middles) - Math.min(...middles) < 4 && bar.scrollWidth <= bar.clientWidth + 1,
            chartTypeShown: Boolean(bar.querySelector('[data-testid="chart-type"]'))
        };
    }, MOVABLE);
    let inMore = [];
    if (state.more) {
        await page.getByTestId("more").click();
        inMore = await page.locator(".pk-popover [data-testid^='more-']").evaluateAll((els) => els.map((e) => e.dataset.testid));
        await page.keyboard.press("Escape");
    }
    return { ...state, inMore };
}

for (const lang of ["en", "de"]) {
    test(`${lang}: a button moves into More only when the room left cannot hold it`, async ({ page }) => {
        test.slow();
        const sizes = await buttonSizes(page, lang);
        const seen = {};
        for (const width of WIDTHS) {
            for (const fields of ["open", "folded"]) {
                await page.setViewportSize({ width, height: 900 });
                await page.goto(`?data=sales&lang=${lang}`);
                await settled(page);
                // the field list keeps its state in the browser: set it either way
                const toggle = page.getByTestId(fields === "folded" ? "collapse-fields" : "expand-fields");
                if (await toggle.count()) {
                    await toggle.click();
                    await settled(page);
                }
                const at = `${width} px, field list ${fields}`;
                const s = await toolbarState(page);
                seen[at] = s.shown;
                const hidden = Object.keys(MOVABLE).filter((id) => !s.shown.includes(id));
                // one line, unless even with every button in More it does not fit (then it wraps)
                expect(s.oneLine || s.shown.length === 0, `${at}: one line`).toBe(true);
                // every button is either in the toolbar or in More
                for (const id of hidden) expect(s.inMore, `${at}: ${id} in More`).toContain(MOVABLE[id]);
                // the room left: the free room less what the chart type keeps for its longest type;
                // with one button in More, More itself would go and leave its room too
                const room = s.free - (s.chartTypeShown ? sizes.chartTypeReserve : 0) + (hidden.length === 1 ? s.more + sizes.gap : 0);
                for (const id of hidden) {
                    const need = sizes.widths[id] + sizes.gap + (id === "chart-type" ? sizes.chartTypeReserve : 0);
                    // the toolbar keeps one px per part for rounding (text widths are fractional): at
                    // most one per part of a toolbar of up to 12 parts
                    expect(room, `${at}: ${id} (${Math.round(need)} px) would fit in ${Math.round(room)} px`).toBeLessThan(need + 12);
                }
            }
        }
        // the cases of issue #88: a wide window keeps every button; with the field list open at
        // 1440 px, Layout and Options stay in English (they went into More next to a wide gap)
        expect(seen["1920 px, field list open"]).toEqual(Object.keys(MOVABLE));
        expect(seen["1920 px, field list folded"]).toEqual(Object.keys(MOVABLE));
        if (lang === "en") {
            // Start over (where New is) goes late: it stays where Layout and Options already went
            expect(seen["1440 px, field list open"]).toEqual(expect.arrayContaining(["start-over", "views"]));
            expect(seen["1280 px, field list open"]).toEqual(expect.arrayContaining(["start-over", "views"]));
            expect(seen["1440 px, field list folded"]).toEqual(Object.keys(MOVABLE));
        }
        // Views is the last to go: wherever any button besides it shows, Views does too
        for (const [at, shown] of Object.entries(seen)) {
            if (shown.length) expect(shown, at).toContain("views");
        }
    });
}

test("picking another chart type never moves a button", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&preset=1");
    await settled(page);
    const before = (await toolbarState(page)).shown;
    await page.getByTestId("chart-type").click();
    await page.getByTestId("chart-horizontal").click();
    await expect(page.getByTestId("chart-type")).toContainText("Horizontal bars");
    await settled(page);
    expect((await toolbarState(page)).shown).toEqual(before);
});
