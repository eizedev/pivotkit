/*
 * The texts of the UI, in English and German. `labels.core` holds the texts pivotkit-core writes into
 * the table and the chart (totals, blank, value names); the rest belongs to the UI. A host passes a
 * partial object through the `labels` prop; it is merged over the language the locale picks.
 * {name} placeholders are filled by fill().
 */

import { DEFAULT_LABELS } from "pivotkit-core";

/** @typedef {typeof en} UiLabels */

export const en = {
    core: /** @type {import("pivotkit-core").Labels} */ (DEFAULT_LABELS),
    zones: { rows: "Rows", cols: "Columns", values: "Values", filters: "Filters" },
    zoneHints: {
        rows: "Drop fields here to group rows",
        cols: "Drop fields here to group columns",
        values: "Drop numbers here to sum or count them",
        filters: "Drop fields here to filter the whole report"
    },
    fields: "Fields",
    fieldsHint: "Drag a field into Rows, Columns, Values or Filters, or open its menu.",
    searchFields: "Search fields",
    noFieldMatch: "No field matches “{query}”.",
    fieldMenu: "Options for {field}",
    addTo: "Add to {zone}",
    move: "Move",
    moveTo: "Move to {zone}",
    dragHandle: "Drag {field}",
    moveLeft: "Move left",
    moveRight: "Move right",
    remove: "Remove",
    removeField: "Remove {field}",
    types: { string: "Text", number: "Number", date: "Date", boolean: "Yes/No", null: "Empty" },
    inZone: "In {zone}",
    toolbar: "Report toolbar",
    table: "Table",
    chart: "Chart",
    view: "View",
    chartType: "Chart type",
    chartTypes: { bar: "Bars", stacked: "Stacked bars", horizontal: "Horizontal bars", line: "Lines", area: "Area", pie: "Pie", heatmap: "Heatmap" },
    undo: "Undo",
    redo: "Redo",
    reset: "Reset",
    resetHint: "Back to the start view",
    templates: "Templates",
    noTemplates: "No templates yet.",
    loadTemplate: "Load {name}",
    deleteTemplate: "Delete {name}",
    saveTemplate: "Save current view",
    templateName: "Template name",
    save: "Save",
    cancel: "Cancel",
    exportLabel: "Export",
    exportXlsx: "Excel workbook (.xlsx)",
    exportCsv: "CSV file (.csv)",
    exportPng: "Chart image (.png)",
    options: "Options",
    totals: "Totals",
    grandTotalRow: "Grand total row",
    grandTotalColumn: "Grand total column",
    rowSubtotals: "Row subtotals",
    colSubtotals: "Column subtotals",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    expand: "Expand {label}",
    collapse: "Collapse {label}",
    // chip menus
    aggregation: "Summarize by",
    showAs: "Show values as",
    showAsNone: "No calculation",
    showAsNames: {
        percentOfGrandTotal: "% of grand total",
        percentOfRowTotal: "% of row total",
        percentOfColumnTotal: "% of column total",
        percentOfParentRow: "% of parent row",
        percentOfParentColumn: "% of parent column",
        differenceFromPrevious: "Difference from previous",
        percentDifferenceFromPrevious: "% difference from previous",
        runningTotal: "Running total",
        percentRunningTotal: "% running total",
        rankAscending: "Rank, smallest first",
        rankDescending: "Rank, largest first"
    },
    along: "Along",
    format: "Number format",
    formatAuto: "Automatic",
    formats: {
        number: "Number",
        "number:0": "Number, no decimals",
        "number:2": "Number, 2 decimals",
        integer: "Whole number",
        currency: "Currency",
        percent: "Percent",
        compact: "Compact (1.2K)",
        bytes: "Bytes (KB, MB)",
        "duration:h": "Duration from hours",
        "duration:s": "Duration from seconds"
    },
    conditional: "Highlight",
    conditionalNone: "None",
    colorScale: "Colour scale",
    dataBar: "Data bars",
    rename: "Name",
    sort: "Sort",
    sortLabelAsc: "A to Z",
    sortLabelDesc: "Z to A",
    sortValueDesc: "Largest {value} first",
    sortValueAsc: "Smallest {value} first",
    groupBy: "Group dates by",
    groupNone: "No grouping",
    units: {
        year: "Year", quarter: "Quarter", month: "Month", week: "Week", day: "Day", hour: "Hour", weekday: "Weekday",
        yearQuarter: "Year and quarter", yearMonth: "Year and month", yearWeek: "Year and week", bin: "Bins"
    },
    derivedName: "{field} ({unit})",
    binsName: "{field} (by {size})",
    bins: "Group numbers in bins",
    binSize: "Bin size",
    apply: "Apply",
    clear: "Clear",
    topN: "Show only top items",
    topCount: "Count",
    top: "Top",
    bottom: "Bottom",
    by: "by {value}",
    filter: "Filter…",
    filtered: "Filtered",
    filterTitle: "Filter {field}",
    searchValues: "Search values",
    selectAll: "Select all",
    selectNone: "Select none",
    onlyThis: "Only",
    valuesShown: "{shown} of {total} values; search to find more",
    condition: "Label condition",
    conditionNone: "Any label",
    labelOps: { equals: "is", notEquals: "is not", contains: "contains", notContains: "does not contain", beginsWith: "begins with", endsWith: "ends with" },
    conditionValue: "Text",
    selected: "{count} selected",
    // result
    emptyTitle: "Build your report in three steps",
    emptySteps: [
        "Drag a field such as a team or region into Rows.",
        "Drag a number into Values: it is summed, or counted for text.",
        "Add a field to Columns, switch to Chart or export to Excel."
    ],
    emptyFields: "The data has no columns.",
    emptyHint: "Tip: every field also has a menu, and the toolbar has Undo.",
    tryTemplate: "Start with “{name}”",
    error: "The report cannot be shown: {message}",
    tooLarge: "This layout makes {value} cells, more than the limit of {max}. Move a field with many values to Filters, or filter it.",
    issues: "Some parts of the view were not used:",
    loadingChart: "Loading chart…",
    noChartData: "Add a value to see a chart.",
    rowsCount: "{count} rows",
    cellHint: "Click a value to see the rows behind it.",
    // drill-down
    drillTitle: "Rows behind this value",
    drillCount: "{count} rows",
    drillShown: "Showing the first {shown} of {count} rows",
    close: "Close",
    // toasts and live region
    toastRemoved: "{field} removed",
    toastAdded: "{field} added to {zone}",
    toastMoved: "{field} moved to {zone}",
    toastUndone: "Undone",
    toastRedone: "Redone",
    toastReset: "Back to the start view",
    toastExported: "Exported {file}",
    toastSaved: "Template “{name}” saved",
    toastLoaded: "Template “{name}” loaded",
    toastDeleted: "Template “{name}” deleted",
    toastExportFailed: "Export failed: {message}",
    dragInstructions: "To pick up a field, press space or enter. Use the arrow keys to move it to a zone, space or enter to drop it, escape to cancel.",
    dragStart: "Picked up {field}.",
    dragOver: "{field} is over {zone}.",
    dragOverNone: "{field} is not over a zone.",
    dragEnd: "{field} dropped in {zone}.",
    dragCancel: "Dragging {field} was cancelled.",
    panel: "Field list",
    showFields: "Fields",
    hideFields: "Close field list",
    dropToRemove: "Drop here to remove",
    countRows: "Count of rows"
};

