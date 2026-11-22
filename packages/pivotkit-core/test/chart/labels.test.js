// decorateOption's labels at a phone's and a desktop's chart size (#228, #229, #230, #231): slanted
// category names cut to leave the plot its height, a donut's outside labels with room beside it, the
// values at the end of horizontal bars inside the chart, a heatmap's row names from the frame it draws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, computePivot, encode, toEChartsOption } from "pivotkit-core";
import { CATEGORY_LABEL_WIDTH, categoryLabelLayout, decorateOption, rowLabelInterval } from "pivotkit-core/chart";
// the layout's internal parts: "pivotkit-core/chart" does not export them
import { PIE_MIN_SCALE, barExtent, pieLabelFit, valueLabelRoom } from "../../src/chart-fit.js";
import { heatmapFrame, textWidth } from "../../src/chart-measure.js";

const NO_TOKENS = { getPropertyValue: () => "" };
const fontSize = DEFAULT_THEME.textSize;

const COUNTRIES = encode(
    [
        ["Sub-Saharan Africa", "Nigeria", 232_679_000],
        ["Sub-Saharan Africa", "Congo, Democratic Republic", 109_276_000],
        ["Sub-Saharan Africa", "Central African Republic", 5_331_000],
        ["Middle East & North Africa", "Egypt, Arab Republic", 116_538_000],
        ["Middle East & North Africa", "Iran, Islamic Republic", 91_568_000],
        ["Latin America & Caribbean", "Saint Vincent and the Grenadines", 101_000],
        ["Latin America & Caribbean", "Brazil", 211_999_000],
        ["Europe & Central Asia", "Russian Federation", 143_533_000],
        ["Europe & Central Asia", "Bosnia and Herzegovina", 3_164_000],
        ["East Asia & Pacific", "China", 1_408_975_000],
        ["East Asia & Pacific", "Micronesia, Federated States", 113_000],
        ["South Asia", "India", 1_450_936_000],
        ["South Asia", "Bangladesh", 173_562_000]
    ].map(([Region, Country, Population]) => ({ Region, Country, Population }))
);

const SALES = encode(
    [
        ["Central", "Sensor kit", 14_210, 1_904_330.5],
        ["Central", "Basic license", 1_620, 1_312_420],
        ["West", "Sensor kit", 9_870, 838_950],
        ["North", "Gateway", 2_362, 1_531_742],
        ["South", "Sensor kit", 10_800, 918_000],
        ["East", "Pro license", 1_400, 1_830_900]
    ].map(([Region, Product, Units, Revenue]) => ({ Region, Product, Units, Revenue }))
);

const decorated = (data, view, size) => decorateOption(toEChartsOption(computePivot(data, view)), NO_TOKENS, size);

test("#228 slanted category names take at most 40 % of the height left for the plot and them", () => {
    const view = { rows: ["Region", "Country"], values: [{ field: "Population", agg: "sum", format: "compact" }], chart: { type: "bar" } };
    // a phone's chart, 330 x 220 px: the whole paths, slanted
    const phone = decorated(COUNTRIES, view, { width: 330, height: 220 });
    const axis = phone.xAxis.axisLabel;
    assert.equal(axis.rotate, 45);
    assert.ok(axis.width < CATEGORY_LABEL_WIDTH, `cut at ${axis.width} px`);
    // 45 degrees: the block is the label's width and a line, times sin 45°, and the axis's 8 px margin
    const reserved = phone.grid.top + phone.grid.bottom;
    assert.ok((axis.width + fontSize) * Math.SQRT1_2 + 8 <= 0.4 * (220 - reserved) + 1);
    // with group labels under the names, their line counts too, and they follow the shorter names
    const groups = decorated(COUNTRIES, { ...view, chart: { type: "bar", groupLabels: "on" } }, { width: 330, height: 220 });
    const [names, group] = groups.xAxis;
    assert.ok(names.axisLabel.width < axis.width, "less room with a line of group labels");
    assert.equal(group.offset, Math.round(names.axisLabel.width * Math.SQRT1_2) + fontSize + 2);
    // a desktop's chart keeps the cut at 120 px (its "auto" group labels fit: the axis is the first of two)
    assert.equal(decorated(COUNTRIES, view, { width: 1060, height: 380 }).xAxis[0].axisLabel.width, CATEGORY_LABEL_WIDTH);
});

