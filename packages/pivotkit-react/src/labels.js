/*
 * The texts of the UI, in English and German. `labels.core` holds the texts pivotkit-core writes into
 * the table and the chart (totals, blank, value names); the rest belongs to the UI. A host passes a
 * partial object through the `labels` prop; it is merged over the language the locale picks (a whole
 * object for a language of its own, with its `lang`). Entries of the wrong type are ignored.
 * {name} placeholders are filled by fill().
 */

import { DEFAULT_LABELS } from "pivotkit-core";

/** @typedef {typeof en} UiLabels */

export const en = {
    /** the language of the texts, for the report's lang attribute */
    lang: "en",
    /** the name of the report's region landmark */
    report: "Pivot report",
    core: /** @type {import("pivotkit-core").Labels} */ ({
        ...DEFAULT_LABELS,
        aggregators: {
            count: "Count",
            countUnique: "Distinct count",
            listUnique: "List of distinct values",
            sum: "Sum",
            average: "Average",
            median: "Median",
            min: "Minimum",
            max: "Maximum",
            stdev: "Standard deviation (sample)",
            stdevp: "Standard deviation (population)",
            var: "Variance (sample)",
            varp: "Variance (population)",
            first: "First value",
            last: "Last value"
        }
    }),
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
    inZone: "in {zone}",
    // screen reader text after a chip's name
    stateFiltered: "filtered",
    stateSorted: "sorted {order}",
    toolbar: "Report toolbar",
    table: "Table",
    chart: "Chart",
    view: "View",
    chartType: "Chart type",
    chartTypeIs: "Chart type: {type}",
    chartTypes: { bar: "Bars", stacked: "Stacked bars", horizontal: "Horizontal bars", line: "Lines", area: "Area", pie: "Pie", heatmap: "Heatmap" },
    undo: "Undo",
    redo: "Redo",
    reset: "Reset",
    resetHint: "Back to the start view",
    swap: "Swap rows and columns",
    more: "More",
    templates: "Templates",
    noTemplates: "No templates yet.",
    loadTemplate: "Load {name}",
    deleteTemplate: "Delete {name}",
    deleteConfirm: "Delete “{name}”?",
    deleteAction: "Delete",
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
    moreStatistics: "More statistics",
    showAs: "Show as",
    showAsNone: "The value itself",
    moreCalculations: "More calculations",
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
    sortOldest: "Oldest first",
    sortNewest: "Newest first",
    sortValueDesc: "Largest {value} first",
    sortValueAsc: "Smallest {value} first",
    groupBy: "Group dates by",
    groupNone: "No grouping (every date and time)",
    groupTimeline: "Along the time line",
    groupCyclic: "Compare periods across years",
    units: {
        year: "Year", yearQuarter: "Quarter", yearMonth: "Month", yearWeek: "Week", day: "Day",
        quarter: "Quarter of year", month: "Month of year", week: "Week of year", weekday: "Weekday", hour: "Hour of day",
        bin: "Ranges"
    },
    unitHints: {
        year: "2025", yearQuarter: "Q1 2025", yearMonth: "Jan 2025", yearWeek: "2025-W03", day: "Jan 15, 2025",
        quarter: "Q1 of every year", month: "Jan of every year", week: "W03 of every year", weekday: "Mon to Sun", hour: "00:00 to 23:00",
        bin: ""
    },
    derivedName: "{field} ({unit})",
    binsName: "{field} (by {size})",
    bins: "Group numbers into ranges",
    binSize: "Range size",
    apply: "Apply",
    clear: "Clear",
    topN: "Show only the top items",
    topCount: "Count",
    top: "Top",
    bottom: "Bottom",
    topBadge: "Top {count}",
    bottomBadge: "Bottom {count}",
    topNote: "{field} shows the top {count} only: totals and percentages cover these items, not all of them.",
    bottomNote: "{field} shows the bottom {count} only: totals and percentages cover these items, not all of them.",
    by: "by {value}",
    filter: "Filter…",
    filtered: "Filtered",
    filterSummary: "{shown} of {total}",
    filterTitle: "Filter {field}",
    searchValues: "Search values",
    selectAll: "Select all",
    selectNone: "Select none",
    onlyThis: "Only",
    valuesShown: "{shown} of {total} values; search to find more",
    condition: "Text condition",
    conditionNone: "No condition",
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
    noValuesHint: "Add a number to Values to see sums or counts next to the labels.",
    error: "The report cannot be shown: {message}",
    tooLarge: "This layout makes {value} cells, more than the limit of {max}. Move a field with many values to Filters, or filter it.",
    issues: "Some parts of the view were not used:",
    loadingChart: "Loading chart…",
    noChartData: "Add a value to see a chart.",
    // a count in words: one form per Intl.PluralRules category of the language ("one", "other", ...)
    rowsCount: { one: "{count} row", other: "{count} rows" },
    tableName: "Pivot table",
    cellHint: "Click a value, or press Enter on it, to see the rows behind it. The arrow keys move between values.",
    // chart
    chartSummary: "{type}: {values} by {categories}.",
    chartCounts: "{categories}, {series}.",
    chartCategories: { one: "{count} category", other: "{count} categories" },
    chartSeries: { one: "{count} series", other: "{count} series" },
    chartExtremes: "Highest {max} at {maxAt}; lowest {min} at {minAt}.",
    chartTableHint: "Switch to Table to read every value.",
    chartManySeries: "{count} series are hard to tell apart. Swap rows and columns, or filter Columns to fewer items.",
    chartDatesOnColumns: "The dates are on Columns, so each date is a line of its own. Swap rows and columns to draw the dates along the axis.",
    chartCapped: "Showing the first {shown} of {total} categories. Add a filter or Top N to choose them.",
    categories: "categories",
    // drill-down
    drillTitle: "Rows behind this value",
    drillCount: { one: "{count} row", other: "{count} rows" },
    drillShown: "Showing the first {shown} of {count} rows",
    close: "Close",
    // toasts and live region
    toastRemoved: "{field} removed",
    toastUndone: "Undone: {step}",
    toastRedone: "Redone: {step}",
    toastReset: "Back to the start view",
    toastExported: "Exported {file}",
    toastSaved: "Template “{name}” saved",
    toastLoaded: "Template “{name}” loaded",
    toastDeleted: "Template “{name}” deleted",
    toastExportFailed: "Export failed: {message}",
    toastSaveFailed: "The template could not be saved: {message}",
    toastDeleteFailed: "The template could not be deleted: {message}",
    // the host refused without saying why (a rejected promise without a message)
    toastSaveRejected: "The server could not save the template.",
    toastDeleteRejected: "The server could not delete the template.",
    // what an undo step was, for "Undone: ..."
    steps: {
        added: "{field} added to {zone}",
        removed: "{field} removed",
        moved: "{field} moved to {zone}",
        reordered: "order in {zone}",
        sort: "sort of {field}",
        group: "grouping of {field}",
        filter: "filter on {field}",
        top: "top items of {field}",
        value: "settings of {field}",
        display: "switch to {display}",
        chart: "chart type {type}",
        totals: "totals",
        collapse: "expand and collapse",
        swap: "rows and columns swapped",
        template: "template “{name}”",
        reset: "back to the start view",
        outside: "change from outside the report",
        change: "last change"
    },
    dragInstructions: "To pick up a field, press space or enter. The left and right arrow keys move it within a zone, up and down to the zone above or below. Press space or enter to drop it, escape to cancel. Every field and chip also has a menu with the same moves.",
    dragStart: "Picked up {field}.",
    dragOverAt: "{field} is over {zone}, position {position} of {count}.",
    dragOverEnd: "{field} is over {zone}, at the end.",
    dragOverNone: "{field} is not over a zone.",
    dragEndAt: "{field} dropped in {zone}, position {position} of {count}.",
    dragEndEnd: "{field} dropped at the end of {zone}.",
    dragRemove: "{field} is over the field list: drop to remove it.",
    dragCancel: "Dragging {field} was cancelled.",
    panel: "Field list",
    showFields: "Fields",
    hideFields: "Close field list",
    dropToRemove: "Drop here to remove"
};

