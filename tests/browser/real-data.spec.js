// The real data sets of the playground (examples/playground/data/): every template opens and shows
// the numbers that the snapshot holds. The expected numbers are computed here from the snapshot with
// plain JavaScript, not with pivotkit, so a wrong aggregation, filter or "show as" fails the test.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { readSheet } from "read-excel-file/node";
import { chips, expect, tableRows, test } from "./fixtures.js";
import { unpack } from "../../examples/playground/data/sources.js";

const load = (name) => unpack(JSON.parse(readFileSync(new URL(`../../examples/playground/data/${name}.json`, import.meta.url), "utf8")));
const weather = load("weather");
const countries = load("countries");
const quakes = load("earthquakes");
const nobel = load("nobel");
const eol = load("endoflife");

const sum = (list) => list.reduce((s, x) => s + x, 0);
const avg = (list) => sum(list) / list.length;
const int = (x) => x.toLocaleString("en-US");
const one = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (x) => `${one(x * 100)}%`;

/**
 * The cells of the table row whose label cells include `label`, once the table shows it: a change
 * (Enter in a menu) renders in a later task under React 19's scheduling, so the row is waited for.
 */
async function row(page, label) {
    let rows = [];
    await expect
        .poll(async () => {
            rows = await tableRows(page);
            return rows.some((r) => r.includes(label));
        }, { message: `a row "${label}" in the table` })
        .toBe(true);
    return rows.find((r) => r.includes(label));
}

async function open(page, query) {
    await page.goto(`?${query}`);
    await expect(page.locator(".pk-root")).toBeVisible();
}

test.describe("weather", () => {
    test("how warm each city is, month by month", async ({ page }) => {
        await open(page, "data=weather&preset=0");
        const berlin = weather.filter((r) => r.City === "Berlin");
        const r = await row(page, "Berlin");
        expect(r[1]).toBe(one(avg(berlin.filter((x) => x.Date.slice(5, 7) === "01").map((x) => x["Mean °C"]))));
        expect(r[7]).toBe(one(avg(berlin.filter((x) => x.Date.slice(5, 7) === "07").map((x) => x["Mean °C"]))));
        expect(r.at(-1)).toBe(one(avg(berlin.map((x) => x["Mean °C"]))));
    });

    test("the sunniest city, top 3", async ({ page }) => {
        await open(page, "data=weather&preset=1");
        const ranked = Object.entries(Object.groupBy(weather, (x) => x.City))
            .map(([city, list]) => [city, avg(list.map((x) => x["Sunshine h"]))])
            .sort((a, b) => b[1] - a[1]);
        const rows = await tableRows(page);
        expect(rows.map((r) => r[0])).toEqual([...ranked.slice(0, 3).map(([c]) => c), "Grand Total"]);
        expect(rows[0][1]).toBe(one(ranked[0][1]));
    });

    test("rain days per season in 2025", async ({ page }) => {
        await open(page, "data=weather&preset=2");
        const sg = weather.filter((x) => x.City === "Singapore" && x.Date.startsWith("2025"));
        const r = await row(page, "Singapore");
        // the seasons in the order the playground gives the field (fieldDefaults.order), Grand Total
        expect(r.slice(1)).toEqual([...["Spring", "Summer", "Autumn", "Winter"].map((s) => int(sum(sg.filter((x) => x.Season === s).map((x) => x["Rain day"])))), int(sg.filter((x) => x["Rain mm"] >= 1).length)]);
    });

    test("Berlin, 2023 to 2025: the chart's table", async ({ page }) => {
        await open(page, "data=weather&preset=3");
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await page.getByTestId("show-table").click();
        const jan = weather.filter((x) => x.City === "Berlin" && x.Date.slice(5, 7) === "01");
        const r = await row(page, "Jan");
        expect(r.slice(1, 4)).toEqual(["2023", "2024", "2025"].map((y) => one(avg(jan.filter((x) => x.Date.startsWith(y)).map((x) => x["Mean °C"])))));
    });
});

