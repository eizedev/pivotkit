/*
 * The texts only the menus show (the chip menus, the chart type, Options, Views, the filter and the
 * drill-down), in English; German is menu-labels-de.js, a chunk of its own. They load with the menus
 * (menus.js), so the first load of a page stays small; menuLabels() adds them to the report's
 * labels, with a host's text for one of them (the `labels` prop, kept aside by resolveLabels) over the default, as for any other label.
 */

import { MENU_TEXTS, mergeLabels } from "./labels.js";

/** @typedef {typeof en} MenuTexts */

export const en = {
    // the "i" next to a setting that needs explaining (Options → Help → Show explanations)
    aboutSetting: "About {setting}",
    settingInfo: {
        grandTotalRow: "A last row with the total of every column.",
        grandTotalColumn: "A last column with the total of every row.",
        rowSubtotals: "With two or more fields in Rows: a total row under each group of the outer field.",
        colSubtotals: "With two or more fields in Columns: a total column after each group of the outer field.",
        along: "The direction the calculation walks: Rows goes down the rows of each column, Columns across the columns of each row. A running total adds up along it, a difference compares with the item before it.",
        showAs: "Shows each value as a share, a difference, a running total or a rank instead of the number itself. For percentages, a tip above the result says what 100% is.",
        exportXlsx: "Every number with all its decimals, formats kept, ready to calculate with.",
        exportCsv: "Percentages and calculations as the table shows them, as plain text.",
        copyTable: "The table as it is shown, headers and totals included: tab-separated, pastes into Excel or Google Sheets as columns.",
        copyDataJson: "The table's numbers with their labels as JSON, for a program. Not the view itself: that is Views → Copy view as JSON.",
        drillCopy: "The rows as the panel shows them, with a header row: tab-separated, pastes into Excel or Google Sheets as columns.",
        drillJson: "The rows as JSON objects, with the data's field names and raw values, for a program.",
        groupLabels: "With two or more fields in Rows: the outer field's items written once under the axis, below their categories.",
        labelPosition: "Outside: each slice's name and number next to it. Inside: the number on the slice, the names in the legend; outside when a donut's ring is too thin for it.",
        sharedView: "Only admins can change shared views.",
        valuesFilter: "Values are not filtered here: filter a field on Rows or Columns through its menu, or move a field to Filters."
    },
    // a menu in levels: the way back, a level's title, the search of a menu
    back: "Back",
    backTo: "Back to the menu of {name}",
    levelTitle: "{name} › {topic}",
    searchMenu: "Search in the menu of {name}",
    searchMenuShort: "Search in this menu (key /)",
    searchResults: "Results",
    searchNothing: "Nothing found. Try another word, or clear the search.",
    // the topics of a field's menu and what they show when nothing is set
    sortByValue: "Sort by value",
    sortOldestShort: "Oldest",
    sortNewestShort: "Newest",
    filterTopic: "Filter",
    filterAll: "All",
    groupTopic: "Group",
    groupNoneShort: "None",
    off: "Off",
    moveToTitle: "Move to",
    topOwn: "Top N…",
    binsOff: "Remove ranges",
    // the Filter level: how many items the list keeps, the condition on a value as a sentence
    valueConditionTitle: "Condition on a value",
    nameHint: "Applies with Enter or when you leave the field; Escape gives the name back.",
    // more words the search of a menu finds an entry by
    showAsKeywords: "percent % share",
    nameKeywords: "rename label title",
    filterKeywords: "values pick choose rule rules condition range dates",
    formatDecimals: { one: "Number, {count} decimal", other: "Number, {count} decimals" },
    // the Filter level: what it keeps in words, what its buttons take away, its folded part
    listAnd: " and ",
    // the Filter level's summary card: what shows, why not the rest, the rows and the data's dates
    summaryAll: "All {total} {noun} shown",
    summarySome: "{shown} of {total} {noun} shown",
    summaryNone: "Nothing shown",
    summaryOk: "Every item is picked, no rules.",
    summaryKept: "Every item is picked; the rules keep them all.",
    summaryQuickOnly: "Every item is picked; {quick}.",
    summaryPicks: "{count} left out by your picks",
    summaryQuick: "{count} outside {quick}",
    // {items}: the items left out; the plural form goes by the number of rules
    summaryRules: { one: "{items} left out by the rule", other: "{items} left out by the rules" },
    summaryTotals: { one: "{items} left out by the rule on the total", other: "{items} left out by the rules on the totals" },
    summaryRows: "{rows} of {total} rows",
    summaryData: "data {range}",
    yearsAll: "{years} combined",
    yearsOne: "{year} only",
    emptyPicks: "Nothing is picked.",
    emptyRules: "No {noun} meets {rules}.",
    emptyTotal: "No {noun} has a total {rule} – {spread}.",
    totalSpread: "the totals go from {low} ({lowItem}) to {high} ({highItem})",
    totalWords: "{measure} that {op} {number}",
    totalWordsTwo: "{measure} that {op} {from} and {to}",
    resetFilter: "Reset filter",
    // the nouns of a field's items, by its grouping ("3 of 12 months shown")
    nouns: {
        item: { one: "item", other: "items" },
        value: { one: "value", other: "values" },
        date: { one: "date", other: "dates" },
        year: { one: "year", other: "years" },
        quarter: { one: "quarter", other: "quarters" },
        month: { one: "month", other: "months" },
        week: { one: "week", other: "weeks" },
        day: { one: "day", other: "days" },
        weekday: { one: "weekday", other: "weekdays" },
        hour: { one: "hour", other: "hours" },
        range: { one: "range", other: "ranges" }
    },
    // the Filter level of a date field: its quick choices ("Last [5] years" around the number typed),
    // each with the data's share and the rows it keeps, the ones not offered, the reference date
    quickTitle: "Quick choices",
    quickCount: { year: "Number of years", month: "Number of months", day: "Number of days" },
    quickLast: { year: { one: "Last {count} year", other: "Last {count} years" }, month: { one: "Last {count} month", other: "Last {count} months" }, day: { one: "Last {count} day", other: "Last {count} days" } },
    quickRows: "{rows} rows",
    quickHidden: { one: "{choices} is not offered: the data end {latest}.", other: "{choices} are not offered: the data end {latest}." },
    anchorLabel: "Counted back from",
    anchorToday: "today ({date})",
    anchorLatest: "the latest record ({date})",
    quickLine: "Quick choice: {text}",
    changeAbove: "change it above",
    // a cyclic grouping ("month of the year") combines the years: the ones ticked
    yearsCombined: "Years combined",
    yearsCombinedHint: "one {noun} over the years ticked",
    yearsCombinedOne: "The table shows {year} only.",
    // the foldable sections: the items to pick, the rules, with their state and what takes them off
    pickItems: "Pick items",
    picksState: "{picked} of {total} picked",
    picksAll: "all {total} picked",
    clear: "Clear",
    clearPicks: "Clear picks",
    rulesState: { one: "{count} rule", other: "{count} rules" },
    rulesNoneState: "No rules",
    removeAll: "Remove",
    removeRules: "Remove the rules",
    tailOut: { one: "Left out by the rules ({count}) – its tick applies again once they go", other: "Left out by the rules ({count}) – their ticks apply again once they go" },
    rulesKeep: "Keep the {noun} for which all of these are true:",
    rulesNone: "Keep the {noun} for which all of these are true. Add one below.",
    ruleKeeps: "Keeps {kept} of {total} {noun}",
    ruleKeepsNone: "Keeps 0 of {total} {noun} – {spread}.",
    ruleIncomplete: "Applies once it is complete.",
    explainRule: "Explain this rule",
    // the "i" of a rule: what it compares, with an example
    ruleInfo: {
        number: "Compares the value itself, not its total. Example: “is between 20 and 25” keeps the values from 20 to 25.",
        date: "Compares each date by its calendar day. Example: “is before Mar 1, 2022” keeps every day up to Feb 28, 2022.",
        group: "Compares each {noun} by its place on the time line. Example: “is from 2022” keeps 2022 and every later one.",
        cyclic: "Compares each {noun} by its place in the year, over all the years combined. Example: “is from Jun” keeps Jun to Dec.",
        total: "The total is the {noun}’s Grand Total – the {measure} over {scope}, as the Grand Total row shows it – not a single cell. Example: “is greater than 20” keeps the {nouns} whose total is above 20.",
        name: "Compares the name of each {noun} as the table writes it. Example: “contains ar” keeps Mar and March."
    },
    scopeItems: "all {count} {field} items",
    scopeDates: "the dates {range}",
    scopeRows: "every row",
    // the searchable picker of a rule's item (a long list): its search, its matches
    pickerSearch: "Search items",
    pickerMatch: "{count} of {total} match",
    pickerNone: "No match",
    // the rules under "More ways to filter", all of them together: on the item, its total, its name
    rulesTitle: "Rules",
    ruleAnd: "and",
    addRule: "Add a rule",
    addRuleItem: "Compare {field}",
    addRuleTotal: "Compare its total",
    addRuleName: "Rule on the name",
    removeRule: "Remove this rule",
    rulesFull: "At most {max} rules per field.",
    ruleName: "The name",
    ruleValue: "Value",
    ruleDate: "Date",
    dateOps: { "=": "is", "!=": "is not", ">": "is after", ">=": "is from", "<": "is before", "<=": "is up to", between: "is between", notBetween: "is not between" },
    lastOp: { one: "is in the last", other: "is in the last" },
    ruleUnits: { year: { one: "year", other: "years" }, month: { one: "month", other: "months" }, day: { one: "day", other: "days" } },
    // a rule on the total, as a sentence: "Product items whose / Count of Cycle / is greater than / 3"
    ruleWhose: "{field} items whose total",
    blanksOut: "Blank items are not kept.",
    ruleUnit: "Unit",
    moveLeft: "Move left",
    moveRight: "Move right",
    // the last item of a chip menu: takes the field (or value) out of the report
    remove: "Remove field",
    // the hint of "Automatic" in the chart type menu: the type it draws for this view
    chartAutoNow: "Now: {type}",
    // the Views menu: the host's shared views, the user's own ("My views") and the browser store
    sharedViews: "Shared views",
    myViews: "My views",
    noViews: "No saved views yet.",
    // My views of the browser store while it is empty: one line with the storage note's gist
    noViewsStore: "None yet. Saved views stay in this browser only.",
    publishView: "Publish {name} as a shared view",
    publishConfirm: "Publish “{name}” as a shared view? Everyone who uses this report sees it.",
    publishAction: "Publish",
    storeNote: "Kept in this browser only: not on other devices, and gone when the site's data is cleared.",
    storeFull: "this browser keeps at most {max} views",
    storeTooLarge: "the views would take more than {max} characters",
    storeRefused: "this browser did not keep it (storage blocked or full)",
    storeChanged: "the views were changed in another tab; open the menu again",
    // what a save, a delete or a publish in the Views menu came to; "Rejected": the host refused
    // without saying why (a rejected promise without a message)
    toastSaved: "View “{name}” saved",
    toastDeleted: "View “{name}” deleted",
    toastPublished: "View “{name}” published",
    toastSaveFailed: "The view could not be saved: {message}",
    toastDeleteFailed: "The view could not be deleted: {message}",
    toastPublishFailed: "The view could not be published: {message}",
    toastSaveRejected: "The server could not save the view.",
    toastDeleteRejected: "The server could not delete the view.",
    toastPublishRejected: "The server could not publish the view.",
    deleteView: "Delete {name}",
    deleteConfirm: "Delete “{name}”?",
    deleteAction: "Delete",
    saveView: "Save current view",
    viewName: "Name of the view",
    // the Views menu's first group: the view shown; Save writes the loaded view under its name
    thisView: "This view",
    saveNamed: "Save “{name}”",
    saveAs: "Save as…",
    saveSharedLocked: "Shared view: you cannot change it. Use Save as.",
    saveNotInViews: "Not saved yet. Use Save as.",
    replaceConfirm: "“{name}” exists. Replace it?",
    replaceAction: "Replace",
    replaceSharedConfirm: "Replace the shared view “{name}” for everyone?",
    save: "Save",
    cancel: "Cancel",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    // chip menus
    aggregation: "Summarize by",
    moreStatistics: "More statistics",
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
    sortOldest: "Oldest first",
    sortNewest: "Newest first",
    groupNone: "No grouping (every date and time)",
    groupTimeline: "Along the time line",
    groupCyclic: "Same period every year",
    unitHints: {
        year: "2025", yearQuarter: "Q1 2025", yearMonth: "Jan 2025", yearWeek: "2025-W03", day: "Jan 15, 2025",
        quarter: "Q1 of every year", month: "Jan of every year", week: "W03 of every year", weekday: "Mon to Sun", hour: "00:00 to 23:00",
        bin: ""
    },
    bins: "Number ranges",
    binsState: "Ranges of {size} from {start}",
    binSize: "Range size",
    binStart: "Starting at",
    binStartFar: "Ranges from {start} cannot hold this field's values ({min} to {max}): every row would be blank. Pick a start closer to them.",
    apply: "Apply",
    // the Top items level
    topN: "Top items",
    topCount: "Count",
    bottom: "Bottom",
    topBy: "by",
    searchValues: "Search values",
    selectAll: "Select all",
    selectNone: "Select none",
    onlyThis: "Only",
    valuesShown: "{shown} of {total} values; search to find more",
    conditionNumber: "Condition on the label",
    conditionNone: "No condition",
    conditionValue: "Text",
    selected: "{count} selected",
    // the Export menu
    exportDownload: "Download",
    exportCopy: "Copy",
    exportXlsx: "Excel workbook (.xlsx)",
    exportCsv: "CSV file (.csv)",
    exportPng: "Chart image (.png)",
    exportPngNeedsChart: "Switch to Chart first.",
    exportNeedsField: "Add a field first.",
    copyTable: "Copy table",
    copyDataJson: "Copy data as JSON",
    toastTableCopied: "Table copied: tab-separated, pastes into Excel or Google Sheets as columns",
    toastDataCopied: "Data copied as JSON",
    toastCopyBlocked: "This page does not allow copying. Download a file instead.",
    // drill-down
    drillTitle: "Rows behind this value",
    drillCount: { one: "{count} row", other: "{count} rows" },
    drillShown: "Showing the first {shown} of {count} rows",
    drillCopy: "Copy",
    drillJson: "Copy as JSON",
    drillCsv: "Download CSV",
    drillXlsx: "Download Excel",
    // what an export of the panel's rows holds: all of them, or the first of more
    drillPart: "{shown} of {count} rows",
    drillCopied: "Copied {rows}: tab-separated, pastes into Excel or Google Sheets as columns",
    drillCopiedJson: "Copied {rows} as JSON",
    drillExported: "Exported {file} ({rows})",
    drillExportNote: "Holds the first {shown} of {count} rows, as shown here.",
    showTips: "Show tips",
    // the "i" of the settings, the zones and the field descriptions
    showSettingInfo: "Show explanations",
    resetTips: "Show dismissed tips again",
    // read after the state of a menu row when it is not the default (its dot)
    sectionChanged: ", changed",
    help: "Help",
    shortcutsTitle: "Keyboard shortcuts",
    // the keys of the shortcuts; "Mod" is Ctrl, or ⌘ on a Mac
    keys: { Mod: "Ctrl", Shift: "Shift", "Arrow keys": "Arrow keys", Enter: "Enter", Space: "Space", Escape: "Escape", F10: "F10" },
    shortcuts: {
        undo: "Undo",
        redo: "Redo",
        move: "Move between values in the table",
        open: "Open the rows behind a value; sort by a header; open a menu",
        drag: "Pick up a field or chip, and drop it",
        close: "Close a menu, a panel or a tip",
        fields: "In the field list: up and down between fields, left and right to a field's grip, its “i” and its menu",
        fieldMenu: "Open the menu of the field in focus"
    },
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
    defaultName: "Use the default name",
    // sharing a view (the Views menu): the group's title
    shareThisView: "Share this view",
    copyLink: "Copy link",
    copyJson: "Copy view as JSON",
    downloadView: "Download view (.pivotkit.json)",
    // said where a view leaves the report as a file, as JSON or as a link
    sharePrivacy: "A view holds the names of fields and, in its filters, the values chosen there: share it only where those may be seen.",
    loadView: "Open view file…",
    loadViewHint: "Paste a view file, a view as JSON or a link, or choose a .pivotkit.json file.",
    loadViewText: "View as JSON or link",
    chooseFile: "Choose file…",
    load: "Load",
    // before a view for other data is loaded: what does not fit, and the choices
    loadCheckTitle: "This view may not fit this data",
    loadAnyway: "Load anyway",
    switchAndLoad: "Switch to “{source}” and load",
    switchStartsFresh: "Switching shows the other data with this view; Undo starts there.",
    numberInvalid: "Enter a number, such as {example}.",
    countInvalid: "Enter a whole number of 1 or more.",
    countMax: "Enter a whole number up to {max}.",
    sizeInvalid: "Enter a number above 0, such as {example}.",
    valueFilterBy: "Value",
    valueFilterOp: "Condition",
    valueFilterNumber: "Number",
    valueFilterTo: "and",
    // a value condition as a sentence: "… whose Sum of Units is greater than 10"
    valueOps: { "=": "is", "!=": "is not", ">": "is greater than", ">=": "is at least", "<": "is less than", "<=": "is at most", between: "is between", notBetween: "is not between" },
    // the second group of a level's choices
    moreFormats: "More formats",
    // Options: the totals, and why one would change nothing; expand and collapse all, and what they did
    totals: "Totals",
    grandTotalRow: "Grand total row",
    grandTotalColumn: "Grand total column",
    rowSubtotals: "Row subtotals",
    colSubtotals: "Column subtotals",
    needsRowField: "Needs a field in Rows.",
    needsColField: "Needs a field in Columns.",
    needsRowFields: "Needs two or more fields in Rows.",
    needsColFields: "Needs two or more fields in Columns.",
    expandNothing: "Nothing is collapsed.",
    collapseNeedsRows: "Needs two or more fields in Rows.",
    collapseAllDone: "Every group is collapsed already.",
    groupsCollapsed: { one: "{count} group collapsed", other: "{count} groups collapsed" },
    groupsExpanded: { one: "{count} group expanded", other: "{count} groups expanded" },
    // the chart type menu: how the chart is drawn
    chartDisplay: "Display",
    // what sharing and the exports said (share-actions.js, export-run.js)
    toastExported: "Exported {file}",
    toastLinkCopied: "Link copied",
    toastJsonCopied: "View copied as JSON",
    toastCopyFailed: "This page does not allow copying. Use “Download view” instead.",
    toastLinkTooLong: "This view is too large for a link. Use “Download view” instead."
};

