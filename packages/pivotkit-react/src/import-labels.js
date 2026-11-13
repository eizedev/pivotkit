/*
 * The texts of loading data (the Data menu, the drop overlay, the preview, the notes of the readers),
 * English and German. They load with the import UI (import-ui.js), never in the first load; a host's
 * texts for them go into the `labels` prop under `dataImport` and are merged by importLabels(), as the
 * menus' texts are. {name} placeholders are filled by fill(); counts are plural forms.
 */

import { MENU_TEXTS, fill, mergeLabels, messageOf, plural } from "./labels.js";

export const en = {
    dataSource: "Data source",
    hostData: "The report's data",
    rows: { one: "{count} row", other: "{count} rows" },
    columns: { one: "{count} column", other: "{count} columns" },
    fromFile: "From a file, only in this browser",
    load: "Load",
    loadFile: "Load data…",
    backToOriginal: "Back to original data",
    backHint: "Undo brings the file back",
    dropHint: "or drop a file onto the report",
    formats: "Reads {formats}",
    // the formats of the built-in readers and pivotkit-xlsx by the reader's name; a plugin's own label otherwise
    formatNames: { csv: "CSV or text", json: "JSON", xlsx: "Excel workbook" },
    dropTitle: "Drop the file to load it",
    dropOne: "Drop one file at a time.",
    reading: "Reading {name}…",
    phases: { read: "Reading the file", unpack: "Unpacking the workbook", parse: "Reading the rows", type: "Checking the columns" },
    cancel: "Cancel",
    previewTitle: "Load {name}",
    sheet: "Sheet",
    hiddenSheet: "{name} (hidden)",
    firstRows: "The first rows",
    someColumns: "The first {shown} of {count} columns are shown; the others keep the type found.",
    typeOf: "Type of {column}",
    types: { string: "Text", number: "Number", date: "Date", boolean: "Yes/No" },
    yes: "Yes",
    no: "No",
    noRows: "The file holds no rows.",
    notesTitle: { one: "{count} note", other: "{count} notes" },
    apply: "Load data",
    loaded: "{name} loaded: {rows}, {columns}",
    stepLoaded: "{name} loaded",
    originalShown: "The original data is shown",
    failed: "{name} could not be loaded: {message}",
    refused: "{name} was not loaded: {message}",
    // a limit of pivotkit-core the file is over; {key} the limit's key, as the reader names it
    overLimit: "it has more than {max} {what} ({key}): load a smaller extract of it, or a host can raise this limit",
    limitWhat: { rows: "rows", columns: "columns", fileBytes: "bytes", importCells: "values (rows x columns)" },
    sourceLine: "{name}, only in this browser",
    sourceSheet: "{name}, sheet “{sheet}”, only in this browser",
    notes: {
        ENCODING: "Read as {encoding}.",
        SEPARATOR: "Values separated by {name}.",
        LINES_SKIPPED: { one: "{count} line above the column names was skipped (a title block).", other: "{count} lines above the column names were skipped (a title block)." },
        COLUMN_RENAMED: "Column “{from}” is named “{to}”.",
        COLUMN_UNNAMED: "Column {position} has no name; it is named “{to}”.",
        COLUMNS_RENAMED_MORE: { one: "{count} more column was renamed.", other: "{count} more columns were renamed." },
        COLUMN_DROPPED: "Column {position} has no name and no values and was left out.",
        COLUMNS_ADDED: { one: "{count} row has more values than there are column names; the extra values are in columns named “Column …”.", other: "{count} rows have more values than there are column names; the extra values are in columns named “Column …”." },
        ROWS_EMPTY: { one: "{count} empty row was left out.", other: "{count} empty rows were left out." },
        TEXT_CUT: { one: "{count} value longer than {max} characters was cut.", other: "{count} values longer than {max} characters were cut." },
        CHARACTERS_REMOVED: { one: "Control or text direction characters were removed from {count} value.", other: "Control or text direction characters were removed from {count} values." },
        DATE_ORDER: "Dates in “{column}” were read as {order}; the values fit both.",
        VALUES_NOT_CONVERTED: { one: "{count} value in “{column}” cannot be read as {type} and is empty.", other: "{count} values in “{column}” cannot be read as {type} and are empty." },
        JSON_PROPERTY: "The rows were read from “{property}”.",
        JSON_FLATTENED: "Nested values became columns named with a dot (“{example}”).",
        SHEET: "Read the sheet “{sheet}”.",
        SHEETS: "Read the sheet “{sheet}” of {count} sheets.",
        USED_RANGE: "The sheet's used range reaches row {usedRow}; the values end at row {lastRow}, the empty rows below were skipped.",
        ERROR_CELLS: { one: "{count} cell holds an Excel error (such as #N/A) and is empty.", other: "{count} cells hold an Excel error (such as #N/A) and are empty." }
    },
    dateOrders: { dmy: "day/month/year", mdy: "month/day/year" }
};

