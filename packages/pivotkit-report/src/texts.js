/*
 * The words a report writes around the table (English and German): the language of the report's
 * locale picks them, English stands in for any other; a host passes its own as `texts`. The row
 * counts are pivotkit-core's ROW_COUNT_TEXTS, which pivotkit-react's labels share: one form per
 * plural category of the language (countText picks it).
 */

import { ROW_COUNT_TEXTS, pluralForm } from "pivotkit-core";

/**
 * The characters that change the direction of text, as pivotkit-core's import leaves them out: a report
 * writes none of them (HTML, SVG), so no name reads as another one ("invoice\u202Etxt.exe").
 */
export const BIDI_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export const REPORT_TEXTS = Object.freeze({
    en: Object.freeze({
        untitled: "Report",
        source: "Source",
        rows: "Rows",
        rowsCount: ROW_COUNT_TEXTS.en.rowsCount,
        rowsFiltered: ROW_COUNT_TEXTS.en.rowsFiltered,
        // the details' rows under their label when filters leave rows out: no "rows" after "Rows"
        rowsKept: "{shown} of {count}",
        generated: "Generated",
        dataAsOf: "Data as of",
        filters: "Filters",
        noFilters: "None",
        chart: "Chart",
        tableCut: "The table shows the first {shown} of {count} rows. Export it as Excel or CSV for all of them.",
        chartCut: "The chart shows the first {shown} of {count} categories.",
        chartUnavailable: "The chart is left out: ECharts is not available.",
        chartNotInXlsx: "The workbook holds the table. The chart is in html or svg."
    }),
    de: Object.freeze({
        untitled: "Bericht",
        source: "Quelle",
        rows: "Zeilen",
        rowsCount: ROW_COUNT_TEXTS.de.rowsCount,
        rowsFiltered: ROW_COUNT_TEXTS.de.rowsFiltered,
        rowsKept: "{shown} von {count}",
        generated: "Erstellt",
        dataAsOf: "Datenstand",
        filters: "Filter",
        noFilters: "Keine",
        chart: "Diagramm",
        tableCut: "Die Tabelle zeigt die ersten {shown} von {count} Zeilen. Für alle als Excel oder CSV exportieren.",
        chartCut: "Das Diagramm zeigt die ersten {shown} von {count} Kategorien.",
        chartUnavailable: "Das Diagramm fehlt: ECharts ist nicht verfügbar.",
        chartNotInXlsx: "Die Arbeitsmappe enthält die Tabelle. Das Diagramm gibt es als html oder svg."
    })
});

/** @typedef {typeof REPORT_TEXTS.en} ReportTexts */

/**
 * A count's words: one text per Intl.PluralRules category, at least `other` ({ one: "{count} row",
 * other: "{count} rows" }).
 * @typedef {Readonly<{ zero?: string, one?: string, two?: string, few?: string, many?: string, other: string }>} CountForms
 */

/**
 * The texts a host passes as `texts`: each a text, and a count also its forms. A count given as one
 * text is that text for every count.
 * @typedef {{ [K in keyof ReportTexts]?: ReportTexts[K] extends string ? string : string | CountForms }} ReportTextsInput
 */

/** A host's count as forms: a text is that text for every count; forms need a text for `other` (pluralForm ignores a form that is no text). */
const formsOf = (value) => (typeof value === "string" ? { other: value } : typeof value?.other === "string" ? value : null);

/**
 * The texts for a locale, the host's over them, and the language whose plural rules pick a count's
 * form: the report's own for a host's count, else that of the built-in texts (a French report takes
 * the English texts and their forms).
 * @param {string} locale
 * @param {ReportTextsInput} [own]
 * @returns {ReportTexts & { countLang: Readonly<Record<string, string>> }}
 */
export function textsFor(locale, own = {}) {
    const lang = String(locale).split("-")[0].toLowerCase();
    const textsLang = Object.hasOwn(REPORT_TEXTS, lang) ? lang : "en";
    const base = REPORT_TEXTS[/** @type {"en" | "de"} */ (textsLang)];
    /** @type {any} */
    const out = { ...base };
    /** @type {Record<string, string>} */
    const countLang = { rowsCount: textsLang, rowsFiltered: textsLang };
    for (const [key, value] of Object.entries(own ?? {})) {
        if (!Object.hasOwn(base, key)) {
            continue;
        }
        if (typeof base[key] === "string") {
            if (typeof value === "string") {
                out[key] = value;
            }
        } else {
            const forms = formsOf(value);
            if (forms) {
                out[key] = forms;
                countLang[key] = lang;
            }
        }
    }
    return { ...out, countLang };
}

/**
 * A count in words: pivotkit-core's pluralForm of `forms` for `count` in `lang`, with `values`
 * filled in.
 * @param {CountForms} forms
 * @param {number} count  picks the form
 * @param {string} lang
 * @param {Record<string, string | number>} values
 */
export const countText = (forms, count, lang, values) => fill(pluralForm(forms, count, lang), values);

/** "{count} rows" with its values. */
export const fill = (text, values) => text.replace(/\{(\w+)\}/g, (m, key) => (Object.hasOwn(values, key) ? String(values[key]) : m));
