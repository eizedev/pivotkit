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
/** A window of 1000 px with the field list open: every toolbar button that can move is in More. */
const MEDIUM = { width: 1000, height: 760 };

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

/**
 * The weather by month (the data end on 2025-12-31, before today): the Filter level's quick choices
 * with the data's share of each, the ones not offered, and the reference date; by month of the year
 * (the years combined): Years combined, and a rule on the total that nothing meets, explained.
 */
const MONTHLY = { derived: [{ name: "Date by month", field: "Date", by: "yearMonth" }], rows: ["Date by month"], values: [{ field: "Mean °C", agg: "average" }] };
const DATES = encodeViewLink({ ...MONTHLY, filters: [{ field: "Date by month", type: "relative", unit: "year", count: 2 }] });
const CYCLIC = { derived: [{ name: "Date by month of year", field: "Date", by: "month" }], rows: ["Date by month of year"], cols: ["City"], values: [{ field: "Mean °C", agg: "average" }] };
const YEARS = encodeViewLink({ ...CYCLIC, filters: [{ field: "Date by month of year", type: "compare", op: "between", value: "2024-01-01", value2: "2025-12-31" }] });
const RULES = encodeViewLink({ ...CYCLIC, filters: [{ field: "Date by month of year", type: "value", op: ">", value: 25, by: { field: "Mean °C", agg: "average" } }] });
/** End-of-life dates by month, the next 2 years: the quick choices with More choices open (Next is one of them). */
const EOL_MONTHLY = { derived: [{ name: "EOL date by month", field: "EOL date", by: "yearMonth" }], rows: ["EOL date by month"], values: [{ agg: "count" }] };
const MORE = encodeViewLink({ version: 2, ...EOL_MONTHLY, filters: [{ field: "EOL date by month", type: "relative", direction: "next", unit: "year", count: 2, blanks: "exclude" }] });
/** The Nobel laureates by country: a rule on the name that keeps the laureates without a country. */
const BLANKS = encodeViewLink({ version: 2, rows: ["Country"], values: [{ agg: "count" }], filters: [{ field: "Country", type: "text", op: "beginsWith", value: "united", not: true, blanks: "include" }] });
/** A date in Filters: the whole report counts the release cycles of the last 12 months. */
const ZONE = encodeViewLink({ rows: ["Category"], values: [{ field: "Cycle", agg: "count", label: "Release cycles" }], filters: [{ field: "Released", type: "relative", unit: "month", count: 12 }] });

/** The weather's years side by side: the date grouped by year on rows and by quarter of the year on columns. */
const DATE_YEARS = encodeViewLink({
    rows: ["Date by year"],
    cols: ["Date by quarter of year"],
    derived: [{ name: "Date by year", field: "Date", by: "year" }, { name: "Date by quarter of year", field: "Date", by: "quarter" }],
    values: [{ field: "Mean °C", agg: "average", format: "number:1" }]
});

/** A view that asks for more than the earthquakes data and the report can give: the warning above the result. */
const UNUSED = encodeViewLink({
    rows: ["Region"],
    values: [{ field: "Time", agg: "count", label: "Quakes", conditional: { type: "colorScale", colors: ["#d33"] } }, { field: "Magnitude", agg: "max", format: "magnitude" }],
    filters: [{ field: "Region", type: "top", count: 10, by: { field: "Time", agg: "count" } }],
    sort: [{ field: "Region", by: "value", order: "desc" }],
    chart: { legend: "left" }
});

