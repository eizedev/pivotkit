// The report's texts (labels.js): the language and a host's labels, the menus' texts under them,
// counts in the plural forms of a language, the row count under the result, a limit of the core and a
// host's refusal in words, and labels the report no longer shows.
// The loading of a language's texts is labels-load.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROW_COUNT_TEXTS, computePivot, encode, toGrid, toSeries } from "pivotkit-core";
import { REPORT_TEXTS } from "pivotkit-report";
import { chartSummary } from "../src/chart-summary.js";
import { LABELS, errorText, fill, hostFailure, plural, removedLabels, resolveLabels, rowCount } from "../src/labels.js";
// the German first-load texts: pivotkit-react adds them as it loads (deferred.js)
import "../src/deferred.js";
import { de as menuDe } from "../src/menu-labels-de.js";
import { addMenuTexts, en as menuEn, menuLabels } from "../src/menu-labels.js";
import { keys } from "./helpers.js";

/** The menus' texts of both languages (German is a chunk of its own in the package). */
const MENU_LABELS = { en: menuEn, de: menuDe };

const en = LABELS.en;

test("labels: the locale picks the language, partial labels merge deeply, en and de have the same keys", () => {
    assert.equal(resolveLabels("de-AT").zones.rows, "Zeilen");
    assert.equal(resolveLabels("fr-FR").zones.rows, "Rows");
    const custom = resolveLabels("de-DE", { zones: { rows: "Reihen" }, core: { grandTotal: "Summe" } });
    assert.deepEqual([custom.zones.rows, custom.zones.cols, custom.core.grandTotal, custom.core.blank], ["Reihen", "Spalten", "Summe", "(Leer)"]);
    assert.equal(resolveLabels("en", JSON.parse('{"__proto__": {"polluted": 1}}')).polluted, undefined);
    assert.deepEqual(keys(LABELS.de), keys(LABELS.en));
    // the menus' texts (loaded with the menus): the same keys too, none of them in the first load's
    assert.deepEqual(keys(MENU_LABELS.de), keys(MENU_LABELS.en));
    assert.deepEqual(Object.keys(MENU_LABELS.en).filter((k) => Object.hasOwn(LABELS.en, k)), []);
    assert.equal(fill("{a} of {b} {c}", { a: 1, b: "x" }), "1 of x {c}");
});

test("labels: the menus' texts come under the report's labels, and a host's text for one of them wins", () => {
    // adds German to the menus' module state for the rest of this file (menu-texts.test.js starts without it)
    addMenuTexts("de", menuDe);
    const plain = menuLabels(resolveLabels("de-DE"));
    assert.deepEqual([plain.cancel, plain.zones.rows, plain.drillCount.other], ["Abbrechen", "Zeilen", "{count} Zeilen"]);
    const custom = menuLabels(resolveLabels("de-DE", { cancel: "Doch nicht", apply: 42, showAsNames: { runningTotal: "Kumuliert" }, core: { grandTotal: "Summe" } }));
    // a text of the host's wins; one of the wrong type is ignored; a partial object merges
    assert.deepEqual([custom.cancel, custom.apply, custom.showAsNames.runningTotal, custom.showAsNames.percentRunningTotal, custom.core.grandTotal], ["Doch nicht", "Anwenden", "Kumuliert", "% laufende Summe", "Summe"]);
    // a language of the host's own: the English menu texts under it
    assert.equal(menuLabels(resolveLabels("fr-FR", { lang: "fr", cancel: "Annuler" })).apply, "Apply");
    assert.equal(menuLabels(resolveLabels("fr-FR", { lang: "fr", cancel: "Annuler" })).cancel, "Annuler");
    // no prototype pollution through a key the first load does not have
    assert.equal(menuLabels(resolveLabels("en", JSON.parse('{"__proto__": {"cancel": "x"}, "constructor": 1}'))).cancel, "Cancel");
});

