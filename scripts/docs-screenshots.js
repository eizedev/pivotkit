// Takes the screenshots of the documentation site (docs/assets/screenshots/) from the built playground
// with Playwright's Chromium, so they show the current UI. Build the playground first:
//
//   npm run build:playground && node scripts/docs-screenshots.js
//   SHOTS=quick-rows,chart node scripts/docs-screenshots.js   # only these shots
//
// The print templates' shots (REPORT_SHOTS) are HTML reports pivotkit-report renders, opened as pages.
// Every shot is one entry in SHOTS: the playground's URL parameters, a view for the fragment, the
// window size, whether to wait for the chart and what to open before the picture is taken. Each shot is taken in both themes,
// `<name>-light.png` and `<name>-dark.png`, which the pages show with `#only-light` and `#only-dark`.
// The generated data has a fixed seed, the real data is a committed snapshot and the browser's clock
// starts at noon of the snapshot's day (tests/snapshot-day.js), so the numbers are the same on every run,
// also for filters relative to today. The clock runs on from there: a clock that stands still stops
// ECharts' animations midway, and a chart can show its labels without its slices. A shot opened from
// a link hides the toast the link gives.
//
// One picture is not taken here: xlsx-result-light.png and xlsx-result-dark.png (one image twice,
// since a workbook has no dark theme). Take it again by hand when the export's look changes:
//   1. pivotkit render weather.pivotkit.json --data weather.csv -o weather.xlsx
//   2. Open it in Microsoft Excel for Mac at 100 % on a Retina screen. Set Excel's region to one that
//      writes a decimal point (en_US): Excel formats numbers by its region (AppleLocale).
//   3. Capture Excel's window only (screencapture -o -l <window id>) and crop it to cells A1:N16.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { toViewFile } from "pivotkit-core";
import { encodeViewLink, hideToasts, openPlayground, openZones, startPlayground } from "./docs-playground.js";
import { SNAPSHOT_DAY } from "../tests/snapshot-day.js";

const out = fileURLToPath(new URL("../docs/assets/screenshots/", import.meta.url));

const WIDE = { width: 1440, height: 900 };
/** A wide window for a menu longer than WIDE's height. */
const TALL = { width: 1440, height: 1080 };
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

/** Monthly revenue as a line with its reference lines: the average, the trend and a target. */
const LINES = encodeViewLink({
    rows: ["Month (Year and month)"],
    derived: [{ name: "Month (Year and month)", field: "Month", by: "yearMonth" }],
    values: [{ field: "Revenue", agg: "sum", format: "currency:EUR" }],
    display: "chart",
    chart: { type: "line", title: "Monthly revenue", referenceLines: { average: true, trend: true, target: 500000 } }
});

/** Revenue per region, stacked by category: the tooltip of one segment names it with the stack's total. */
const STACKED = encodeViewLink({
    rows: ["Region"],
    cols: ["Category"],
    values: [{ field: "Revenue", agg: "sum", format: "currency:EUR" }],
    sort: [{ field: "Region", by: "value", order: "desc" }],
    display: "chart",
    chart: { type: "bar", stacked: true }
});