/** The radius (px) of a pie's series in `box`, and the room beside it for its labels (short lines). */
function pieRoom(series, box) {
    const half = Math.min(box.width, box.height) / 2;
    const r = (parseFloat(series.radius[1]) / 100) * half;
    return { r, room: box.width / 2 - r - 10 - 10 - 15 };
}

/** Fails unless every label's lines fit beside the pie (a single word may be the line), and the pie keeps its least size. */
function assertLabelsFit(patch, series, box, size) {
    const theme = (parseFloat(series.radius[1]) / 100) * (Math.min(box.width, box.height) / 2);
    const { r, room } = pieRoom({ ...series, ...patch }, box);
    assert.ok(r >= theme * PIE_MIN_SCALE - 0.5, `radius ${r} below the floor ${theme * PIE_MIN_SCALE}`);
    const format = patch.label?.formatter ?? series.label?.formatter ?? ((p) => p.name);
    const total = series.data.reduce((sum, d) => sum + d.value, 0);
    for (const d of series.data) {
        for (const line of String(format({ name: d.name, value: d.value, percent: (d.value / total) * 100 })).split("\n")) {
            assert.ok(textWidth(line, size) <= room || !line.includes(" "), `"${line}" (${textWidth(line, size)} px) beside ${room} px`);
        }
    }
}

const PHONE_BOX = { width: 330, height: 300 };

test("#229 a donut's outside labels: room beside it on a phone, on lines where long; a desktop's unchanged", () => {
    const view = { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "donut", valueLabels: "value" } };
    const option = toEChartsOption(computePivot(SALES, view));
    const wide = decorateOption(option, NO_TOKENS, { width: 1060, height: 426 });
    assert.deepEqual(wide.series[0].radius, option.series[0].radius);
    assert.equal(wide.series[0].label.formatter, option.series[0].label.formatter);
    assert.equal(wide.series[0].data, option.series[0].data, "every slice keeps its label");
    const phone = decorateOption(option, NO_TOKENS, { width: 330, height: 376 });
    const outer = (s) => parseFloat(s.radius[1]);
    assert.ok(outer(phone.series[0]) < outer(option.series[0]), `radius ${phone.series[0].radius}`);
    // the ring keeps its shape, the lines are shorter, a label is its name and value on lines
    assert.ok(Math.abs(parseFloat(phone.series[0].radius[0]) / outer(phone.series[0]) - 42 / 70) < 0.01);
    assert.deepEqual([phone.series[0].labelLine.length, phone.series[0].labelLine.length2, phone.series[0].labelLine.show], [10, 10, true]);
    assert.equal(phone.series[0].label.formatter({ name: "Central", value: 3_735_700.5, percent: 30 }).replace(/\n/g, " "), "Central: 3,735,700.5");
    assertLabelsFit(phone.series[0], option.series[0], { width: 330, height: 376 - phone.series[0].top - phone.series[0].bottom }, fontSize);
    // labels inside, or none: nothing to fit
    assert.deepEqual(pieLabelFit({ ...option.series[0], label: { position: "inside" } }, PHONE_BOX), {});
    assert.deepEqual(pieLabelFit({ ...option.series[0], label: { show: false } }, PHONE_BOX), {});
});

test("#229 shares at a larger text size: the labels fit beside the pie, and it keeps its least size", () => {
    const view = { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], chart: { type: "donut", valueLabels: "percent" } };
    const option = toEChartsOption(computePivot(SALES, view), { theme: { textSize: 18 } });
    const phone = decorateOption(option, NO_TOKENS, { width: 330, height: 376 });
    assert.match(phone.series[0].label.formatter({ name: "Central", value: 1, percent: 12.5 }).replace(/\n/g, " "), /^Central: 12\.5%$/);
    assertLabelsFit(phone.series[0], option.series[0], { width: 330, height: 376 - phone.series[0].top - phone.series[0].bottom }, 18);
});