/** Column subtotals switched on with two fields in Columns: the line before each, and the tip that explains them. */
const COLUMN_SUBTOTALS = encodeViewLink({
    rows: ["Team"],
    cols: ["Priority", "Channel"],
    values: [{ field: "Ticket", agg: "count" }],
    filters: [{ field: "Priority", type: "in", items: ["P1 Critical", "P2 High"] }],
    totals: { colSubtotals: true }
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

/**
 * A CSV export as a ticket tool on a German Windows writes it (made up here, with a fixed pattern):
 * semicolons, German numbers and dates, a title line above the header, an empty line, postcodes.
 */
const TICKETS_CSV = (() => {
    const teams = ["Network", "Server", "Client", "Service desk"];
    const states = ["Open", "In progress", "Closed"];
    const lines = ["Ticket export, all teams", "Ticket;Team;Opened;State;Hours;Site postcode"];
    for (let i = 0; i < 240; i++) {
        lines.push(`${27_000 + i};${teams[i % 4]};${String((i % 28) + 1).padStart(2, "0")}.${String((i % 12) + 1).padStart(2, "0")}.2026;${states[(i * 7 + Math.floor(i / 5)) % 3]};${(i * 37) % 40},${(i * 3) % 10};0${1000 + ((i * 131) % 8000)}`);
        if (i === 120) lines.push("");
    }
    return `${lines.join("\n")}\n`;
})();

/** Drags the ticket CSV over the report (`drop`: lets go, the preview opens). */
async function dragTickets(page, drop) {
    const dt = await page.evaluateHandle((text) => {
        // eslint-disable-next-line no-undef -- runs in the page
        const t = new DataTransfer();
        t.items.add(new File([text], "tickets-2026.csv", { type: "text/csv" }));
        return t;
    }, TICKETS_CSV);
    const target = page.locator(".pk-result");
    await target.dispatchEvent("dragenter", { dataTransfer: dt });
    await target.dispatchEvent("dragover", { dataTransfer: dt });
    await page.getByTestId("drop-overlay").waitFor();
    if (drop) {
        await target.dispatchEvent("drop", { dataTransfer: dt });
        await page.getByTestId("import-apply").waitFor();
    }
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
            await page.getByTestId("topic-filter").click();
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
    // a value's menu: its first level, one row per topic with what is set
    {
        name: "value-menu",
        query: "data=sales",
        size: WIDE,
        open: (page) => page.getByTestId("chip-menu-Sum of Revenue").click()
    },
    // a field's menu: its first level, sort side by side, then a row per topic
    {
        name: "field-menu",
        query: "data=sales",
        size: WIDE,
        open: (page) => page.getByTestId("chip-menu-Region").click()
    },
    // the Filter level of a field's menu: the values with their counts, the conditions
    {
        name: "filter",
        query: "data=sales",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Region").click();
            await page.getByTestId("topic-filter").click();
        }
    },
    // the Group level of a date: one column, the example on the right, under its two headings
    {
        name: "group-level",
        query: "data=sales&empty",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("field-menu-Month").click();
            await page.getByRole("menuitem", { name: "Add to Rows" }).click();
            await page.locator('.pk-field[data-field="Revenue"] .pk-field-name').click();
            await page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });
            await page.locator('[data-zone="rows"] .pk-chip-label').click();
            await page.getByTestId("topic-group").click();
        }
    },
    // years as rows, the quarters of the year as columns: one year compared with another (docs/use/values.md)
    { name: "date-years", query: "data=weather&empty", hash: DATE_YEARS, size: WIDE },
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
        // the report as a host gives it on a phone: its own height, the page scrolled to it; below the
        // narrow layout's 820 px (COMPACT_HEIGHT_NARROW), so its zones start folded into one line
        name: "phone",
        query: "data=tickets&height=800",
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
            await page.getByTestId("legend-bottom").click();
        }
    },
    { name: "chart-groups", query: "data=countries", hash: GROUPED, size: WIDE, chart: true },
    {
        // Start over open at the start view: Reset greyed out with its reason, New with what it does;
        // a window of 1920 px, where Start over is in the toolbar with the field list open
        name: "start-over",
        query: "data=sales",
        size: { width: 1920, height: 900 },
        open: (page) => page.getByTestId("start-over").click()
    },
    {
        // More in a window where every button that can move is in it: its groups with a rule between
        name: "more-menu",
        query: "data=sales",
        size: MEDIUM,
        open: (page) => page.getByTestId("more").click()
    },
    {
        // Shared views (the presets and the views of the OpenAPI document) and My views with one saved
        name: "views-menu",
        query: "data=endoflife",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("save-as").click();
            await page.getByTestId("saved-view-name").fill("Supported cycles of my products");
            await page.getByTestId("saved-view-name").press("Enter");
            await page.locator(".pk-toast").first().waitFor();
            // a save closes the menu: open it again, with the saved view marked as the one loaded
            await page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });
            await toolbar(page, "views");
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
        // This view in the Views menu: Save for one of my views, changed, and Save as…
        name: "views-this-view",
        query: "data=tickets",
        size: WIDE,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("save-as").click();
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
            // Only West, then back: the Filter row says what the filter keeps, with its dot
            await page.getByTestId("chip-menu-Region").click();
            await page.getByTestId("topic-filter").click();
            const west = page.locator(".pk-chip-menu .pk-value", { hasText: "West" });
            await west.hover();
            await west.locator(".pk-only").click();
            await page.getByTestId("level-back").click();
        }
    },
    {
        name: "value-filter",
        query: "data=sales", hash: VALUE_FILTER,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Region").click();
            // the Filter level scrolled to its rules: the rule on the total, written as a sentence
            await page.getByTestId("topic-filter").click();
            await page.getByTestId("rules").scrollIntoViewIfNeeded();
        }
    },
    // a date's Filter level on data that end before today: the summary, the quick choices with the
    // data's share (Last 2 years checked), This year not offered, Counted back from
    {
        name: "filter-dates",
        query: "data=weather&empty",
        hash: DATES,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Date by month").click();
            await page.getByTestId("topic-filter").click();
        }
    },
    // a date's More choices, open since the choice set is one of them: Next and Before the last with
    // their counts and units, Rolling, and Counted back from (the data reach past today)
    {
        name: "filter-more",
        query: "data=endoflife&empty",
        hash: MORE,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-EOL date by month").click();
            await page.getByTestId("topic-filter").click();
            await page.getByTestId("quick-more-body").scrollIntoViewIfNeeded();
        }
    },
    // a rule on the name with the blank items kept: "does not begin with", the checkbox with its rows
    {
        name: "filter-blanks",
        query: "data=nobel&empty",
        hash: BLANKS,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Country").click();
            await page.getByTestId("topic-filter").click();
            await page.getByTestId("rules-blanks").scrollIntoViewIfNeeded();
        }
    },
    // a grouping that combines the years: Years combined with 2023 off, the summary saying so
    {
        name: "filter-cyclic",
        query: "data=weather&empty",
        hash: YEARS,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Date by month of year").click();
            await page.getByTestId("topic-filter").click();
        }
    },
    // a rule on the total that nothing meets: the red summary, the rule's line with the totals' range, its "i" open
    {
        name: "filter-rules",
        query: "data=weather&empty",
        hash: RULES,
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Date by month of year").click();
            await page.getByTestId("topic-filter").click();
            await page.getByTestId("rule-info").click();
            await page.getByTestId("rules").scrollIntoViewIfNeeded();
        }
    },
    // a field in Filters: its menu with the Filter row and Move to
    {
        name: "filter-zone",
        query: "data=endoflife&empty",
        hash: ZONE,
        size: WIDE,
        open: (page) => page.getByTestId("chip-menu-Released").click()
    },
    {
        // the Top items level of a field's menu: the template's Top 3, the quick choices and Top N…, the ties
        name: "top-items",
        query: "data=countries&preset=0",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("chip-menu-Country").click();
            await page.getByTestId("topic-top").click();
        }
    },
    {
        // a value's menu on a phone: a sheet at the bottom, its first level with what each topic holds
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
        }
    },
    {
        // Options: totals that change nothing say why, an "i" explains each, Help with its switches
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
    // loading data (allowImport, the playground's ?import): the Data menu, a file dragged over the
    // report, its preview, the report on it, the empty report's place to drop, the preview on a phone
    { name: "data-menu", query: "data=sales&import", size: WIDE, open: (page) => toolbar(page, "data") },
    { name: "import-drop", query: "data=sales&import", size: WIDE, open: (page) => dragTickets(page, false) },
    { name: "import-preview", query: "data=sales&import", size: WIDE, open: (page) => dragTickets(page, true) },
    {
        name: "import-loaded",
        query: "data=sales&import",
        size: WIDE,
        open: async (page) => {
            await dragTickets(page, true);
            await page.getByTestId("import-apply").click();
            await page.getByTestId("source-line").waitFor();
            for (const [field, zone] of [["Team", "Add to Rows"], ["State", "Add to Columns"], ["Hours", "Add to Values"]]) {
                await page.getByTestId(`field-menu-${field}`).click();
                await page.getByRole("menuitem", { name: zone }).click();
            }
            await page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });
        }
    },
    { name: "import-empty", query: "data=sales&empty&import", size: WIDE },
    {
        name: "import-phone",
        query: "data=sales&import",
        size: PHONE,
        open: async (page) => {
            await dragTickets(page, true);
        }
    },
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
    {
        name: "column-subtotals",
        query: "data=tickets&empty",
        hash: COLUMN_SUBTOTALS,
        size: WIDE,
        // the note that the view came from the link would cover the last column
        open: (page) => page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" })
    },
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