export const de = {
    lang: "de",
    report: "Pivot-Bericht",
    core: /** @type {import("pivotkit-core").Labels} */ ({
        ...DEFAULT_LABELS,
        blank: "(Leer)",
        total: "{label} gesamt",
        grandTotal: "Gesamtergebnis",
        values: "Werte",
        valueName: "{agg} von {field}",
        countRows: "Anzahl",
        true: "wahr",
        false: "falsch",
        aggregators: {
            count: "Anzahl",
            countUnique: "Anzahl verschiedener Werte",
            listUnique: "Liste verschiedener Werte",
            sum: "Summe",
            average: "Durchschnitt",
            median: "Median",
            min: "Minimum",
            max: "Maximum",
            stdev: "Standardabweichung (Stichprobe)",
            stdevp: "Standardabweichung (Grundgesamtheit)",
            var: "Varianz (Stichprobe)",
            varp: "Varianz (Grundgesamtheit)",
            first: "Erster Wert",
            last: "Letzter Wert"
        },
        showAsName: "{showAs} von {value}",
        showAs: {
            percentOfGrandTotal: "% des Gesamtergebnisses",
            percentOfRowTotal: "% der Zeilensumme",
            percentOfColumnTotal: "% der Spaltensumme",
            percentOfParentRow: "% der übergeordneten Zeile",
            percentOfParentColumn: "% der übergeordneten Spalte",
            differenceFromPrevious: "Differenz zum vorherigen",
            percentDifferenceFromPrevious: "% Differenz zum vorherigen",
            runningTotal: "Laufende Summe",
            percentRunningTotal: "% laufende Summe",
            rankAscending: "Rang (kleinster zuerst)",
            rankDescending: "Rang (größter zuerst)"
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
    inZone: "in {zone}",
    stateFiltered: "gefiltert",
    stateSorted: "sortiert {order}",
    toolbar: "Werkzeugleiste des Berichts",
    table: "Tabelle",
    chart: "Diagramm",
    view: "Ansicht",
    chartType: "Diagrammtyp",
    chartTypeIs: "Diagrammtyp: {type}",
    chartTypes: { bar: "Balken", stacked: "Gestapelte Balken", horizontal: "Liegende Balken", line: "Linien", area: "Fläche", pie: "Kreis", heatmap: "Heatmap" },
    undo: "Rückgängig",
    redo: "Wiederholen",
    reset: "Zurücksetzen",
    resetHint: "Zurück zur Startansicht",
    swap: "Zeilen und Spalten tauschen",
    more: "Mehr",
    templates: "Vorlagen",
    noTemplates: "Noch keine Vorlagen.",
    loadTemplate: "{name} laden",
    deleteTemplate: "{name} löschen",
    deleteConfirm: "„{name}“ löschen?",
    deleteAction: "Löschen",
    saveTemplate: "Aktuelle Ansicht speichern",
    templateName: "Name der Vorlage",
    save: "Speichern",
    cancel: "Abbrechen",
    exportLabel: "Export",
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
    moreStatistics: "Weitere Statistiken",
    showAs: "Anzeigen als",
    showAsNone: "Der Wert selbst",
    moreCalculations: "Weitere Berechnungen",
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
    sortOldest: "Älteste zuerst",
    sortNewest: "Neueste zuerst",
    sortValueDesc: "Größte {value} zuerst",
    sortValueAsc: "Kleinste {value} zuerst",
    groupBy: "Datum gruppieren nach",
    groupNone: "Keine Gruppierung (jedes Datum mit Uhrzeit)",
    groupTimeline: "Entlang der Zeitachse",
    groupCyclic: "Zeiträume über Jahre vergleichen",
    units: {
        year: "Jahr", yearQuarter: "Quartal", yearMonth: "Monat", yearWeek: "Woche", day: "Tag",
        quarter: "Quartal im Jahr", month: "Monat im Jahr", week: "Woche im Jahr", weekday: "Wochentag", hour: "Stunde am Tag",
        bin: "Bereiche"
    },
    unitHints: {
        year: "2025", yearQuarter: "Q1 2025", yearMonth: "Jan. 2025", yearWeek: "2025-W03", day: "15.01.2025",
        quarter: "Q1 jedes Jahres", month: "Jan. jedes Jahres", week: "W03 jedes Jahres", weekday: "Mo. bis So.", hour: "00:00 bis 23:00",
        bin: ""
    },
    derivedName: "{field} ({unit})",
    binsName: "{field} (je {size})",
    bins: "Zahlen in Bereiche gruppieren",
    binSize: "Bereichsgröße",
    apply: "Anwenden",
    clear: "Löschen",
    topN: "Nur die obersten Einträge zeigen",
    topCount: "Anzahl",
    top: "Oberste",
    bottom: "Unterste",
    topBadge: "Top {count}",
    bottomBadge: "Letzte {count}",
    topNote: "{field} zeigt nur die obersten {count}: Summen und Prozente beziehen sich auf diese Einträge, nicht auf alle.",
    bottomNote: "{field} zeigt nur die untersten {count}: Summen und Prozente beziehen sich auf diese Einträge, nicht auf alle.",
    by: "nach {value}",
    filter: "Filtern…",
    filtered: "Gefiltert",
    filterSummary: "{shown} von {total}",
    filterTitle: "{field} filtern",
    searchValues: "Werte suchen",
    selectAll: "Alle auswählen",
    selectNone: "Keine auswählen",
    onlyThis: "Nur",
    valuesShown: "{shown} von {total} Werten; suchen, um weitere zu finden",
    condition: "Textbedingung",
    conditionNone: "Keine Bedingung",
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
    noValuesHint: "Eine Zahl in Werte ziehen, um neben den Beschriftungen Summen oder Anzahlen zu sehen.",
    error: "Der Bericht kann nicht angezeigt werden: {message}",
    tooLarge: "Diese Anordnung ergibt {value} Zellen, mehr als die Grenze von {max}. Ein Feld mit vielen Werten nach Filter verschieben oder filtern.",
    issues: "Einige Teile der Ansicht wurden nicht verwendet:",
    loadingChart: "Diagramm wird geladen…",
    noChartData: "Einen Wert hinzufügen, um ein Diagramm zu sehen.",
    rowsCount: { one: "{count} Zeile", other: "{count} Zeilen" },
    tableName: "Pivot-Tabelle",
    cellHint: "Auf einen Wert klicken oder darauf Eingabe drücken, um die Zeilen dahinter zu sehen. Die Pfeiltasten wechseln zwischen den Werten.",
    chartSummary: "{type}: {values} nach {categories}.",
    chartCounts: "{categories}, {series}.",
    chartCategories: { one: "{count} Kategorie", other: "{count} Kategorien" },
    chartSeries: { one: "{count} Reihe", other: "{count} Reihen" },
    chartExtremes: "Höchster Wert {max} bei {maxAt}; niedrigster {min} bei {minAt}.",
    chartTableHint: "Zur Tabelle wechseln, um jeden Wert zu lesen.",
    chartManySeries: "{count} Reihen sind schwer zu unterscheiden. Zeilen und Spalten tauschen oder Spalten auf weniger Einträge filtern.",
    chartDatesOnColumns: "Die Daten liegen in Spalten, so wird jedes Datum eine eigene Linie. Zeilen und Spalten tauschen, um die Daten entlang der Achse zu zeichnen.",
    chartCapped: "Die ersten {shown} von {total} Kategorien. Mit einem Filter oder „Nur die obersten Einträge“ auswählen.",
    categories: "Kategorien",
    drillTitle: "Zeilen hinter diesem Wert",
    drillCount: { one: "{count} Zeile", other: "{count} Zeilen" },
    drillShown: "Die ersten {shown} von {count} Zeilen",
    close: "Schließen",
    toastRemoved: "{field} entfernt",
    toastUndone: "Rückgängig: {step}",
    toastRedone: "Wiederholt: {step}",
    toastReset: "Zurück zur Startansicht",
    toastExported: "{file} exportiert",
    toastSaved: "Vorlage „{name}“ gespeichert",
    toastLoaded: "Vorlage „{name}“ geladen",
    toastDeleted: "Vorlage „{name}“ gelöscht",
    toastExportFailed: "Export fehlgeschlagen: {message}",
    toastSaveFailed: "Die Vorlage konnte nicht gespeichert werden: {message}",
    toastDeleteFailed: "Die Vorlage konnte nicht gelöscht werden: {message}",
    toastSaveRejected: "Der Server konnte die Vorlage nicht speichern.",
    toastDeleteRejected: "Der Server konnte die Vorlage nicht löschen.",
    steps: {
        added: "{field} zu {zone} hinzugefügt",
        removed: "{field} entfernt",
        moved: "{field} nach {zone} verschoben",
        reordered: "Reihenfolge in {zone}",
        sort: "Sortierung von {field}",
        group: "Gruppierung von {field}",
        filter: "Filter auf {field}",
        top: "oberste Einträge von {field}",
        value: "Einstellungen von {field}",
        display: "Wechsel zu {display}",
        chart: "Diagrammtyp {type}",
        totals: "Summen",
        collapse: "Auf- und Zuklappen",
        swap: "Zeilen und Spalten getauscht",
        template: "Vorlage „{name}“",
        reset: "zurück zur Startansicht",
        outside: "Änderung von außerhalb des Berichts",
        change: "letzte Änderung"
    },
    dragInstructions: "Leertaste oder Eingabe hebt ein Feld auf. Die Pfeiltasten links und rechts bewegen es innerhalb eines Bereichs, hoch und runter in den Bereich darüber oder darunter. Mit Leertaste oder Eingabe ablegen, mit Escape abbrechen. Jedes Feld und jeder Chip hat auch ein Menü mit denselben Schritten.",
    dragStart: "{field} aufgenommen.",
    dragOverAt: "{field} ist über {zone}, Position {position} von {count}.",
    dragOverEnd: "{field} ist über {zone}, am Ende.",
    dragOverNone: "{field} ist über keinem Bereich.",
    dragEndAt: "{field} in {zone} abgelegt, Position {position} von {count}.",
    dragEndEnd: "{field} am Ende von {zone} abgelegt.",
    dragRemove: "{field} ist über der Feldliste: Ablegen entfernt es.",
    dragCancel: "Ziehen von {field} abgebrochen.",
    panel: "Feldliste",
    showFields: "Felder",
    hideFields: "Feldliste schließen",
    dropToRemove: "Zum Entfernen hier ablegen"
};

/** @type {Readonly<{ en: UiLabels, de: UiLabels }>} */
export const LABELS = Object.freeze({ en, de });

/**
 * Partial labels a host passes: any entry of UiLabels, nested objects partial too.
 * @typedef {{ [K in keyof UiLabels]?: UiLabels[K] extends string | string[] ? UiLabels[K] : Partial<UiLabels[K]> }} PartialLabels
 */

/** The message of a thrown value, for a note. */
export function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * The note for a host's callback that threw or rejected: `withMessage` with the host's own message
 * when it gave one (an Error, a text, an object with a `message` text), else `withoutMessage`.
 * @param {string} withMessage  with {message}
 * @param {string} withoutMessage
 * @param {unknown} error
 */
export function hostFailure(withMessage, withoutMessage, error) {
    const raw = typeof error === "string" ? error : error !== null && typeof error === "object" && typeof (/** @type {any} */ (error).message) === "string" ? /** @type {any} */ (error).message : "";
    const message = raw.trim();
    return message ? fill(withMessage, { message }) : withoutMessage;
}

/** Replaces {name} placeholders; unknown names stay as they are. */
export function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(values, name) ? String(values[name]) : all));
}

