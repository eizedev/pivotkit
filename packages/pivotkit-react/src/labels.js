/*
 * The texts of the UI, in English and German. `labels.core` holds the texts pivotkit-core writes into
 * the table and the chart (totals, blank, value names); the rest belongs to the UI. A host passes a
 * partial object through the `labels` prop; it is merged over the language the locale picks (a whole
 * object for a language of its own, with its `lang`). Entries of the wrong type are ignored.
 * {name} placeholders are filled by fill().
 */

import { DEFAULT_LABELS, PivotkitError } from "pivotkit-core";

/** @typedef {typeof en} UiLabels */

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
    noFieldMatch: "No field matches “{query}”.",
    fieldMenu: "Options for {field}",
    addTo: "Add to {zone}",
    // a click on a field that is in its zone already: said in the status line
    alreadyIn: "{field} is already in {zone}",
    move: "Move",
    moveTo: "Move to {zone}",
    dragHandle: "Drag {field}",
    dragIntoZone: "Drag into a zone",
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
    chartTypes: { bar: "Bars", stacked: "Stacked bars", horizontal: "Horizontal bars", line: "Lines", area: "Area", pie: "Pie", donut: "Donut", heatmap: "Heatmap" },
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
    savedViews: "Saved views",
    noViews: "No saved views yet.",
    deleteView: "Delete {name}",
    deleteConfirm: "Delete “{name}”?",
    deleteAction: "Delete",
    saveView: "Save current view",
    viewName: "Name of the view",
    save: "Save",
    cancel: "Cancel",
    exportLabel: "Export",
    exportXlsx: "Excel workbook (.xlsx)",
    exportCsv: "CSV file (.csv)",
    exportPng: "Chart image (.png)",
    exportPngNeedsChart: "Switch to Chart first.",
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
    sortCustom: "Custom order",
    sortCustomDesc: "Custom order, reversed",
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
    binStart: "Starting at",
    binStartFar: "Ranges from {start} cannot hold this field's values ({min} to {max}): every row would be blank. Pick a start closer to them.",
    apply: "Apply",
    clear: "Clear",
    topN: "Show only the top items",
    topCount: "Count",
    top: "Top",
    bottom: "Bottom",
    topBadge: "Top {count}",
    bottomBadge: "Bottom {count}",
    by: "by {value}",
    topBy: "by",
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
        // per "show values as" percentage: what 100 % is
        showAs: {
            percentOfGrandTotal: "100 % is the grand total: each value is its share of everything.",
            percentOfRowTotal: "100 % is the total of each row: the values of a row add up to 100 %.",
            percentOfColumnTotal: "100 % is the total of each column: the values of a column add up to 100 %.",
            percentOfParentRow: "100 % is the group a row belongs to: each row is its share of the row above it.",
            percentOfParentColumn: "100 % is the group a column belongs to: each column is its share of the column above it.",
            percentRunningTotal: "100 % is the total along the axis: the running total ends at 100 %.",
            percentDifferenceFromPrevious: "The previous item is 100 %: each value says how much it grew or shrank from it."
        },
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
        bars: "Switch to Bars"
    },
    dismissTip: "Dismiss tip",
    tipsTitle: "Tips",
    showTips: "Show tips",
    showFieldInfo: "Show field descriptions",
    showZoneInfo: "Show zone explanations",
    showSettingInfo: "Show explanations",
    resetTips: "Show dismissed tips again",
    help: "Help",
    shortcutsTitle: "Keyboard shortcuts",
    // the keys of the shortcuts; "Mod" is Ctrl, or ⌘ on a Mac
    keys: { Mod: "Ctrl", Shift: "Shift", "Arrow keys": "Arrow keys", Enter: "Enter", Space: "Space", Escape: "Escape" },
    shortcuts: {
        undo: "Undo",
        redo: "Redo",
        move: "Move between values in the table",
        open: "Open the rows behind a value; open a menu",
        drag: "Pick up a field or chip, and drop it",
        close: "Close a menu, a panel or a tip"
    },
    // field descriptions (fieldDefaults)
    aboutField: "About {field}",
    // the "i" next to a setting that needs explaining (Options → Help → Show explanations)
    aboutSetting: "About {setting}",
    settingInfo: {
        grandTotalRow: "A last row with the total of every column.",
        grandTotalColumn: "A last column with the total of every row.",
        rowSubtotals: "With two or more fields in Rows: a total row under each group of the outer field.",
        colSubtotals: "With two or more fields in Columns: a total column after each group of the outer field.",
        along: "The direction the calculation walks: Rows goes down the rows of each column, Columns across the columns of each row. A running total adds up along it, a difference compares with the item before it.",
        showAs: "Shows each value as a share, a difference, a running total or a rank instead of the number itself. For percentages, a tip above the result says what 100 % is.",
        exportXlsx: "Every number with all its decimals, formats kept, ready to calculate with.",
        exportCsv: "Percentages and calculations as the table shows them, as plain text.",
        groupLabels: "With two or more fields in Rows: the outer field's items written once under the axis, below their categories.",
        labelPosition: "Outside: each slice's name and number next to it. Inside: the number on the slice, the names in the legend."
    },
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
    valueLabels: "Value labels",
    valueLabelNames: { auto: "Automatic", off: "Off", value: "Value", percent: "Percent", both: "Value and percent" },
    legend: "Legend",
    legendNames: { auto: "Automatic", bottom: "Bottom", right: "Right", off: "Off" },
    chartTitle: "Title",
    chartTitleNone: "No title",
    smoothLines: "Smooth lines",
    labelPosition: "Labels",
    labelPositionNames: { outside: "Outside", inside: "Inside" },
    axisLabels: "Axis labels",
    axisLabelNames: { auto: "Automatic", all: "All (slanted)", nth: "Every n-th" },
    groupLabels: "Group labels under the axis",
    groupLabelNames: { auto: "Automatic", on: "On", off: "Off" },
    axisEvery: "One label in every {n} is shown; point at a bar or point for its name.",
    // the × in a text field
    clearText: "Clear",
    defaultName: "Use the default name",
    // sharing a view (the Views menu)
    share: "Share",
    copyLink: "Copy link",
    copyJson: "Copy view as JSON",
    downloadView: "Download view (.pivotkit.json)",
    // said where a view leaves the report as a file, as JSON or as a link
    sharePrivacy: "A view holds the names of fields and, in its filters, the values chosen there: share it only where those may be seen.",
    loadView: "Load view…",
    loadViewHint: "Paste a view file, a view as JSON or a link, or choose a .pivotkit.json file.",
    loadViewText: "View as JSON or link",
    chooseFile: "Choose file…",
    load: "Load",
    toastLinkCopied: "Link copied",
    toastJsonCopied: "View copied as JSON",
    toastCopyFailed: "This page does not allow copying. Use “Download view” instead.",
    toastLinkTooLong: "This view is too large for a link. Use “Download view” instead.",
    toastViewLoaded: "View loaded",
    toastViewLoadedPartly: "View loaded; some parts did not fit this data",
    toastLinkOpened: "Opened the view from the link",
    toastLinkOpenedPartly: "Opened the view from the link; some parts did not fit this data",
    viewLeftOut: "Some parts did not fit this data and were left out: {parts}",
    // before a view for other data is loaded: what does not fit, and the choices
    loadCheckTitle: "This view may not fit this data",
    loadCheckSource: "It was made for “{source}”.",
    loadCheckOtherSource: "It was made for other data.",
    loadCheckMissing: "Fields this data does not have: {fields}.",
    loadCheckChanged: "Fields of another type here: {fields}.",
    loadAnyway: "Load anyway",
    switchAndLoad: "Switch to “{source}” and load",
    switchStartsFresh: "Switching shows the other data with this view; Undo starts there.",
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
    numberInvalid: "Enter a number, such as {example}.",
    countInvalid: "Enter a whole number of 1 or more.",
    sizeInvalid: "Enter a number above 0, such as {example}.",
    valueFilter: "Value filter…",
    valueFilterBy: "Value",
    valueFilterOp: "Condition",
    valueFilterNumber: "Number",
    valueFilterTo: "and",
    valueOps: { "=": "equals", "!=": "does not equal", ">": "greater than", ">=": "greater than or equal to", "<": "less than", "<=": "less than or equal to", between: "between", notBetween: "not between" },
    valueConditions: { compare: "{value} {op} {number}", between: "{value} between {from} and {to}", notBetween: "{value} not between {from} and {to}" },
    removeFilter: "Remove filter",
    valuesFilterHint: "Values are not filtered here: filter a field on Rows or Columns through its menu, or move a field to Filters.",
    // the i next to each zone's title (shown while tips are on)
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
    fullScreen: "Full screen",
    // collapsible sections of the menus
    moreFormats: "More formats",
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
    noFieldMatch: "Kein Feld passt zu „{query}“.",
    fieldMenu: "Optionen für {field}",
    addTo: "Zu {zone} hinzufügen",
    alreadyIn: "{field} ist bereits in {zone}",
    move: "Verschieben",
    moveTo: "Nach {zone} verschieben",
    dragHandle: "{field} ziehen",
    dragIntoZone: "In einen Bereich ziehen",
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
    chartTypes: { bar: "Balken", stacked: "Gestapelte Balken", horizontal: "Liegende Balken", line: "Linien", area: "Fläche", pie: "Kreis", donut: "Ring", heatmap: "Heatmap" },
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
    savedViews: "Gespeicherte Ansichten",
    noViews: "Noch keine gespeicherten Ansichten.",
    deleteView: "{name} löschen",
    deleteConfirm: "„{name}“ löschen?",
    deleteAction: "Löschen",
    saveView: "Aktuelle Ansicht speichern",
    viewName: "Name der Ansicht",
    save: "Speichern",
    cancel: "Abbrechen",
    exportLabel: "Export",
    exportXlsx: "Excel-Arbeitsmappe (.xlsx)",
    exportCsv: "CSV-Datei (.csv)",
    exportPng: "Diagramm als Bild (.png)",
    exportPngNeedsChart: "Zuerst zum Diagramm wechseln.",
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
    sortCustom: "Eigene Reihenfolge",
    sortCustomDesc: "Eigene Reihenfolge, umgekehrt",
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
    binStart: "Beginnt bei",
    binStartFar: "Bereiche ab {start} können die Werte dieses Felds ({min} bis {max}) nicht fassen: Jede Zeile wäre leer. Einen Beginn näher an den Werten wählen.",
    apply: "Anwenden",
    clear: "Löschen",
    topN: "Nur die obersten Einträge zeigen",
    topCount: "Anzahl",
    top: "Oberste",
    bottom: "Unterste",
    topBadge: "Top {count}",
    bottomBadge: "Letzte {count}",
    by: "nach {value}",
    topBy: "nach",
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
    drillTitle: "Zeilen hinter diesem Wert",
    drillCount: { one: "{count} Zeile", other: "{count} Zeilen" },
    drillShown: "Die ersten {shown} von {count} Zeilen",
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
        bars: "Zu Balken wechseln"
    },
    dismissTip: "Tipp ausblenden",
    tipsTitle: "Tipps",
    showTips: "Tipps zeigen",
    showFieldInfo: "Feldbeschreibungen zeigen",
    showZoneInfo: "Erklärungen der Bereiche zeigen",
    showSettingInfo: "Erklärungen zeigen",
    resetTips: "Ausgeblendete Tipps wieder zeigen",
    help: "Hilfe",
    shortcutsTitle: "Tastenkürzel",
    keys: { Mod: "Strg", Shift: "Umschalt", "Arrow keys": "Pfeiltasten", Enter: "Eingabe", Space: "Leertaste", Escape: "Esc" },
    shortcuts: {
        undo: "Rückgängig",
        redo: "Wiederholen",
        move: "Zwischen den Werten der Tabelle wechseln",
        open: "Die Zeilen hinter einem Wert öffnen; ein Menü öffnen",
        drag: "Ein Feld oder einen Chip aufnehmen und ablegen",
        close: "Ein Menü, ein Fenster oder einen Tipp schließen"
    },
    aboutField: "Über {field}",
    aboutSetting: "Über {setting}",
    settingInfo: {
        grandTotalRow: "Eine letzte Zeile mit der Summe jeder Spalte.",
        grandTotalColumn: "Eine letzte Spalte mit der Summe jeder Zeile.",
        rowSubtotals: "Mit zwei oder mehr Feldern in Zeilen: eine Summenzeile unter jeder Gruppe des äußeren Felds.",
        colSubtotals: "Mit zwei oder mehr Feldern in Spalten: eine Summenspalte nach jeder Gruppe des äußeren Felds.",
        along: "Die Richtung der Berechnung: Zeilen geht die Zeilen jeder Spalte hinunter, Spalten über die Spalten jeder Zeile. Eine laufende Summe addiert entlang, eine Differenz vergleicht mit dem Eintrag davor.",
        showAs: "Zeigt jeden Wert als Anteil, Differenz, laufende Summe oder Rang statt der Zahl selbst. Bei Prozenten sagt ein Tipp über dem Ergebnis, was 100 % ist.",
        exportXlsx: "Jede Zahl mit allen Nachkommastellen, Formate bleiben, bereit zum Rechnen.",
        exportCsv: "Prozente und Berechnungen wie in der Tabelle, als reiner Text.",
        groupLabels: "Mit zwei oder mehr Feldern in Zeilen: die Einträge des äußeren Felds einmal unter der Achse, unter ihren Kategorien.",
        labelPosition: "Außen: Name und Zahl jedes Segments daneben. Innen: die Zahl auf dem Segment, die Namen in der Legende."
    },
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
    valueLabels: "Wertbeschriftung",
    valueLabelNames: { auto: "Automatisch", off: "Aus", value: "Wert", percent: "Prozent", both: "Wert und Prozent" },
    legend: "Legende",
    legendNames: { auto: "Automatisch", bottom: "Unten", right: "Rechts", off: "Aus" },
    chartTitle: "Titel",
    chartTitleNone: "Kein Titel",
    smoothLines: "Geglättete Linien",
    labelPosition: "Beschriftung",
    labelPositionNames: { outside: "Außen", inside: "Innen" },
    axisLabels: "Achsenbeschriftung",
    axisLabelNames: { auto: "Automatisch", all: "Alle (schräg)", nth: "Jede n-te" },
    groupLabels: "Gruppen unter der Achse",
    groupLabelNames: { auto: "Automatisch", on: "Ein", off: "Aus" },
    axisEvery: "Jede {n}. Beschriftung wird gezeigt; zeigen Sie auf einen Balken oder Punkt für seinen Namen.",
    clearText: "Leeren",
    defaultName: "Standardnamen verwenden",
    share: "Teilen",
    copyLink: "Link kopieren",
    copyJson: "Ansicht als JSON kopieren",
    downloadView: "Ansicht herunterladen (.pivotkit.json)",
    sharePrivacy: "Eine Ansicht enthält die Namen der Felder und in ihren Filtern die dort gewählten Werte: Teilen Sie sie nur, wo diese gesehen werden dürfen.",
    loadView: "Ansicht laden…",
    loadViewHint: "Eine Ansichtsdatei, eine Ansicht als JSON oder einen Link einfügen oder eine .pivotkit.json-Datei wählen.",
    loadViewText: "Ansicht als JSON oder Link",
    chooseFile: "Datei wählen…",
    load: "Laden",
    toastLinkCopied: "Link kopiert",
    toastJsonCopied: "Ansicht als JSON kopiert",
    toastCopyFailed: "Diese Seite erlaubt kein Kopieren. Nutzen Sie stattdessen „Ansicht herunterladen“.",
    toastLinkTooLong: "Diese Ansicht ist zu groß für einen Link. Nutzen Sie stattdessen „Ansicht herunterladen“.",
    toastViewLoaded: "Ansicht geladen",
    toastViewLoadedPartly: "Ansicht geladen; einige Teile passen nicht zu diesen Daten",
    toastLinkOpened: "Ansicht aus dem Link geöffnet",
    toastLinkOpenedPartly: "Ansicht aus dem Link geöffnet; einige Teile passen nicht zu diesen Daten",
    viewLeftOut: "Einige Teile passen nicht zu diesen Daten und wurden weggelassen: {parts}",
    loadCheckTitle: "Diese Ansicht passt vielleicht nicht zu diesen Daten",
    loadCheckSource: "Sie wurde für „{source}“ gemacht.",
    loadCheckOtherSource: "Sie wurde für andere Daten gemacht.",
    loadCheckMissing: "Felder, die diese Daten nicht haben: {fields}.",
    loadCheckChanged: "Felder mit anderem Typ hier: {fields}.",
    loadAnyway: "Trotzdem laden",
    switchAndLoad: "Zu „{source}“ wechseln und laden",
    switchStartsFresh: "Der Wechsel zeigt die anderen Daten mit dieser Ansicht; Rückgängig beginnt dort.",
    linkCheckTitle: "Die Ansicht des Links passt vielleicht nicht zu diesen Daten",
    viewMissingFields: "Felder, die diese Daten nicht haben ({fields})",
    viewOtherIssue: "{count} weitere Einstellung",
    viewOtherIssues: "{count} weitere Einstellungen",
    viewFailed: {
        empty: "Fügen Sie zuerst eine Ansicht ein oder wählen Sie eine Datei.",
        tooLarge: "Das ist zu groß für eine Ansicht.",
        notJson: "Das ist weder eine Ansicht als JSON noch ein pivotkit-Link.",
        notView: "Das ist keine pivotkit-Ansicht.",
        newer: "Diese Ansicht stammt aus einer neueren pivotkit-Version und kann hier nicht gelesen werden. Aktualisieren Sie pivotkit, um sie zu öffnen.",
        badLink: "Dieser Link ist beschädigt oder kein pivotkit-Link.",
        file: "Die Datei konnte nicht gelesen werden."
    },
    filterIs: "Filter: {filter}",
    numberInvalid: "Eine Zahl eingeben, etwa {example}.",
    countInvalid: "Eine ganze Zahl ab 1 eingeben.",
    sizeInvalid: "Eine Zahl über 0 eingeben, etwa {example}.",
    valueFilter: "Wertfilter…",
    valueFilterBy: "Wert",
    valueFilterOp: "Bedingung",
    valueFilterNumber: "Zahl",
    valueFilterTo: "und",
    valueOps: { "=": "gleich", "!=": "ungleich", ">": "größer als", ">=": "größer oder gleich", "<": "kleiner als", "<=": "kleiner oder gleich", between: "zwischen", notBetween: "nicht zwischen" },
    valueConditions: { compare: "{value} {op} {number}", between: "{value} zwischen {from} und {to}", notBetween: "{value} nicht zwischen {from} und {to}" },
    removeFilter: "Filter entfernen",
    valuesFilterHint: "Werte werden hier nicht gefiltert: Filtern Sie ein Feld in Zeilen oder Spalten über sein Menü, oder ziehen Sie ein Feld in Filter.",
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
    fullScreen: "Vollbild",
    moreFormats: "Weitere Formate",
    collapseAllDone: "Alle Gruppen sind schon zugeklappt.",
    groupsCollapsed: { one: "{count} Gruppe zugeklappt", other: "{count} Gruppen zugeklappt" },
    groupsExpanded: { one: "{count} Gruppe aufgeklappt", other: "{count} Gruppen aufgeklappt" }
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
    return /** @type {UiLabels} */ (merge(base, withLegacyTips(custom)));
}