/** @typedef {typeof en} ImportTexts */

/** @type {ImportTexts} */
export const de = {
    dataSource: "Datenquelle",
    hostData: "Die Daten des Berichts",
    rows: { one: "{count} Zeile", other: "{count} Zeilen" },
    columns: { one: "{count} Spalte", other: "{count} Spalten" },
    fromFile: "Aus einer Datei, nur in diesem Browser",
    load: "Laden",
    loadFile: "Daten laden…",
    backToOriginal: "Zurück zu den Originaldaten",
    backHint: "Rückgängig holt die Datei zurück",
    dropHint: "oder eine Datei auf den Bericht ziehen",
    formats: "Liest {formats}",
    formatNames: { csv: "CSV oder Text", json: "JSON", xlsx: "Excel-Arbeitsmappe" },
    dropTitle: "Loslassen, um die Datei zu laden",
    dropOne: "Bitte nur eine Datei auf einmal ziehen.",
    reading: "{name} wird gelesen…",
    phases: { read: "Datei wird gelesen", unpack: "Arbeitsmappe wird entpackt", parse: "Zeilen werden gelesen", type: "Spalten werden geprüft" },
    cancel: "Abbrechen",
    previewTitle: "{name} laden",
    sheet: "Blatt",
    hiddenSheet: "{name} (ausgeblendet)",
    firstRows: "Die ersten Zeilen",
    someColumns: "Die ersten {shown} von {count} Spalten werden gezeigt; die anderen behalten den erkannten Typ.",
    typeOf: "Typ von {column}",
    types: { string: "Text", number: "Zahl", date: "Datum", boolean: "Ja/Nein" },
    yes: "Ja",
    no: "Nein",
    noRows: "Die Datei enthält keine Zeilen.",
    notesTitle: { one: "{count} Hinweis", other: "{count} Hinweise" },
    apply: "Daten laden",
    loaded: "{name} geladen: {rows}, {columns}",
    stepLoaded: "{name} geladen",
    originalShown: "Die Originaldaten werden gezeigt",
    failed: "{name} konnte nicht geladen werden: {message}",
    refused: "{name} wurde nicht geladen: {message}",
    overLimit: "sie hat mehr als {max} {what} ({key}): eine kleinere Auswahl daraus laden, oder eine Anwendung kann diese Grenze anheben",
    limitWhat: { rows: "Zeilen", columns: "Spalten", fileBytes: "Bytes", importCells: "Werte (Zeilen x Spalten)" },
    sourceLine: "{name}, nur in diesem Browser",
    sourceSheet: "{name}, Blatt „{sheet}“, nur in diesem Browser",
    notes: {
        ENCODING: "Gelesen als {encoding}.",
        SEPARATOR: "Werte getrennt durch {name}.",
        LINES_SKIPPED: { one: "{count} Zeile über den Spaltennamen wurde übersprungen (ein Titelblock).", other: "{count} Zeilen über den Spaltennamen wurden übersprungen (ein Titelblock)." },
        COLUMN_RENAMED: "Die Spalte „{from}“ heißt jetzt „{to}“.",
        COLUMN_UNNAMED: "Spalte {position} hat keinen Namen; sie heißt jetzt „{to}“.",
        COLUMNS_RENAMED_MORE: { one: "{count} weitere Spalte wurde umbenannt.", other: "{count} weitere Spalten wurden umbenannt." },
        COLUMN_DROPPED: "Spalte {position} hat weder Namen noch Werte und wurde weggelassen.",
        COLUMNS_ADDED: { one: "{count} Zeile hat mehr Werte als Spaltennamen; die zusätzlichen Werte stehen in Spalten namens „Column …“.", other: "{count} Zeilen haben mehr Werte als Spaltennamen; die zusätzlichen Werte stehen in Spalten namens „Column …“." },
        ROWS_EMPTY: { one: "{count} leere Zeile wurde weggelassen.", other: "{count} leere Zeilen wurden weggelassen." },
        TEXT_CUT: { one: "{count} Wert mit mehr als {max} Zeichen wurde gekürzt.", other: "{count} Werte mit mehr als {max} Zeichen wurden gekürzt." },
        CHARACTERS_REMOVED: { one: "Aus {count} Wert wurden Steuer- oder Richtungszeichen entfernt.", other: "Aus {count} Werten wurden Steuer- oder Richtungszeichen entfernt." },
        DATE_ORDER: "Datumswerte in „{column}“ wurden als {order} gelesen; die Werte passen zu beidem.",
        VALUES_NOT_CONVERTED: { one: "{count} Wert in „{column}“ lässt sich nicht als {type} lesen und bleibt leer.", other: "{count} Werte in „{column}“ lassen sich nicht als {type} lesen und bleiben leer." },
        JSON_PROPERTY: "Die Zeilen wurden aus „{property}“ gelesen.",
        JSON_FLATTENED: "Verschachtelte Werte wurden zu Spalten mit Punkt im Namen („{example}“).",
        SHEET: "Gelesen wurde das Blatt „{sheet}“.",
        SHEETS: "Gelesen wurde das Blatt „{sheet}“ von {count} Blättern.",
        USED_RANGE: "Der benutzte Bereich des Blatts reicht bis Zeile {usedRow}; die Werte enden in Zeile {lastRow}, die leeren Zeilen darunter wurden übersprungen.",
        ERROR_CELLS: { one: "{count} Zelle enthält einen Excel-Fehler (etwa #NV) und bleibt leer.", other: "{count} Zellen enthalten einen Excel-Fehler (etwa #NV) und bleiben leer." }
    },
    dateOrders: { dmy: "Tag/Monat/Jahr", mdy: "Monat/Tag/Jahr" }
};

