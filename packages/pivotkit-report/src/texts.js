/*
 * The words a report writes around the table (English and German): the language of the report's
 * locale picks them, English stands in for any other; a host passes its own as `texts`.
 */

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
        rowsCount: "{count} rows",
        generated: "Generated",
        filters: "Filters",
        noFilters: "None",
        chart: "Chart",
        tableCut: "The table shows the first {shown} of {count} rows. Export it as Excel or CSV for all of them.",
        chartCut: "The chart shows the first {shown} of {count} categories.",
        chartUnavailable: "The chart is left out: ECharts is not available."
    }),
    de: Object.freeze({
        untitled: "Bericht",
        source: "Quelle",
        rows: "Zeilen",
        rowsCount: "{count} Zeilen",
        generated: "Erstellt",
        filters: "Filter",
        noFilters: "Keine",
        chart: "Diagramm",
        tableCut: "Die Tabelle zeigt die ersten {shown} von {count} Zeilen. Für alle als Excel oder CSV exportieren.",
        chartCut: "Das Diagramm zeigt die ersten {shown} von {count} Kategorien.",
        chartUnavailable: "Das Diagramm fehlt: ECharts ist nicht verfügbar."
    })
});

/** @typedef {typeof REPORT_TEXTS.en} ReportTexts */

/**
 * The texts for a locale, the host's over them.
 * @param {string} locale
 * @param {Partial<ReportTexts>} [own]
 * @returns {ReportTexts}
 */
export function textsFor(locale, own = {}) {
    const lang = String(locale).split("-")[0].toLowerCase();
    const base = Object.hasOwn(REPORT_TEXTS, lang) ? REPORT_TEXTS[lang] : REPORT_TEXTS.en;
    /** @type {any} */
    const out = { ...base };
    for (const [key, value] of Object.entries(own ?? {})) {
        if (Object.hasOwn(base, key) && typeof value === "string") {
            out[key] = value;
        }
    }
    return out;
}

/** "{count} rows" with its values. */
export const fill = (text, values) => text.replace(/\{(\w+)\}/g, (m, key) => (Object.hasOwn(values, key) ? String(values[key]) : m));