test("#229 the pie is smaller until the longest word fits beside it, never below its floor; labels wrap at their spaces", () => {
    const series = { radius: ["42%", "70%"], data: [{ name: "Saint Vincent and the Grenadines", value: 1 }, { name: "India", value: 9 }], label: {} };
    const fit = pieLabelFit(series, PHONE_BOX);
    assertLabelsFit(fit, series, PHONE_BOX, fontSize);
    const lines = fit.label.formatter({ name: "Saint Vincent and the Grenadines" }).split("\n");
    assert.ok(lines.length > 1 && lines.join(" ") === "Saint Vincent and the Grenadines", lines.join("|"));
    // a short name beside a pie in a wide box: ECharts' own lines and radius
    assert.deepEqual(pieLabelFit({ ...series, data: [{ name: "India", value: 1 }] }, { width: 1060, height: 300 }), {});
    // a word longer than the room at the floor: the donut stays at its floor (its ring is too thin for the text inside)
    const long = { ...series, data: [{ name: "Kreditkartenabrechnungen", value: 1 }] };
    const floor = pieLabelFit(long, PHONE_BOX);
    assert.ok(pieRoom({ ...long, ...floor }, PHONE_BOX).r >= 0.7 * 150 * PIE_MIN_SCALE - 0.5);
    assert.equal(floor.label?.position, undefined);
});

test("#229 a pie at its floor with a word still too long writes its labels inside, while a legend names the slices", () => {
    const series = { radius: ["0%", "70%"], data: [{ name: "Kreditkartenabrechnungen", value: 3 }, { name: "Lastschriften", value: 1 }], label: {}, labelLine: { show: true } };
    const inside = pieLabelFit(series, PHONE_BOX);
    assert.deepEqual([inside.label.position, inside.labelLine.show, inside.minShowLabelAngle, inside.radius], ["inside", false, 12, undefined]);
    // without a legend the labels stay outside: a name on the slice could be left out
    const outside = pieLabelFit(series, PHONE_BOX, { legend: false });
    assert.equal(outside.label?.position, undefined);
    assert.ok(outside.radius);
});

test("#229 with a legend each side writes as many labels as its height holds, the larger slices first; without one every label stays", () => {
    // 20 slices from 39 down to 1: the large ones on the right, the many small ones on the left
    const data = Array.from({ length: 20 }, (_, i) => ({ name: `Country ${i + 1}`, value: 40 - 2 * i - 1 }));
    const series = { radius: ["42%", "70%"], data, label: {} };
    // 240 px hold twelve lines of 14 px text (19 px each) on a side
    const fit = pieLabelFit(series, { width: 1060, height: 240 });
    const shown = fit.data.map((d) => d.label?.show !== false);
    assert.deepEqual(fit.data.filter((d) => d.label?.show === false).map((d) => d.labelLine.show), Array(shown.filter((x) => !x).length).fill(false));
    assert.ok(shown.filter(Boolean).length >= 12 && shown.filter(Boolean).length < 20, `${shown.filter(Boolean).length} labels`);
    assert.equal(shown[0], true, "the largest slice");
    assert.equal(shown[19], false, "the smallest slice");
    // a slice keeps its own fields
    assert.deepEqual(Object.keys(fit.data[19]).sort(), ["label", "labelLine", "name", "value"]);
    // a tall box holds every label
    assert.equal(pieLabelFit(series, { width: 1060, height: 600 }).data, undefined);
    // no legend: no label is left out, in a low box too, also through decorateOption
    assert.equal(pieLabelFit(series, { width: 1060, height: 240 }, { legend: false }).data, undefined);
    const many = encode(data.map((d) => ({ C: d.name, V: d.value })));
    const off = decorated(many, { rows: ["C"], values: [{ field: "V", agg: "sum" }], chart: { type: "donut", legend: "off" } }, { width: 330, height: 240 });
    assert.equal(off.legend, undefined);
    assert.ok(off.series[0].data.every((d) => d.label?.show !== false));
    const on = decorated(many, { rows: ["C"], values: [{ field: "V", agg: "sum" }], chart: { type: "donut" } }, { width: 330, height: 240 });
    assert.ok(on.series[0].data.some((d) => d.label?.show === false));
});

test("CJK and fullwidth names count a whole em: they slant where Latin names of their length would not", () => {
    const names = ["東京都千代田区丸の内", "大阪府大阪市北区梅田", "愛知県名古屋市中村区"];
    // three slots of 120 px: 10 characters at 14 px take 140 px (77 px at the Latin average)
    assert.equal(textWidth(names[0], 14), 140);
    assert.equal(categoryLabelLayout(names, { width: 80 + 3 * 120, height: 400 }).rotate, 45);
    assert.equal(categoryLabelLayout(["abcdefghij", "abcdefghij", "abcdefghij"], { width: 80 + 3 * 120, height: 400 }).rotate, 0);
    // capitals weigh more than small letters
    assert.ok(textWidth("WWWW", 14) > textWidth("wwww", 14));
    // CJK extension B (plane 2) and emoji: a whole em each, one character though two UTF-16 units
    assert.equal(textWidth("\u{2000b}\u{2123d}", 14), 28);
    assert.equal(textWidth("\u{1f4c8}\u{1f30d}", 14), 28);
    assert.equal(textWidth("a\u{1f4c8}", 10), 15.5);
});

