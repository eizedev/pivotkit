// Records the short videos of the documentation site (docs/assets/clips/) from the built playground
// with Playwright's Chromium: what a picture cannot show, such as a drag, a filter set step by step or a
// click on the chart. Build the playground first:
//
//   npm run build:playground && node scripts/docs-clips.js
//   CLIPS=drag-field node scripts/docs-clips.js   # only these clips
//
// Every clip is one entry in CLIPS: the playground's URL parameters, a view for the fragment and the
// steps, played with a visible pointer. Each clip writes `<name>.webm` and `<name>.png`, the poster:
// the last frame, the result of the steps.
//
// - The video is Playwright's screencast (page.screencast, Playwright 1.59 and later). It starts once
//   the report has its data, so a clip holds the steps only. Playwright writes VP9 in WebM; its docs
//   name no format, the file says it. Browsers that play WebM: https://caniuse.com/webm
// - The pointer is Playwright's action decoration (screencast.showActions, cursor "pointer"). Each
//   pointer action is shown for POINTER_MS, so a step's length is its number of moves times that.
// - The report fills the window: the playground's header and frame are hidden, so a clip is the
//   report only.
// - Clips are light only. The site switches pictures by theme with `#only-light`/`#only-dark` on
//   images; it has no such switch for a video.
// - The page that shows a clip uses the pattern in AGENTS.md ("Pages and screenshots").
import { chromium } from "@playwright/test";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { encodeViewLink, hideToasts, openPlayground, openZones, startPlayground } from "./docs-playground.js";

const out = fileURLToPath(new URL("../docs/assets/clips/", import.meta.url));
const SIZE = { width: 800, height: 600 };
/** Frames per second: the pointer and the drag stay smooth, the file stays small. */
const FPS = 12;
/** How long Playwright shows each pointer action, in milliseconds. */
const POINTER_MS = 60;
/**
 * The report alone: the playground's header and footer hidden, the report over the whole window. The
 * tips above the result are hidden too: they take the room the result needs in a small window.
 */
const REPORT_ONLY = ".pg-head, .pg-foot, .pk-tips { display: none !important; } .pk-root { position: fixed !important; inset: 0 !important; margin: 0 !important; border: 0 !important; border-radius: 0 !important; }";

/** The weather by month: the rows a date range filters. */
const MONTHS = encodeViewLink({
    derived: [{ name: "Date by month", field: "Date", by: "yearMonth" }],
    rows: ["Date by month"],
    values: [{ field: "Mean °C", agg: "average", format: "number:1" }]
});

/** Revenue per region as bars: a click on a bar opens its menu. */
const BARS = encodeViewLink({
    rows: ["Region"],
    values: [{ field: "Revenue", agg: "sum", format: "currency:EUR" }],
    sort: [{ field: "Region", by: "value", order: "desc" }],
    display: "chart",
    chart: { type: "bar" }
});

/** Where the pointer is: Playwright's mouse does not say, and a glide starts there. */
const pointer = { x: SIZE.width / 2, y: SIZE.height - 40 };

/**
 * Moves the pointer to a point in steps, so the clip shows the way and a drag follows it. A step is one
 * pointer action of POINTER_MS: by default one per 50 pixels, at least 3, so a short way is quick.
 */
async function glide(page, to, steps = Math.max(3, Math.round(Math.hypot(to.x - pointer.x, to.y - pointer.y) / 50))) {
    const from = { ...pointer };
    for (let i = 1; i <= steps; i++) {
        pointer.x = from.x + ((to.x - from.x) * i) / steps;
        pointer.y = from.y + ((to.y - from.y) * i) / steps;
        await page.mouse.move(pointer.x, pointer.y);
    }
}

/** The middle of an element, or a point `dx` from its left edge. */
async function middle(locator, dx) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    return { x: box.x + (dx ?? box.width / 2), y: box.y + box.height / 2 };
}

/** Glides to an element and clicks it, as a person would. */
async function clickOn(page, locator) {
    await glide(page, await middle(locator));
    await page.mouse.click(pointer.x, pointer.y);
}

/** Drags an element onto another with the mouse, slow enough to see where it goes. */
async function dragOnto(page, from, to) {
    await glide(page, await middle(from, 40));
    await page.mouse.down();
    await glide(page, await middle(to));
    await page.waitForTimeout(400);
    await page.mouse.up();
}

/** Picks an item of a rule from its searchable list: the list opens, the search finds it, Enter picks. */
async function pickItem(page, button, label) {
    await clickOn(page, button);
    await page.getByTestId("picker-search").fill(label);
    await page.waitForTimeout(400);
    await page.getByTestId("picker-search").press("Enter");
}