test.describe("countries", () => {
    const year = (y) => countries.filter((x) => x.Year === y);
    const total = (list, field) => sum(list.map((x) => x[field] ?? 0));

    test("region, then country: the three largest per region in 2024", async ({ page }) => {
        await open(page, "data=countries&preset=0");
        const sa = year(2024).filter((x) => x.Region === "South Asia").sort((a, b) => b.Population - a.Population);
        expect(sa[0].Country).toBe("India");
        const rows = await tableRows(page);
        const start = rows.findIndex((r) => r.includes("India"));
        expect(rows.slice(start, start + 3).map((r) => r.at(-2))).toEqual(sa.slice(0, 3).map((x) => x.Country));
        await expect(page.getByTestId("tip-top")).toContainText("Country shows the top 3 only");
    });

    test("share of the world's CO2 per region", async ({ page }) => {
        await open(page, "data=countries&preset=1");
        const all = total(year(2024), "CO2 (Mt)");
        const r = await row(page, "East Asia & Pacific");
        // 2005, 2010, 2015, 2020, 2024
        expect(r[5]).toBe(pct(total(year(2024).filter((x) => x.Region === "East Asia & Pacific"), "CO2 (Mt)") / all));
        expect((await row(page, "Grand Total"))[5]).toBe("100.0%");
    });

    test("GDP change from the year before", async ({ page }) => {
        await open(page, "data=countries&preset=2");
        const hi = (y) => total(year(y).filter((x) => x["Income group"] === "High income"), "GDP (US$)");
        const r = await row(page, "High income");
        // 2019 has no year before it in the report: blank, "No value" for a screen reader (there are rows)
        expect(r[1]).toBe("");
        await expect(page.locator('[data-testid="pivot-table"] tbody tr[data-r]').filter({ hasText: /^High income/ }).locator("td").first()).toHaveText("No value");
        expect(r[2]).toBe(pct(hi(2020) / hi(2019) - 1));
        expect(r[6]).toBe(pct(hi(2024) / hi(2023) - 1));
    });

    test("population per income group: chart and its table", async ({ page }) => {
        await open(page, "data=countries&preset=3");
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await expect(page.getByTestId("chart-type")).toContainText("Stacked bars");
        await page.getByTestId("show-table").click();
        const r = await row(page, "2024");
        const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
        expect(r.at(-1)).toBe(compact.format(total(year(2024), "Population")));
    });
});

test.describe("earthquakes", () => {
    test("magnitude ranges", async ({ page }) => {
        await open(page, "data=earthquakes&preset=0");
        const low = quakes.filter((x) => x.Magnitude >= 4.5 && x.Magnitude < 5).length;
        const r = await row(page, "4.5 – 5");
        expect(r.slice(1)).toEqual([int(low), pct(low / quakes.length)]);
        expect(await row(page, "Grand Total")).toEqual(["Grand Total", int(quakes.length), "100.0%"]);
    });

    test("the regions that shook most often, top 10", async ({ page }) => {
        await open(page, "data=earthquakes&preset=1");
        const ranked = Object.entries(Object.groupBy(quakes, (x) => x.Region)).sort((a, b) => b[1].length - a[1].length);
        const rows = await tableRows(page);
        expect(rows).toHaveLength(11);
        expect(rows[0]).toEqual([ranked[0][0], int(ranked[0][1].length), one(Math.max(...ranked[0][1].map((x) => x.Magnitude)))]);
        expect(rows.at(-1)[1]).toBe(int(sum(ranked.slice(0, 10).map(([, l]) => l.length))));
    });

    test("quakes of 7 and more: a click shows the single quakes", async ({ page }) => {
        await open(page, "data=earthquakes&preset=2");
        const strong = quakes.filter((x) => x.Magnitude >= 7);
        expect((await row(page, "Grand Total")).at(-1)).toBe(int(strong.length));
        const russia = strong.filter((x) => x.Region === "Russia" && x["Tsunami flag"] === "Yes");
        const cell = page.locator('[data-testid="pivot-table"] tbody tr[data-r]').filter({ hasText: /^Russia/ }).locator("td").nth(1);
        await expect(cell).toHaveText(int(russia.length));
        await cell.click();
        await expect(page.getByTestId("drill-count")).toHaveText(`${russia.length} rows`);
        await expect(page.locator(".pk-drill-table tbody tr")).toHaveCount(russia.length);
        await expect(page.locator(".pk-drill-table tbody")).toContainText(russia.find((x) => x.Magnitude === Math.max(...russia.map((q) => q.Magnitude))).Place);
    });

    test("quakes per month: chart and its table", async ({ page }) => {
        await open(page, "data=earthquakes&preset=3");
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await page.getByTestId("show-table").click();
        expect((await row(page, "Jul 2025"))[1]).toBe(int(quakes.filter((x) => x.Time.startsWith("2025-07")).length));
    });

    test("a colour scale, ranges by count and the regions in each range by count: nothing dropped", async ({ page }) => {
        await open(page, "data=earthquakes&preset=0");
        await page.getByTestId("chip-menu-Quakes").click();
        await page.getByTestId("section-highlight").click();
        await page.getByTestId("cond-colorScale").click();
        await page.getByTestId("chip-menu-Magnitude (by 0.5)").click();
        await page.getByTestId("sort-value-desc-0").click();
        await page.getByTestId("field-menu-Region").click();
        await page.getByRole("menuitem", { name: "Add to Rows" }).click();
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("sort-value-desc-0")).toHaveText("Largest Quakes first");
        await page.getByTestId("sort-value-desc-0").click();
        // the regions of the first range (4.5 to 5, the most quakes) by their count, largest first
        const first = Object.entries(Object.groupBy(quakes.filter((x) => x.Magnitude < 5), (x) => x.Region))
            .map(([region, list]) => [region, list.length])
            .sort((a, b) => b[1] - a[1]);
        await expect.poll(async () => (await tableRows(page)).slice(0, 3).map((r) => r.at(-3))).toEqual(first.slice(0, 3).map(([region]) => region));
        expect((await tableRows(page))[0].at(-2)).toBe(int(first[0][1]));
        // the colour scale in the theme's colours is no part of the view that was not used
        await expect(page.getByTestId("view-issues")).toHaveCount(0);
    });
});