/** The 40 largest countries by population on a phone: the axis cannot name them all, a zoom slider shows a part. */
const ZOOMED = encodeViewLink({
    rows: ["Country"],
    values: [{ field: "Population", agg: "sum", format: "compact" }],
    filters: [{ field: "Year", type: "include", items: [2024] }, { field: "Country", type: "top", count: 40, by: { field: "Population", agg: "sum" } }],
    sort: [{ field: "Country", by: "value", order: "desc" }],
    display: "chart",
    chart: { type: "bar" }
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
const POINTS = encodeViewLink({
    derived: [{ name: "Date by month of year", field: "Date", by: "month" }, { name: "Date by year", field: "Date", by: "year" }],
    rows: ["Date by month of year"],
    cols: ["Date by year"],
    values: [{ field: "Mean °C", agg: "average", format: "number:1" }],
    filters: [{ field: "City", type: "in", items: ["Berlin"] }],
    display: "chart",
    chart: { type: "line", referenceLines: { extremes: true } }
});
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
    await hideToasts(page);
}

/**
 * Scrolls an element to the top of a phone's window, so the shot shows the report as a host gives
 * it and not the playground's own header above it. Room below the page lets a short page scroll.
 */
const toTop = (locator) => locator.evaluate((el) => {
    el.ownerDocument.body.style.paddingBottom = "100vh";
    el.style.scrollMarginTop = "12px";
    el.scrollIntoView({ block: "start" });
});

/**
 * Waits until the chart's canvas, where one shows, stays the same for 300 ms, at most 5 s: an update after the first
 * draw (a resize, labels that need room) animates again, and a picture taken during it shows a
 * half-drawn chart.
 */
async function chartSettled(page) {
    const canvas = page.locator('[data-testid="pivot-chart"] canvas').first();
    if (!(await canvas.count())) return;
    let last = "";
    for (const end = Date.now() + 5000; Date.now() < end;) {
        const now = await canvas.evaluate((el) => el.toDataURL());
        if (now === last) return;
        last = now;
        await page.waitForTimeout(300);
    }
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
    { name: "date-context", query: "data=weather&height=640", size: WIDE },
    // a value's menu: its first level, one row per topic with what is set
    {
        name: "value-menu",
        query: "data=sales",
        size: WIDE,
        open: (page) => page.getByTestId("chip-menu-Sum of Revenue").click()
    },
    // "+ Add" of Rows: every field with its type, a placed one with its zone, one in Rows disabled
    {
        name: "add-menu",
        query: "data=sales",
        size: WIDE,
        open: (page) => page.getByTestId("add-field-rows").click()
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
        query: "data=sales&empty&height=840",
        size: { width: WIDE.width, height: 1000 },
        open: async (page) => {
            await page.getByTestId("field-menu-Month").click();
            await page.getByRole("menuitem", { name: "Add to Rows" }).click();
            await page.locator('.pk-field[data-field="Revenue"] .pk-field-name').click();
            await hideToasts(page);
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
        // narrow layout's 820 px (COMPACT_HEIGHT_NARROW), so its zones start folded under their heading
        name: "phone",
        query: "data=tickets&height=800",
        size: PHONE,
        open: (page) => toTop(page.locator(".pk-root"))
    },
    {
        name: "chart-display",
        query: "data=sales&preset=1",
        // tall enough for the whole menu, Layout included
        size: TALL,
        chart: true,
        open: async (page) => {
            // the legend at the bottom (its level), back on the first level: the chart types and the topic rows
            await page.getByTestId("view-settings").click();
            await page.getByTestId("topic-legend").click();
            await page.getByTestId("legend-bottom").click();
        }
    },
    { name: "chart-groups", query: "data=countries", hash: GROUPED, size: WIDE, chart: true },
    // a phone's chart of 40 countries: the zoom slider under the axis, every country in its window named
    {
        name: "chart-zoom",
        query: "data=countries&height=640",
        hash: ZOOMED,
        size: PHONE,
        chart: true,
        open: async (page) => {
            await hideToasts(page);
            await toTop(page.locator(".pk-root"));
        }
    },
    // a line with its average (dashed), its trend (dotted) and a target (solid)
    { name: "chart-lines", query: "data=sales", hash: LINES, size: WIDE, chart: true },
    // one city's months, a line per year, each year's highest and lowest month marked
    {
        name: "chart-points",
        query: "data=weather",
        hash: POINTS,
        size: WIDE,
        chart: true,
        open: async (page) => {
            await hideToasts(page);
        }
    },
    {
        // Display › Reference lines open over the same chart: the switches, the target and its row's level
        name: "chart-lines-level",
        query: "data=sales",
        hash: LINES,
        size: WIDE,
        chart: true,
        open: async (page) => {
            await hideToasts(page);
            await page.getByTestId("view-settings").click();
            await page.getByTestId("topic-lines").click();
        }
    },
    {
        // the pointer on a segment of stacked bars: the tooltip names it and adds the stack's total
        name: "chart-tooltip",
        query: "data=sales",
        hash: STACKED,
        size: WIDE,
        chart: true,
        open: async (page) => {
            await hideToasts(page);
            const chart = page.getByTestId("pivot-chart");
            const box = await chart.boundingBox();
            // along a line through the middle of the bars until the pointer is on a segment: the
            // tooltip then has three lines, the region, the segment and the total
            const lines = chart.locator(":scope > div:not(:first-child) > div > div");
            for (let x = box.x + box.width * 0.2; x < box.x + box.width; x += 8) {
                await page.mouse.move(x, box.y + box.height * 0.6);
                await page.waitForTimeout(40);
                if ((await lines.count()) === 3 && (await chart.locator(":scope > div:not(:first-child)").isVisible())) break;
            }
        }
    },
    {
        // Start over open at the start view: Reset greyed out with its reason, New with what it does
        name: "start-over",
        query: "data=sales",
        size: WIDE,
        open: (page) => page.getByTestId("start-over").click()
    },
    {
        // More on a phone: Help first, then Start over's two entries and Views, a rule between the groups
        name: "more-menu",
        query: "data=sales",
        size: PHONE,
        open: async (page) => {
            await toTop(page.locator(".pk-root"));
            await page.getByTestId("more").click();
        }
    },
    {
        // Shared views (the presets and the views of the OpenAPI document) and My views with one saved
        name: "views-menu",
        query: "data=endoflife",
        // tall enough for the whole menu, Share this view included
        size: TALL,
        open: async (page) => {
            await toolbar(page, "views");
            await page.getByTestId("save-as").click();
            await page.getByTestId("saved-view-name").fill("Supported cycles of my products");
            await page.getByTestId("saved-view-name").press("Enter");
            await page.locator(".pk-toast").first().waitFor();
            // a save closes the menu: open it again, with the saved view marked as the one loaded
            await hideToasts(page);
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
            await hideToasts(page);
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
            await hideToasts(page);
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
            await openZones(page);
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
            await openZones(page);
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
    // the field list's Add to Filters: the field's filter opens first, nothing is placed until Apply
    {
        name: "add-to-filters",
        query: "data=sales",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("field-menu-Product").click();
            await page.getByRole("menuitem", { name: "Add to Filters" }).click();
            await page.locator(".pk-filter-popover").waitFor();
        }
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
            await toTop(page.locator(".pk-root"));
            await page.getByTestId("layout-summary").click();
            await page.getByTestId("chip-menu-Sum of Revenue").click();
        }
    },
    {
        // a donut with the numbers on its slices, Chart settings open
        name: "donut-labels",
        query: "data=sales&height=900",
        hash: encodeViewLink({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum", format: "compact" }], display: "chart", chart: { type: "donut", valueLabels: "value", labelPosition: "inside" } }),
        size: WIDE,
    },
    {
        // a donut on a phone with its values outside: a smaller pie, the labels whole on two lines
        name: "donut-phone",
        query: "data=sales&height=760",
        hash: encodeViewLink({ rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "chart", chart: { type: "donut", valueLabels: "value", legend: "bottom" } }),
        size: PHONE,
        chart: true,
        open: (page) => toTop(page.locator(".pk-root"))
    },
    {
        // bars and lines: revenue per month as bars, units as a line on the right axis
        name: "chart-combo",
        query: "data=sales",
        hash: encodeViewLink({
            rows: ["Month (Year and month)"],
            derived: [{ name: "Month (Year and month)", field: "Month", by: "yearMonth" }],
            values: [{ field: "Revenue", agg: "sum", format: "compact" }, { field: "Units", agg: "sum" }],
            display: "chart",
            chart: { type: "combo" }
        }),
        size: WIDE,
        chart: true,
        open: async (page) => {
            await hideToasts(page);
        }
    },
    {
        // a treemap of the 20 largest countries: a tile each, named on it in the colour that reads there
        name: "chart-treemap",
        query: "data=countries",
        hash: encodeViewLink({
            rows: ["Country"],
            values: [{ field: "Population", agg: "sum", format: "compact" }],
            filters: [{ field: "Year", type: "in", items: [2024] }, { field: "Country", type: "top", count: 20, by: { field: "Population", agg: "sum" } }],
            sort: [{ field: "Country", by: "value", order: "desc", value: { field: "Population", agg: "sum" } }],
            display: "chart",
            chart: { type: "treemap" }
        }),
        size: WIDE,
        chart: true,
        open: async (page) => {
            await hideToasts(page);
        }
    },
    {
        // a donut of many countries on a phone without a legend: the smallest share one slice "Other (n)"
        name: "donut-other",
        query: "data=countries&height=760",
        hash: encodeViewLink({
            rows: ["Country"],
            values: [{ field: "Population", agg: "sum", format: "compact" }],
            filters: [{ field: "Year", type: "in", items: [2024] }, { field: "Country", type: "top", count: 20, by: { field: "Population", agg: "sum" } }],
            sort: [{ field: "Country", by: "value", order: "desc", value: { field: "Population", agg: "sum" } }],
            display: "chart",
            chart: { type: "donut", legend: "off" }
        }),
        size: PHONE,
        chart: true,
        open: (page) => toTop(page.locator(".pk-root"))
    },
    {
        // Table settings: totals that change nothing say why, an "i" explains each, then Expand all and Collapse all
        name: "explanations",
        query: "data=tickets",
        size: WIDE,
        open: async (page) => {
            await page.getByTestId("view-settings").click();
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
            await hideToasts(page);
        }
    },
    { name: "german", query: "data=sales&lang=de", size: WIDE },
    // loading data (allowImport, on in the playground; the other shots turn it off): the Data menu, a file dragged over the
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
            await hideToasts(page);
        }
    },
    // tall enough that the start buttons under the load box are not cut
    { name: "import-empty", query: "data=sales&empty&import", size: TALL },
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
        open: (page) => hideToasts(page)
    },
    // "Learn with real data": one template of each real data set. Weather and countries show the
    // shots `report` and `tips`, which open the same templates
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

/**
 * The print templates of `pivotkit example templates` (examples/report-templates/) over the sales
 * example's data, rendered by pivotkit-report as the command line renders them, in the system's light
 * and dark theme: the shots of "Your own corporate design". Corporate is light on every screen
 * (`light: true`): one picture, written as both names.
 */
/** A window that holds the sales table to its footer line, so no row is cut in half. */
const REPORT_SIZE = { width: 1000, height: 850 };

const REPORT_SHOTS = [
    { name: "template-corporate", template: "corporate.template.html", view: "sales.pivotkit.json", size: REPORT_SIZE, light: true },
    { name: "template-corporate-chart", template: "corporate.template.html", view: "sales-chart.pivotkit.json", size: REPORT_SIZE, light: true },
    { name: "template-minimal", template: "minimal.template.html", view: "sales-chart.pivotkit.json", size: REPORT_SIZE }
];

/** Takes the report shots: the HTML report opened as a page of its own, as a reader opens the file. */
async function reportShots(browser, only) {
    const shots = REPORT_SHOTS.filter((s) => !only || only.includes(s.name));
    if (!shots.length) return;
    const [{ render }, { readFile: readTable }, echarts, { buildExamples }] = await Promise.all([import("pivotkit-report"), import("pivotkit-core/import"), import("echarts"), import("./examples.js")]);
    const built = await buildExamples();
    const { encode } = await import("pivotkit-core");
    const data = encode(await readTable(new File([built.files.get("sales.csv")], "sales.csv")));
    for (const shot of shots) {
        const report = await render(built.files.get(shot.view), data, { format: "html", echarts, template: built.files.get(shot.template), source: "sales.csv", now: "2026-11-13T10:00:00Z" });
        for (const theme of shot.light ? ["light"] : THEMES) {
            const page = await browser.newPage({ viewport: shot.size, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: theme });
            await page.setContent(report.text);
            const picture = await page.screenshot();
            await page.close();
            for (const name of shot.light ? THEMES.map((t) => `${shot.name}-${t}.png`) : [`${shot.name}-${theme}.png`]) {
                await writeFile(`${out}${name}`, picture);
                console.log(name);
            }
        }
    }
}

const playground = startPlayground(4174);
try {
    await mkdir(out, { recursive: true });
    const browser = await chromium.launch();
    const only = process.env.SHOTS?.split(",");
    for (const shot of SHOTS.filter((s) => !only || only.includes(s.name))) {
        for (const theme of THEMES) {
            const page = await browser.newPage({ viewport: shot.size, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: theme });
            await page.clock.setSystemTime(SNAPSHOT_DAY);
            await openPlayground(page, playground.base, { query: shot.query, hash: shot.hash, theme });
            // "Opened the view from the link" is no part of what a shot shows
            if (shot.hash) await hideToasts(page);
            if (shot.chart) await page.locator('[data-testid="pivot-chart"] canvas').waitFor();
            if (shot.open) await shot.open(page);
            // fonts, the chart's first frame, the popover's position
            await page.waitForTimeout(600);
            await chartSettled(page);
            const name = `${shot.name}-${theme}.png`;
            await page.screenshot({ path: `${out}${name}` });
            await page.close();
            console.log(name);
        }
    }
    await reportShots(browser, only);
    await browser.close();
} finally {
    playground.stop();
}
