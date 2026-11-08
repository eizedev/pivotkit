// Takes the screenshots of the documentation site (docs/assets/screenshots/) from the built playground
// with Playwright's Chromium, so they show the current UI. Build the playground first:
//
//   npm run build:playground && node scripts/docs-screenshots.js
//   SHOTS=quick-rows,chart node scripts/docs-screenshots.js   # only these shots
//
// Every shot is one entry in SHOTS: the playground's URL parameters, a view for the fragment, the
// window size, whether to wait for the chart and what to open before the picture is taken. Each shot is taken in both themes,
// `<name>-light.png` and `<name>-dark.png`, which the pages show with `#only-light` and `#only-dark`.
// The generated data has a fixed seed and the real data is a committed snapshot, so the numbers are
// the same on every run.
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
const THEMES = ["light", "dark"];
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

/** A view that asks for more than the earthquakes data and the report can give: the warning above the result. */
const UNUSED = encodeViewLink({
    rows: ["Region"],
    values: [{ field: "Time", agg: "count", label: "Quakes", conditional: { type: "colorScale", colors: ["#d33"] } }, { field: "Magnitude", agg: "max", format: "magnitude" }],
    filters: [{ field: "Region", type: "top", count: 10, by: { field: "Time", agg: "count" } }],
    sort: [{ field: "Region", by: "value", order: "desc" }],
    chart: { legend: "left" }
});

/** The quick start's steps, clicked from the empty report: Region to Rows, Revenue to Values, Category to Columns. */
const QUICK_STEPS = [
    (page) => page.locator('.pk-field[data-field="Region"] .pk-field-name').click(),
    (page) => page.locator('.pk-field[data-field="Revenue"] .pk-field-name').click(),
    async (page) => {
        await page.getByTestId("field-menu-Category").click();
        await page.getByRole("menuitem", { name: "Add to Columns" }).click();
    }
];

/** Clicks the first `count` steps of the quick start; status notes the clicks leave are hidden. */
async function quick(page, count) {
    for (const step of QUICK_STEPS.slice(0, count)) await step(page);
    await page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });
}

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

