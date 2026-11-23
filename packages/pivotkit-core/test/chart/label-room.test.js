// Whether a chart's labels fit (pivotkit-core/chart): a donut's numbers in its ring, a pie's room,
// heatmap names and cells, category axis labels and group labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_LABEL_WIDTH, SLANTED_LABEL_WIDTH, categoryLabelLayout, columnLabelLayout, groupLabelsFit, heatmapCellLabels, pieLabelRoom, ringLabelsFit, rowLabelInterval } from "pivotkit-core/chart";

test("a donut's numbers fit inside its ring only when the ring is wide enough for them", () => {
    const texts = ["32.3%", "10.7%"];
    // 42 % to 70 % of half of 360 px: a ring of 50 px holds "32.3%" at 14 px (about 45 px with its room);
    // one of 42 px (300 px) does not, at 12 px it would
    assert.equal(ringLabelsFit(["42%", "70%"], { width: 390, height: 360 }, texts), true);
    assert.equal(ringLabelsFit(["42%", "70%"], { width: 330, height: 300 }, texts), false);
    assert.equal(ringLabelsFit(["42%", "70%"], { width: 330, height: 300 }, texts, 12), true);
    // the box left by a legend on the right of a phone's chart: a ring of about 24 px does not
    assert.equal(ringLabelsFit(["42%", "70%"], { width: 170, height: 300 }, texts), false);
    // a pie has room from its centre
    assert.equal(ringLabelsFit(["0%", "70%"], { width: 60, height: 60 }, texts), true);
    assert.equal(ringLabelsFit([20, 40], { width: 300, height: 300 }, ["1"]), true);
    assert.equal(ringLabelsFit([20, 30], { width: 300, height: 300 }, ["1"]), false);
});

test("a pie's room for its labels follows the chart's height, at most 24 px", () => {
    assert.equal(pieLabelRoom(200), 10);
    assert.equal(pieLabelRoom(480), 24);
    assert.equal(pieLabelRoom(900), 24);
    assert.equal(pieLabelRoom(-5), 0);
});

test("heatmap column names: straight when they fit, slanted and cut when they would overlap", () => {
    const names = ["App", "Database", "Device", "Framework", "Language", "Operating system", "Server app", "Service", "Standard"];
    // "Operating system" at 14 px takes about 125 px (its capital a little wider): straight from a chart
    // of about 1250 px; the chart of a report 1440 px wide (about 1100 px) slants them, at 12 px it would not
    assert.deepEqual(columnLabelLayout(names, 1250), { rotate: 0 });
    assert.deepEqual(columnLabelLayout(names, 1100), { rotate: 45, width: SLANTED_LABEL_WIDTH, overflow: "truncate" });
    assert.deepEqual(columnLabelLayout(names, 1100, 12), { rotate: 0 });
    assert.deepEqual(columnLabelLayout(names, 390), { rotate: 45, width: SLANTED_LABEL_WIDTH, overflow: "truncate" });
    assert.deepEqual(columnLabelLayout(["2024", "2025"], 390), { rotate: 0 });
    assert.deepEqual(columnLabelLayout([], 390), { rotate: 0 });
});

test("heatmap cells show their numbers only when the formatted numbers fit", () => {
    const counts = ["4", "37", "487"];
    // 9 columns of about 113 px and 15 rows of 21 px: counts fit
    assert.equal(heatmapCellLabels(9, 15, 1100, 440, counts), true);
    // a phone: 29 px wide cells at 14 px hold "37" (15 px and its room) but not "487" (23 px), nor
    // "1,234.5" or "-12.3%" (54 px, 46 px)
    assert.equal(heatmapCellLabels(9, 15, 340, 440, ["4", "37"]), true);
    assert.equal(heatmapCellLabels(9, 15, 340, 440, counts), false);
    assert.equal(heatmapCellLabels(9, 15, 340, 440, counts, 12), true);
    assert.equal(heatmapCellLabels(9, 15, 340, 440, ["1,234.5"]), false);
    assert.equal(heatmapCellLabels(9, 15, 340, 440, ["-12.3%"]), false);
    assert.equal(heatmapCellLabels(3, 15, 340, 440, ["1,234.5"]), true);
    // rows lower than a line of text
    assert.equal(heatmapCellLabels(9, 15, 1100, 300, counts), false);
    assert.equal(heatmapCellLabels(0, 0, 0, 0, []), false);
});

test("heatmap row names: every one when a line fits each row, else every n-th", () => {
    // a row needs a px more than 14 px text; the cells get the height less 102 px of frame (straight
    // column names): 15 rows in 440 px, 22 px each, hold every name
    assert.equal(rowLabelInterval(15, 440), 0);
    // 15 rows in 300 px: 13 px each, every second name
    assert.equal(rowLabelInterval(15, 300), 1);
    // 45 rows in 300 px: 4.4 px each, every fourth (every third at 12 px, rows of 13 px)
    assert.equal(rowLabelInterval(45, 300), 3);
    assert.equal(rowLabelInterval(45, 300, 12), 2);
    assert.equal(rowLabelInterval(0, 300), 0);
});

test("category axis labels: all straight when they fit, slanted, else every n-th; the modes force one", () => {
    const short = ["A", "B", "C"];
    assert.deepEqual(categoryLabelLayout(short, { width: 800, height: 400 }), { rotate: 0, interval: 0, every: 1, width: CATEGORY_LABEL_WIDTH, overflow: "truncate" });
    const countries = Array.from({ length: 21 }, (_, i) => `Country number ${i}`);
    const slanted = categoryLabelLayout(countries, { width: 900, height: 400 });
    assert.deepEqual([slanted.rotate, slanted.every], [45, 1], "21 long names in 900 px: slanted, every one");
    const many = Array.from({ length: 200 }, (_, i) => `Country number ${i}`);
    const nth = categoryLabelLayout(many, { width: 900, height: 400 });
    assert.equal(nth.rotate, 45);
    assert.ok(nth.every > 1 && nth.interval === nth.every - 1);
    assert.equal(categoryLabelLayout(many, { width: 900, height: 400, mode: "all" }).every, 1);
    const straight = categoryLabelLayout(countries, { width: 900, height: 400, mode: "nth" });
    assert.deepEqual([straight.rotate, straight.every > 1], [0, true]);
    // horizontal bars: names stay straight, one per row while a line fits
    assert.equal(categoryLabelLayout(countries, { width: 900, height: 600, horizontal: true }).every, 1);
    assert.ok(categoryLabelLayout(many, { width: 900, height: 600, horizontal: true }).every > 1);
});

test("auto group labels need room: a phone-sized chart writes the whole names instead", () => {
    assert.equal(groupLabelsFit(21, 3, { width: 1100, height: 420 }), true);
    assert.equal(groupLabelsFit(21, 3, { width: 350, height: 180 }), false, "390 px phone");
    assert.equal(groupLabelsFit(200, 1, { width: 1100, height: 420 }), false, "groups of one category are too narrow");
    assert.equal(groupLabelsFit(21, 3, { width: 900, height: 600, horizontal: true }), true);
});