export const de = {
    core: /** @type {import("pivotkit-core").Labels} */ ({
        ...DEFAULT_LABELS,
        blank: "(Leer)",
        total: "{label} Ergebnis",
        grandTotal: "Gesamtergebnis",
        values: "Werte",
        valueName: "{agg} von {field}",
        countRows: "Anzahl",
        true: "wahr",
        false: "falsch",
        aggregators: {
            count: "Anzahl",
            countUnique: "Anzahl eindeutig",
            listUnique: "Liste eindeutig",
            sum: "Summe",
            average: "Mittelwert",
            median: "Median",
            min: "Min",
            max: "Max",
            stdev: "StdAbw",
            stdevp: "StdAbwN",
            var: "Varianz",
            varp: "VarianzN",
            first: "Erster",
            last: "Letzter"
        }
    }),
    zones: { rows: "Zeilen", cols: "Spalten", values: "Werte", filters: "Filter" },
    zoneHints: {
        rows: "Felder hierher ziehen, um Zeilen zu gruppieren",
        cols: "Felder hierher ziehen, um Spalten zu gruppieren",
        values: "Zahlen hierher ziehen, um sie zu summieren oder zu zählen",
        filters: "Felder hierher ziehen, um den ganzen Bericht zu filtern"
    },
    fields: "Felder",
    fieldsHint: "Ein Feld in Zeilen, Spalten, Werte oder Filter ziehen oder sein Menü öffnen.",
    searchFields: "Felder suchen",
    noFieldMatch: "Kein Feld passt zu „{query}“.",
    fieldMenu: "Optionen für {field}",
    addTo: "Zu {zone} hinzufügen",
    move: "Verschieben",
    moveTo: "Nach {zone} verschieben",
    dragHandle: "{field} ziehen",
    moveLeft: "Nach links",
    moveRight: "Nach rechts",
    remove: "Entfernen",
    removeField: "{field} entfernen",
    types: { string: "Text", number: "Zahl", date: "Datum", boolean: "Ja/Nein", null: "Leer" },
    inZone: "In {zone}",
    toolbar: "Werkzeugleiste des Berichts",
    table: "Tabelle",
    chart: "Diagramm",
    view: "Ansicht",
    chartType: "Diagrammtyp",
    chartTypes: { bar: "Balken", stacked: "Gestapelte Balken", horizontal: "Liegende Balken", line: "Linien", area: "Fläche", pie: "Kreis", heatmap: "Heatmap" },
    undo: "Rückgängig",
    redo: "Wiederholen",
    reset: "Zurücksetzen",
    resetHint: "Zurück zur Startansicht",
    templates: "Vorlagen",
    noTemplates: "Noch keine Vorlagen.",
    loadTemplate: "{name} laden",
    deleteTemplate: "{name} löschen",
    saveTemplate: "Aktuelle Ansicht speichern",
    templateName: "Name der Vorlage",
    save: "Speichern",
    cancel: "Abbrechen",
    exportLabel: "Exportieren",
    exportXlsx: "Excel-Arbeitsmappe (.xlsx)",
    exportCsv: "CSV-Datei (.csv)",
    exportPng: "Diagramm als Bild (.png)",
    options: "Optionen",
    totals: "Summen",
    grandTotalRow: "Gesamtzeile",
    grandTotalColumn: "Gesamtspalte",
    rowSubtotals: "Teilergebnisse der Zeilen",
    colSubtotals: "Teilergebnisse der Spalten",
    expandAll: "Alle aufklappen",
    collapseAll: "Alle zuklappen",
    expand: "{label} aufklappen",
    collapse: "{label} zuklappen",
    aggregation: "Zusammenfassen mit",
    showAs: "Werte anzeigen als",
    showAsNone: "Keine Berechnung",
    showAsNames: {
        percentOfGrandTotal: "% des Gesamtergebnisses",
        percentOfRowTotal: "% der Zeilensumme",
        percentOfColumnTotal: "% der Spaltensumme",
        percentOfParentRow: "% der übergeordneten Zeile",
        percentOfParentColumn: "% der übergeordneten Spalte",
        differenceFromPrevious: "Differenz zum vorherigen",
        percentDifferenceFromPrevious: "% Differenz zum vorherigen",
        runningTotal: "Laufende Summe",
        percentRunningTotal: "% laufende Summe",
        rankAscending: "Rang, kleinster zuerst",
        rankDescending: "Rang, größter zuerst"
    },
    along: "Entlang",
    format: "Zahlenformat",
    formatAuto: "Automatisch",
    formats: {
        number: "Zahl",
        "number:0": "Zahl ohne Nachkommastellen",
        "number:2": "Zahl mit 2 Nachkommastellen",
        integer: "Ganze Zahl",
        currency: "Währung",
        percent: "Prozent",
        compact: "Kompakt (1,2 Tsd.)",
        bytes: "Bytes (KB, MB)",
        "duration:h": "Dauer aus Stunden",
        "duration:s": "Dauer aus Sekunden"
    },
    conditional: "Hervorheben",
    conditionalNone: "Keine",
    colorScale: "Farbskala",
    dataBar: "Datenbalken",
    rename: "Name",
    sort: "Sortieren",
    sortLabelAsc: "A bis Z",
    sortLabelDesc: "Z bis A",
    sortValueDesc: "Größte {value} zuerst",
    sortValueAsc: "Kleinste {value} zuerst",
    groupBy: "Datum gruppieren nach",
    groupNone: "Keine Gruppierung",
    units: {
        year: "Jahr", quarter: "Quartal", month: "Monat", week: "Woche", day: "Tag", hour: "Stunde", weekday: "Wochentag",
        yearQuarter: "Jahr und Quartal", yearMonth: "Jahr und Monat", yearWeek: "Jahr und Woche", bin: "Bereiche"
    },
    derivedName: "{field} ({unit})",
    binsName: "{field} (je {size})",
    bins: "Zahlen in Bereiche gruppieren",
    binSize: "Bereichsgröße",
    apply: "Anwenden",
    clear: "Löschen",
    topN: "Nur die obersten Einträge",
    topCount: "Anzahl",
    top: "Oberste",
    bottom: "Unterste",
    by: "nach {value}",
    filter: "Filtern…",
    filtered: "Gefiltert",
    filterTitle: "{field} filtern",
    searchValues: "Werte suchen",
    selectAll: "Alle auswählen",
    selectNone: "Keine auswählen",
    onlyThis: "Nur",
    valuesShown: "{shown} von {total} Werten; suchen, um weitere zu finden",
    condition: "Bedingung für die Beschriftung",
    conditionNone: "Jede Beschriftung",
    labelOps: { equals: "ist", notEquals: "ist nicht", contains: "enthält", notContains: "enthält nicht", beginsWith: "beginnt mit", endsWith: "endet mit" },
    conditionValue: "Text",
    selected: "{count} ausgewählt",
    emptyTitle: "Den Bericht in drei Schritten bauen",
    emptySteps: [
        "Ein Feld wie Team oder Region in Zeilen ziehen.",
        "Eine Zahl in Werte ziehen: Sie wird summiert, Text wird gezählt.",
        "Ein Feld in Spalten ziehen, zum Diagramm wechseln oder nach Excel exportieren."
    ],
    emptyFields: "Die Daten haben keine Spalten.",
    emptyHint: "Tipp: Jedes Feld hat auch ein Menü, und die Werkzeugleiste hat Rückgängig.",
    tryTemplate: "Mit „{name}“ beginnen",
    error: "Der Bericht kann nicht angezeigt werden: {message}",
    tooLarge: "Diese Anordnung ergibt {value} Zellen, mehr als die Grenze von {max}. Ein Feld mit vielen Werten nach Filter verschieben oder filtern.",
    issues: "Einige Teile der Ansicht wurden nicht verwendet:",
    loadingChart: "Diagramm wird geladen…",
    noChartData: "Einen Wert hinzufügen, um ein Diagramm zu sehen.",
    rowsCount: "{count} Zeilen",
    cellHint: "Auf einen Wert klicken, um die Zeilen dahinter zu sehen.",
    drillTitle: "Zeilen hinter diesem Wert",
    drillCount: "{count} Zeilen",
    drillShown: "Die ersten {shown} von {count} Zeilen",
    close: "Schließen",
    toastRemoved: "{field} entfernt",
    toastAdded: "{field} zu {zone} hinzugefügt",
    toastMoved: "{field} nach {zone} verschoben",
    toastUndone: "Rückgängig gemacht",
    toastRedone: "Wiederholt",
    toastReset: "Zurück zur Startansicht",
    toastExported: "{file} exportiert",
    toastSaved: "Vorlage „{name}“ gespeichert",
    toastLoaded: "Vorlage „{name}“ geladen",
    toastDeleted: "Vorlage „{name}“ gelöscht",
    toastExportFailed: "Export fehlgeschlagen: {message}",
    dragInstructions: "Leertaste oder Eingabe hebt ein Feld auf. Mit den Pfeiltasten zu einem Bereich bewegen, mit Leertaste oder Eingabe ablegen, mit Escape abbrechen.",
    dragStart: "{field} aufgenommen.",
    dragOver: "{field} ist über {zone}.",
    dragOverNone: "{field} ist über keinem Bereich.",
    dragEnd: "{field} in {zone} abgelegt.",
    dragCancel: "Ziehen von {field} abgebrochen.",
    panel: "Feldliste",
    showFields: "Felder",
    hideFields: "Feldliste schließen",
    dropToRemove: "Zum Entfernen hier ablegen",
    countRows: "Anzahl der Zeilen"
};

/** @type {Readonly<{ en: UiLabels, de: UiLabels }>} */
export const LABELS = Object.freeze({ en, de });

/** Replaces {name} placeholders; unknown names stay as they are. */
export function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(values, name) ? String(values[name]) : all));
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** A deep merge of plain objects; arrays and other values of `over` replace those of `base`. */
function merge(base, over) {
    if (!isObject(over)) {
        return base;
    }
    const out = { ...base };
    for (const key of Object.keys(over)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
            continue;
        }
        out[key] = isObject(base[key]) && isObject(over[key]) ? merge(base[key], over[key]) : over[key];
    }
    return out;
}

/**
 * The labels for a locale: the language of the locale picks en or de (default en), the host's
 * partial labels are merged over them.
 * @param {string | undefined} locale
 * @param {object} [custom]
 * @returns {UiLabels}
 */
export function resolveLabels(locale, custom) {
    const lang = typeof locale === "string" ? locale.toLowerCase().split(/[-_]/)[0] : "en";
    const base = Object.hasOwn(LABELS, lang) ? LABELS[lang] : en;
    return /** @type {UiLabels} */ (merge(base, custom));
}