test.describe("Nobel laureates", () => {
    const people = nobel.filter((x) => x.Type === "Person");

    test("laureates per category and decade", async ({ page }) => {
        await open(page, "data=nobel&preset=0");
        const physics = nobel.filter((x) => x.Category === "Physics");
        const r = await row(page, "Physics");
        expect(r[1]).toBe(int(physics.filter((x) => x.Year < 1910).length));
        expect(r.at(-1)).toBe(int(physics.length));
    });

    test("decades down: the chart, then rows and columns swapped back", async ({ page }) => {
        await open(page, "data=nobel&preset=1");
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await page.getByTestId("swap").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Category"]);
        await page.getByTestId("show-table").click();
        expect((await row(page, "Chemistry")).at(-1)).toBe(int(nobel.filter((x) => x.Category === "Chemistry").length));
    });

    test("share of women per category", async ({ page }) => {
        await open(page, "data=nobel&preset=2");
        const physics = people.filter((x) => x.Category === "Physics");
        const r = await row(page, "Physics");
        // Female, Male, Grand Total
        expect(r.slice(1)).toEqual([pct(physics.filter((x) => x.Gender === "Female").length / physics.length), pct(physics.filter((x) => x.Gender === "Male").length / physics.length), "100.0%"]);
    });

    test("the countries with the most laureates, top 10", async ({ page }) => {
        await open(page, "data=nobel&preset=3");
        const ranked = Object.entries(Object.groupBy(nobel.filter((x) => x.Country), (x) => x.Country)).sort((a, b) => b[1].length - a[1].length);
        const rows = await tableRows(page);
        expect(rows[0].slice(0, 2)).toEqual([ranked[0][0], int(ranked[0][1].length)]);
        const ages = ranked[0][1].map((x) => x["Age at award"]).filter((x) => x !== null);
        expect(rows[0][2]).toBe(int(Math.round(avg(ages))));
    });
});

