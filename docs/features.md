---
title: Feature list
description: Every feature of pivotkit, also the small behaviours, grouped by area, each with a link to its details.
---

# Feature list

Every feature of pivotkit, grouped by area, with the small behaviours that make it work. The short
version is [What pivotkit does](overview.md).

## Data

- Rows are plain objects; each key is a field. Columns are typed (text, number, date, yes/no) and stored as typed arrays ([engine](reference/core.md#encoderows-options)).
- Column names match case-insensitively; the data's own spelling is shown ([core](reference/core.md#data)).
- Dates are read as wall-clock times in the report's `timeZone`, default UTC, never the machine's ([time zones](concepts/limits.md)).
- Numbers sent as text can be read as numbers (`inferNumbers`, `fieldDefaults.type`) ([fields](concepts/fields.md)).
- A host that renders on every change passes `dataKey`: the rows are encoded once per key ([React props](reference/react.md#props)).
- A data set larger than 10,000 rows paints the skeleton first and is encoded in the next frame ([loading](#embedding)).

## Zones and fields

- Four zones: Rows, Columns, Values, Filters; drag, click or a menu place a field ([guide](guide.md#adding-fields)).
- A click on a field: numbers go to Values (each click adds another value), the rest to Rows; a field in Columns or Filters moves to Rows; a field in Rows already stays, and the status line says so ([guide](guide.md#adding-fields)).
- The grip of a field says "Drag into a zone"; a click on it opens the field's menu ([guide](guide.md#adding-fields)).
- The field menu: Add to Rows, Columns, Values, Filters, and "Filter…" for a field not placed yet ([filters](#filters)).
- Each zone's title has an "i" that says what the zone does, with an example; Options, Help switches it ([guide](guide.md#menus-and-text-fields)).
- Chips show what is set on them: "3 of 4", "Top 5", "Sum of Revenue > 1,000" (a long condition ends in "…"), the sort; screen readers hear the same ([guide](guide.md#chips)).
- After a removal the focus goes to the neighbouring chip, or to the zone; a note in the status line offers Undo ("Region removed") ([guide](guide.md#chips)).
- A field that leaves the report (its x, Remove, dragged to the field list) takes its filters and its sort with it ([filters](concepts/filters.md#filters-in-the-ui)).
- An empty report shows three first steps and up to three saved views to start from ([guide](guide.md#adding-fields)).
- Sort by label; "Largest … first" and "Smallest … first" for each value that gives a number, so with several values the user picks the one that orders the items; "Custom order" when the host gives a field its order of items ([filters](concepts/filters.md#sorting)).
- Swap rows and columns sits above Columns; it drops its text where the zone is narrow ([React reference](reference/react.md#layout)). It swaps the fields, the collapsed groups and the direction of calculations (% of row total to % of column total, along Rows to along Columns) ([guide](guide.md#the-table)).
- The field search finds names, display names and descriptions; its × and Escape empty it ([guide](guide.md#menus-and-text-fields)).
- A long field name takes two lines in the field list, with the whole name on hover ([guide](guide.md#adding-fields)).

## Toolbar and layout

- Undo (Ctrl+Z, ⌘Z on a Mac) and Redo (Ctrl+Shift+Z or Ctrl+Y, ⌘⇧Z) for every change, also as buttons; Reset goes to the start view as one step ([guide](guide.md#undo-saved-views-and-export)).
- An entry that would do nothing is greyed out: Undo and Redo without a step, Reset at the start view, the PNG export without a drawn chart, "Show dismissed tips again" without a dismissed tip, Expand and Collapse all when nothing changes, a total that changes nothing in the layout, Save and Load without text ([guide](guide.md#undo-saved-views-and-export)).
- A greyed-out entry whose reason is not obvious says why in a short line under it, only while it is greyed out ("Switch to Chart first.", "Needs two or more fields in Rows.") ([guide](guide.md#undo-saved-views-and-export)).
- Options, Help, Keyboard shortcuts lists the keys ([guide](guide.md#tips)).
- Toolbar buttons that do not fit move into More by a fixed priority, Reset first, then Layout, Views, Options, the chart type; by the report's width, not the length of the texts, so English and German show the same buttons; Table or Chart, Undo with Redo next to it and Export always stay ([guide](guide.md#small-screens)).
- A low report (below 600 px, a narrow one below 820 px) folds its zones into one line that says what is in them and shows at most one tip; Layout opens them ([layout](reference/react.md#layout)).
- Layout keeps its name and its place; it shows pressed while the zones are open (`aria-pressed`), and in More it is an entry with a check ([guide](guide.md#small-screens)).
- A report without a height of the host's, lower than its toolbar, zones, tips and the result's least height (240 px, 280 px narrow) need, grows so the page scrolls; with a height (a card) it stays inside and the table scrolls; `grow` / `grow` decides it either way ([layout](reference/react.md#layout)).
- A menu whose code could not be loaded (offline, `dist/chunks/` not deployed) says so with Try again ([files](reference/react.md#files-the-package-loads)).
- Enlarge, at the top right of the result: the result fills the report, the field list, zones, tips and notes step aside, one line names the fields; Escape or the button brings them back; not part of the view ([guide](guide.md#more-room-for-the-result)).
- While enlarged the button reads Reduce (Verkleinern), pressed (`aria-pressed`) ([guide](guide.md#more-room-for-the-result)).
- Full screen, next to it: the whole report on the screen (Fullscreen API, also in the web component's shadow root); Escape leaves it; not offered where the browser cannot ([guide](guide.md#more-room-for-the-result)).
- Below 640 px of the report's own width the field list is a drawer opened with Fields in the toolbar, and menus open as sheets from the bottom ([layout](reference/react.md#layout)).
- On a phone More and every menu are a sheet at the bottom of the window, at most 82 % of its height, scrolling inside: every entry is reachable ([guide](guide.md#small-screens)).
- The drawer closes with its x ("Close field list"), Escape or a tap beside it, and by itself after a field is added from it, its "Filter…" opens or a drag starts ([guide](guide.md#small-screens)).
- Status messages at the bottom edge of the part of the report on screen (under the result, or at the bottom of the window when the report reaches past it): at most two, each for 6 seconds, longer while the pointer or the focus is on it; errors stay until closed ([guide](guide.md#status-messages)).
- A loaded view is a note with Undo ("View loaded", "Opened the view from the link"); with parts left out it is a warning ("View loaded; some parts did not fit this data") that goes like any note ([guide](guide.md#status-messages)).
- "Some parts of the view were not used: N" above the result, for a saved view, link or file that names what the data lacks; it opens to up to 20 parts (in words, or with their path and why) and stays until dismissed with its x or another view is loaded ([guide](guide.md#parts-of-a-view-that-were-not-used)).
- The wheel over a menu stays in it: the table and the page behind never scroll; a menu is never higher than the window ([guide](guide.md#menus-that-are-long)).
- Menu sections fold with their title; the frequent ones are open (Summarize by, Show as; Sort, grouping, ranges, top items, Filters), the rest folded; what the user opens or folds is remembered like the tips ([guide](guide.md#menus-that-are-long)).
- An "i" next to a setting that needs explaining (totals, Show as, Along, the export formats, the chart's Labels and Group labels), on hover, focus or tap; menu rows stay one line; Options, Help, "Show explanations" hides them all, `settingInfo` decides it for the host ([guide](guide.md#menus-and-text-fields)).
- Data without columns says "The data has no columns."; an error shows "The report cannot be shown: …"; a limit says what to change ([guide](guide.md#when-the-report-cannot-show-anything)).

## Values

- Sum, count, average, median, minimum, maximum, distinct count, statistics, first and last ([values](concepts/values.md)).
- Show as: shares of totals and parents, running totals, differences, ranks ([values](concepts/values.md)).
- Number formats, a colour scale or data bars ([values](concepts/values.md)).
- Show as, Number format and Highlight appear only for a value that gives a number (not a list of distinct values, first or last of a text, average, median, minimum or maximum of dates) ([values](concepts/values.md#in-the-values-menu)).
- The calculations along an axis (differences, running totals, ranks) have an "Along" switch, Rows or Columns ([values](concepts/values.md#in-the-values-menu)).
- The menu offers ten formats, five of them (whole number, compact, bytes, durations) under "More formats"; other formats of a view (`percent100`, `date`, `text`, `currency:USD`, ...) work and are kept, but are not in the menu ([values](concepts/values.md#in-the-values-menu)).
- A value's name: the × gives it the default name back at once, as one undo step ([guide](guide.md#menus-and-text-fields)).
- The Values menu says that filtering happens on Rows or Columns, or by moving a field to Filters ([guide](guide.md#values)).

## Filters

- Values with row counts, search, Select all, Select none, Only; a condition on the labels by the field's type: "Text condition" for text, "Condition on the label" for a number, none for a date or a grouping of one and a yes/no field ([filters](concepts/filters.md)).
- At most 300 values listed, then "300 of 1,045 values; search to find more"; Select all and Select none act on what the search finds; "N selected" at the top ([filters](concepts/filters.md#filters-in-the-ui)).
- The values left out are stored (`exclude`), so values new in later data show; every value ticked removes the filter ([filters](concepts/filters.md#filters-in-the-ui)).
- A value condition, "Value filter…" in a row or column field's menu: a value, an operator (equals to not between) and one or two numbers; the chip and the menu show it as "Sum of Revenue > 1,000"; Clear removes it ([filters](concepts/filters.md#filters-in-the-ui)).
- The chip menu says what the filter keeps ("Filter: 15 of 45", "Filter: contains “an”") in the accent colour, with "Remove filter" right below ([guide](guide.md#filters)).
- The filter popover has "Remove filter" at its top while the field is filtered ([guide](guide.md#filters)).
- The × of the text condition removes it at once; the values chosen stay a draft ([guide](guide.md#filters)).
- "Filter…" of a field not placed opens its filter at once; Apply places it in Filters, Cancel changes nothing ([guide](guide.md#filters)).
- A field keeps its filter when it moves between Filters, Rows and Columns ([filters](concepts/filters.md)).
- Numbers in the menus (value condition, Top N, ranges) are typed as the report's language writes them ("1.000,5" in German), a plain "1000.5" everywhere; anything else gets a note under the field ([filters](concepts/filters.md#filters-in-the-ui)).
- A value condition compares the raw aggregated value, not a "show as" percentage; between writes the smaller number first ([filters](concepts/filters.md#filters-in-the-ui)).
- Top or bottom N by a value the user picks (the first one by default), with a notice what it does to totals ([filters](concepts/filters.md#filters-in-the-ui)).

## Dates

- A date is grouped as it is placed, by the span of its values ([dates](concepts/dates.md)).
- A grouping is named in words: "Created by month", in German "Erstellt nach Monat" ([dates](concepts/dates.md)).
- Along the time line or across years; numbers into ranges with "Starting at", whose × empties it ([dates](concepts/dates.md)).

## Chart

- Automatic (the default until the user picks a type): lines when a date along the time line is on Rows (a weekday or hour of day is categories: bars), lines with the dates along the axis when they are on Columns (swapped for the chart alone), else bars; the menu's "Automatic" says what it draws now ([charts](concepts/charts.md#the-chart-type)).
- Bars, stacked bars, horizontal bars, lines, area, pie (a whole circle), donut (a ring), heatmap; a click opens the rows behind a mark ([charts](concepts/charts.md)).
- Display: value labels, legend, title, smooth lines, axis labels, group labels, kept in the view ([charts](concepts/charts.md#display-settings-for-the-people-who-use-the-report)).
- A pie or a donut writes its labels outside (name and number on a line to the slice) or inside (the number on the slice, in a colour that reads on it; the legend names the slices); not offered while value labels are off ([charts](concepts/charts.md#display-settings-for-the-people-who-use-the-report)).
- Axis labels: every one when they fit, slanted when needed, else every n-th with a note; long names end in "…", the tooltip has them whole ([charts](concepts/charts.md)).
- Two fields in Rows: the outer field's items as group labels under the axis, with separators; automatic ones only where the chart has room (not on a phone), On forces them ([charts](concepts/charts.md)).
- A title wider than the chart ends in "…", on screen and in the PNG ([charts](concepts/charts.md)).
- A tip suggests bars for lines over categories without an order, with Switch to Bars ([charts](concepts/charts.md)).
- A chosen type over dates gets a tip with "Show as lines over time"; a pie or donut of more than 7 slices one with "Switch to Bars"; a pie with a field on Columns says that it adds up the columns ([charts](concepts/charts.md#the-chart-type)).
- A heatmap's colour scale writes its ends in the value's number format; a pie's share is written as the language writes percentages ("35.7%", "35,7 %") ([charts](concepts/charts.md)).
- `chartOptions` for developers: plain JSON merged over the option, the host wins; markup, addresses and text templates (a string `formatter`, `rich`, `link`, `image`) are left out ([charts](concepts/charts.md#chartoptions-for-developers)).
- At most 50 categories, with a notice; a text alternative for screen readers ([charts](concepts/charts.md)).
- The tooltip: the category's whole name and a line per series with its colour and formatted value; a pie's slice; a heatmap's row, column and value; plain text, never HTML ([charts](concepts/charts.md)).

## Table

- Subtotals and grand totals in Options; groups expand and collapse ([guide](guide.md#the-table)).
- A total that would change nothing is greyed out with what it needs: the grand total row a field in Rows, the grand total column one in Columns, subtotals two or more fields on their axis ([guide](guide.md#the-table)).
- Expand all and Collapse all (the groups of Rows) are offered only when they change something, say why not ("Nothing is collapsed.", "Needs two or more fields in Rows.", "Every group is collapsed already."), and report "5 groups collapsed" ([guide](guide.md#the-table)).
- Headers and row labels stay in place; the body is virtual from 300 rows ([layout](reference/react.md#layout)).
- Row labels wrap between words and keep at least 5.5em on a phone, so a common word is never cut; a longer one breaks at a hyphen of its own, a word longer than the column as a last resort ([layout](reference/react.md#layout)).
- Headers drag into a zone ([guide](guide.md#the-table)).

## Drill-down

- Click, Enter or Space on a value: the rows behind it, formatted as the table, up to `drillDownLimit`; with more, "Showing the first 1,000 of 4,210 rows" ([guide](guide.md#the-rows-behind-a-number)).
- The panel is modal: the focus stays in it; Escape, its close button or a click beside it closes it and returns to the value ([guide](guide.md#the-rows-behind-a-number)).
- `onCellClick` gives the host the cell and its rows ([React props](reference/react.md#props)).

## Export

- Excel with formats, merged headers and highlighting; CSV safe against formulas; the chart as PNG with what is drawn ([guide](guide.md#undo-saved-views-and-export), [security](security.md)).
- Every file passes `onExport` first (`xlsx`, `csv`, `png`, and `json` for a downloaded view file) ([React props](reference/react.md#props)).
- The CSV is UTF-8 with a byte order mark; the XLSX sheet is named after `fileName` (valid for Excel, at most 31 characters); the PNG is at twice the screen's resolution on the report's background colour ([guide](guide.md#undo-saved-views-and-export)).
- The export menu explains Excel and CSV with an "i" each; the chart image says "Switch to Chart first." while the table is shown ([guide](guide.md#undo-saved-views-and-export)).

## Sharing

- The Views menu: Saved views and Share ([sharing](concepts/sharing.md#in-the-views-menu-for-the-people-who-use-the-report)).
- Copy link (with `shareLink`), Copy view as JSON, Download view (.pivotkit.json), Load view… from text, a link or a file ([sharing](concepts/sharing.md)).
- What is shared is a view file: the view with its name, the data it was made for (`source`) and the fields it uses, in a documented, versioned format with a JSON Schema ([view file format](reference/view-file.md)).
- The JSON Schema ships in pivotkit-core (`pivotkit-core/schema/view-file-1.json`) and is published on this site; `$schema` points to it, to a host's own copy (`schemaUrl` / `schema-url`) or is left out ([view file format](reference/view-file.md#the-fields)).
- A downloaded view is named `<name>.pivotkit.json` after the view's name, else the data's name, else `fileName` ([sharing](concepts/sharing.md#in-the-views-menu-for-the-people-who-use-the-report)).
- The Share section says that a shared view holds the values chosen in its filters ([sharing](concepts/sharing.md#in-the-views-menu-for-the-people-who-use-the-report)).
- A view made for other data (another `source.id`, fields missing or of another type) asks before it loads: Load anyway, Cancel, or Switch to its data and load (`sources`, `onSourceSwitch`) ([sharing](concepts/sharing.md#before-a-view-for-other-data-is-loaded)).
- A link in the page's address made for other data asks the same before it opens (Load anyway, Cancel, Switch), above the result; the check takes the focus when it replaces the Load view form ([sharing](concepts/sharing.md#before-a-view-for-other-data-is-loaded)).
- A view file of a newer format or view version is refused with "Update pivotkit to open it." ([view file format](reference/view-file.md#reading-a-view-file)).
- An in-browser check of a view file on the documentation site, with the real pivotkit-core and no upload ([view file format](reference/view-file.md#check-a-view-file)).
- Load view refuses a text of more than 1,000,000 characters or a file of more than 1,000,000 bytes: "This is too large for a view." ([sharing](concepts/sharing.md#in-the-views-menu-for-the-people-who-use-the-report)).
- Links carry the view file's link profile compressed in the fragment, `#pivot=` or `#pivot-<storageKey>=`, size-capped; the rest of the fragment (a hash route) stays byte for byte ([sharing](concepts/sharing.md#links-for-developers)).
- `shareLink` true links to the page without its query string; a host that wants its query passes the whole URL ([sharing](concepts/sharing.md#links-for-developers)).
- A link at load is where the report starts; a link opened later in the same tab is one step Undo takes back ([sharing](concepts/sharing.md#links-for-developers)).
- A loaded or linked view is normalized; what was left out is named in plain words ([sharing](concepts/sharing.md)).
- `persistView="session"` keeps the view per tab; Reset stores the start view ([sharing](concepts/sharing.md#keeping-the-view-per-tab)).
- The playground's address holds data set, start template and view ([demo](demo.md#the-playgrounds-url-parameters)).

## Saved views

- The host's `templates`, under Saved views in the Views menu: load, save under a name (up to 120 characters, Enter saves), delete with a confirmation; the host stores them ([views](concepts/views.md#saved-views-in-the-ui)).
- After Save the Views menu stays open with the new entry, the name field empty and Copy link one click away ([views](concepts/views.md)).
- The name field has an ×; Escape in it empties it first, then closes the menu ([guide](guide.md#menus-and-text-fields)).

## Tips

- One at a time, the most important first; the next waits until it is followed or dismissed; dismissible and remembered per `storageKey`; the tip to save goes after a save ([tips](reference/react.md#tips)).
- Notices for a cut or empty result always show ([tips](reference/react.md#tips)).

## Field descriptions

- Labels, descriptions and links per field, also from a JSON Schema or OpenAPI document ([fields](concepts/fields.md)).
- Options, Help, "Show explanations" hides every "i": of a field, a zone and a setting; screen readers keep the text; `fieldInfo`, `zoneInfo` and `settingInfo` decide one kind each for the host ([React props](reference/react.md#props)).

## Accessibility

- Every action by keyboard and by a menu; drag and drop is never the only way ([guide](guide.md#keyboard-and-screen-readers)).
- Menus: arrow keys, Home and End; the table: arrow keys, Enter or Space opens a value ([guide](guide.md#keyboard-and-screen-readers)).
- The field list is one stop of the Tab order: up and down between fields, left and right to a field's grip, "i" and menu, Shift+F10 opens its menu, Enter adds it; "Skip to the toolbar" before it; listed under Keyboard shortcuts ([guide](guide.md#keyboard-and-screen-readers)).
- While a report layer is open, Escape closes the newest one, also with the focus on the host page; a host dialog keeps its Escape with `preventDefault()` ([React reference](reference/react.md#escape-and-the-host-page)).
- Focus kept or moved on purpose; the × of a text field keeps the focus in it ([guide](guide.md#menus-and-text-fields)).
- Text of at least 14 px, controls of at least 24 x 24 px, 44 px for the small ones on a touch screen (`--pk-target-touch`), contrast checked in both themes ([theming](reference/theming.md)).
- The skeleton is one status message ("Loading the report…", announced once); reduced motion stops its shimmer ([React props](reference/react.md#props)).

## Theming

- Every colour, size and duration is a `--pk-*` token; light and dark ([theming](reference/theming.md)).

## Languages

- English and German; numbers and dates in the locale; every text replaceable ([localisation](reference/localisation.md)).

## Security

- A view holds names only, checked against fixed lists and limits; a link and a loaded file too ([security](security.md)).
- `chartOptions` passes plain JSON only; nothing in it is run ([charts](concepts/charts.md#chartoptions-for-developers)).

## Limits

- Rows, groups, cells and work are capped before anything big is allocated ([limits](concepts/limits.md)).
- A link is capped at 32,000 characters and 1,000,000 inflated, enforced while inflating ([sharing](concepts/sharing.md#links-for-developers)).

## Embedding

- `theme` (auto follows the page's `data-theme`, then the system), `height`, `label` (the name of the report's region), `locale`, `timeZone`, `fileName`, `className` ([React props](reference/react.md#props)).
- React: `<PivotReport>`, controlled or not, rendered on every host change ([React](getting-started/react.md)).
- Web component: `<pivot-report>` in a shadow root, attributes and `pivot-*` events ([element](reference/element.md)).
- PowerShell Universal: pivotkit-react on its React 18.3.1 ([PowerShell Universal](getting-started/react.md#powershell-universal)).
- `loading` shows the skeleton before the first data and covers the result on later loads ([React props](reference/react.md#props)).

## Props and attributes

Every setting of a host, as the React prop and the element's attribute (objects are element properties only); the details are in the [React reference](reference/react.md#props) and the [element reference](reference/element.md#properties-and-attributes).

- Data: `data`, `dataKey` (property), `encoded` (React only), `timeZone` / `time-zone`, `limits` (property).
- The view: `view` / `view` (JSON) controlled with `onViewChange` (event `pivot-view-change`), `defaultView` / `default-view` (JSON) uncontrolled.
- Saved views: `templates` (property), `onSaveTemplate` / `save-templates` (event `pivot-template-save`), `onDeleteTemplate` (event `pivot-template-delete`).
- Source of the data: `source` / `source-id` and `source-name`, `sources` (property), `onSourceSwitch` (event `pivot-source-switch`); the view files' `$schema`: `schemaUrl` / `schema-url`.
- Fields: `fieldDefaults` (property): `agg`, `format`, `drillFormat` (the drill-down's format), `order`, `label`, `description`, `href` (the "Learn more" link), `type`.
- Drill-down: `drillDown` / `drill-down`, `drillDownLimit` / `drill-down-limit`, `onCellClick` (event `pivot-cell-click`).
- Texts and look: `locale` / `locale`, `labels` (property), `theme` / `theme`, `height` / `height`, `label` / `label`, `className` (React only).
- Export: `fileName` / `file-name`, `onExport` (event `pivot-export`).
- Tips and help: `tips` / `tips`, `storageKey` / `storage-key`, `dismissedTips` (property), `onTipDismiss` (event `pivot-tip-dismiss`), `fieldInfo` / `field-info`, `zoneInfo` / `zone-info`, `settingInfo` / `setting-info`.
- Chart: `chartOptions` (property).
- Sharing and keeping: `shareLink` / `share-link`, `persistView` / `persist-view`.
- Loading: `loading` / `loading`.
