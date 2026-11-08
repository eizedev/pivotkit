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
        newReport: "Takes every field out, to start over. Undo brings them back; saved views stay.",
        valuesFilter: "Values are not filtered here: filter a field on Rows or Columns through its menu, or move a field to Filters."
    },
    moveLeft: "Move left",
    moveRight: "Move right",
    // the foot of a chip menu: takes the field (or value) out of the report; "Remove" alone is a form's (removeSetting)
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
    newAlready: "The report is empty already.",
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
    groupBy: "Group dates by",
    groupNone: "No grouping (every date and time)",
    groupTimeline: "Along the time line",
    groupCyclic: "Compare periods across years",
    unitHints: {
        year: "2025", yearQuarter: "Q1 2025", yearMonth: "Jan 2025", yearWeek: "2025-W03", day: "Jan 15, 2025",
        quarter: "Q1 of every year", month: "Jan of every year", week: "W03 of every year", weekday: "Mon to Sun", hour: "00:00 to 23:00",
        bin: ""
    },
    bins: "Number ranges",
    binsStart: "Group into ranges…",
    binsState: "Ranges of {size} from {start}",
    binSize: "Range size",
    binStart: "Starting at",
    binStartFar: "Ranges from {start} cannot hold this field's values ({min} to {max}): every row would be blank. Pick a start closer to them.",
    apply: "Apply",
    // what is set in a section of the field menu (its ranges, its Top N, its filters): change it, remove it
    change: "Change",
    removeSetting: "Remove",
    topN: "Top items",
    topStart: "Show top items…",
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
    // every menu section open or folded as at first (the tips stay as they are)
    resetSections: "Reset menu sections",
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
    // before a view for other data is loaded: what does not fit, and the choices
    loadCheckTitle: "This view may not fit this data",
    loadAnyway: "Load anyway",
    switchAndLoad: "Switch to “{source}” and load",
    switchStartsFresh: "Switching shows the other data with this view; Undo starts there.",
    numberInvalid: "Enter a number, such as {example}.",
    countInvalid: "Enter a whole number of 1 or more.",
    sizeInvalid: "Enter a number above 0, such as {example}.",
    chooseValues: "Choose values…",
    valueFilter: "Value condition…",
    valueFilterBy: "Value",
    valueFilterOp: "Condition",
    valueFilterNumber: "Number",
    valueFilterTo: "and",
    valueOps: { "=": "equals", "!=": "does not equal", ">": "greater than", ">=": "greater than or equal to", "<": "less than", "<=": "less than or equal to", between: "between", notBetween: "not between" },
    removeFilter: "Remove filter",
    // collapsible sections of the menus
    moreFormats: "More formats"
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
