/*
 * pivotkit-react: the pivot report builder as a React 18/19 component on pivotkit-core.
 *
 *   import { PivotReport } from "pivotkit-react";
 *   import "pivotkit-react/styles.css";
 *
 *   <PivotReport data={rows} defaultView={preset} onViewChange={save} locale="de-DE" />
 *   <PivotReport data={rows} view={saved} onViewChange={setSaved} />   // controlled
 *
 * React, ReactDOM and ECharts are peer dependencies the host provides; pivotkit-core and dnd-kit are
 * imports the host's bundler resolves.
 */

/**
 * A view of pivotkit-core: what the report shows, as JSON. Hosts store and pass it; a partial view is
 * filled with defaults, anything unknown is dropped (pivotkit-core's normalize()).
 * @typedef {import("pivotkit-core").View} View
 * @typedef {{ [K in keyof View]?: View[K] extends Array<infer T> ? Array<T extends object ? Partial<T> : T> : View[K] extends object ? Partial<View[K]> : View[K] }} ViewInput
 * @typedef {import("./labels.js").UiLabels} UiLabels
 * @typedef {import("./labels.js").PartialLabels} PartialLabels
 */

/**
 * @typedef {object} Template  an entry of the Views menu: a view, or a view file
 * @property {string} [name]  shown in the menu; default the view file's name (an entry without a name is left out)
 * @property {ViewInput} [view]
 * @property {Record<string, unknown> | string} [file]  a view file ("pivotkit-view", its object or text)
 *   instead of `view`, read by pivotkit-core's fromViewFile
 * @property {"shared" | "user"} [scope]  the group: "Shared views" (for everyone) or "My views" (the
 *   user's own); default "user" for a deletable entry, else "shared"
 * @property {boolean} [deletable]  shows a delete button when onDeleteTemplate is set (default false)
 */

/**
 * @typedef {object} TemplateScope  where a template is or goes
 * @property {"shared" | "user"} scope
 */

/**
 * @typedef {object} FieldDefaults  the host's settings for a field
 * @property {string} [agg]  aggregator of a new value, when it fits the field's type ("average" for durations)
 * @property {string} [format]  a format of pivotkit-core ("duration:h", "currency:EUR") for a new value,
 *   and for the field's own numbers in the drill-down unless `drillFormat` is set
 * @property {string} [drillFormat]  the format of the field's values in the drill-down: "text" shows an
 *   identifier as it is (40072, not 40,072), "date" a date without its time
 * @property {Array<string | number | boolean | null>} [order]  the field's own order of items on Rows or
 *   Columns ("Spring", "Summer", "Autumn", "Winter"): a field placed there is sorted in it, and its
 *   menu offers it as "Custom order"; items not listed come after, by label
 * @property {string} [label]  the name shown for the field (chips, headers, value names, exports,
 *   chart, drill-down); views and templates keep the field's own name. At most 120 characters
 * @property {string} [description]  plain text shown with an "i" next to the field, in its menu and on
 *   its headers; at most 1,000 characters, control characters become spaces
 * @property {string} [href]  an https link shown as "Learn more" with the description; other links are dropped
 * @property {"string" | "number" | "date" | "boolean"} [type]  the type the field's column is read as
 *   (pivotkit-core's encode `types`): numbers sent as text, dates as numbers
 */

/**
 * @typedef {object} CellClick
 * @property {any[]} row  key path of the row ([] is the grand total)
 * @property {any[]} col  key path of the column
 * @property {unknown} value  the raw value of the cell
 * @property {number | undefined} valueIndex
 * @property {string | undefined} text  the value as shown
 * @property {number} count  source rows behind the cell
 * @property {object[]} rows  the first `drillDownLimit` of them: the host's row objects (`data`) or
 *   rows rebuilt from `encoded`
 */

