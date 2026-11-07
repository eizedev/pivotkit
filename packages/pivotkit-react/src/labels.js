/*
 * The texts of the UI, in English and German. `labels.core` holds the texts pivotkit-core writes into
 * the table and the chart (totals, blank, value names); the rest belongs to the UI. A host passes a
 * partial object through the `labels` prop; it is merged over the language the locale picks (a whole
 * object for a language of its own, with its `lang`). Entries of the wrong type are ignored.
 * {name} placeholders are filled by fill(). The texts only the menus show are in menu-labels.js and
 * load with them; a host's entries for them are kept here and win there.
 */

import { DEFAULT_LABELS, PivotkitError } from "pivotkit-core";

/**
 * Every text of the UI: these and the menus' (menu-labels.js, loaded with the menus; a type import
 * only, so they stay out of the first load).
 * @typedef {typeof en & import("./menu-labels.js").MenuTexts} UiLabels
 */

export const en = {
    /** the language of the texts, for the report's lang attribute */
    lang: "en",
    /** the name of the report's region landmark */
    report: "Pivot report",
    core: /** @type {import("pivotkit-core").Labels} */ ({
        ...DEFAULT_LABELS,
        // a yes/no field in the table, the filter list and the drill-down: words, not true/false
        true: "Yes",
        false: "No",
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
    // the field list's keys, for screen readers (the list is one stop of the Tab order)
    fieldListKeys: "Arrow keys up and down move between the fields, left and right to a field's grip, its i and its menu. Enter adds the field, Shift+F10 opens its menu.",
    noFieldMatch: "No field matches “{query}”.",
    fieldMenu: "Options for {field}",
    addTo: "Add to {zone}",
    // a click on a field that is in its zone already: said in the status line
    alreadyIn: "{field} is already in {zone}",
    move: "Move",
    moveTo: "Move to {zone}",
    dragHandle: "Drag {field}",
    dragIntoZone: "Drag into a zone",
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
    chartTypes: { auto: "Automatic", bar: "Bars", stacked: "Stacked bars", horizontal: "Horizontal bars", line: "Lines", area: "Area", pie: "Pie", donut: "Donut", heatmap: "Heatmap" },
    undo: "Undo",
    redo: "Redo",
    reset: "Reset",
    resetHint: "Back to the start view",
    swap: "Swap rows and columns",
    // the zones folded into one line (compact layout), and the toolbar button that does it (pressed: open)
    layout: "Layout",
    showLayout: "Show field layout",
    layoutEmpty: "No fields placed yet",
    more: "More",
    // the Views menu: the saved views (the host's templates) and sharing
    views: "Views",
    exportLabel: "Export",
    options: "Options",
    totals: "Totals",
    grandTotalRow: "Grand total row",
    grandTotalColumn: "Grand total column",
    rowSubtotals: "Row subtotals",
    colSubtotals: "Column subtotals",
    expand: "Expand {label}",
    collapse: "Collapse {label}",
    showAs: "Show as",
    sort: "Sort",
    sortLabelAsc: "A to Z",
    sortLabelDesc: "Z to A",
    sortCustom: "Custom order",
    sortCustomDesc: "Custom order, reversed",
    sortValueDesc: "Largest {value} first",
    sortValueAsc: "Smallest {value} first",
    units: {
        year: "Year", yearQuarter: "Quarter", yearMonth: "Month", yearWeek: "Week", day: "Day",
        quarter: "Quarter of year", month: "Month of year", week: "Week of year", weekday: "Weekday", hour: "Hour of day",
        bin: "Ranges"
    },
    // a date grouping's name: "Date by month"; the unit as it reads inside it (unitInName)
    derivedName: "{field} by {unit}",
    unitInName: {
        year: "year", yearQuarter: "quarter", yearMonth: "month", yearWeek: "week", day: "day",
        quarter: "quarter of year", month: "month of year", week: "week of year", weekday: "weekday", hour: "hour of day",
        bin: "ranges"
    },
    binsName: "{field} (by {size})",
    top: "Top",
    topBadge: "Top {count}",
    bottomBadge: "Bottom {count}",
    by: "by {value}",
    filter: "Filter…",
    filtered: "Filtered",
    filterSummary: "{shown} of {total}",
    filterTitle: "Filter {field}",
    // the condition on the labels of a field: text, or a number's label
    condition: "Text condition",
    labelOps: { equals: "is", notEquals: "is not", contains: "contains", notContains: "does not contain", beginsWith: "begins with", endsWith: "ends with" },
    // result
    emptyTitle: "Build your report in three steps",
    emptySteps: [
        "Drag a field such as a team or region into Rows.",
        "Drag a number into Values: it is summed, or counted for text.",
        "Add a field to Columns, switch to Chart or export to Excel."
    ],
    emptyFields: "The data has no columns.",
    tryView: "Start with “{name}”",
    error: "The report cannot be shown: {message}",
    tooLarge: "This layout makes {value} cells, more than the limit of {max}. Move a field with many values to Filters, or filter it.",
    tooManyGroups: "This layout makes more than {max} groups of rows and columns. Remove a field with many values from Rows or Columns, or filter it.",
    tooManyCells: "This layout makes more than {max} cells with its subtotals. Remove a field from Rows or Columns, or filter it.",
    tooManyRows: "The data has {value} rows, more than the limit of {max}.",
    tooMuchWork: "This layout needs {value} cell updates, more than the limit of {max}. Remove a field from Rows or Columns, or a value such as a median or a unique count.",
    zoneFull: "{zone} holds at most {max} fields. Remove one first.",
    viewTrimmed: "“{name}” has more than {max} fields in {zone}; the report shows the first {max}.",
    issues: "Some parts of the view were not used:",
    dismissIssues: "Dismiss",
    loadingChart: "Loading chart…",
    noChartData: "Add a value to see a chart.",
    // a count in words: one form per Intl.PluralRules category of the language ("one", "other", ...)
    rowsCount: { one: "{count} row", other: "{count} rows" },
    tableName: "Pivot table",
    emptyCell: "No rows",
    emptyValue: "No value",
    rowLabel: "Row: {label}",
    // chart
    chartSummary: "{type}: {values} by {categories}.",
    chartCounts: "{categories}, {series}.",
    chartCategories: { one: "{count} category", other: "{count} categories" },
    chartSeries: { one: "{count} series", other: "{count} series" },
    chartExtremes: "Highest {max} at {maxAt}; lowest {min} at {minAt}.",
    // the last sentence of the chart's text alternative
    chartTableHint: "Switch to Table to read every value.",
    categories: "categories",
    close: "Close",
    // toasts and live region
    toastRemoved: "{field} removed",
    toastUndone: "Undone: {step}",
    toastRedone: "Redone: {step}",
    toastReset: "Back to the start view",
    toastExported: "Exported {file}",
    toastSaved: "View “{name}” saved",
    toastLoaded: "View “{name}” loaded",
    toastDeleted: "View “{name}” deleted",
    toastExportFailed: "Export failed: {message}",
    toastSaveFailed: "The view could not be saved: {message}",
    toastDeleteFailed: "The view could not be deleted: {message}",
    // the host refused without saying why (a rejected promise without a message)
    toastSaveRejected: "The server could not save the view.",
    toastDeleteRejected: "The server could not delete the view.",
    // what an undo step was, for "Undone: ..."
    steps: {
        added: "{field} added to {zone}",
        removed: "{field} removed",
        moved: "{field} moved to {zone}",
        reordered: "order in {zone}",
        sort: "sort of {field}",
        group: "grouping of {field}",
        filter: "filter on {field}",
        filtersRemoved: "filters removed",
        top: "top items of {field}",
        value: "settings of {field}",
        display: "switch to {display}",
        chart: "chart type {type}",
        totals: "totals",
        collapse: "expand and collapse",
        swap: "rows and columns swapped",
        template: "view “{name}”",
        reset: "back to the start view",
        outside: "change from outside the report",
        viewLoaded: "view loaded",
        chartDisplay: "chart display",
        change: "last change"
    },
    // tips above the result (tips.js): when each shows is in the TIPS table
    tips: {
        filterEmpty: "Nothing matches the filter. Remove it, or choose other items.",
        top: "{field} shows the top {count} only: totals and percentages cover these items, not all of them.",
        bottom: "{field} shows the bottom {count} only: totals and percentages cover these items, not all of them.",
        chartCapped: "Showing the first {shown} of {total} categories. Add a filter or Top N to choose them.",
        // per "show values as" percentage: what 100% is
        showAs: {
            percentOfGrandTotal: "100% is the grand total: each value is its share of everything.",
            percentOfRowTotal: "100% is the total of each row: the values of a row add up to 100%.",
            percentOfColumnTotal: "100% is the total of each column: the values of a column add up to 100%.",
            percentOfParentRow: "100% is the group a row belongs to: each row is its share of the row above it.",
            percentOfParentColumn: "100% is the group a column belongs to: each column is its share of the column above it.",
            percentRunningTotal: "100% is the total along the axis: the running total ends at 100%.",
            percentDifferenceFromPrevious: "The previous item is 100%: each value says how much it grew or shrank from it."
        },
        chartOverTime: "{field} is a date: lines show how the values change over time.",
        pieSlices: "A pie works for up to about {max} parts; this one has {count}. Bars compare them more easily.",
        pieColumns: "A pie draws one slice per row and adds up the columns ({fields}). Bars show the columns side by side.",
        chartDates: "The dates are on Columns, so each date is a line of its own. Swap rows and columns to draw the dates along the axis.",
        chartTrend: "Lines connect points into a trend. For categories such as countries, bars fit better.",
        chartSeries: "{count} series are hard to tell apart. Swap rows and columns, or filter Columns to fewer items.",
        textValue: "{field} is text, so Values counts its entries. Use a number field for sums.",
        dateUngrouped: "{field} makes a row or column for every date. Group it by {unit} to read it more easily.",
        manyColumns: "{count} columns are hard to read side by side. Swap rows and columns to list them down the page.",
        values: "Add a number to Values to see sums or counts next to the labels.",
        afterDrag: "Undo takes the last step back. Every field and chip also has a menu with the same moves.",
        saveTemplate: "Save this view to open it again later?",
        menus: "Every field also has a menu, and the toolbar has Undo.",
        cells: "Click a value, or press Enter on it, to see the rows behind it. The arrow keys move between values."
    },
    tipActions: {
        removeFilters: "Remove filter",
        swap: "Swap rows and columns",
        groupDate: "Group by {unit}",
        saveTemplate: "Save view",
        bars: "Switch to Bars",
        auto: "Show as lines over time"
    },
    dismissTip: "Dismiss tip",
    tipsTitle: "Tips",
    shortcuts: {
        undo: "Undo",
        redo: "Redo",
        move: "Move between values in the table",
        open: "Open the rows behind a value; open a menu",
        drag: "Pick up a field or chip, and drop it",
        close: "Close a menu, a panel or a tip",
        fields: "In the field list: up and down between fields, left and right to a field's grip, its “i” and its menu",
        fieldMenu: "Open the menu of the field in focus"
    },
    // the first stop of the report for the keyboard: past the field list to the toolbar
    skipToToolbar: "Skip to the toolbar",
    // field descriptions (fieldDefaults)
    aboutField: "About {field}",
    learnMore: "Learn more",
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
    dropToRemove: "Drop here to remove",
    // while the report waits for its data or a shared view
    loadingReport: "Loading the report…",
    // a menu whose panel is still loading (on a slow connection, right after the page opened)
    loadingMenu: "Loading…",
    // a menu whose panel could not be loaded (offline, or the host did not deploy dist/chunks/)
    menuFailed: "This menu could not be loaded.",
    tryAgain: "Try again",
    // chart display (the chart type menu)
    chartDisplay: "Display",
    axisEvery: "One label in every {n} is shown; point at a bar or point for its name.",
    // the × in a text field
    clearText: "Clear",
    toastLinkCopied: "Link copied",
    toastJsonCopied: "View copied as JSON",
    toastCopyFailed: "This page does not allow copying. Use “Download view” instead.",
    toastLinkTooLong: "This view is too large for a link. Use “Download view” instead.",
    toastViewLoaded: "View loaded",
    toastViewLoadedPartly: "View loaded; some parts did not fit this data",
    toastLinkOpened: "Opened the view from the link",
    toastLinkOpenedPartly: "Opened the view from the link; some parts did not fit this data",
    viewLeftOut: "Some parts did not fit this data and were left out: {parts}",
    loadCheckSource: "It was made for “{source}”.",
    loadCheckOtherSource: "It was made for other data.",
    loadCheckMissing: "Fields this data does not have: {fields}.",
    loadCheckChanged: "Fields of another type here: {fields}.",
    // a link in the page's address for other data: asked before it is opened
    linkCheckTitle: "The link's view may not fit this data",
    viewMissingFields: "fields this data does not have ({fields})",
    viewOtherIssue: "{count} other setting",
    viewOtherIssues: "{count} other settings",
    viewFailed: {
        empty: "Paste a view or choose a file first.",
        tooLarge: "This is too large for a view.",
        notJson: "This is neither a view in JSON nor a pivotkit link.",
        notView: "This is not a pivotkit view.",
        newer: "This view comes from a newer version of pivotkit and cannot be read here. Update pivotkit to open it.",
        badLink: "This link is damaged or not a pivotkit link.",
        file: "The file could not be read."
    },
    // filters
    filterIs: "Filter: {filter}",
    valueConditions: { compare: "{value} {op} {number}", between: "{value} between {from} and {to}", notBetween: "{value} not between {from} and {to}" },
    // the i next to each zone's title (shown while explanations are on)
    zoneInfo: {
        rows: "Rows group the report by a field: each of its items gets a row. Example: Region in Rows lists North, South and West one below the other.",
        cols: "Columns split every row by a field: each of its items gets a column. Example: Year in Columns puts 2024 and 2025 side by side.",
        values: "Values are the numbers in the cells, summed, counted or averaged for each row and column. Example: Revenue in Values shows the revenue of each region.",
        filters: "Filters keep only some items of a field in the whole report, without a row or column for it. Example: Country in Filters with only Germany selected."
    },
    // Options: expand and collapse all, and the totals that would change nothing (their reason)
    expandNothing: "Nothing is collapsed.",
    collapseNeedsRows: "Needs two or more fields in Rows.",
    needsRowField: "Needs a field in Rows.",
    needsColField: "Needs a field in Columns.",
    needsRowFields: "Needs two or more fields in Rows.",
    needsColFields: "Needs two or more fields in Columns.",
    // the result area: bigger, and the full screen
    enlarge: "Enlarge",
    // the same button while the result is enlarged
    reduce: "Reduce",
    fullScreen: "Full screen",
    collapseAllDone: "Every group is collapsed already.",
    groupsCollapsed: { one: "{count} group collapsed", other: "{count} groups collapsed" },
    groupsExpanded: { one: "{count} group expanded", other: "{count} groups expanded" }
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
        true: "Ja",
        false: "Nein",
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
    fieldListKeys: "Pfeiltasten auf und ab wechseln zwischen den Feldern, links und rechts zum Griff eines Felds, seinem i und seinem Menü. Eingabe fügt das Feld hinzu, Umschalt+F10 öffnet sein Menü.",
    noFieldMatch: "Kein Feld passt zu „{query}“.",
    fieldMenu: "Optionen für {field}",
    addTo: "Zu {zone} hinzufügen",
    alreadyIn: "{field} ist bereits in {zone}",
    move: "Verschieben",
    moveTo: "Nach {zone} verschieben",
    dragHandle: "{field} ziehen",
    dragIntoZone: "In einen Bereich ziehen",
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
    chartTypes: { auto: "Automatisch", bar: "Balken", stacked: "Gestapelte Balken", horizontal: "Liegende Balken", line: "Linien", area: "Fläche", pie: "Kreis", donut: "Ring", heatmap: "Heatmap" },
    undo: "Rückgängig",
    redo: "Wiederholen",
    reset: "Zurücksetzen",
    resetHint: "Zurück zur Startansicht",
    swap: "Zeilen und Spalten tauschen",
    layout: "Anordnung",
    showLayout: "Feldanordnung zeigen",
    layoutEmpty: "Noch keine Felder angeordnet",
    more: "Mehr",
    views: "Ansichten",
    exportLabel: "Export",
    options: "Optionen",
    totals: "Summen",
    grandTotalRow: "Gesamtzeile",
    grandTotalColumn: "Gesamtspalte",
    rowSubtotals: "Teilergebnisse der Zeilen",
    colSubtotals: "Teilergebnisse der Spalten",
    expand: "{label} aufklappen",
    collapse: "{label} zuklappen",
    showAs: "Anzeigen als",
    sort: "Sortieren",
    sortLabelAsc: "A bis Z",
    sortLabelDesc: "Z bis A",
    sortCustom: "Eigene Reihenfolge",
    sortCustomDesc: "Eigene Reihenfolge, umgekehrt",
    sortValueDesc: "Größte {value} zuerst",
    sortValueAsc: "Kleinste {value} zuerst",
    units: {
        year: "Jahr", yearQuarter: "Quartal", yearMonth: "Monat", yearWeek: "Woche", day: "Tag",
        quarter: "Quartal im Jahr", month: "Monat im Jahr", week: "Woche im Jahr", weekday: "Wochentag", hour: "Stunde am Tag",
        bin: "Bereiche"
    },
    derivedName: "{field} nach {unit}",
    unitInName: {
        year: "Jahr", yearQuarter: "Quartal", yearMonth: "Monat", yearWeek: "Woche", day: "Tag",
        quarter: "Quartal im Jahr", month: "Monat im Jahr", week: "Woche im Jahr", weekday: "Wochentag", hour: "Stunde am Tag",
        bin: "Bereichen"
    },
    binsName: "{field} (je {size})",
    top: "Oberste",
    topBadge: "Top {count}",
    bottomBadge: "Letzte {count}",
    by: "nach {value}",
    filter: "Filtern…",
    filtered: "Gefiltert",
    filterSummary: "{shown} von {total}",
    filterTitle: "{field} filtern",
    condition: "Textbedingung",
    labelOps: { equals: "ist", notEquals: "ist nicht", contains: "enthält", notContains: "enthält nicht", beginsWith: "beginnt mit", endsWith: "endet mit" },
    emptyTitle: "Den Bericht in drei Schritten bauen",
    emptySteps: [
        "Ein Feld wie Team oder Region in Zeilen ziehen.",
        "Eine Zahl in Werte ziehen: Sie wird summiert, Text wird gezählt.",
        "Ein Feld in Spalten ziehen, zum Diagramm wechseln oder nach Excel exportieren."
    ],
    emptyFields: "Die Daten haben keine Spalten.",
    tryView: "Mit „{name}“ beginnen",
    error: "Der Bericht kann nicht angezeigt werden: {message}",
    tooLarge: "Diese Anordnung ergibt {value} Zellen, mehr als die Grenze von {max}. Ein Feld mit vielen Werten nach Filter verschieben oder filtern.",
    tooManyGroups: "Diese Anordnung ergibt mehr als {max} Gruppen in Zeilen und Spalten. Ein Feld mit vielen Werten aus Zeilen oder Spalten entfernen oder filtern.",
    tooManyCells: "Diese Anordnung ergibt mit ihren Teilergebnissen mehr als {max} Zellen. Ein Feld aus Zeilen oder Spalten entfernen oder filtern.",
    tooManyRows: "Die Daten haben {value} Zeilen, mehr als die Grenze von {max}.",
    tooMuchWork: "Diese Anordnung braucht {value} Zellberechnungen, mehr als die Grenze von {max}. Ein Feld aus Zeilen oder Spalten entfernen oder einen Wert wie Median oder Anzahl eindeutiger Werte.",
    zoneFull: "{zone} nimmt höchstens {max} Felder auf. Zuerst eines entfernen.",
    viewTrimmed: "„{name}“ hat mehr als {max} Felder in {zone}; der Bericht zeigt die ersten {max}.",
    issues: "Einige Teile der Ansicht wurden nicht verwendet:",
    dismissIssues: "Ausblenden",
    loadingChart: "Diagramm wird geladen…",
    noChartData: "Einen Wert hinzufügen, um ein Diagramm zu sehen.",
    rowsCount: { one: "{count} Zeile", other: "{count} Zeilen" },
    tableName: "Pivot-Tabelle",
    emptyCell: "Keine Zeilen",
    emptyValue: "Kein Wert",
    rowLabel: "Zeile: {label}",
    chartSummary: "{type}: {values} nach {categories}.",
    chartCounts: "{categories}, {series}.",
    chartCategories: { one: "{count} Kategorie", other: "{count} Kategorien" },
    chartSeries: { one: "{count} Reihe", other: "{count} Reihen" },
    chartExtremes: "Höchster Wert {max} bei {maxAt}; niedrigster {min} bei {minAt}.",
    chartTableHint: "Zur Tabelle wechseln, um jeden Wert zu lesen.",
    categories: "Kategorien",
    close: "Schließen",
    toastRemoved: "{field} entfernt",
    toastUndone: "Rückgängig: {step}",
    toastRedone: "Wiederholt: {step}",
    toastReset: "Zurück zur Startansicht",
    toastExported: "{file} exportiert",
    toastSaved: "Ansicht „{name}“ gespeichert",
    toastLoaded: "Ansicht „{name}“ geladen",
    toastDeleted: "Ansicht „{name}“ gelöscht",
    toastExportFailed: "Export fehlgeschlagen: {message}",
    toastSaveFailed: "Die Ansicht konnte nicht gespeichert werden: {message}",
    toastDeleteFailed: "Die Ansicht konnte nicht gelöscht werden: {message}",
    toastSaveRejected: "Der Server konnte die Ansicht nicht speichern.",
    toastDeleteRejected: "Der Server konnte die Ansicht nicht löschen.",
    steps: {
        added: "{field} zu {zone} hinzugefügt",
        removed: "{field} entfernt",
        moved: "{field} nach {zone} verschoben",
        reordered: "Reihenfolge in {zone}",
        sort: "Sortierung von {field}",
        group: "Gruppierung von {field}",
        filter: "Filter auf {field}",
        filtersRemoved: "Filter entfernt",
        top: "oberste Einträge von {field}",
        value: "Einstellungen von {field}",
        display: "Wechsel zu {display}",
        chart: "Diagrammtyp {type}",
        totals: "Summen",
        collapse: "Auf- und Zuklappen",
        swap: "Zeilen und Spalten getauscht",
        template: "Ansicht „{name}“",
        reset: "zurück zur Startansicht",
        outside: "Änderung von außerhalb des Berichts",
        viewLoaded: "Ansicht geladen",
        chartDisplay: "Diagrammdarstellung",
        change: "letzte Änderung"
    },
    tips: {
        filterEmpty: "Nichts passt zum Filter. Den Filter entfernen oder andere Einträge wählen.",
        top: "{field} zeigt nur die obersten {count}: Summen und Prozente beziehen sich auf diese Einträge, nicht auf alle.",
        bottom: "{field} zeigt nur die untersten {count}: Summen und Prozente beziehen sich auf diese Einträge, nicht auf alle.",
        chartCapped: "Die ersten {shown} von {total} Kategorien. Mit einem Filter oder „Nur die obersten Einträge“ auswählen.",
        showAs: {
            percentOfGrandTotal: "100 % ist das Gesamtergebnis: Jeder Wert ist sein Anteil am Ganzen.",
            percentOfRowTotal: "100 % ist die Summe jeder Zeile: Die Werte einer Zeile ergeben zusammen 100 %.",
            percentOfColumnTotal: "100 % ist die Summe jeder Spalte: Die Werte einer Spalte ergeben zusammen 100 %.",
            percentOfParentRow: "100 % ist die Gruppe einer Zeile: Jede Zeile ist ihr Anteil an der Zeile darüber.",
            percentOfParentColumn: "100 % ist die Gruppe einer Spalte: Jede Spalte ist ihr Anteil an der Spalte darüber.",
            percentRunningTotal: "100 % ist die Summe entlang der Achse: Die laufende Summe endet bei 100 %.",
            percentDifferenceFromPrevious: "Der vorherige Eintrag ist 100 %: Jeder Wert sagt, wie viel er gegenüber ihm gewachsen oder geschrumpft ist."
        },
        chartOverTime: "{field} ist ein Datum: Linien zeigen, wie sich die Werte über die Zeit ändern.",
        pieSlices: "Ein Kreis eignet sich für bis zu etwa {max} Teile; dieser hat {count}. Balken lassen sich leichter vergleichen.",
        pieColumns: "Ein Kreis zeigt ein Stück je Zeile und addiert dafür die Spalten ({fields}). Balken zeigen die Spalten nebeneinander.",
        chartDates: "Die Daten liegen in Spalten, so wird jedes Datum eine eigene Linie. Zeilen und Spalten tauschen, um die Daten entlang der Achse zu zeichnen.",
        chartTrend: "Linien verbinden Punkte zu einem Verlauf. Für Kategorien wie Länder passen Balken besser.",
        chartSeries: "{count} Reihen sind schwer zu unterscheiden. Zeilen und Spalten tauschen oder Spalten auf weniger Einträge filtern.",
        textValue: "{field} ist Text, darum werden seine Einträge gezählt. Für Summen ein Zahlenfeld verwenden.",
        dateUngrouped: "{field} macht für jedes Datum eine Zeile oder Spalte. Nach {unit} gruppiert ist es leichter zu lesen.",
        manyColumns: "{count} Spalten nebeneinander sind schwer zu lesen. Zeilen und Spalten tauschen, um sie untereinander aufzulisten.",
        values: "Eine Zahl in Werte ziehen, um neben den Beschriftungen Summen oder Anzahlen zu sehen.",
        afterDrag: "Rückgängig nimmt den letzten Schritt zurück. Jedes Feld und jeder Chip hat auch ein Menü mit denselben Schritten.",
        saveTemplate: "Diese Ansicht speichern, um sie später wieder zu öffnen?",
        menus: "Jedes Feld hat auch ein Menü, und die Werkzeugleiste hat Rückgängig.",
        cells: "Auf einen Wert klicken oder darauf Eingabe drücken, um die Zeilen dahinter zu sehen. Die Pfeiltasten wechseln zwischen den Werten."
    },
    tipActions: {
        removeFilters: "Filter entfernen",
        swap: "Zeilen und Spalten tauschen",
        groupDate: "Nach {unit} gruppieren",
        saveTemplate: "Ansicht speichern",
        bars: "Zu Balken wechseln",
        auto: "Als Linien über die Zeit zeigen"
    },
    dismissTip: "Tipp ausblenden",
    tipsTitle: "Tipps",
    shortcuts: {
        undo: "Rückgängig",
        redo: "Wiederholen",
        move: "Zwischen den Werten der Tabelle wechseln",
        open: "Die Zeilen hinter einem Wert öffnen; ein Menü öffnen",
        drag: "Ein Feld oder einen Chip aufnehmen und ablegen",
        close: "Ein Menü, ein Fenster oder einen Tipp schließen",
        fields: "In der Feldliste: auf und ab zwischen den Feldern, links und rechts zum Griff eines Felds, seinem „i“ und seinem Menü",
        fieldMenu: "Das Menü des Felds im Fokus öffnen"
    },
    skipToToolbar: "Zur Werkzeugleiste springen",
    aboutField: "Über {field}",
    learnMore: "Mehr erfahren",
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
    dropToRemove: "Zum Entfernen hier ablegen",
    loadingReport: "Bericht wird geladen…",
    loadingMenu: "Wird geladen…",
    menuFailed: "Dieses Menü konnte nicht geladen werden.",
    tryAgain: "Erneut versuchen",
    chartDisplay: "Darstellung",
    axisEvery: "Jede {n}. Beschriftung wird gezeigt; auf einen Balken oder Punkt zeigen, um seinen Namen zu sehen.",
    clearText: "Leeren",
    toastLinkCopied: "Link kopiert",
    toastJsonCopied: "Ansicht als JSON kopiert",
    toastCopyFailed: "Diese Seite erlaubt kein Kopieren. Stattdessen „Ansicht herunterladen“ verwenden.",
    toastLinkTooLong: "Diese Ansicht ist zu groß für einen Link. Stattdessen „Ansicht herunterladen“ verwenden.",
    toastViewLoaded: "Ansicht geladen",
    toastViewLoadedPartly: "Ansicht geladen; einige Teile passen nicht zu diesen Daten",
    toastLinkOpened: "Ansicht aus dem Link geöffnet",
    toastLinkOpenedPartly: "Ansicht aus dem Link geöffnet; einige Teile passen nicht zu diesen Daten",
    viewLeftOut: "Einige Teile passen nicht zu diesen Daten und wurden weggelassen: {parts}",
    loadCheckSource: "Sie wurde für „{source}“ gemacht.",
    loadCheckOtherSource: "Sie wurde für andere Daten gemacht.",
    loadCheckMissing: "Felder, die diese Daten nicht haben: {fields}.",
    loadCheckChanged: "Felder mit anderem Typ hier: {fields}.",
    linkCheckTitle: "Die Ansicht des Links passt vielleicht nicht zu diesen Daten",
    viewMissingFields: "Felder, die diese Daten nicht haben ({fields})",
    viewOtherIssue: "{count} weitere Einstellung",
    viewOtherIssues: "{count} weitere Einstellungen",
    viewFailed: {
        empty: "Zuerst eine Ansicht einfügen oder eine Datei wählen.",
        tooLarge: "Das ist zu groß für eine Ansicht.",
        notJson: "Das ist weder eine Ansicht als JSON noch ein pivotkit-Link.",
        notView: "Das ist keine pivotkit-Ansicht.",
        newer: "Diese Ansicht stammt aus einer neueren pivotkit-Version und kann hier nicht gelesen werden. Zum Öffnen pivotkit aktualisieren.",
        badLink: "Dieser Link ist beschädigt oder kein pivotkit-Link.",
        file: "Die Datei konnte nicht gelesen werden."
    },
    filterIs: "Filter: {filter}",
    valueConditions: { compare: "{value} {op} {number}", between: "{value} zwischen {from} und {to}", notBetween: "{value} nicht zwischen {from} und {to}" },
    zoneInfo: {
        rows: "Zeilen gruppieren den Bericht nach einem Feld: Jeder Eintrag bekommt eine Zeile. Beispiel: Region in Zeilen listet Nord, Süd und West untereinander.",
        cols: "Spalten teilen jede Zeile nach einem Feld: Jeder Eintrag bekommt eine Spalte. Beispiel: Jahr in Spalten stellt 2024 und 2025 nebeneinander.",
        values: "Werte sind die Zahlen in den Zellen, summiert, gezählt oder gemittelt für jede Zeile und Spalte. Beispiel: Umsatz in Werte zeigt den Umsatz jeder Region.",
        filters: "Filter behalten nur einige Einträge eines Felds im ganzen Bericht, ohne Zeile oder Spalte dafür. Beispiel: Land in Filter mit nur Deutschland ausgewählt."
    },
    expandNothing: "Nichts ist zugeklappt.",
    collapseNeedsRows: "Braucht zwei oder mehr Felder in Zeilen.",
    needsRowField: "Braucht ein Feld in Zeilen.",
    needsColField: "Braucht ein Feld in Spalten.",
    needsRowFields: "Braucht zwei oder mehr Felder in Zeilen.",
    needsColFields: "Braucht zwei oder mehr Felder in Spalten.",
    enlarge: "Vergrößern",
    reduce: "Verkleinern",
    fullScreen: "Vollbild",
    collapseAllDone: "Alle Gruppen sind schon zugeklappt.",
    groupsCollapsed: { one: "{count} Gruppe zugeklappt", other: "{count} Gruppen zugeklappt" },
    groupsExpanded: { one: "{count} Gruppe aufgeklappt", other: "{count} Gruppen aufgeklappt" }
};

/** @type {Readonly<{ en: typeof en, de: typeof en }>} the texts of the first load; the menus' are MENU_LABELS (menu-labels.js) */
export const LABELS = Object.freeze({ en, de });

/**
 * Partial labels a host passes: any entry of UiLabels, nested objects partial too.
 * @typedef {{ [K in keyof UiLabels]?: UiLabels[K] extends string | string[] ? UiLabels[K] : Partial<UiLabels[K]> }} PartialLabels
 */

/** The message of a thrown value, for a note. */
export function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}

/** The text per limit of pivotkit-core that the report can run into while it shows data. */
const LIMIT_TEXTS = Object.freeze({ cells: "tooLarge", groups: "tooManyGroups", pivotCells: "tooManyCells", work: "tooMuchWork", rows: "tooManyRows" });

/**
 * The note in place of the result when it cannot be shown: a limit of pivotkit-core in words with
 * what to change, else `labels.error` with the error's message.
 * @param {unknown} error
 * @param {UiLabels} labels
 * @param {string} locale  for the numbers
 */
export function errorText(error, labels, locale) {
    const limit = error instanceof PivotkitError && error.code === "LIMIT_EXCEEDED" ? String(error.details.limit) : "";
    if (limit && Object.hasOwn(LIMIT_TEXTS, limit)) {
        const details = /** @type {PivotkitError} */ (error).details;
        const number = (n) => Number(n).toLocaleString(locale);
        return fill(labels[LIMIT_TEXTS[limit]], { value: number(details.value), max: number(details.max) });
    }
    return fill(labels.error, { message: messageOf(error) });
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

/** True for a count label: an object of plural forms with at least `other`. */
const isPluralForms = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.hasOwn(v, "other") && Object.keys(v).every((k) => PLURAL_CATEGORIES.includes(k));

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

/** Where resolved labels keep a host's texts for the menus (menu-labels.js); a symbol, so it is no text. */
export const MENU_TEXTS = Symbol("pivotkit menu texts");

/**
 * A deep merge of `over` into `base` that keeps the shape of `base`: an entry replaces one of the same
 * kind only (text by text, a list of texts by a list of texts, an object is merged), so a wrong type
 * in a host's labels cannot break the UI. Keys `base` does not have are ignored.
 */
export function mergeLabels(base, over) {
    return merge(base, over);
}

function merge(base, over) {
    if (!isObject(over)) {
        return base;
    }
    const out = { ...base };
    // a count label takes every plural form a language has, also those English lacks ("few", "many")
    const keys = isPluralForms(base) ? PLURAL_CATEGORIES : Object.keys(base);
    for (const key of keys) {
        if (!Object.hasOwn(over, key)) {
            continue;
        }
        const was = base[key] ?? "";
        const now = over[key];
        if (isPluralForms(was) && typeof now === "string") {
            // a count written as one text (the form before plural forms): that text for every count
            out[key] = { other: now };
        } else if (isObject(was)) {
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
 * Labels that became tips (labels.tips) under their earlier names: a host's text for one of them
 * still applies, unless the host also gives the tip's own entry.
 */
const LEGACY_TIPS = Object.freeze({
    topNote: "top",
    bottomNote: "bottom",
    noValuesHint: "values",
    cellHint: "cells",
    emptyHint: "menus",
    chartManySeries: "chartSeries",
    chartDatesOnColumns: "chartDates",
    chartCapped: "chartCapped"
});

/** A host's labels with the earlier names of tip texts moved to labels.tips. */
function withLegacyTips(custom) {
    if (!isObject(custom)) {
        return custom;
    }
    const moved = {};
    for (const [old, id] of Object.entries(LEGACY_TIPS)) {
        if (Object.hasOwn(custom, old) && typeof custom[old] === "string") {
            moved[id] = custom[old];
        }
    }
    if (Object.keys(moved).length === 0) {
        return custom;
    }
    return { ...custom, tips: { ...moved, ...(isObject(custom.tips) ? custom.tips : {}) } };
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
    const own = withLegacyTips(custom);
    // the host's entries this language has no text for here (the menus' texts): kept aside under
    // MENU_TEXTS, merged and checked when the menus load (menu-labels.js)
    return /** @type {UiLabels} */ ({ ...merge(base, own), [MENU_TEXTS]: isObject(own) ? own : {} });
}
