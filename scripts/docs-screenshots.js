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
import { toViewFile } from "pivotkit-core";
import { encodeViewLink as encodeLink } from "pivotkit-core/link";

/** A view as the playground's links carry it: the link profile of a view file. */
const encodeViewLink = (view) => encodeLink(toViewFile(view, {}, { link: true }));

const root = new URL("../", import.meta.url);
const out = new URL("docs/assets/screenshots/", root).pathname;
const port = Number(process.env.PLAYGROUND_PORT ?? 4174);
const base = `http://127.0.0.1:${port}/`;

const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** The three largest countries per region as bars: the regions are the group labels under the axis. */
const GROUPED = encodeViewLink({
    rows: ["Region", "Country"],
    values: [{ field: "Population", agg: "sum", format: "compact" }],
    filters: [{ field: "Year", type: "include", items: [2024] }, { field: "Country", type: "top", count: 3, by: { field: "Population", agg: "sum" } }],
    sort: [{ field: "Region", by: "value", order: "desc" }, { field: "Country", by: "value", order: "desc" }],
    display: "chart",
    chart: { type: "bar", title: "The three largest countries of each region (2024)" }
});

/** Regions with more than 2 million revenue, by the second value of two: the chip says so, the menu has the form open. */
const VALUE_FILTER = encodeViewLink({
    rows: ["Region", "Product"],
    values: [{ field: "Units", agg: "sum" }, { field: "Revenue", agg: "sum", format: "currency:EUR" }],
    filters: [{ field: "Region", type: "value", op: ">", value: 2_000_000, by: { field: "Revenue", agg: "sum" } }],
    sort: [{ field: "Region", by: "value", order: "desc", value: { field: "Revenue", agg: "sum" } }]
});

/** Clicks a toolbar button, or its entry in "More" when the report is too narrow for it. */
async function toolbar(page, testId) {
    const own = page.getByTestId(testId);
    if (await own.count()) {
        await own.click();
        return;
    }
    await page.getByTestId("more").click();
    await page.getByTestId(`more-${testId}`).click();
}

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
    {
        // the drill-down enlarged, its Export menu open
        name: "drill-export",
        query: "data=tickets&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.locator('[data-testid="pivot-table"] td.pk-clickable').last().click();
            await page.getByTestId("drill-panel").waitFor();
            await page.getByTestId("drill-enlarge").click();
            await page.getByTestId("drill-export").click();
            await page.getByTestId("drill-copy").waitFor();
        }
    },
    {
        name: "export-menu",
        query: "data=tickets&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("export").click();
            await page.getByTestId("export-copy-table").waitFor();
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
    {
        name: "chart-display",
        query: "data=sales&preset=1&theme=light",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "chart-type");
            await page.getByTestId("legend-bottom").click();
        }
    },
    { name: "chart-groups", query: `data=countries&theme=light#pivot-playground=${GROUPED}`, size: WIDE },
    {
        name: "share-menu",
        query: "data=sales&theme=light",
        size: WIDE,
        open: (page) => toolbar(page, "views")
    },
    {
        // Shared views (the presets and the views of the OpenAPI document) and My views with one saved
        name: "views-menu",
        query: "data=endoflife&theme=light",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("saved-view-name").fill("Supported cycles of my products");
            await page.getByTestId("saved-view-name").press("Enter");
            await page.locator(".pk-toast").first().waitFor();
            await page.getByTestId("saved-view-name").blur();
        }
    },
    {
        // the field list collapsed to a rail: the zones and the result take its room
        name: "field-rail",
        query: "data=sales&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("collapse-fields").click();
            await page.getByTestId("expand-fields").blur();
        }
    },
    {
        name: "filter-state",
        query: "data=sales&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Region").click();
            await page.getByTestId("open-filter").click();
            const west = page.locator(".pk-filter-popover .pk-value", { hasText: "West" });
            await west.hover();
            await west.locator(".pk-only").click();
            await page.getByTestId("filter-apply").click();
            await page.getByTestId("chip-menu-Region").click();
        }
    },
    {
        name: "value-filter",
        query: `data=sales&theme=light#pivot-playground=${VALUE_FILTER}`,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Region").click();
            // the menu scrolled to its Filters section
            await page.getByTestId("open-filter").evaluate((el) => el.closest(".pk-section").scrollIntoView({ block: "start" }));
        }
    },
    {
        // a donut with the numbers on its slices, the chart type menu open at its Labels choice
        name: "donut-labels",
        query: `data=sales&theme=light#pivot-playground=${encodeViewLink({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum", format: "compact" }], display: "chart", chart: { type: "donut", valueLabels: "value", labelPosition: "inside" } })}`,
        size: WIDE,
        open: async (page) => {
            await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
            await toolbar(page, "chart-type");
        }
    },
    {
        // Options: totals that change nothing say why, an "i" explains each, Help has its four switches
        name: "explanations",
        query: "data=tickets&theme=light",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "options");
            await page.getByTestId("setting-info-rowSubtotals").hover();
            await page.locator(".pk-info-pop").waitFor();
        }
    },
    {
        // Enlarge: the result fills the report, the fields in one line above it
        name: "enlarged",
        query: "data=weather&theme=light",
        size: WIDE,
        open: (page) => page.getByTestId("enlarge").click()
    },
    {
        // a view file made for other data: asked before it is loaded
        name: "load-check",
        query: "data=sales&theme=light",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("load-view").click();
            const file = toViewFile({ rows: ["City"], values: [{ field: "Sunshine h", agg: "average" }] }, { name: "Sunshine per city", source: { id: "weather", name: "Weather" } });
            await page.getByTestId("load-view-text").fill(JSON.stringify(file));
            await page.getByTestId("load-view-apply").click();
            await page.getByTestId("load-check").waitFor();
        }
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
    { name: "learn-nobel", query: "data=nobel&preset=0&theme=light", size: WIDE },
    {
        name: "learn-endoflife",
        query: "data=endoflife&preset=4&theme=light",
        size: WIDE,
        open: async (page) => {
            await page.locator('[data-testid="pivot-table"] tbody tr[data-r]').filter({ hasText: "Nexus Repository" }).locator("td").last().click();
            await page.getByTestId("drill-panel").waitFor();
        }
    }
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
        // a real data set loads first: the skeleton goes when the report has its data
        await page.getByTestId("skeleton").waitFor({ state: "detached" });
        // the playground's footer shows timings that differ on every run
        await page.addStyleTag({ content: ".pg-foot { visibility: hidden; }" });
        if (shot.query.includes("preset=1") || shot.query.includes(GROUPED)) await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
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
