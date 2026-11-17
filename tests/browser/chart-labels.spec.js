// The chart's labels at a phone's (390 px) and a desktop's (1440 px) width, in both themes, with data
// that needs the room: long category names (#228), a donut's outside labels (#229), long values at the
// end of horizontal bars (#230) and a heatmap with many rows (#231). Each test reads what ECharts drew:
// the text's boxes inside the chart, whole (no "…"), not on top of each other.
import { test, expect } from "./fixtures.js";
import { ZOOM_SLIDER } from "../../packages/pivotkit-core/src/chart-zoom.js";

/** Countries with long names and their population (2024, rounded), as the countries example has them. */
const COUNTRIES = [
    ["Sub-Saharan Africa", "Nigeria", 232_679_000],
    ["Sub-Saharan Africa", "Ethiopia", 132_060_000],
    ["Sub-Saharan Africa", "Congo, Democratic Republic", 109_276_000],
    ["Sub-Saharan Africa", "Central African Republic", 5_331_000],
    ["Middle East & North Africa", "Egypt, Arab Republic", 116_538_000],
    ["Middle East & North Africa", "Iran, Islamic Republic", 91_568_000],
    ["Middle East & North Africa", "Syrian Arab Republic", 24_672_000],
    ["Latin America & Caribbean", "Brazil", 211_999_000],
    ["Latin America & Caribbean", "Mexico", 130_861_000],
    ["Latin America & Caribbean", "Saint Vincent and the Grenadines", 101_000],
    ["Europe & Central Asia", "Russian Federation", 143_533_000],
    ["Europe & Central Asia", "Bosnia and Herzegovina", 3_164_000],
    ["Europe & Central Asia", "United Kingdom", 69_226_000],
    ["East Asia & Pacific", "China", 1_408_975_000],
    ["East Asia & Pacific", "Indonesia", 283_488_000],
    ["East Asia & Pacific", "Micronesia, Federated States", 113_000],
    ["South Asia", "India", 1_450_936_000],
    ["South Asia", "Pakistan", 251_269_000],
    ["South Asia", "Bangladesh", 173_562_000],
    ["North America", "United States", 340_111_000],
    ["North America", "Canada", 41_288_000]
].map(([Region, Country, Population]) => ({ Region, Country, Population }));

/** Revenue and units per region and product, with values long enough to need room (34,880 units, 4.7 million revenue). */
const SALES = [
    ["Central", "Sensor kit", 14_210, 1_904_330.5],
    ["Central", "Basic license", 1_620, 1_312_420],
    ["Central", "Training day", 410, 574_000],
    ["West", "Sensor kit", 9_870, 838_950],
    ["West", "Pro license", 1_130, 1_480_010],
    ["North", "Gateway", 2_362, 1_531_742],
    ["South", "Support plan", 1_707, 1_092_480],
    ["South", "Sensor kit", 10_800, 918_000],
    ["East", "Basic license", 1_400, 1_008_000],
    ["East", "Pro license", 1_400, 1_830_900]
].map(([Region, Product, Units, Revenue]) => ({ Region, Product, Units, Revenue }));

