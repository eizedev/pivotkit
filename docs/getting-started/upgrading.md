---
title: Upgrading
description: What a host or a script checks when it moves to the next release of pivotkit - from 0.5 to 0.6 (Table as CSV, Source data, the report's words and the command line) and from 0.4 to 0.5 (view and file format 2, dark theme selectors, the colour scale, labels, font weights, chart text and column subtotals).
---

# Upgrading

Each section lists what changes between two releases and whom it concerns; **Breaking** marks a
change that needs your action when it applies.

## From 0.5 to 0.6 { #from-0-5 }

Hosts of the report change nothing: views, files and links of 0.5 load with the same result, and the
new features are off until you turn them on. Scripts that read what pivotkit-report or the command
line write check the last two rows. Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| [Versions move together](#versions-0-6) | you also install pivotkit-core, pivotkit-report or pivotkit-xlsx yourself | update them to the same release |
| [Export → Table as CSV](#table-as-csv) | your tests or screenshots look for "CSV file (.csv)" | look for "Table as CSV (.csv)" |
| [Source data](#source-data-0-6) | you want people to download the rows | set `exportData` (`export-data`); off by default |
| [The report's words in pivotkit-report](#report-words) | a script reads the words of a report pivotkit-report or the CLI writes | take the new words, or pass `labels: DEFAULT_LABELS` |
| [Command line](#cli-0-6) | a script runs `pivotkit` and reads its exit code, `--json` or stderr | check the list below |

### Versions move together { #versions-0-6 }

Each package depends on the others of the same release, and in 0.x a caret range admits one minor
only. A host that also lists pivotkit-core, pivotkit-report or pivotkit-xlsx itself updates them to
the versions released with pivotkit-react 0.6 (their CHANGELOGs say which), or npm installs two
copies.

### Export → Table as CSV { #table-as-csv }

The Export menu's **CSV file (.csv)** is called **Table as CSV (.csv)** (German **Tabelle als CSV
(.csv)**), so it is not taken for the rows behind the report. Its label key (`exportCsv`) and its
`onExport` kind `"csv"` stay.

### Source data { #source-data-0-6 }

`exportData` (pivotkit-element: `export-data`) adds **Source data** to the Export menu: every row of
the data shown as CSV or JSON. It is off by default because it holds columns no view places; see
[security](../security.md). `onSaveTemplate`, `onPublishTemplate` and the element's
`pivot-template-save` and `pivot-template-publish` also get `source`, the data the view was made for;
a host that ignores it changes nothing.

### The report's words in pivotkit-report { #report-words }

Without `labels`, `render()` (and so `pivotkit render`) writes the report's words in the language of
its locale, German for `de-DE` ("Gesamtergebnis", "Summe von Units"), and in English the words the
report on a page shows: "Yes" and "No" instead of "true" and "false", "Distinct count" instead of
"Count Unique". The HTML report's details give "Rows: 8" (it said "Rows: 8 rows"). Pass
`labels: DEFAULT_LABELS` (pivotkit-core) for the engine's own words.

### Command line { #cli-0-6 }

- A view file or link that names a workbook's sheet the data does not have is an error (exit 2,
  `NO_SHEET`), not a run on the first sheet; `--sheet` reads another.
- `--strict` also fails on `LINES_SKIPPED` (title lines skipped, a warning now) and on the new
  `noRowsKept` (filters that keep no row).
- `--json`: `validate` and `describe` of a view add `uses`; `describe` of a view gives `findings`
  instead of `errors` and `warnings`; `describe` of data gives `rows`, `fields` and `text`; every
  command with data gives `sheet`.
- `-o report.html -f csv` is a usage error (the name and the format disagree).
- Usage errors end with `see "pivotkit help <command>"`, and `render` says on stderr what it wrote
  (`-q` keeps it off).

## From 0.4 to 0.5 { #from-0-4 }

Most hosts change nothing: views, files and links of 0.4 load with the same result. Check the list
below for what your page does; **Breaking** marks a change that needs your action when it applies.
Each package's `CHANGELOG.md` has the full list.

| Change | Applies to you when | Action |
| --- | --- | --- |
| **Breaking:** [view and file format 2](#view-and-file-format-2) | users share views, files or links with a page that still runs 0.4 | upgrade those pages too |
| **Breaking:** [dark theme selectors](#dark-theme-selectors) | your CSS sets `--pk-*` tokens for the dark theme | write them for `[data-pk-theme="dark"]` |
| **Breaking:** [import maps](#import-maps) | your page loads pivotkit-react through an import map | map `pivotkit-report` and `pivotkit-core/chart` |
| [Colour scale in blue](#colour-scale) | you liked red, yellow, green | set three tokens |
| [Column subtotals off](#column-subtotals) | your start view or templates rely on column subtotals | add `totals: { colSubtotals: true }` |
| [Label `filter` removed](#labels) | you pass `labels.filter` | nothing; remove it |
| [Font weights 550 and 650 are 600](#font-weights) | you compare screenshots | nothing, or `--pk-weight-strong` |
| [Chart text 14 px](#chart-text) | you compare screenshots | nothing |

### View and file format 2 { #view-and-file-format-2 }

**Breaking.** The report writes views, [view files](../reference/view-file.md) and links of format
version 2: a filter has one shape with `not` and `blanks`. Views, files and links of version 1 load
with the same result. pivotkit 0.4 refuses a view, file or link of version 2 as newer, so a link
shared from the new release does not open on a page that still runs 0.4. A host that reads the
filters of a normalized view in its own code reads the new shape (pivotkit-core's CHANGELOG lists the
names).

### Dark theme selectors { #dark-theme-selectors }

**Breaking** for a host that sets its own dark colours. Write them for the theme the report shows,
not for an attribute of the page:

```css
/* pivotkit-react */
.pk-root[data-pk-theme="dark"] {
    --pk-surface: #101418;
}
/* pivotkit-element */
pivot-report[data-pk-theme="dark"] {
    --pk-surface: #101418;
}
```

A rule such as `html[data-theme="dark"] .pk-root` keeps working on screen, but the Excel export and
the HTML report read the light theme by showing it on the report for a moment: a rule on the page's
attribute stays active then, and your dark colours land in the file
([Theming, Light and dark](../reference/theming.md#light-and-dark)).

### Import maps { #import-maps }

**Breaking** for a page without a bundler. pivotkit-react imports `pivotkit-report` (on the first
HTML report, SVG or print of the Export menu) and `pivotkit-core/chart` (on the first chart) by their
bare names: add both to the import map
([Bundlers and import maps](react.md#bundlers-and-import-maps)). A bundler and pivotkit-element need
nothing.

### Colour scale { #colour-scale }

A colour scale without colours of its own runs from light to strong blue (`--pk-scale-low` and
`--pk-scale-high`, the heatmap's colours): it says "more", not "good" or "bad". `--pk-scale-mid` is no
longer set; a host that sets it gets a three-colour scale. The colours of 0.4, red over yellow to
green, come back with these tokens (on `pivot-report` for the web component):

```css
.pk-root {
    --pk-scale-low: #f8696b;
    --pk-scale-mid: #ffeb84;
    --pk-scale-high: #63be7b;
}
.pk-root[data-pk-theme="dark"] {
    --pk-scale-low: #c2413f;
    --pk-scale-mid: #b39a2e;
    --pk-scale-high: #3f9a5c;
}
```

The Excel export and the HTML report take them too. A view's own colours are unchanged. With
pivotkit-core alone, pass `theme: { colorScale: ["#f8696b", "#ffeb84", "#63be7b"] }` to `toXlsx`.

### Column subtotals { #column-subtotals }

Column subtotals are off by default; row subtotals and both grand totals stay on. Every view the
report saves, shares or stores names all four totals, so these keep what they showed. A start view, a
template or a view file written by hand without `totals.colSubtotals` shows no column subtotals now:
add `totals: { colSubtotals: true }` to keep them.

### Labels { #labels }

The field list's menu has one entry for filtering, **Add to Filters**; the label key `filter` of the
old "Filter…" entry is gone, and a host's text for it is ignored.

### Font weights { #font-weights }

The font weights are four tokens (`--pk-weight-normal` 400, `--pk-weight-medium` 500,
`--pk-weight-strong` 600, `--pk-weight-bold` 700). The weights 550 (field chips, the drill-down's
path) and 650 (titles, table headers) are 600 (`--pk-weight-strong`); a font without those faces drew
them as 600 or 700 anyway.

### Chart text { #chart-text }

The chart's axes, legend and labels are 14 px (`--pk-chart-text-size`, by default `--pk-small`), not
ECharts' 12 px; labels slant or thin out a little sooner. Text in the report is never below 14 px.
With pivotkit-core alone, `theme: { textSize: 12 }` keeps the old size.