/** The categories of Intl.PluralRules: the keys a count label may have. */
const PLURAL_CATEGORIES = Object.freeze(["zero", "one", "two", "few", "many", "other"]);

/**
 * A count in words: the form of `forms` for the plural category of `count` in the labels' language
 * (Intl.PluralRules), `other` when that form is missing, with {count} filled in the locale's digits.
 * @param {Partial<Record<string, string>>} forms  e.g. { one: "{count} row", other: "{count} rows" }
 * @param {number} count
 * @param {{ lang: string, locale: string }} options
 */
export function plural(forms, count, { lang, locale }) {
    let category = "other";
    try {
        category = new Intl.PluralRules(lang).select(count);
    } catch {
        // a language tag Intl does not take: the "other" form
    }
    const form = typeof forms[category] === "string" ? forms[category] : forms.other;
    return fill(form ?? "", { count: count.toLocaleString(locale) });
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isTextList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * A deep merge of `over` into `base` that keeps the shape of `base`: an entry replaces one of the same
 * kind only (text by text, a list of texts by a list of texts, an object is merged), so a wrong type
 * in a host's labels cannot break the UI. Keys `base` does not have are ignored.
 */
function merge(base, over) {
    if (!isObject(over)) {
        return base;
    }
    const out = { ...base };
    // a count label takes every plural form a language has, also those English lacks ("few", "many")
    const keys = Object.hasOwn(base, "other") && Object.keys(base).every((k) => PLURAL_CATEGORIES.includes(k)) ? PLURAL_CATEGORIES : Object.keys(base);
    for (const key of keys) {
        if (!Object.hasOwn(over, key)) {
            continue;
        }
        const was = base[key] ?? "";
        const now = over[key];
        if (isObject(was)) {
            out[key] = merge(was, now);
        } else if (Array.isArray(was)) {
            out[key] = isTextList(now) && now.length > 0 ? now : was;
        } else if (typeof now === typeof was) {
            out[key] = now;
        }
    }
    return out;
}

/**
 * The labels for a locale: the language of the locale picks en or de (default en), the host's
 * partial labels are merged over them.
 * @param {string | undefined} locale
 * @param {PartialLabels | object} [custom]
 * @returns {UiLabels}
 */
export function resolveLabels(locale, custom) {
    const lang = typeof locale === "string" ? locale.toLowerCase().split(/[-_]/)[0] : "en";
    const base = Object.hasOwn(LABELS, lang) ? LABELS[lang] : en;
    return /** @type {UiLabels} */ (merge(base, custom));
}