/** The import texts of each language. */
export const IMPORT_TEXTS = Object.freeze({ en, de });

/** Merged once per labels object. */
const done = /* @__PURE__ */ new WeakMap();

/**
 * The import texts of the report's language (English for a language of a host's own), a host's own
 * texts (`labels.dataImport`, kept aside by resolveLabels) merged over them.
 * @param {import("./labels.js").UiLabels} labels
 * @returns {ImportTexts}
 */
export function importLabels(labels) {
    const known = done.get(labels);
    if (known) {
        return known;
    }
    const base = Object.hasOwn(IMPORT_TEXTS, labels.lang) ? IMPORT_TEXTS[/** @type {"en" | "de"} */ (labels.lang)] : en;
    const own = /** @type {any} */ (labels)[MENU_TEXTS]?.dataImport;
    const out = /** @type {ImportTexts} */ (mergeLabels(base, own));
    done.set(labels, out);
    return out;
}

/**
 * A reader's note in the report's language: the text of its code with its params (numbers in the
 * locale's digits, a count in its plural form), else the reader's own English message (a plugin's
 * code this version has no text for). Params come from the file: text, never markup.
 * @param {{ code: string, params?: Record<string, unknown>, message?: string }} note
 * @param {ImportTexts} texts
 * @param {{ lang: string, locale: string }} where
 */
export function noteText(note, texts, where) {
    const p = note.params && typeof note.params === "object" ? note.params : {};
    let code = note.code;
    if (code === "COLUMN_RENAMED" && p.from === "") {
        code = "COLUMN_UNNAMED";
    } else if (code === "SHEET" && Number(p.count) > 1) {
        code = "SHEETS";
    }
    const form = Object.hasOwn(texts.notes, code) ? /** @type {any} */ (texts.notes)[code] : null;
    if (!form) {
        return String(note.message ?? code);
    }
    const values = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "number" ? v.toLocaleString(where.locale) : String(v ?? "")]));
    if (code === "DATE_ORDER") {
        values.order = Object.hasOwn(texts.dateOrders, String(p.order)) ? /** @type {any} */ (texts.dateOrders)[String(p.order)] : values.order;
    } else if (code === "VALUES_NOT_CONVERTED") {
        values.type = Object.hasOwn(texts.types, String(p.type)) ? /** @type {any} */ (texts.types)[String(p.type)] : values.type;
    }
    return fill(typeof form === "string" ? form : plural(form, Number(p.count) || 0, where), values);
}

/**
 * Why a file could not be read, after "{name} could not be loaded:", which names the file: a limit of
 * pivotkit-core (`LIMIT_EXCEEDED` with a limit this version has words for) in the report's language
 * with its key (`limits.rows`, whose words fit `importLimits` too), else the reader's own English
 * message without the file's name in front (`"name": ` of `fileError`, `"name" ` of `limitError`).
 * @param {unknown} error
 * @param {string} name  the file's name
 * @param {ImportTexts} texts
 * @param {{ lang: string, locale: string }} where
 */
export function errorText(error, name, texts, where) {
    const e = /** @type {any} */ (error);
    const d = e && typeof e === "object" && e.code === "LIMIT_EXCEEDED" && e.details && typeof e.details === "object" ? e.details : null;
    if (d && typeof d.limit === "string" && Object.hasOwn(texts.limitWhat, d.limit) && typeof d.max === "number") {
        return fill(texts.overLimit, { max: d.max.toLocaleString(where.locale), what: /** @type {any} */ (texts.limitWhat)[d.limit], key: `limits.${d.limit}` });
    }
    const text = messageOf(error);
    for (const prefix of [`"${name}": `, `"${name}" `]) {
        if (text.startsWith(prefix)) {
            return text.slice(prefix.length);
        }
    }
    return text;
}