test.describe("software end of life", () => {
    const year = (x) => x["EOL date"]?.slice(0, 4);
    // a date as the report writes it in en-US: the snapshot's dates are calendar days, no time zone
    const usDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    const known = eol.filter((x) => x["Support years"] !== null);

    test("release cycles reaching end of life per year: chart and its table", async ({ page }) => {
        await open(page, "data=endoflife&preset=0");
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await page.getByTestId("show-table").click();
        expect((await row(page, "2025"))[1]).toBe(int(eol.filter((x) => year(x) === "2025").length));
        const shown = eol.filter((x) => year(x) >= "2016" && year(x) <= "2030");
        expect((await row(page, "Grand Total"))[1]).toBe(int(shown.length));
    });

    test("the products with the most supported release cycles, top 10", async ({ page }) => {
        await open(page, "data=endoflife&preset=1");
        const ranked = Object.entries(Object.groupBy(eol.filter((x) => x.Maintained), (x) => x.Product)).sort((a, b) => b[1].length - a[1].length);
        const rows = await tableRows(page);
        expect(rows.map((r) => r[0])).toEqual([...ranked.slice(0, 10).map(([p]) => p), "Grand Total"]);
        const oldest = ranked[0][1].map((x) => x.Released).sort()[0];
        expect(rows[0].slice(1)).toEqual([int(ranked[0][1].length), usDate(oldest)]);
        await expect(page.getByTestId("tip-top")).toContainText("Product shows the top 10 only");
    });

    test("support length per category in ranges of 2 years, without unknown ends", async ({ page }) => {
        await open(page, "data=endoflife&preset=2");
        const os = known.filter((x) => x.Category === "Operating system");
        const r = await row(page, "Operating system");
        // 0 – 2, 2 – 4, ...: each cycle counts in the range of its whole years
        expect(r[1]).toBe(pct(os.filter((x) => x["Support years"] < 2).length / os.length));
        expect(r[2]).toBe(pct(os.filter((x) => x["Support years"] >= 2 && x["Support years"] < 4).length / os.length));
        expect(r.at(-1)).toBe("100.0%");
        const head = await page.locator('[data-testid="pivot-table"] thead').textContent();
        expect(head).not.toContain("(blank)");
    });

    test("LTS against the rest: average support in years", async ({ page }) => {
        await open(page, "data=endoflife&preset=3");
        const lang = known.filter((x) => x.Category === "Language");
        const r = await row(page, "Language");
        // No, Yes, Grand Total: the boolean LTS reads as No and Yes
        expect(r.slice(1)).toEqual([one(avg(lang.filter((x) => !x.LTS).map((x) => x["Support years"]))), one(avg(lang.filter((x) => x.LTS).map((x) => x["Support years"]))), one(avg(lang.map((x) => x["Support years"])))]);
        const head = await page.locator('[data-testid="pivot-table"] thead').textContent();
        expect(head).toContain("No");
        expect(head).toContain("Yes");
    });

    test("what reaches end of life in the next 12 months: a click lists the cycles", async ({ page }) => {
        await open(page, "data=endoflife&preset=4");
        const next = eol.filter((x) => x["Days to EOL"] !== null && x["Days to EOL"] >= 0 && x["Days to EOL"] < 365);
        expect((await row(page, "Grand Total")).at(-1)).toBe(int(next.length));
        const ranked = Object.entries(Object.groupBy(next, (x) => x.Product)).sort((a, b) => b[1].length - a[1].length);
        const [product, cycles] = ranked[0];
        const cell = page.locator('[data-testid="pivot-table"] tbody tr[data-r]').filter({ hasText: product }).locator("td").last();
        await expect(cell).toHaveText(int(cycles.length));
        await cell.click();
        await expect(page.getByTestId("drill-count")).toHaveText(`${cycles.length} rows`);
        await expect(page.locator(".pk-drill-table tbody")).toContainText(cycles[0].Cycle);
    });

    test("German: dates, booleans and numbers in German notation", async ({ page }) => {
        await open(page, "data=endoflife&preset=3&lang=de");
        const head = await page.locator('[data-testid="pivot-table"] thead').textContent();
        expect(head).toContain("Nein");
        expect(head).toContain("Ja");
        const lang = known.filter((x) => x.Category === "Language" && x.LTS);
        expect((await row(page, "Language"))[2]).toBe(avg(lang.map((x) => x["Support years"])).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
        await open(page, "data=endoflife&preset=1&lang=de");
        const top = Object.entries(Object.groupBy(eol.filter((x) => x.Maintained), (x) => x.Product)).sort((a, b) => b[1].length - a[1].length)[0];
        const oldest = top[1].map((x) => x.Released).sort()[0];
        expect((await row(page, top[0]))[2]).toBe(new Date(oldest).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }));
    });

    test("the export keeps dates, booleans and blanks", async ({ page }) => {
        await open(page, "data=endoflife&preset=3");
        await page.getByTestId("export").click();
        const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-xlsx").click()]);
        expect(xlsx.suggestedFilename()).toBe("pivotkit-endoflife.xlsx");
        const sheet = await readSheet(await readFile(await xlsx.path()));
        const lang = known.filter((x) => x.Category === "Language");
        const line = sheet.find((r) => r[0] === "Language");
        expect(line[2]).toBeCloseTo(avg(lang.filter((x) => x.LTS).map((x) => x["Support years"])), 9);
        // a category without LTS cycles: an empty cell, not a zero
        expect(sheet.find((r) => r[0] === "Device")[2]).toBeNull();
        await page.getByTestId("export").click();
        const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
        const text = (await readFile(await csv.path(), "utf8")).replace(/^\uFEFF/, "");
        expect(text.split(/\r?\n/).find((l) => l.startsWith("Device,"))).toMatch(/^Device,[\d.]+,,[\d.]+$/);
    });
});