/** Mean temperature of 14 cities by month: a heatmap of 14 rows and 12 columns. */
const CITIES = ["Berlin", "Cairo", "Cape Town", "Dubai", "London", "Mexico City", "Mumbai", "New York", "Reykjavik", "Rome", "São Paulo", "Singapore", "Sydney", "Tokyo"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEATHER = CITIES.flatMap((City, c) => MONTHS.map((Month, m) => ({ City, Month, Temperature: Math.round(((c * 7 + m * 5) % 37) - 2) })));

/**
 * A report of `height` px with `view` over `data` on the host page at `width` px; the chart's locator.
 * @param {import("@playwright/test").Page} page
 */
async function mount(page, { width, theme, data, view, height }) {
    await page.setViewportSize({ width, height: 900 });
    // no animation: the screenshots show the chart drawn
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("pages/host.html");
    await page.evaluate(async ({ theme, data, view, height }) => {
        const React = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { PivotReport } = await import("pivotkit-react");
        const el = document.createElement("section");
        el.id = "labels";
        document.body.append(el);
        createRoot(el).render(React.createElement(PivotReport, { theme, data, view, height, fieldList: "collapsed", tips: "off" }));
    }, { theme, data, view, height });
    const chart = page.locator("#labels").getByTestId("pivot-chart");
    await expect(chart.locator("canvas").first()).toBeVisible();
    return chart;
}

/**
 * What the chart drew, once its layout has settled: its size, the plot's box, every text with its box
 * in px (a text of two lines is two texts), the labels of the first series' items, the value axis's
 * labels and its largest value, and the y axis's label interval.
 * @param {import("@playwright/test").Locator} chart
 */
async function drawn(chart) {
    const read = () =>
        chart.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            const instance = getInstanceByDom(el);
            // the chart's animation has ended: the marks are where they stay
            if (!instance || !instance.getZr().animation.isFinished()) return null;
            const box = (t) => {
                const r = t.getBoundingRect().clone();
                const m = t.getComputedTransform();
                if (m) r.applyTransform(m);
                return { x: r.x, y: r.y, width: r.width, height: r.height };
            };
            const visible = (t) => t && !t.ignore && !t.invisible && t.style?.text;
            // the angle a text is drawn at, from its transform on the page
            const angle = (t) => {
                const m = t.getComputedTransform();
                return m ? Math.abs(Math.atan2(m[1], m[0])) : 0;
            };
            // a text in a clipped area (the legend's scrolled items) counts with its part in the area
            const clipped = (t) => {
                const b = box(t);
                for (const clip of t.__clipPaths ?? []) {
                    const c = box(clip);
                    const x = Math.max(b.x, c.x);
                    const y = Math.max(b.y, c.y);
                    b.width = Math.min(b.x + b.width, c.x + c.width) - x;
                    b.height = Math.min(b.y + b.height, c.y + c.height) - y;
                    b.x = x;
                    b.y = y;
                }
                return b;
            };
            const texts = instance
                .getZr()
                .storage.getDisplayList()
                .filter((x) => x.type === "tspan" && visible(x))
                .map((t) => ({ text: t.style.text, rotated: angle(t) > 0.1, ...clipped(t) }))
                .filter((t) => t.width > 0 && t.height > 0);
            // the label of each item of the first series: shown or not, and its lines as drawn
            const data = instance.getModel().getSeriesByIndex(0)?.getData();
            const items = [];
            for (let i = 0; data && i < data.count(); i++) {
                const label = data.getItemGraphicEl(i)?.getTextContent();
                const lines = visible(label) ? label.childrenRef().filter(visible).map((t) => t.style.text) : [];
                items.push({ name: data.getName(i), lines });
            }
            const grid = instance.getModel().getComponent("grid")?.coordinateSystem?.getRect();
            const value = ["yAxis", "xAxis"].map((t) => instance.getModel().getComponent(t)?.axis).find((a) => a && a.type === "value");
            const option = instance.getOption();
            const category = instance.getModel().getComponent("xAxis")?.axis;
            return {
                width: instance.getWidth(),
                height: instance.getHeight(),
                plot: grid ? { y: grid.y, height: grid.height } : null,
                texts,
                items,
                valueAxis: value ? { max: value.scale.getExtent()[1], labels: value.getViewLabels().map((l) => ({ text: l.formattedLabel, value: Number(l.tick?.value ?? l.tickValue) })) } : null,
                yInterval: option.yAxis?.[0]?.axisLabel?.interval ?? null,
                // the names the category axis along the bottom writes, whole
                categoryLabels: category?.type === "category" ? category.getViewLabels().map((l) => l.formattedLabel) : null,
                // the zoom slider's thickness, when the chart has one (more than 20 categories)
                slider: option.dataZoom?.[0]?.height ?? option.dataZoom?.[0]?.width ?? null,
                splitNumber: option.xAxis?.[0]?.splitNumber ?? null
            };
        });
    // the layout settles after the first frames (fonts, the resize observer)
    let last = null;
    await expect
        .poll(async () => {
            const now = await read();
            const same = now && last && JSON.stringify(now) === JSON.stringify(last);
            last = now;
            return Boolean(same);
        }, { intervals: [300, 300, 300, 500, 500, 1000] })
        .toBe(true);
    return last;
}

