/*
 * The texts of the UI in English, and the languages added to them (German: labels-de.js).
 * `labels.core` holds the texts pivotkit-core writes into the table and the chart (totals, blank,
 * value names); the rest belongs to the UI. A host passes a
 * partial object through the `labels` prop; it is merged over the language the locale picks (a whole
 * object for a language of its own, with its `lang`). Entries of the wrong type are ignored.
 * {name} placeholders are filled by fill(). The texts only the menus show are in menu-labels.js and
 * load with them; a host's entries for them are kept here and win there.
 */

import { GROUPING_NAMES, PLURAL_CATEGORIES, PivotkitError, REPORT_LABELS, ROW_COUNT_TEXTS, pluralForm } from "pivotkit-core";

/**
 * Every text of the UI: these and the menus' (menu-labels.js, loaded with the menus; a type import
 * only, so they stay out of the first load).
 * @typedef {typeof en & import("./menu-labels.js").MenuTexts & { unused?: import("./unused-texts.js").UnusedTexts, dataImport?: import("./import-labels.js").ImportTexts }} UiLabels
 *   `unused`: the texts of a view's unused parts (unused-texts.js), loaded when a view has such parts;
 *   `dataImport`: those of loading data (import-labels.js), loaded with the import UI; a host's of
 *   both are kept aside as the menus' are
 */