/** @type {{ name: string, query: string, hash?: string, size: typeof WIDE, chart?: boolean, open?: (page: import("@playwright/test").Page) => Promise<void> }[]} */
const SHOTS = [
    // the quick start (docs/use/quick-start.md): the sales data from an empty report to a chart
    { name: "quick-empty", query: "data=sales&empty", size: WIDE },
    { name: "quick-rows", query: "data=sales&empty", size: WIDE, open: (page) => quick(page, 1) },
    { name: "quick-values", query: "data=sales&empty", size: WIDE, open: (page) => quick(page, 2) },
    { name: "quick-columns", query: "data=sales&empty", size: WIDE, open: (page) => quick(page, 3) },
    {
        name: "quick-filter",
        query: "data=sales&empty",
        size: WIDE,
        open: async (page) => {
            await quick(page, 3);
            await page.getByTestId("chip-menu-Region").click();
            await page.getByTestId("open-filter").click();
        }
    },
    {
        name: "quick-chart",
        query: "data=sales&empty",
        size: WIDE,
        open: async (page) => {
            await quick(page, 3);
            await page.getByTestId("show-chart").click();
            await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
        }
    },
    // the hero of the start page: real data (the weather of 14 cities)
    { name: "report", query: "data=weather", size: WIDE },
    {
        name: "value-menu",
        query: "data=sales",
        size: WIDE,
        open: (page) => page.getByTestId("chip-menu-Sum of Revenue").click()
    },
    {
        name: "filter",
        query: "data=sales",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Region").click();
            await page.getByTestId("open-filter").click();
        }
    },
    {
        name: "drill-down",
        query: "data=tickets",
        size: WIDE,
        open: async (page) => {
            await page.locator('[data-testid="pivot-table"] td.pk-clickable').nth(2).click();
            await page.getByTestId("drill-panel").waitFor();
        }
    },
    {
        // the drill-down enlarged, its Export menu open
        name: "drill-export",
        query: "data=tickets",
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
        query: "data=tickets",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("export").click();
            await page.getByTestId("export-copy-table").waitFor();
        }
    },
    { name: "chart", query: "data=sales&preset=1", size: WIDE, chart: true },
    {
        // the report as a host gives it on a phone: its own height, the page scrolled to it
        name: "phone",
        query: "data=tickets&height=820",
        size: PHONE,
        open: (page) => page.locator(".pk-root").evaluate((el) => {
            el.style.scrollMarginTop = "12px";
            el.scrollIntoView({ block: "start" });
        })
    },
    {
        name: "chart-display",
        query: "data=sales&preset=1",
        size: WIDE,
        chart: true,
        open: async (page) => {
            await toolbar(page, "chart-type");
            // folded at first: opened as a user would
            await page.getByTestId("section-chartDisplay").click();
            await page.getByTestId("legend-bottom").click();
        }
    },
    { name: "chart-groups", query: "data=countries", hash: GROUPED, size: WIDE, chart: true },
    {
        name: "share-menu",
        query: "data=sales",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            // folded at first: opened as a user would
            await page.getByTestId("section-share").click();
        }
    },
    {
        // Shared views (the presets and the views of the OpenAPI document) and My views with one saved
        name: "views-menu",
        query: "data=endoflife",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("saved-view-name").fill("Supported cycles of my products");
            await page.getByTestId("saved-view-name").press("Enter");
            await page.locator(".pk-toast").first().waitFor();
            // a save closes the menu: open it again, with the saved view marked as the one loaded
            await page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });
            await toolbar(page, "views");
            await page.getByTestId("saved-view-name").blur();
        }
    },
    {
        // a saved view loaded and changed: its name next to Views with the dot for unsaved changes
        name: "view-name",
        query: "data=tickets",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("saved-view-Median lead time by month").click();
            await page.getByTestId("show-chart").click();
            await page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });
        }
    },
    {
        // This view in the Views menu: Save for one of my views, changed, the Save as field and New
        name: "views-this-view",
        query: "data=tickets",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("saved-view-name").fill("Open work by team");
            await page.getByTestId("saved-view-name").press("Enter");
            await page.locator(".pk-toast").first().waitFor();
            await page.getByTestId("show-chart").click();
            await page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });
            await toolbar(page, "views");
        }
    },
    {
        // the field list collapsed to a rail: the zones and the result take its room
        name: "field-rail",
        query: "data=sales",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("collapse-fields").click();
            await page.getByTestId("expand-fields").blur();
        }
    },
    {
        name: "filter-state",
        query: "data=sales",
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
        query: "data=sales", hash: VALUE_FILTER,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Region").click();
            // the condition in a line of its own with Change and Remove, the menu scrolled to its Filters section
            await page.getByTestId("open-filter").evaluate((el) => el.closest(".pk-section").scrollIntoView({ block: "start" }));
        }
    },
    {
        // a field's menu with its Top N in one line: "Top 3 by Sum of Population · Change · Remove"
        name: "top-items",
        query: "data=countries&preset=0",
        size: WIDE,
        open: (page) => page.getByTestId("chip-menu-Country").click()
    },
    {
        // a value's menu on a phone: a sheet at the bottom, folded sections with their state
        name: "phone-value-menu",
        query: "data=sales",
        size: PHONE,
        open: async (page) => {
            await page.getByTestId("layout-summary").click();
            await page.getByTestId("chip-menu-Sum of Revenue").click();
        }
    },
    {
        // a donut with the numbers on its slices, the chart type menu open at its Labels choice
        name: "donut-labels",
        query: "data=sales",
        hash: encodeViewLink({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum", format: "compact" }], display: "chart", chart: { type: "donut", valueLabels: "value", labelPosition: "inside" } }),
        size: WIDE,
        open: async (page) => {
            await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
            await toolbar(page, "chart-type");
            await page.getByTestId("section-chartDisplay").click();
        }
    },
    {
        // Options: totals that change nothing say why, an "i" explains each, Help has its four switches
        name: "explanations",
        query: "data=tickets",
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
        query: "data=weather",
        size: WIDE,
        open: (page) => page.getByTestId("enlarge").click()
    },
    {
        // a view file made for other data: asked before it is loaded
        name: "load-check",
        query: "data=sales",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("section-share").click();
            await page.getByTestId("load-view").click();
            const file = toViewFile({ rows: ["City"], values: [{ field: "Sunshine h", agg: "average" }] }, { name: "Sunshine per city", source: { id: "weather", name: "Weather" } });
            await page.getByTestId("load-view-text").fill(JSON.stringify(file));
            await page.getByTestId("load-view-apply").click();
            await page.getByTestId("load-check").waitFor();
        }
    },
    {
        // a view with parts the report cannot use: the warning, open, each part in plain words
        name: "unused-parts",
        query: "data=earthquakes",
        hash: UNUSED,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("unused-item").first().locator("strong").waitFor();
            await page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });
        }
    },
    { name: "german", query: "data=sales&lang=de", size: WIDE },
    // a field's description (fieldDefaults) opened from its "i", and the tips above the table
    {
        name: "field-info",
        query: "data=countries&preset=0",
        size: WIDE,
        open: async (page) => {
            await page.locator('.pk-field[data-field="Population"] .pk-info').click();
            await page.locator(".pk-info-pop a").waitFor();
        }
    },
    { name: "tips", query: "data=countries&preset=0", size: WIDE },
    // "Learn with real data": one template of each real data set
    { name: "learn-weather", query: "data=weather&preset=0", size: WIDE },
    { name: "learn-countries", query: "data=countries&preset=0", size: WIDE },
    {
        name: "learn-earthquakes",
        query: "data=earthquakes&preset=2",
        size: WIDE,
        open: async (page) => {
            await page.locator('[data-testid="pivot-table"] tbody tr[data-r]').filter({ hasText: /^Russia/ }).locator("td").nth(1).click();
            await page.getByTestId("drill-panel").waitFor();
        }
    },
    { name: "learn-nobel", query: "data=nobel&preset=0", size: WIDE },
    {
        name: "learn-endoflife",
        query: "data=endoflife&preset=4",
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
    const only = process.env.SHOTS?.split(",");
    for (const shot of SHOTS.filter((s) => !only || only.includes(s.name))) {
        for (const theme of THEMES) {
            const page = await browser.newPage({ viewport: shot.size, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: theme });
            const url = `${base}?${shot.query}&theme=${theme}${shot.hash ? `#pivot-playground=${shot.hash}` : ""}`;
            // the server needs a moment on the first request
            for (let i = 0; ; i++) {
                try {
                    await page.goto(url);
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
            if (shot.chart) await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
            if (shot.open) await shot.open(page);
            // fonts, the chart's first frame, the popover's position
            await page.waitForTimeout(600);
            const name = `${shot.name}-${theme}.png`;
            await page.screenshot({ path: `${out}${name}` });
            await page.close();
            console.log(name);
        }
    }
    await browser.close();
} finally {
    server.kill();
}