/**
 * Fails for a text whose box reaches past the chart. `whole` texts must not end in "…", and must not
 * cover each other (1 px of tolerance).
 */
function expectReadable(d, label, whole = (t) => !t.rotated) {
    for (const t of d.texts) {
        expect(t.x, `${label}: "${t.text}" starts left of the chart`).toBeGreaterThanOrEqual(-0.5);
        expect(t.y, `${label}: "${t.text}" starts above the chart`).toBeGreaterThanOrEqual(-0.5);
        expect(t.x + t.width, `${label}: "${t.text}" ends right of the chart (${d.width} px)`).toBeLessThanOrEqual(d.width + 0.5);
        expect(t.y + t.height, `${label}: "${t.text}" ends below the chart (${d.height} px)`).toBeLessThanOrEqual(d.height + 0.5);
    }
    const checked = d.texts.filter(whole);
    // ECharts cuts a text with "..." where it has no room
    expect(checked.filter((t) => /(…|\.\.\.)$/.test(t.text)).map((t) => t.text), `${label}: texts cut`).toEqual([]);
    const overlaps = [];
    checked.forEach((a, i) =>
        checked.slice(i + 1).forEach((b) => {
            const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
            const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
            if (w > 1 && h > 1) overlaps.push(`"${a.text}" / "${b.text}"`);
        })
    );
    expect(overlaps, `${label}: texts on top of each other`).toEqual([]);
}

/** The phone's report is lower: its chart about 330 x 220 px, as in a 390 px window. */
// the report's height for a chart of 279 px at 390 px and 286 px at 1440 px: the sizes these labels
// are measured at (the zones' section and the tabs take 12 or 13 px more folded, 62 open)
const HEIGHT = { 390: 532, 1440: 702 };