test("a host that refuses to save a view: its own message when it gives one, a plain note when not", () => {
    // the texts of save, delete and publish load with the Views menu
    const save = (e, l = menuEn) => hostFailure(l.toastSaveFailed, l.toastSaveRejected, e);
    assert.equal(save(new Error("Name taken")), "The view could not be saved: Name taken");
    assert.equal(save("Quota reached"), "The view could not be saved: Quota reached");
    assert.equal(save({ message: "Forbidden" }), "The view could not be saved: Forbidden");
    // nothing to show: no "undefined", no "[object Object]", no dangling colon
    for (const e of [undefined, null, new Error(""), new Error("  "), "", {}, 42, false]) {
        assert.equal(save(e), "The server could not save the view.", String(e));
    }
    assert.equal(save(undefined, menuDe), "Der Server konnte die Ansicht nicht speichern.");
    assert.equal(hostFailure(menuDe.toastDeleteFailed, menuDe.toastDeleteRejected, null), "Der Server konnte die Ansicht nicht löschen.");
});

test("counts in words take the plural form of the language: 1 series, 1 Reihe", () => {
    const r = computePivot(encode([{ R: "North", V: 5 }]), { rows: ["R"], values: [{ field: "V", agg: "sum" }] });
    const s = toSeries(r);
    assert.match(chartSummary(s, { type: "bar", rows: ["R"], valueNames: ["Sum of V"], labels: en, locale: "en-US" }), /\. 1 category, 1 series\./);
    assert.match(chartSummary(s, { type: "bar", rows: ["R"], valueNames: ["Summe von V"], labels: LABELS.de, locale: "de-DE" }), /\. 1 Kategorie, 1 Reihe\./);
    assert.equal(plural(en.rowsCount, 1, { lang: "en", locale: "en-US" }), "1 row");
    assert.equal(plural(en.rowsCount, 1234, { lang: "en", locale: "en-US" }), "1,234 rows");
    assert.equal(plural(MENU_LABELS.de.drillCount, 1, { lang: "de", locale: "de-DE" }), "1 Zeile");
    assert.equal(plural(MENU_LABELS.de.drillCount, 0, { lang: "de", locale: "de-DE" }), "0 Zeilen");
    // a language with more forms: a host's labels keep "few" and "many", which English does not have
    const pl = resolveLabels("en", { lang: "pl", rowsCount: { one: "{count} wiersz", few: "{count} wiersze", many: "{count} wierszy", other: "{count} wiersza" } });
    assert.equal(plural(pl.rowsCount, 3, { lang: pl.lang, locale: "pl-PL" }), "3 wiersze");
    assert.equal(plural(pl.rowsCount, 5, { lang: pl.lang, locale: "pl-PL" }), "5 wierszy");
    // a form of the wrong type is ignored; a missing form falls back to "other"
    assert.equal(resolveLabels("en", { rowsCount: { one: 1 } }).rowsCount.one, "{count} row");
    assert.equal(plural({ other: "{count} things" }, 1, { lang: "en", locale: "en-US" }), "1 things");
});

test("the row count under the result: the data's rows, or the rows a filter keeps of them (#108)", () => {
    assert.equal(rowCount(15344, 15344, en, "en-US"), "15,344 rows");
    assert.equal(rowCount(1, 1, en, "en-US"), "1 row");
    assert.equal(rowCount(5110, 15344, en, "en-US"), "5,110 of 15,344 rows");
    assert.equal(rowCount(0, 1, en, "en-US"), "0 of 1 row");
    assert.equal(rowCount(2190, 4386, LABELS.de, "de-DE"), "2.190 von 4.386 Zeilen");
    assert.equal(rowCount(4386, 4386, LABELS.de, "de-DE"), "4.386 Zeilen");
    // a host's text for the filtered count, one text for every count
    assert.equal(rowCount(3, 10, resolveLabels("en", { rowsFiltered: "{shown}/{count} records" }), "en-US"), "3/10 records");
});

test("the row count's words are pivotkit-core's: the component and the HTML report say the same (#547)", () => {
    for (const lang of /** @type {("en" | "de")[]} */ (Object.keys(LABELS))) {
        assert.equal(LABELS[lang].rowsCount, ROW_COUNT_TEXTS[lang].rowsCount, lang);
        assert.equal(LABELS[lang].rowsFiltered, ROW_COUNT_TEXTS[lang].rowsFiltered, lang);
        assert.equal(REPORT_TEXTS[lang].rowsCount, ROW_COUNT_TEXTS[lang].rowsCount, lang);
        assert.equal(REPORT_TEXTS[lang].rowsFiltered, ROW_COUNT_TEXTS[lang].rowsFiltered, lang);
    }
});