test("the extent of horizontal bars reads a value given as an item object too", () => {
    assert.deepEqual(barExtent([{ type: "bar", data: [3, { value: 9 }, null, { value: -2 }] }]), [-2, 9]);
    assert.deepEqual(barExtent([{ type: "bar", stack: "s", data: [{ value: 4 }, 1] }, { type: "bar", stack: "s", data: [5, { value: -3 }] }]), [-3, 9]);
});

test("#230 horizontal bars keep the room of their longest value label on the right", () => {
    const view = { rows: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", horizontal: true, valueLabels: "value" } };
    const bars = decorated(SALES, view, { width: 330, height: 376 });
    // "34,880" (6 characters at 14 px, estimated) and 5 px from the bar's end, past the 24 px margin
    assert.equal(bars.grid.right, 24 + Math.ceil(6 * fontSize * 0.55 + 5));
    assert.equal(valueLabelRoom(bars.series, fontSize), Math.ceil(6 * fontSize * 0.55 + 5));
    // without value labels, or with them inside stacked bars, nothing changes
    assert.equal(decorated(SALES, { ...view, chart: { type: "bar", horizontal: true } }, { width: 330, height: 376 }).grid.right, 24);
    assert.equal(decorated(SALES, { ...view, chart: { type: "bar", horizontal: true, stacked: true, valueLabels: "value" } }, { width: 330, height: 376 }).grid.right, 24);
    // a legend on the right keeps its room, the labels' comes on top
    const legend = decorated(SALES, { ...view, cols: ["Region"], chart: { type: "bar", horizontal: true, valueLabels: "value", legend: "right" } }, { width: 1060, height: 426 });
    assert.equal(legend.grid.right, 168 + valueLabelRoom(legend.series, fontSize));
});

test("#230 a narrow value axis writes fewer, even ticks so its labels do not collide; a wide one keeps ECharts' own", () => {
    const view = { rows: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar", horizontal: true, valueLabels: "value" } };
    assert.equal(decorated(SALES, view, { width: 1060, height: 426 }).xAxis.splitNumber, undefined);
    const phone = decorated(SALES, view, { width: 330, height: 376 });
    assert.ok(phone.xAxis.splitNumber >= 1 && phone.xAxis.splitNumber < 5, `splitNumber ${phone.xAxis.splitNumber}`);
    // vertical bars and lines keep ECharts' ticks
    assert.equal(decorated(SALES, { ...view, chart: { type: "bar", valueLabels: "value" } }, { width: 330, height: 376 }).yAxis.splitNumber, undefined);
});

test("#231 a heatmap's row names: the frame from the grid and the column names it draws, a row a px higher than the text", () => {
    const cities = ["Berlin", "Cairo", "Cape Town", "Dubai", "London", "Mexico City", "Mumbai", "New York", "Reykjavik", "Rome", "São Paulo", "Singapore", "Sydney", "Tokyo"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const data = encode(cities.flatMap((City, c) => months.map((Month, m) => ({ City, Month: `${String(m + 1).padStart(2, "0")} ${Month}`, T: (c * 7 + m * 5) % 37 }))));
    const view = { rows: ["City"], cols: ["Month"], values: [{ field: "T", agg: "average" }], chart: { type: "heatmap" } };
    // 1060 x 350 px: 16 + 64 px of grid margins and a line of straight month names leave 248 px, 17.7 px a row
    const wide = decorated(data, view, { width: 1060, height: 350 });
    assert.equal(heatmapFrame({ width: 1060, names: wide.xAxis.data }).y, 102);
    assert.equal(wide.yAxis.axisLabel.interval, 0, "every city");
    // a phone slants the month names: their height counts, and rows lower than 15 px show every n-th name
    const phone = decorated(data, view, { width: 330, height: 330 });
    assert.equal(phone.xAxis.axisLabel.rotate, 45);
    const frame = heatmapFrame({ width: 330, names: phone.xAxis.data });
    assert.ok(frame.y > 102);
    assert.equal(phone.yAxis.axisLabel.interval, rowLabelInterval(cities.length, 330, fontSize, frame));
    assert.ok(phone.yAxis.axisLabel.interval > 0);
});