/**
 * The middle of a bar of the chart, found before the clip starts: the pointer goes along a line through
 * the bars until the tooltip shows, and the bar is where it shows. The pointer goes back afterwards.
 */
async function barMiddle(page) {
    const chart = page.getByTestId("pivot-chart");
    const tooltip = chart.locator(":scope > div:not(:first-child)");
    const box = await chart.boundingBox();
    const y = box.y + box.height * 0.75;
    const on = [];
    for (let x = box.x + box.width * 0.1; x < box.x + box.width * 0.6; x += 6) {
        await page.mouse.move(x, y);
        await page.waitForTimeout(30);
        if (await tooltip.isVisible()) on.push(x);
        else if (on.length) break;
    }
    if (!on.length) throw new Error("docs-clips: no bar found on the chart");
    await page.mouse.move(pointer.x, pointer.y);
    await tooltip.waitFor({ state: "hidden" });
    return { x: (on[0] + on.at(-1)) / 2, y };
}

/**
 * @type {{ name: string, query: string, hash?: string, chart?: boolean, before?: (page: import("@playwright/test").Page) => Promise<any>,
 *   play: (page: import("@playwright/test").Page, ready: any) => Promise<void> }[]}
 */
const CLIPS = [
    {
        // docs/use/fields.md: a field dragged from the list into Rows; the table groups by it
        name: "drag-field",
        query: "data=sales&empty",
        play: (page) => dragOnto(page, page.locator('.pk-field[data-field="Region"]'), page.locator('[data-zone="rows"]'))
    },
    {
        // docs/use/filters.md: the months kept to a range with a rule, "is between" Jun 2024 and Aug 2024
        name: "filter-dates",
        query: "data=weather&empty",
        hash: MONTHS,
        before: openZones,
        play: async (page) => {
            const menu = page.locator(".pk-chip-menu");
            await clickOn(page, page.getByTestId("chip-menu-Date by month"));
            await clickOn(page, menu.getByTestId("topic-filter"));
            const rules = menu.getByTestId("section-rules");
            if ((await rules.getAttribute("aria-expanded")) !== "true") await clickOn(page, rules);
            await clickOn(page, menu.getByTestId("rule-add-item"));
            // a native select's list is not part of the page's picture: the choice shows in the field
            await glide(page, await middle(menu.getByTestId("rule-item-op")));
            await menu.getByTestId("rule-item-op").selectOption("between");
            await page.waitForTimeout(400);
            await pickItem(page, menu.getByTestId("rule-item-value"), "Jun 2024");
            await pickItem(page, menu.getByTestId("rule-item-value2"), "Aug 2024");
            await page.waitForTimeout(500);
            await page.keyboard.press("Escape");
            await page.keyboard.press("Escape");
        }
    },
    {
        // docs/use/charts.md: a click on a bar opens its menu, Show the rows lists the rows behind it
        name: "chart-rows",
        query: "data=sales&empty",
        hash: BARS,
        chart: true,
        before: barMiddle,
        play: async (page, bar) => {
            await glide(page, bar);
            await page.mouse.click(bar.x, bar.y);
            await page.waitForTimeout(500);
            await clickOn(page, page.getByRole("menu").getByRole("menuitem", { name: "Show the rows" }));
            await page.getByTestId("drill-panel").waitFor();
        }
    }
];

const playground = startPlayground(4175);
try {
    await mkdir(out, { recursive: true });
    const browser = await chromium.launch();
    const only = process.env.CLIPS?.split(",");
    for (const clip of CLIPS.filter((c) => !only || only.includes(c.name))) {
        const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: "light" });
        await openPlayground(page, playground.base, { query: `${clip.query}&height=${SIZE.height}`, hash: clip.hash, theme: "light" });
        await page.addStyleTag({ content: REPORT_ONLY });
        await hideToasts(page);
        if (clip.chart) await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
        const ready = await clip.before?.(page);
        Object.assign(pointer, { x: SIZE.width / 2, y: SIZE.height - 40 });
        await page.mouse.move(pointer.x, pointer.y);
        // fonts and the first frame
        await page.waitForTimeout(400);
        const video = `${out}${clip.name}.webm`;
        await page.screencast.start({ path: video, size: SIZE, fps: FPS });
        await page.screencast.showActions({ cursor: "pointer", duration: POINTER_MS, style: { title: "display: none" } });
        await page.waitForTimeout(600);
        await clip.play(page, ready);
        // the result stays a moment, and is the poster
        await page.waitForTimeout(1500);
        await page.screencast.hideActions();
        await page.screenshot({ path: `${out}${clip.name}.png` });
        await page.screencast.stop();
        await page.close();
        console.log(`${clip.name}.webm ${Math.round((await stat(video)).size / 1024)} KB`);
    }
    await browser.close();
} finally {
    playground.stop();
}