export const en = {
    /** the language of the texts, for the report's lang attribute */
    lang: "en",
    dateYearsCombined: "{years} combined",
    dateYearOnly: "{years} only",
    dateRangeTitle: "{field}: the data's first and last date, before filters",
    dateRangeData: "Data before filters: {range}",
    dateRangeField: "{field} before filters: {range}",
    /** the name of the report's region landmark */
    report: "Pivot report",
    core: /** @type {import("pivotkit-core").Labels} */ (REPORT_LABELS.en),
    zones: { rows: "Rows", cols: "Columns", values: "Values", filters: "Filters" },
    zoneHints: {
        rows: "Add or drop a field to group rows",
        cols: "Add or drop a field to group columns",
        values: "Add or drop a number to sum or count it",
        filters: "Add or drop a field to filter"
    },
    fields: "Fields",
    fieldsHint: "Drag a field into Rows, Columns, Values or Filters, or open its menu.",
    searchFields: "Search fields",
    // the field list's keys, for screen readers (the list is one stop of the Tab order)
    fieldListKeys: "Arrow keys up and down move between the fields, left and right to a field's grip, its i and its menu. Enter adds the field, Shift+F10 opens its menu.",
    noFieldMatch: "No field matches “{query}”.",
    fieldMenu: "Options for {field}",
    addTo: "Add to {zone}",
    // the field's menu, for a field in Values already: a second value of it (a sum and its share, say)
    addAgain: "Add to {zone} again",
    // a click on a field that is in its zone already: said in the status line
    alreadyIn: "{field} is already in {zone}",
    // "+ Add" in each zone: its text, and its name and tooltip
    addField: "Add",
    addFieldTo: "Add a field to {zone}",
    // said in the zones' status line after a field from "+ Add" moved there from another zone
    movedFrom: "{field} moved from {from} to {zone}",
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
    // the table and the chart side by side (#51): the tab, and the divider between them
    both: "Both",
    // the Undo step of switching to both, and Enlarge and Full screen while both are shown
    bothShown: "table and chart",
    enlargeBoth: "Enlarge the table and the chart",
    splitValue: "Table {table} %, chart {chart} %",
    splitDivider: "Width of the table and the chart",
    view: "View",
    chartType: "Chart type",
    chartTypeIs: "Chart type: {type}",
    chartTypes: { auto: "Automatic", bar: "Bars", stacked: "Stacked bars", horizontal: "Horizontal bars", line: "Lines", area: "Area", pie: "Pie", donut: "Donut", heatmap: "Heatmap", combo: "Bars and lines", treemap: "Treemap" },
    undo: "Undo",
    redo: "Redo",
    // Start over: the toolbar's menu of Reset and New (or their entries in More), each with what it
    // does and, while it does nothing, why
    startOver: "Start over",
    reset: "Reset",
    resetHint: "Back to the start view. Your data stays.",
    resetAlready: "Already at the start view.",
    resetStartEmpty: "The start view is empty: use New, empty report.",
    newHint: "No fields. Undo brings it back. Your data stays.",
    newAlready: "The report is empty already.",
    // next to Views: the name of the view loaded, and the mark while it has changes not saved
    unsavedChanges: "Unsaved changes",
    swap: "Swap rows and columns",
    // the section of the zones: its heading, and its line under it while open (folded: what is placed,
    // or layoutEmpty)
    zonesTitle: "Fields in the report",
    zonesHint: "Drag fields into Filters, Columns, Rows and Values, or use Add in each one.",
    layoutEmpty: "No fields placed yet",
    // always at the end of the toolbar: Help first, then the buttons that do not fit
    more: "More",
    // the Views menu: the saved views (the host's templates) and sharing
    views: "Views",
    // loading data (allowImport): the Data button, its dot while a file's data is shown, the empty report
    data: "Data",
    dataLoaded: "Data from a file",
    loadData: "Load data…",
    emptyLoad: "Or load your own data: drop a file onto the report, or",
    emptyDrop: "Drop a file onto the report, or",
    emptyNoData: "Load data to start",
    exportLabel: "Export",
    // the button beside the tabs Table and Chart: the settings of the view shown
    tableSettings: "Table settings",
    chartSettings: "Chart settings",
    // the same button's text on a phone; its name stays the whole one
    settingsShort: "Settings",
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
    // a sort by a value in one column (#70): "Average of Temp in Jul"
    valueInColumn: "{value} in {column}",
    // a click on a table header: its tooltip (what the next click does) and what a screen reader hears after it
    headerSort: "Sort {field}: {order}",
    headerSortDesc: "Sort by {value}: largest first",
    headerSortAsc: "Sort by {value}: smallest first",
    headerSorted: "{field} sorted: {order}",
    units: {
        year: "Year", yearQuarter: "Quarter", yearMonth: "Month", yearWeek: "Week", day: "Day",
        quarter: "Quarter of year", month: "Month of year", week: "Week of year", weekday: "Weekday", hour: "Hour of day",
        bin: "Ranges"
    },
    // a date grouping's name: "Date by month"; the unit as it reads inside it (unitInName); pivotkit-core's GROUPING_NAMES
    derivedName: GROUPING_NAMES.en.name,
    unitInName: GROUPING_NAMES.en.units,
    binsName: GROUPING_NAMES.en.bins,
    top: "Top",
    topBadge: "Top {count}",
    bottomBadge: "Bottom {count}",
    by: "by {value}",
    filtered: "Filtered",
    filterSummary: "{shown} of {total}",
    /** a text the user typed or a name, quoted as the language quotes: a text condition, field names */
    quote: "“{text}”",
    filterTitle: "Filter {field}",
    // the condition on the labels of a field: text, or a number's label
    condition: "Only if the name…",
    // result
    emptyTitle: "Build your report in three steps",
    emptySteps: [
        "Click + Add next to Rows, or drag a field such as a team or region into it.",
        "Add a number to Values the same way: it is summed, or counted for text.",
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
    // the warning above the result: parts of a view the report could not use (unused.jsx; each part's
    // own line in plain words loads with unused-texts.js), and the technical line under each
    unusedParts: { one: "{count} part of this view could not be used", other: "{count} parts of this view could not be used" },
    unusedPath: "For developers:",
    // the lines past the first few (three, two on a narrow report) of an open warning
    unusedMore: { one: "Show {count} more", other: "Show {count} more" },
    unusedFewer: "Show fewer",
    dismissIssues: "Dismiss",
    loadingChart: "Loading chart…",
    noChartData: "Add a value to see a chart.",
    // a count in words: one form per Intl.PluralRules category of the language ("one", "other", ...);
    // the row counts are pivotkit-core's, so pivotkit-report's HTML report says the same
    rowsCount: ROW_COUNT_TEXTS.en.rowsCount,
    // a filter left rows out: the rows kept ({shown}) of the data's ({count}, which picks the form)
    rowsFiltered: ROW_COUNT_TEXTS.en.rowsFiltered,
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
    // the chart's reference lines in its text alternative: "Average 25; Trend from 10 to 40"
    chartLines: "Reference lines: {lines}.",
    chartTrendSpan: "from {from} to {to}",
    // the last sentence of the chart's text alternative
    chartTableHint: "Switch to Table to read every value.",
    // the tooltip's last line on stacked bars and areas: the sum of the stack's parts
    chartTotal: "Total",
    // the tooltip's line for the series that do not fit
    chartMore: "+{count} more",
    chartMoreInTotal: "+{count} more (in the total)",
    // said when a click on the legend hides or shows a series (or a slice)
    // the chart's text alternative of a 100 % stack
    chartShares: "Shown as shares of each stack.",
    // the zoom slider by keyboard: its name, and what it shows
    chartZoom: "Zoom window",
    chartZoomWindow: "Categories {from} to {to} of {count}",
    chartHidden: "{name} hidden",
    chartShown: "{name} shown",
    categories: "categories",
    close: "Close",
    // toasts and live region
    toastRemoved: "{field} removed",
    toastUndone: "Undone: {step}",
    toastRedone: "Redone: {step}",
    toastReset: "Back to the start view",
    // New's entry under Start over, and its step said in the status line
    newEmpty: "New, empty report",
    toastLoaded: "View “{name}” loaded",
    toastExportFailed: "Export failed: {message}",
    // what an undo step was, for "Undone: ..."
    steps: {
        added: "{field} added to {zone}",
        removed: "{field} removed",
        moved: "{field} moved to {zone}",
        reordered: "order in {zone}",
        sort: "sort of {field}",
        group: "grouping of {field}",
        rename: "name of {field}",
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
        new: "new, empty report",
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
        colSubtotals: "A Total column adds up the columns of the group before it; it is not an item of its own.",
        chartOverTime: "{field} is a date: lines show how the values change over time.",
        pieSlices: "A pie works for up to about {max} parts; this one has {count}. Bars compare them more easily.",
        stackedTotal: "{value} does not add up, so the top of a stack is no total. Bars show the parts side by side.",
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
        menus: "No need to drag: use + Add, or a field's menu (⋮).",
        cells: "Click a value, or press Enter on it, to see the rows behind it; click a header to sort. The arrow keys move between values."
    },
    tipActions: {
        removeFilters: "Remove filter",
        swap: "Swap rows and columns",
        groupDate: "Group by {unit}",
        saveTemplate: "Save view",
        bars: "Switch to Bars",
        auto: "Show as lines over time",
        colSubtotalsOff: "Hide column subtotals"
    },
    dismissTip: "Dismiss tip",
    tipsTitle: "Tips",
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
    // the field list folded to a rail on a wide report, and opened again
    collapseFields: "Collapse the field list",
    expandFields: "Show the field list",
    dropToRemove: "Drop here to remove",
    // while the report waits for its data or a shared view
    loadingReport: "Loading the report…",
    // a menu whose panel is still loading (on a slow connection, right after the page opened)
    loadingMenu: "Loading…",
    // a menu whose panel could not be loaded (offline, or the host did not deploy dist/chunks/)
    menuFailed: "This menu could not be loaded.",
    tryAgain: "Try again",
    axisEvery: "One label in every {n} is shown; point at a bar or point for its name.",
    // the × in a text field
    clearText: "Clear",
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
    viewFailed: {
        empty: "Paste a view or choose a file first.",
        tooLarge: "This is too large for a view.",
        notJson: "This is neither a view in JSON nor a link to a report.",
        notView: "This is not a view.",
        newer: "This view comes from a newer version and cannot be read here. Update the application to open it.",
        badLink: "This link is damaged or not a link to a report.",
        file: "The file could not be read."
    },
    // filters
    valueConditions: { compare: "{value} {op} {number}", between: "{value} between {from} and {to}", notBetween: "{value} not between {from} and {to}" },
    // the measure a sort or a filter goes by when the view shows no value: the rows counted
    countOfRows: "Count of rows",
    // a rule on the names of a field's items, on its chip and in its menu: "contains “an”"
    labelOps: { equals: "is", notEquals: "is not", contains: "contains", notContains: "does not contain", beginsWith: "begins with", notBeginsWith: "does not begin with", endsWith: "ends with", notEndsWith: "does not end with" },
    // a rule inverted (a loaded view's "not" the menus have no word for): "not (begins with “a”)"
    notRule: "not ({rule})",
    // a relative date range and a date compared, in short (the chip and the Filter level): "last 5 years (2022–2026)", "from 2022"
    relative: { year: "this year", years: "last {count} years", month: "last {count} month", months: "last {count} months", day: "last {count} day", days: "last {count} days" },
    withRange: "{text} ({range})",
    // the range counted back from the data's latest record, and the data's share of a range
    relativeTo: "{text} to {end}",
    // a relative range the menus do not write yet (a loaded view's): its words, and the dates it keeps
    relativeMore: {
        last: {
            hour: { one: "last {count} hour", other: "last {count} hours" }, day: { one: "last {count} day", other: "last {count} days" },
            week: { one: "last {count} week", other: "last {count} weeks" }, month: { one: "last {count} month", other: "last {count} months" },
            quarter: { one: "last {count} quarter", other: "last {count} quarters" }, year: { one: "last {count} year", other: "last {count} years" }
        },
        next: {
            hour: { one: "next {count} hour", other: "next {count} hours" }, day: { one: "next {count} day", other: "next {count} days" },
            week: { one: "next {count} week", other: "next {count} weeks" }, month: { one: "next {count} month", other: "next {count} months" },
            quarter: { one: "next {count} quarter", other: "next {count} quarters" }, year: { one: "next {count} year", other: "next {count} years" }
        },
        before: {
            hour: { one: "before the last {count} hour", other: "before the last {count} hours" }, day: { one: "before the last {count} day", other: "before the last {count} days" },
            week: { one: "before the last {count} week", other: "before the last {count} weeks" }, month: { one: "before the last {count} month", other: "before the last {count} months" },
            quarter: { one: "before the last {count} quarter", other: "before the last {count} quarters" }, year: { one: "before the last {count} year", other: "before the last {count} years" }
        },
        this: { hour: "this hour", day: "today", week: "this week", month: "this month", quarter: "this quarter", year: "this year" },
        rolling: "{text}, rolling",
        withoutCurrent: "{text}, current period excluded",
        fromLatest: "{text}, counted from the latest record",
        fromFirst: "{text}, counted from the first record",
        fromDate: "{text}, counted from {date}",
        until: "until {to}"
    },
    withShare: "{text} ({range}; {missing})",
    noData: { one: "{range} has no data", other: "{range} have no data" },
    compareShort: { "=": "{value}", "!=": "not {value}", ">": "after {value}", ">=": "from {value}", "<": "before {value}", "<=": "up to {value}", between: "{from} to {to}", notBetween: "not {from} to {to}" },
    // the i next to each zone's title (shown while explanations are on)
    zoneInfo: {
        rows: "Rows group the report by a field: each of its items gets a row. Example: Region in Rows lists North, South and West one below the other.",
        cols: "Columns split every row by a field: each of its items gets a column. Example: Year in Columns puts 2024 and 2025 side by side.",
        values: "Values are the numbers in the cells, summed, counted or averaged for each row and column. Example: Revenue in Values shows the revenue of each region.",
        filters: "Filters keep only some items of a field in the whole report, without a row or column for it. Example: Country in Filters with only Germany selected."
    },
    // the result area: bigger, and the full screen
    enlarge: "Enlarge",
    // the same button while the result is enlarged
    reduce: "Reduce",
    fullScreen: "Full screen"
};

/**
 * The first load's texts of each language that is here, by language: English always; another one once
 * addLabels() added it (deferred.js at once, deferred-late.js when a report asks for it). The menus'
 * texts are in menu-labels.js (English) and menu-labels-<lang>.js (menu-texts.js).
 * @type {Record<string, typeof en>}
 */
export const LABELS = { en };

/** @type {Set<() => void>} */
const labelListeners = new Set();

/**
 * Adds a language's first-load texts, and tells the reports waiting for them.
 * @param {string} lang
 * @param {typeof en} texts
 */
export function addLabels(lang, texts) {
    if (LABELS[lang] !== texts) {
        LABELS[lang] = Object.freeze(texts);
        labelListeners.forEach((listener) => listener());
    }
}

/** Calls `listener` whenever a language's texts are added or failed to load; returns the unsubscribe. @param {() => void} listener */
export function onLabels(listener) {
    labelListeners.add(listener);
    return () => void labelListeners.delete(listener);
}

/**
 * The language of a locale, as the labels name it: "de" for "de-DE", "en" without a locale.
 * @param {unknown} locale
 */
export const langOf = (locale) => (typeof locale === "string" ? locale.toLowerCase().split(/[-_]/)[0] : "en");

/** Whether the first-load texts of `locale`'s language are here. @param {unknown} locale */
export const hasLabels = (locale) => Object.hasOwn(LABELS, langOf(locale));

/** Languages whose texts are loading. @type {Set<string>} */
const labelsPending = new Set();
/** Languages whose texts did not load, or not in time (a partial copy of dist/, offline): English stands in. */
const labelsFailed = new Set();
/** Languages whose failure the console was told about: once per page. */
const labelsWarned = new Set();

/** How long a report waits for its language's texts before it shows in English (ms). */
export const LABELS_WAIT_MS = 4000;

/**
 * Whether a report in `locale` can show its texts: its language's are here, have no loader (English
 * stands in, as for any language pivotkit has no texts for), or failed to load.
 * @param {string | undefined} locale
 * @param {Readonly<Record<string, () => Promise<void>>>} loaders  per language not here yet (deferred.js)
 */
export function labelsHere(locale, loaders) {
    const lang = langOf(locale);
    return Object.hasOwn(LABELS, lang) || !Object.hasOwn(loaders, lang) || labelsFailed.has(lang);
}

/**
 * Loads the texts of `locale`'s language once (its loader adds them, addLabels). A failure, or no
 * answer within LABELS_WAIT_MS, lets English stand in and is said once in the console; texts that
 * arrive later still take their place. `again` tries a language that failed once more (a report that
 * mounts after a failure).
 * @param {string | undefined} locale
 * @param {Readonly<Record<string, () => Promise<void>>>} loaders
 * @param {{ again?: boolean }} [options]
 */
export function requestLabels(locale, loaders, { again = false } = {}) {
    const lang = langOf(locale);
    if (again && labelsFailed.has(lang) && !labelsPending.has(lang)) {
        labelsFailed.delete(lang);
    }
    if (labelsHere(locale, loaders) || labelsPending.has(lang)) {
        return;
    }
    labelsPending.add(lang);
    const fail = (why) => {
        if (!labelsFailed.has(lang) && !Object.hasOwn(LABELS, lang)) {
            labelsFailed.add(lang);
            if (!labelsWarned.has(lang)) {
                labelsWarned.add(lang);
                console.warn(`pivotkit: the ${lang} texts did not load, English stands in: ${why}`);
            }
            labelListeners.forEach((listener) => listener());
        }
    };
    const timer = setTimeout(() => fail(`no answer within ${LABELS_WAIT_MS / 1000} s`), LABELS_WAIT_MS);
    loaders[lang]().then(
        () => labelsFailed.delete(lang),
        (error) => fail(messageOf(error))
    ).finally(() => {
        clearTimeout(timer);
        labelsPending.delete(lang);
    });
}

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
    return fill(pluralForm(forms, count, lang), { count: count.toLocaleString(locale) });
}