test("labels from a host: wrong types are ignored, not merged", () => {
    const l = resolveLabels("en", { emptySteps: "not a list", zones: { rows: 5, cols: "Spalten" }, undo: null, unknownKey: "x", lang: "fr" });
    assert.deepEqual(l.emptySteps, en.emptySteps);
    assert.deepEqual([l.zones.rows, l.zones.cols, l.undo, l.lang], ["Rows", "Spalten", "Undo", "fr"]);
    assert.equal(/** @type {any} */ (l).unknownKey, undefined);
    assert.deepEqual(resolveLabels("en", { emptySteps: ["One", "Two"] }).emptySteps, ["One", "Two"]);
    assert.deepEqual(resolveLabels("en", { emptySteps: [1, 2] }).emptySteps, en.emptySteps);
});

test("count labels written the old way keep working: one text for every count, nouns not doubled", () => {
    const l = resolveLabels("de", { rowsCount: "{count} Datensätze", chartCounts: "{categories} Kategorien, {series} Reihen." });
    assert.deepEqual(l.rowsCount, { other: "{count} Datensätze" });
    assert.equal(plural(l.rowsCount, 1, { lang: "de", locale: "de-DE" }), "1 Datensätze");
    const r = computePivot(encode([{ R: "A", V: 1 }, { R: "B", V: 2 }]), { rows: ["R"], values: [{ field: "V", agg: "sum" }] });
    assert.match(chartSummary(toSeries(r), { type: "bar", rows: ["R"], valueNames: ["Summe von V"], labels: l, locale: "de-DE" }), /\. 2 Kategorien, 1 Reihen\./);
});

test("a limit of the core is a message in words with what to change, any other error its message", () => {
    const data = encode(Array.from({ length: 40 }, (_, i) => ({ A: `a${i}`, B: `b${i}` })));
    const refused = (limits, view = { rows: ["A"], cols: ["B"] }) => {
        try {
            toGrid(computePivot(data, view, { limits }), { limits });
        } catch (e) {
            return e;
        }
        throw new Error("no limit was hit");
    };
    assert.equal(errorText(refused({ groups: 50 }), en, "en-US"), fill(en.tooManyGroups, { max: "50" }));
    assert.equal(errorText(refused({ pivotCells: 100 }), LABELS.de, "de-DE"), fill(LABELS.de.tooManyCells, { max: "100" }));
    // 40 rows x 2 x 2 x 1 count
    assert.equal(errorText(refused({ work: 100 }, { rows: ["A"], cols: ["B"], values: [{ agg: "count" }] }), en, "en-US"), fill(en.tooMuchWork, { value: "160", max: "100" }));
    // (2 header rows + 41 body rows) x (1 label column + 41 columns), the totals included (a count makes them)
    assert.equal(errorText(refused({ cells: 1000 }, { rows: ["A"], cols: ["B"], values: [{ agg: "count" }] }), en, "en-US"), "This layout makes 1,806 cells, more than the limit of 1,000. Move a field with many values to Filters, or filter it.");
    let rows;
    try {
        encode([{}, {}, {}], { limits: { rows: 2 } });
    } catch (e) {
        rows = e;
    }
    assert.equal(errorText(rows, en, "en-US"), "The data has 3 rows, more than the limit of 2.");
    assert.equal(errorText(new Error("boom"), en, "en-US"), "The report cannot be shown: boom");
    for (const key of ["tooManyGroups", "tooManyCells", "tooManyRows", "tooMuchWork", "zoneFull", "viewTrimmed"]) {
        assert.equal(typeof LABELS.de[key], "string", key);
    }
});

test("labels the report no longer shows: each named with what replaces it, others ignored (#580 review)", () => {
    assert.deepEqual(removedLabels({ layout: "Anordnung", undo: "Back", options: "Optionen", showLayout: "x", chartDisplay: "y" }), [
        ["layout", "zonesTitle"],
        ["options", "tableSettings"],
        ["showLayout", "zonesTitle"],
        ["chartDisplay", "chartSettings"]
    ]);
    assert.deepEqual(removedLabels({ undo: "Back" }), []);
    assert.deepEqual(removedLabels(null), []);
    assert.deepEqual(removedLabels("labels"), []);
    // a key of an object's prototype is no label
    assert.deepEqual(removedLabels(Object.create({ layout: "x" })), []);
});
