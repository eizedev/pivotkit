// Takes the screenshots of the documentation site (docs/assets/screenshots/) from the built playground
// with Playwright's Chromium, so they show the current UI. Build the playground first:
//
//   npm run build:playground && node scripts/docs-screenshots.js
//
// Every shot is one entry in SHOTS: the playground's URL parameters, the window size and what to open
// before the picture is taken. The generated data has a fixed seed and the real data is a committed
// snapshot, so the numbers are the same on every run.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const out = new URL("docs/assets/screenshots/", root).pathname;
const port = Number(process.env.PLAYGROUND_PORT ?? 4174);
const base = `http://127.0.0.1:${port}/`;

const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** @type {{ name: string, query: string, size: typeof WIDE, open?: (page: import("@playwright/test").Page) => Promise<void> }[]} */
const SHOTS = [
    // the hero of the start page: real data (the weather of 14 cities)
    { name: "report-light", query: "data=weather&theme=light", size: WIDE },
    { name: "report-dark", query: "data=weather&theme=dark", size: WIDE },
    {
        name: "value-menu",
        query: "data=sales&theme=light",
        size: WIDE,
        open: (page) => page.getByTestId("chip-menu-Sum of Revenue").click()
    },
    {
        name: "filter",
        query: "data=sales&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Region").click();
            await page.getByTestId("open-filter").click();
        }
    },
    {
        name: "drill-down",
        query: "data=tickets&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.locator('[data-testid="pivot-table"] td.pk-clickable').nth(2).click();
            await page.getByTestId("drill-panel").waitFor();
        }
    },
    { name: "chart", query: "data=sales&preset=1&theme=dark", size: WIDE },
    {
        // the report as a host gives it on a phone: its own height, the page scrolled to it
        name: "phone",
        query: "data=tickets&theme=light&height=820",
        size: PHONE,
        open: (page) => page.locator(".pk-root").evaluate((el) => {
            el.style.scrollMarginTop = "12px";
            el.scrollIntoView({ block: "start" });
        })
    },
    { name: "german", query: "data=sales&lang=de&theme=light", size: WIDE },
    // a field's description (fieldDefaults) opened from its "i", and the tips above the table
    {
        name: "field-info",
        query: "data=countries&preset=0&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.locator('.pk-field[data-field="Population"] .pk-info').click();
            await page.locator(".pk-info-pop a").waitFor();
        }
    },
    { name: "tips", query: "data=countries&preset=0&theme=light", size: WIDE },
    // "Learn with real data": one template of each real data set
    { name: "learn-weather", query: "data=weather&preset=0&theme=light", size: WIDE },
    { name: "learn-countries", query: "data=countries&preset=0&theme=light", size: WIDE },
    {
        name: "learn-earthquakes",
        query: "data=earthquakes&preset=2&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.locator('[data-testid="pivot-table"] tbody tr[data-r]').filter({ hasText: /^Russia/ }).locator("td").nth(1).click();
            await page.getByTestId("drill-panel").waitFor();
        }
    },
    { name: "learn-nobel", query: "data=nobel&preset=0&theme=light", size: WIDE }
];

const server = spawn(process.execPath, [new URL("examples/playground/serve.js", root).pathname, String(port)], { stdio: "ignore" });
try {
    await mkdir(out, { recursive: true });
    const browser = await chromium.launch();
    for (const shot of SHOTS) {
        const page = await browser.newPage({ viewport: shot.size, deviceScaleFactor: 1, reducedMotion: "reduce" });
        // the server needs a moment on the first request
        for (let i = 0; ; i++) {
            try {
                await page.goto(`${base}?${shot.query}`);
                break;
            } catch (error) {
                if (i > 20) throw error;
                await page.waitForTimeout(250);
            }
        }
        await page.locator(".pk-root").waitFor();
        // the playground's footer shows timings that differ on every run
        await page.addStyleTag({ content: ".pg-foot { visibility: hidden; }" });
        if (shot.query.includes("preset=1")) await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
        if (shot.open) await shot.open(page);
        // fonts, the chart's first frame, the popover's position
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${out}${shot.name}.png` });
        await page.close();
        console.log(`${shot.name}.png`);
    }
    await browser.close();
} finally {
    server.kill();
}