for (const theme of ["light", "dark"]) {
    for (const width of [390, 1440]) {
        test.describe(`chart labels, ${theme}, ${width} px`, () => {
            test("#228 slanted category names leave the plot most of the height, the top value tick stays", async ({ page }, testInfo) => {
                const view = { rows: ["Region", "Country"], values: [{ field: "Population", agg: "sum", format: "compact" }], display: "chart" };
                // the whole paths ("auto" group labels have no room on a phone), and group labels under the names
                for (const [name, chart] of [["groups", { type: "bar", groupLabels: "on" }], ["paths", { type: "bar" }]]) {
                    const locator = await mount(page, { width, theme, data: COUNTRIES, view: { ...view, chart }, height: HEIGHT[width] });
                    const d = await drawn(locator);
                    await locator.screenshot({ path: testInfo.outputPath(`228-${name}-${theme}-${width}.png`) });
                    // a category name and a group's name may end in "…" (the tooltip has them whole)
                    expectReadable(d, name, () => false);
                    // the zoom slider (21 countries: more than 20 categories) and its gap are neither plot
                    // nor labels: the plot's share counts the height without them
                    const room = d.height - (d.slider ? d.slider + ZOOM_SLIDER.gap : 0);
                    expect(d.plot.height / room, `${name}: the plot's share of the chart's ${room} px besides the zoom slider`).toBeGreaterThanOrEqual(0.4);
                    // the value axis writes its top tick, above the largest bar
                    const top = Math.max(...d.valueAxis.labels.map((l) => l.value));
                    expect(top, `${name}: the top tick`).toBe(d.valueAxis.max);
                    const topText = d.valueAxis.labels.find((l) => l.value === top).text;
                    expect(d.texts.map((t) => t.text), `${name}: the top tick is drawn`).toContain(topText);
                    // the slanted names: each one the axis writes is drawn, whole or cut with "..." at the end
                    const slanted = d.texts.filter((t) => t.rotated).map((t) => t.text);
                    expect(slanted.length, `${name}: the names drawn`).toBe(d.categoryLabels.length);
                    slanted.forEach((text, i) => {
                        const whole = d.categoryLabels[i];
                        if (text !== whole) expect(text.endsWith("...") && whole.startsWith(text.slice(0, -3)), `${name}: "${text}" for "${whole}"`).toBe(true);
                    });
                }
            });

            test("#229 a donut's outside labels are whole and inside the chart, wherever the legend is", async ({ page }, testInfo) => {
                const view = { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "chart" };
                for (const legend of ["auto", "bottom", "right"]) {
                    const locator = await mount(page, { width, theme, data: SALES, view: { ...view, chart: { type: "donut", valueLabels: "value", legend } }, height: HEIGHT[width] });
                    const d = await drawn(locator);
                    await locator.screenshot({ path: testInfo.outputPath(`229-${legend}-${theme}-${width}.png`) });
                    expectReadable(d, `legend ${legend}`);
                    // five regions, each with its whole label: the region's name and its revenue
                    const labels = d.items.map((i) => i.lines.join(" "));
                    expect(labels, `legend ${legend}`).toEqual(["Central: 3,790,750.5", "East: 2,838,900.0", "North: 1,531,742.0", "South: 2,010,480.0", "West: 2,318,960.0"]);
                }
            });

            test("#229 a donut without a legend keeps every slice's label, on lines where long", async ({ page }, testInfo) => {
                const view = { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], display: "chart", chart: { type: "donut", valueLabels: "value", legend: "off" } };
                const locator = await mount(page, { width, theme, data: SALES, view, height: HEIGHT[width] });
                const d = await drawn(locator);
                await locator.screenshot({ path: testInfo.outputPath(`229-off-${theme}-${width}.png`) });
                expectReadable(d, "legend off");
                expect(d.items.map((i) => i.lines.join(" "))).toEqual(["Central: 3,790,750.5", "East: 2,838,900.0", "North: 1,531,742.0", "South: 2,010,480.0", "West: 2,318,960.0"]);
                // many slices without a legend: every name is there, even where two labels touch
                const many = { rows: ["Country"], values: [{ field: "Population", agg: "sum" }], sort: [{ field: "Country", by: "value", order: "desc" }], display: "chart", chart: { type: "donut", valueLabels: "percent", legend: "off" } };
                const all = await drawn(await mount(page, { width, theme, data: COUNTRIES, view: many, height: HEIGHT[width] }));
                await page.locator("#labels").getByTestId("pivot-chart").screenshot({ path: testInfo.outputPath(`229-many-off-${theme}-${width}.png`) });
                expect(all.items.filter((i) => i.lines.length).length).toBe(COUNTRIES.length);
                expectReadable(all, "many, legend off", () => false);
            });

            test("#229 a donut of many small slices: labels that have no room are left out, the others are whole", async ({ page }, testInfo) => {
                const view = { rows: ["Country"], values: [{ field: "Population", agg: "sum" }], sort: [{ field: "Country", by: "value", order: "desc" }], display: "chart", chart: { type: "donut", valueLabels: "percent" } };
                const locator = await mount(page, { width, theme, data: COUNTRIES, view, height: HEIGHT[width] });
                const d = await drawn(locator);
                await locator.screenshot({ path: testInfo.outputPath(`229-many-${theme}-${width}.png`) });
                expectReadable(d, "many slices");
                const shown = d.items.filter((i) => i.lines.length);
                // the largest slices keep their labels; a label is whole or not there
                expect(shown.map((i) => i.name).slice(0, 2)).toEqual(["India", "China"]);
                for (const i of shown) expect(i.lines.join(" ")).toMatch(/^\S.*: \d+\.\d%$/);
                if (width === 1440) expect(shown.length, "a desktop's chart names most slices").toBeGreaterThanOrEqual(12);
            });

            test("#230 the value at the end of the longest horizontal bar is whole", async ({ page }, testInfo) => {
                for (const [name, value, expected] of [
                    ["units", { field: "Units", agg: "sum" }, "34,880"],
                    ["revenue", { field: "Revenue", agg: "sum", format: "currency:EUR" }, "€3,661,280.50"]
                ]) {
                    const view = { rows: ["Product"], values: [value], display: "chart", chart: { type: "bar", horizontal: true, valueLabels: "value" } };
                    const locator = await mount(page, { width, theme, data: SALES, view, height: HEIGHT[width] });
                    const d = await drawn(locator);
                    await locator.screenshot({ path: testInfo.outputPath(`230-${name}-${theme}-${width}.png`) });
                    expectReadable(d, name);
                    expect(d.items.map((i) => i.lines.join(" ")), name).toContain(expected);
                    expect(d.items.every((i) => i.lines.length === 1), `${name}: every bar has its value`).toBe(true);
                    // the value axis: every tick it has is written, 0 among them, at even steps
                    const ticks = d.valueAxis.labels;
                    expect(ticks[0].value, `${name}: 0`).toBe(0);
                    for (const t of ticks) expect(d.texts.map((x) => x.text), `${name}: tick ${t.text}`).toContain(t.text);
                    const steps = new Set(ticks.slice(1).map((t, i) => t.value - ticks[i].value));
                    expect(steps.size, `${name}: even ticks`).toBe(1);
                    // a desktop keeps ECharts' own 5 intervals
                    if (width === 1440) expect([null, 5], `${name}: ECharts' own ticks on a desktop`).toContain(d.splitNumber);
                }
            });

            test("CJK names on the category axis: slanted where they need it, never on top of each other", async ({ page }, testInfo) => {
                const data = ["東京都千代田区丸の内", "大阪府大阪市北区梅田", "愛知県名古屋市中村区", "福岡県福岡市博多区"].map((Place, i) => ({ Place, Visitors: 1200 + i * 350 }));
                const view = { rows: ["Place"], values: [{ field: "Visitors", agg: "sum" }], display: "chart", chart: { type: "bar" } };
                const locator = await mount(page, { width, theme, data, view, height: HEIGHT[width] });
                const d = await drawn(locator);
                await locator.screenshot({ path: testInfo.outputPath(`cjk-${theme}-${width}.png`) });
                expectReadable(d, "CJK", (t) => !/\.\.\.$/.test(t.text) && !t.rotated);
                const names = d.texts.filter((t) => /[\u4e00-\u9fff]/u.test(t.text));
                expect(names.length).toBe(4);
                // straight names side by side do not overlap; slanted ones are apart along the axis
                const straight = names.filter((t) => !t.rotated);
                straight.forEach((a, i) => straight.slice(i + 1).forEach((b) => expect(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), `"${a.text}" / "${b.text}"`).toBeLessThanOrEqual(1)));
            });

            test("#231 a heatmap names every row where a line fits it, else every n-th, never overlapping", async ({ page }, testInfo) => {
                const view = { rows: ["City"], cols: ["Month"], values: [{ field: "Temperature", agg: "average", format: "number:0" }], display: "chart", chart: { type: "heatmap" } };
                const data = WEATHER.map((r) => ({ ...r, Month: `${String(MONTHS.indexOf(r.Month) + 1).padStart(2, "0")} ${r.Month}` }));
                // the zones folded at these heights: 12 or 13 px more than before for their heading and the tabs
                for (const [name, height] of [["fits", width === 390 ? 652 : 573], ["low", width === 390 ? 452 : 453]]) {
                    const locator = await mount(page, { width, theme, data, view, height });
                    const d = await drawn(locator);
                    await locator.screenshot({ path: testInfo.outputPath(`231-${name}-${theme}-${width}.png`) });
                    expectReadable(d, name);
                    const rows = d.texts.filter((t) => CITIES.includes(t.text));
                    const rowHeight = d.plot.height / CITIES.length;
                    // the rule (docs/use/charts.md): every name while a row is a pixel higher than the text, else every n-th
                    const fontSize = rows[0].height;
                    if (name === "fits") expect(rowHeight).toBeGreaterThanOrEqual(fontSize + 1);
                    if (rowHeight >= fontSize + 1) expect(rows.map((t) => t.text).sort(), `${name}: rows of ${rowHeight.toFixed(1)} px`).toEqual([...CITIES].sort());
                    const step = d.yInterval + 1;
                    expect(rows.length, `${name}: every ${step}. name`).toBe(Math.ceil(CITIES.length / step));
                }
            });
        });
    }
}