test.describe("software end of life in a time zone far from UTC", () => {
    // the dates are calendar days: a year, a quarter or a date must not move with the browser's zone
    for (const timezoneId of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
        test.describe(timezoneId, () => {
            test.use({ timezoneId });
            test("EOL years and the oldest release date stay the same", async ({ page }) => {
                await open(page, "data=endoflife&preset=0");
                await page.getByTestId("show-table").click();
                expect((await row(page, "2026"))[1]).toBe(int(eol.filter((x) => x["EOL date"]?.startsWith("2026")).length));
                await open(page, "data=endoflife&preset=1");
                const top = Object.entries(Object.groupBy(eol.filter((x) => x.Maintained), (x) => x.Product)).sort((a, b) => b[1].length - a[1].length)[0];
                const oldest = top[1].map((x) => x.Released).sort()[0];
                expect((await row(page, top[0]))[2]).toBe(new Date(oldest).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }));
            });
        });
    }
});

// A few "try this" tasks of the documentation's "Learn with real data" page, as a person does them.
test.describe("learning tasks", () => {
    test("weather: Max instead of Average; rain days as % of row total", async ({ page }) => {
        await open(page, "data=weather&preset=0");
        await page.getByTestId("chip-menu-Average of Mean °C").click();
        await page.getByTestId("agg-max").click();
        const jan = weather.filter((x) => x.City === "Reykjavik" && x.Date.slice(5, 7) === "01");
        expect((await row(page, "Reykjavik"))[1]).toBe(one(Math.max(...jan.map((x) => x["Mean °C"]))));

        await open(page, "data=weather&preset=2");
        await page.getByTestId("chip-menu-Rain days").click();
        await page.getByTestId("showas-percentOfRowTotal").click();
        expect((await row(page, "Singapore")).at(-1)).toBe("100.0%");
    });

    test("weather: top 5 sunniest cities", async ({ page }) => {
        await open(page, "data=weather&preset=1");
        await page.getByTestId("chip-menu-City").click();
        await page.getByTestId("top-count").fill("5");
        await page.getByRole("button", { name: "Apply" }).click();
        const ranked = Object.entries(Object.groupBy(weather, (x) => x.City)).map(([c, l]) => [c, avg(l.map((x) => x["Sunshine h"]))]).sort((a, b) => b[1] - a[1]);
        expect((await tableRows(page)).map((r) => r[0])).toEqual([...ranked.slice(0, 5).map(([c]) => c), "Grand Total"]);
    });

    test("countries: removing the top 3 shows every country of a region", async ({ page }) => {
        await open(page, "data=countries&preset=0");
        await page.getByTestId("chip-menu-Country").click();
        await page.getByTestId("top-remove").click();
        await expect(page.getByTestId("tip-top")).toHaveCount(0);
        const southAsia = countries.filter((x) => x.Year === 2024 && x.Region === "South Asia");
        const rows = await tableRows(page);
        expect(rows.filter((r) => southAsia.some((c) => r.includes(c.Country)))).toHaveLength(southAsia.length);
    });

    test("countries: Apply with no count removes the top 3, and Undo brings it back", async ({ page }) => {
        await open(page, "data=countries&preset=0");
        await page.getByTestId("chip-menu-Country").click();
        await page.getByTestId("top-count").fill("");
        await page.getByTestId("top-count").press("Enter");
        await expect(page.getByTestId("tip-top")).toHaveCount(0);
        await expect(page.getByTestId("top-count-problem")).toHaveCount(0);
        // the focus goes back to the chip, as after any change in its menu
        await expect(page.getByTestId("chip-menu-Country")).toBeFocused();
        const southAsia = countries.filter((x) => x.Year === 2024 && x.Region === "South Asia");
        await expect.poll(async () => (await tableRows(page)).filter((r) => southAsia.some((c) => r.includes(c.Country))).length).toBe(southAsia.length);
        await page.getByTestId("undo").click();
        await expect(page.getByTestId("tip-top")).toHaveCount(1);
    });

    test("earthquakes: ranges of 1, then the depth in ranges of 100", async ({ page }) => {
        await open(page, "data=earthquakes&preset=0");
        await page.getByTestId("chip-menu-Magnitude (by 0.5)").click();
        await page.getByTestId("bin-size").fill("1");
        await page.getByTestId("bin-size").press("Enter");
        expect((await row(page, "Grand Total"))[1]).toBe(int(quakes.length));
        expect(await tableRows(page)).toHaveLength(6);

        await open(page, "data=earthquakes&preset=1");
        await page.getByRole("button", { name: "Remove Region" }).click();
        await page.getByTestId("field-menu-Depth km").click();
        await page.getByRole("menuitem", { name: "Add to Rows" }).click();
        await page.getByTestId("chip-menu-Depth km").click();
        await page.getByTestId("bin-size").fill("100");
        await page.getByTestId("bin-size").press("Enter");
        expect((await row(page, "0 – 100"))[1]).toBe(int(quakes.filter((x) => x["Depth km"] < 100).length));
    });

    test("end of life: category as a heatmap; the median instead of the average", async ({ page }) => {
        await open(page, "data=endoflife&preset=0");
        await page.getByTestId("field-menu-Category").click();
        await page.getByRole("menuitem", { name: "Add to Columns" }).click();
        await page.getByTestId("chart-type").click();
        await page.getByTestId("chart-heatmap").click();
        await expect(page.getByTestId("chart-type")).toHaveAccessibleName("Chart type: Heatmap");
        // ECharts draws a heatmap with a slider on more than one canvas
        await expect(page.locator('[data-testid="pivot-chart"] canvas').first()).toBeVisible();
        await page.getByTestId("show-table").click();
        expect((await row(page, "2026"))[7]).toBe(int(eol.filter((x) => x["EOL date"]?.startsWith("2026") && x.Category === "Server app").length));

        await open(page, "data=endoflife&preset=3");
        await page.getByTestId("chip-menu-Average of Support years").click();
        await page.getByText("More statistics").click();
        await page.getByTestId("agg-median").click();
        const years = eol.filter((x) => x.Category === "Language" && !x.LTS && x["Support years"] !== null).map((x) => x["Support years"]).sort((a, b) => a - b);
        const mid = years.length / 2;
        const median = years.length % 2 ? years[Math.floor(mid)] : (years[mid - 1] + years[mid]) / 2;
        // the host's format for Support years (fieldDefaults, number:1) stays with the new aggregator
        expect((await row(page, "Language"))[1]).toBe(one(median));
    });

    test("Nobel: the sum of Share counts prizes, not laureates", async ({ page }) => {
        await open(page, "data=nobel&preset=0");
        await page.locator('.pk-field[data-field="Share"] .pk-field-name').click();
        const physics = nobel.filter((x) => x.Category === "Physics");
        const prizes = new Set(physics.map((x) => x.Year)).size;
        expect(Math.round(sum(physics.map((x) => x.Share)))).toBe(prizes);
        const r = await row(page, "Physics");
        expect(Number(r.at(-1).replace(/,/g, ""))).toBeCloseTo(prizes, 6);
    });
});