/**
 * The row count under the result: "15,344 rows", or "5,110 of 15,344 rows" when a filter (Top N and
 * value conditions too) leaves rows of the data out (#108).
 * @param {number} shown  the source rows left after every filter
 * @param {number} total  the data's rows
 * @param {UiLabels} labels
 * @param {string} locale
 */
export function rowCount(shown, total, labels, locale) {
    const lang = { lang: labels.lang, locale };
    return shown < total ? fill(plural(labels.rowsFiltered, total, lang), { shown: shown.toLocaleString(locale) }) : plural(labels.rowsCount, total, lang);
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
 * Label keys the report no longer shows (#580), with the key that holds that text now. A host's
 * labels may still set them; the report ignores them and says so once in the console.
 */
export const REMOVED_LABELS = Object.freeze({ layout: "zonesTitle", showLayout: "zonesTitle", options: "tableSettings", chartDisplay: "chartSettings" });

/**
 * The keys of REMOVED_LABELS a host's labels set, in their order, each with its replacement.
 * @param {unknown} custom
 * @returns {Array<[string, string]>}
 */
export function removedLabels(custom) {
    if (!isObject(custom)) {
        return [];
    }
    return Object.keys(/** @type {object} */ (custom)).filter((k) => Object.hasOwn(REMOVED_LABELS, k)).map((k) => [k, REMOVED_LABELS[k]]);
}

/**
 * The labels for a locale: the language of the locale picks one of LABELS (default en, also for a
 * language not added yet), the host's partial labels are merged over them.
 * @param {string | undefined} locale
 * @param {PartialLabels | object} [custom]
 * @returns {UiLabels}
 */
export function resolveLabels(locale, custom) {
    const lang = langOf(locale);
    const base = Object.hasOwn(LABELS, lang) ? LABELS[lang] : en;
    const own = withLegacyTips(custom);
    // the host's entries this language has no text for here (the menus' texts): kept aside under
    // MENU_TEXTS, merged and checked when the menus load (menu-labels.js)
    return /** @type {UiLabels} */ ({ ...merge(base, own), [MENU_TEXTS]: isObject(own) ? own : {} });
}