/**
 * The menus' texts of each language loaded: English always (the fallback), another once its chunk
 * has loaded (menu-labels-de.js; lazy-menus.jsx loads it with the menus and adds it here).
 * @type {Map<string, MenuTexts>}
 */
const LOADED = /* @__PURE__ */ new Map([["en", en]]);

/** Adds the menus' texts of a language, once its chunk has loaded. */
export function addMenuTexts(lang, texts) {
    LOADED.set(lang, texts);
}

/** Whether the menus' texts of a language are here. */
export const hasMenuTexts = (lang) => LOADED.has(lang);

/** Labels and the menus' texts merged once per labels object (and the language's texts it used). */
const done = /* @__PURE__ */ new WeakMap();

/**
 * The report's labels with the menus' texts of their language (English for a language of a host's
 * own, or while that language's texts still load), a host's own texts for them applied.
 * @param {import("./labels.js").UiLabels} labels
 * @returns {import("./labels.js").UiLabels}
 */
export function menuLabels(labels) {
    const base = LOADED.get(labels.lang) ?? en;
    const known = done.get(labels);
    if (known && known.base === base) {
        return known.out;
    }
    // a host's texts (kept aside by resolveLabels) over the defaults, checked as every label is
    const out = /** @type {import("./labels.js").UiLabels} */ ({ ...labels, ...mergeLabels(base, /** @type {any} */ (labels)[MENU_TEXTS]) });
    done.set(labels, { base, out });
    return out;
}