test("export of real data: the XLSX holds the numbers, the German CSV the same numbers in German notation", async ({ page }) => {
    await open(page, "data=weather&preset=1&lang=de");
    const cairo = avg(weather.filter((x) => x.City === "Cairo").map((x) => x["Sunshine h"]));
    await page.getByTestId("export").click();
    const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-xlsx").click()]);
    expect(xlsx.suggestedFilename()).toBe("pivotkit-weather.xlsx");
    const sheet = await readSheet(await readFile(await xlsx.path()));
    const line = sheet.find((r) => r[0] === "Cairo");
    expect(line[1]).toBeCloseTo(cairo, 9);
    await page.getByTestId("export").click();
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    const text = (await readFile(await csv.path(), "utf8")).replace(/^\uFEFF/, "");
    const cells = text.split(/\r?\n/).find((l) => l.startsWith("Cairo;")).split(";");
    expect(Number(cells[1].replace(",", "."))).toBeCloseTo(cairo, 9);
});

test("each real data set names its source and licence next to the data", async ({ page }) => {
    for (const [data, text, licence] of [["weather", "Open-Meteo.com", "CC BY 4.0"], ["countries", "World Bank", "CC BY 4.0"], ["earthquakes", "U.S. Geological Survey", "public domain"], ["nobel", "Nobel Prize Outreach", "CC0"], ["endoflife", "endoflife.date", "MIT"]]) {
        await open(page, `data=${data}`);
        await expect(page.getByTestId("pg-source")).toContainText(text);
        await expect(page.getByTestId("pg-source").getByRole("link", { name: licence })).toBeVisible();
        // the weather data also credits the Copernicus programme (ERA5, ERA5-Land), as the Climate Data Store asks;
        // the end-of-life data shows the copyright notice of its MIT License
        await expect(page.getByTestId("pg-credit")).toHaveCount(data === "weather" || data === "endoflife" ? 1 : 0);
    }
    await open(page, "data=endoflife");
    await expect(page.getByTestId("pg-credit")).toHaveText("Copyright 2020 endoflife.date contributors.");
    // "supported right now", "the next 12 months": as of the day the snapshot was fetched
    const fetched = JSON.parse(readFileSync(new URL("../../examples/playground/data/endoflife.json", import.meta.url), "utf8")).fetched;
    expect(fetched).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByTestId("pg-as-of")).toHaveText(`, as of ${fetched}`);
    await expect(page.getByTestId("pg-source")).toContainText(`MIT, as of ${fetched}.`);
    await open(page, "data=weather");
    await expect(page.getByTestId("pg-credit")).toContainText("Contains modified Copernicus Climate Change Service information");
});