/**
 * @typedef {object} ExportFile  a file the report made, before it is downloaded, or a text before it
 *   goes on the clipboard
 * @property {"xlsx" | "csv" | "png" | "json" | "copy-table" | "copy-json" | "drill-copy" | "drill-json" | "drill-csv" | "drill-xlsx"} kind
 *   "json": the view file (Views, "Download view"); "copy-table", "copy-json": Export → Copy table,
 *   Copy data as JSON; "drill-*": the drill-down panel's Export menu (Copy, Copy as JSON, Download
 *   CSV, Download Excel)
 * @property {string} fileName  with the extension ("pivot.xlsx"), made safe; for a copy the name it
 *   would have as a file ("pivot.tsv", "Central – Jul 2026.json")
 * @property {Blob} blob
 * @property {string} [text]  a copy's text (tab-separated or JSON), the same as the blob's
 * @property {{ shown: number, count: number }} [rows]  a drill-down export: the rows it holds (the
 *   panel's, at most `drillDownLimit`) and the rows behind the value
 */

/**
 * @typedef {object} PivotReportProps
 * @property {object[]} [data]  the rows; encoded once per array, or once per `dataKey`
 * @property {string | number} [dataKey]  identity of `data`: a new array with the same key is not encoded again
 * @property {import("pivotkit-core").Encoded} [encoded]  already encoded data, instead of `data`
 * @property {ViewInput} [view]  controlled: the view to show; pass back what onViewChange gives
 * @property {ViewInput} [defaultView]  uncontrolled: the start view; the report keeps the view itself
 * @property {(view: View) => void} [onViewChange]  every change, normalized
 * @property {Template[]} [templates]  the entries of the Views menu, in two groups by `scope`
 * @property {(name: string, view: View, where: TemplateScope) => unknown} [onSaveTemplate]  shows
 *   "Save" when set (`where.scope` is "user"); "saved" is shown when it returns or the promise it
 *   returns resolves, an error when it throws or rejects. It wins over `templateStore`
 * @property {(name: string, where: TemplateScope) => unknown} [onDeleteTemplate]  deletes a template
 *   marked `deletable` (`where.scope`: its group); the entry goes when it returns (or its promise resolves)
 * @property {(name: string, view: ViewInput) => unknown} [onPublishTemplate]  with `canPublish`:
 *   "Publish as shared view" on each of the user's views; the host makes it a shared entry of
 *   `templates`; "published" is shown when it returns or its promise resolves
 * @property {boolean} [canPublish]  the user may publish views for everyone (an admin); default false
 * @property {"browser"} [templateStore]  "browser": the user's own views are kept in this browser's
 *   localStorage under `storageKey` (only this browser and device, lost when the site's data is
 *   cleared), when `onSaveTemplate` is not set
 * @property {Record<string, FieldDefaults>} [fieldDefaults]  per field name: aggregator and format of a new
 *   value, custom order, display name, description, column type; pivotkit-core's fieldDefaultsFromSchema
 *   builds it from a JSON Schema or OpenAPI document
 * @property {(cell: CellClick) => void} [onCellClick]
 * @property {boolean} [drillDown]  the panel with the rows behind a clicked value (default true)
 * @property {number} [drillDownLimit]  rows passed to the panel and onCellClick (default 1000)
 * @property {string} [locale]  numbers, dates, sorting and the language of the labels (default "en-US")
 * @property {string} [timeZone]  the zone `data` is encoded in (default "UTC"); see pivotkit-core
 * @property {PartialLabels} [labels]  partial labels merged over the locale's language (en, de)
 * @property {"auto" | "light" | "dark"} [theme]  "auto" follows the nearest data-theme above the report, then the system
 * @property {number | string} [height]  the report's height (default 640 px). Without it the report
 *   grows past 640 px when its toolbar, zones and tips leave the result less than its least height
 *   (the page scrolls); with it the report stays inside that height and its result scrolls
 * @property {"on" | "off"} [grow]  whether the report grows past its height to keep the result's
 *   least height: "on" by default without `height`, "off" with it
 * @property {Partial<import("pivotkit-core").Limits>} [limits]
 * @property {string} [label]  the name of the report's region landmark (default the labels' `report`);
 *   several reports on one page each need their own
 * @property {string} [className]
 * @property {string} [fileName]  name of exported files without extension (default "pivot"); made safe
 * @property {(file: ExportFile) => unknown} [onExport]  every exported file before its download, and
 *   every copy before it goes on the clipboard; returning false skips the download or the copy (the
 *   host keeps the file or the text, for example to upload it)
 * @property {"on" | "off" | string | string[]} [tips]  the tips above the result: "on" (default), "off"
 *   (none, and no switch in Options), or the ids of the tips allowed (an array, or a comma-separated text)
 * @property {string} [storageKey]  remembers dismissed tips in localStorage under this key (one per
 *   report on a page); without it they are remembered until the page is loaded again. The browser
 *   store of `templateStore` keeps the user's views under it too
 * @property {string[]} [dismissedTips]  dismissed tip ids from the host's own storage ("*": all tips off,
 *   "-explanations": "Show explanations" of Options → Help off;
 *   "open:<section>" and "closed:<section>": a menu section the user opened or folded)
 * @property {(change: TipDismiss) => void} [onTipDismiss]  every dismissal, "Show tips" and
 *   "Show dismissed tips again", with the whole list, for a host that stores it itself
 * @property {Record<string, unknown>} [chartOptions]  plain JSON merged over the ECharts option the
 *   report builds (objects key by key; an object given for a list such as `series` into every entry);
 *   it wins over the view's chart settings. Functions, values that are not plain JSON and the
 *   options that are markup or addresses (a string `formatter`, `rich`, `link`, `image`) are left out
 *   with a console warning
 * @property {boolean | string} [shareLink]  "Copy link" in the Views menu and opening a shared
 *   link: `true` links to the page's own address without its query, a string is the base URL as it is; the view travels in the
 *   URL fragment (`#pivot=`, `#pivot-<storageKey>=` with a storageKey). Off by default
 * @property {"session"} [persistView]  "session": the view is kept in sessionStorage for this tab
 *   (per `storageKey`) and comes back when the page is loaded again
 * @property {"on" | "off"} [fieldInfo]  the "i" of the field descriptions: "on" or "off" decides it,
 *   whatever the user's "Show explanations" in Options → Help (on by default, remembered like the
 *   tips) says; without it that switch decides. Screen readers keep the descriptions either way
 * @property {"on" | "off"} [zoneInfo]  the "i" next to the zone titles that explains each zone, as `fieldInfo`
 * @property {"on" | "off"} [settingInfo]  the "i" next to the settings that need explaining (totals,
 *   "Show as", "Along", the export formats, chart labels), as `fieldInfo`. Options shows "Show
 *   explanations" while one of the three is left to the user
 * @property {ViewSource} [source]  the data the report shows: its id and name go into the view files
 *   and links it shares, and a view made for another source asks before it is loaded
 * @property {ViewSource[]} [sources]  the other data the host can show: a view made for one of them
 *   offers "Switch to <name> and load" (with `onSourceSwitch`)
 * @property {string | null} [schemaUrl]  the `$schema` of the view files the report writes: by default
 *   https://pivotkit.eize.dev/schema/view-file-1.json, a host's own copy of the schema (it ships in
 *   pivotkit-core as "pivotkit-core/schema/view-file-1.json"), or null or "" to leave it out; loading a
 *   view never depends on it
 * @property {(request: SourceSwitch) => void} [onSourceSwitch]  the user chose to switch to the data a
 *   view was made for and load it there: the host shows that data and the view (as its start view)
 * @property {"open" | "collapsed"} [fieldList]  the field list of a wide or medium report open or
 *   collapsed to a rail; without it the user's choice («, remembered with the tips per storageKey)
 *   decides. With it the user can still change it until the page is loaded again
 * @property {boolean} [loading]  the host is loading the data: the report shows its skeleton (before
 *   the first data) or covers its result (later loads)
 */

/**
 * @typedef {object} ViewSource  the data a view is made for
 * @property {string} id  stable, as the host names the data ("sales", a table's or an endpoint's name)
 * @property {string} [name]  shown to people ("Sales 2026")
 */

/**
 * @typedef {object} SourceSwitch
 * @property {ViewSource} source  the data to switch to (an entry of `sources`)
 * @property {Record<string, unknown>} view  the view as the file has it, not normalized (it is made for
 *   that data): pass it as the start view of the report on it
 * @property {string} [name]  the view's name in the file
 */

/**
 * @typedef {object} TipDismiss
 * @property {string | null} id  the tip dismissed, "*" when every tip was switched off, null when tips came back
 * @property {string[]} dismissed  every dismissed id now, to pass back as `dismissedTips`
 */

export { PivotReport } from "./PivotReport.jsx";