test("at 390 px the page does not scroll sideways with a real data set", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const data of ["weather", "countries", "earthquakes", "nobel", "endoflife"]) {
        await open(page, `data=${data}&theme=dark`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), data).toBe(390);
    }
});

test.describe("what the real data showed (#21 to #26)", () => {
    test("ranges of years read 1900 – 1910, in English and German", async ({ page }) => {
        for (const lang of ["en", "de"]) {
            await open(page, `data=nobel&preset=0&lang=${lang}`);
            await expect(page.locator(".pk-table thead th").filter({ hasText: /^1900 – 1910$/ })).toHaveCount(1);
        }
    });

    test("a blank cell with no quakes behind it opens nothing, by click or Enter", async ({ page }) => {
        await open(page, "data=earthquakes&preset=2");
        const russia = page.locator('[data-testid="pivot-table"] tbody tr[data-r]').filter({ hasText: /^Russia/ });
        const strong = quakes.filter((x) => x.Magnitude >= 7 && x.Region === "Russia");
        // Russia had no quake of 7 or more without a tsunami flag: that cell is blank
        expect(strong.filter((x) => x["Tsunami flag"] === "No")).toHaveLength(0);
        const blank = russia.locator("td").nth(0);
        // blank on screen; a screen reader hears why (a visually hidden text)
        expect((await row(page, "Russia"))[1]).toBe("");
        await expect(blank).toHaveText("No rows");
        await expect(blank.locator(".pk-sr")).toHaveText("No rows");
        await expect(blank).toHaveAccessibleName("No rows");
        // a selection of the table (what Ctrl+C copies into a spreadsheet) keeps the empty cells empty
        const copied = await page.evaluate(() => {
            const range = document.createRange();
            range.selectNodeContents(document.querySelector('[data-testid="pivot-table"] tbody'));
            const sel = getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return sel.toString();
        });
        expect(copied).toContain("Russia");
        expect(copied).not.toContain("No rows");
        await expect(blank).not.toHaveClass(/pk-clickable/);
        await blank.click();
        await blank.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("drill-count")).toHaveCount(0);
        // the arrow keys still stop on it and move on to the count next to it, which opens
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        await expect(page.getByTestId("drill-count")).toHaveText(`${strong.length} rows`);
    });

    test("Apply with no range size removes the ranges, as Remove does", async ({ page }) => {
        await open(page, "data=earthquakes&preset=0");
        await page.getByTestId("chip-menu-Magnitude (by 0.5)").click();
        await page.getByTestId("bin-size").fill("");
        await page.getByTestId("bin-size").press("Enter");
        await expect(page.getByTestId("chip-menu-Magnitude")).toBeVisible();
        await expect(page.getByTestId("bin-size-problem")).toHaveCount(0);
        await page.getByTestId("undo").click();
        await expect(page.getByTestId("chip-menu-Magnitude (by 0.5)")).toBeVisible();
        await page.getByTestId("chip-menu-Magnitude (by 0.5)").click();
        await page.getByTestId("bin-remove").click();
        await expect(page.getByTestId("chip-menu-Magnitude")).toBeVisible();
    });

    test("a new range size keeps the start; Starting at moves it", async ({ page }) => {
        await open(page, "data=earthquakes&preset=0");
        await page.getByTestId("chip-menu-Magnitude (by 0.5)").click();
        await expect(page.getByTestId("bin-start")).toHaveValue("4.5");
        await page.getByTestId("bin-size").fill("1");
        await page.getByTestId("bin-size").press("Enter");
        expect((await row(page, "4.5 – 5.5"))[1]).toBe(int(quakes.filter((x) => x.Magnitude < 5.5).length));
        await page.getByTestId("chip-menu-Magnitude (by 1)").click();
        await page.getByTestId("bin-start").fill("4");
        await page.getByTestId("bin-start").press("Enter");
        expect((await row(page, "4 – 5"))[1]).toBe(int(quakes.filter((x) => x.Magnitude < 5).length));
    });

    test("Starting at: empty is 0; a start too far from the values is refused with a note", async ({ page }) => {
        await open(page, "data=earthquakes&preset=0");
        await page.getByTestId("chip-menu-Magnitude (by 0.5)").click();
        // the ranges of 0.5 from 1e17 cannot be told apart: every row would be "(blank)"
        await page.getByTestId("bin-start").fill("1e17");
        await expect(page.getByTestId("bin-problem")).toContainText("Ranges from 100,000,000,000,000,000 cannot hold this field's values");
        await expect(page.getByTestId("bin-start")).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByTestId("bin-start")).toHaveAttribute("aria-describedby", /.+/);
        await expect(page.getByRole("button", { name: "Apply" }).first()).toBeDisabled();
        await page.getByTestId("bin-start").press("Enter");
        expect((await row(page, "4.5 – 5"))[1]).toBe(int(quakes.filter((x) => x.Magnitude < 5).length));
        // empty: from 0, as the placeholder says, not the range's old start
        await page.getByTestId("bin-start").fill("");
        await expect(page.getByTestId("bin-problem")).toHaveCount(0);
        await page.getByTestId("bin-size").fill("2");
        await page.getByTestId("bin-size").press("Enter");
        expect((await row(page, "4 – 6"))[1]).toBe(int(quakes.filter((x) => x.Magnitude < 6).length));
    });

    test("at 390 px a value is visible next to two levels of long row labels", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await open(page, "data=countries&preset=0");
        await expect(page.locator(".pk-table tbody th").filter({ hasText: "East Asia & Pacific" }).first()).toBeVisible();
        const visible = await page.evaluate(() => {
            const wrap = document.querySelector(".pk-table-wrap").getBoundingClientRect();
            return [...document.querySelectorAll(".pk-table tbody td")].filter((td) => {
                const r = td.getBoundingClientRect();
                return td.textContent !== "" && r.left >= wrap.left && r.right <= wrap.right + 0.5;
            }).length;
        });
        expect(visible).toBeGreaterThan(0);
    });

    test("one value: its name once over the months", async ({ page }) => {
        await open(page, "data=weather&preset=0");
        const names = page.locator(".pk-table thead tr:last-child th.pk-colHeader");
        await expect(names).toHaveCount(1);
        await expect(names).toHaveText("Average of Mean °C");
        await expect(names).toHaveAttribute("colspan", "13");
    });

    test("the seasons in the order of the year in a template without a sort; reversed and A to Z from the menu", async ({ page }) => {
        await open(page, "data=weather&preset=2");
        const seasons = () => page.locator(".pk-table thead tr:first-child th.pk-colHeader").allTextContents();
        expect(await seasons()).toEqual(["Spring", "Summer", "Autumn", "Winter", "Grand Total"]);
        await page.getByTestId("chip-menu-Season").click();
        await expect(page.getByTestId("sort-custom")).toHaveAttribute("aria-pressed", "true");
        await page.getByTestId("sort-custom-desc").click();
        await expect.poll(seasons).toEqual(["Winter", "Autumn", "Summer", "Spring", "Grand Total"]);
        // A to Z stays A to Z: the host's order does not come back
        await page.getByTestId("chip-menu-Season").click();
        await page.getByRole("button", { name: "A to Z", exact: true }).click();
        await expect.poll(seasons).toEqual(["Autumn", "Spring", "Summer", "Winter", "Grand Total"]);
    });

    test("the CSV holds a percentage as the table shows it, in percent", async ({ page }) => {
        await open(page, "data=countries&preset=2&lang=de");
        // 2020 against 2019 (2019, the first year, has nothing before it)
        const shown = (await row(page, "High income"))[2];
        await page.getByTestId("export").click();
        const [csv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
        const text = (await readFile(await csv.path(), "utf8")).replace(/^\uFEFF/, "");
        const cell = text.split(/\r?\n/).find((l) => l.startsWith("High income;")).split(";")[2];
        expect(cell).toMatch(/^-?\d+(,\d+)?%$/);
        // as the table shows it, one decimal ("-2,6 %"): the same number, without the space before the sign
        expect(cell).toBe(shown.replace(/\s/g, "").replace("−", "-"));
        // the XLSX keeps every decimal
        await page.getByTestId("export").click();
        // its "i" says so: on hover, the explanation of the format
        await page.getByTestId("setting-info-exportXlsx").hover();
        await expect(page.locator(".pk-info-pop")).toContainText("Jede Zahl mit allen Nachkommastellen");
        const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-xlsx").click()]);
        const full = (await readSheet(await readFile(await xlsx.path()))).find((r) => r[0] === "High income")[2];
        expect(full.toFixed(3)).toBe((Number(cell.replace("%", "").replace(",", ".")) / 100).toFixed(3));
        expect(String(full).length).toBeGreaterThan(8);
    });
});
