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
 * @typedef {object} Template
 * @property {string} name
 * @property {ViewInput} view
 * @property {boolean} [deletable]  shows a delete button when onDeleteTemplate is set (default false)
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
 * @typedef {object} ExportFile  a file the report made, before it is downloaded
 * @property {"xlsx" | "csv" | "png" | "json"} kind  "json": the view (Templates, "Download view")
 * @property {string} fileName  with the extension ("pivot.xlsx"), made safe
 * @property {Blob} blob
 */

/**
 * @typedef {object} PivotReportProps
 * @property {object[]} [data]  the rows; encoded once per array, or once per `dataKey`
 * @property {string | number} [dataKey]  identity of `data`: a new array with the same key is not encoded again
 * @property {import("pivotkit-core").Encoded} [encoded]  already encoded data, instead of `data`
 * @property {ViewInput} [view]  controlled: the view to show; pass back what onViewChange gives
 * @property {ViewInput} [defaultView]  uncontrolled: the start view; the report keeps the view itself
 * @property {(view: View) => void} [onViewChange]  every change, normalized
 * @property {Template[]} [templates]
 * @property {(name: string, view: View) => unknown} [onSaveTemplate]  shows "Save" when set;
 *   "saved" is shown when it returns or the promise it returns resolves, an error when it throws or rejects
 * @property {(name: string) => unknown} [onDeleteTemplate]  deletes a template marked
 *   `deletable`; the entry goes when it returns (or its promise resolves)
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
 * @property {number | string} [height]  the report's height (default 640 px)
 * @property {Partial<import("pivotkit-core").Limits>} [limits]
 * @property {string} [label]  the name of the report's region landmark (default the labels' `report`);
 *   several reports on one page each need their own
 * @property {string} [className]
 * @property {string} [fileName]  name of exported files without extension (default "pivot"); made safe
 * @property {(file: ExportFile) => unknown} [onExport]  every exported file before its download;
 *   returning false skips the download (the host keeps the file, for example to upload it)
 * @property {"on" | "off" | string | string[]} [tips]  the tips above the result: "on" (default), "off"
 *   (none, and no switch in Options), or the ids of the tips allowed (an array, or a comma-separated text)
 * @property {string} [storageKey]  remembers dismissed tips in localStorage under this key (one per
 *   report on a page); without it they are remembered until the page is loaded again
 * @property {string[]} [dismissedTips]  dismissed tip ids from the host's own storage ("*": all tips off,
 *   "-fieldInfo" and "-zoneInfo": those switches of Options → Help off)
 * @property {(change: TipDismiss) => void} [onTipDismiss]  every dismissal, "Show tips" and
 *   "Show dismissed tips again", with the whole list, for a host that stores it itself
 * @property {Record<string, unknown>} [chartOptions]  plain JSON merged over the ECharts option the
 *   report builds (objects key by key; an object given for a list such as `series` into every entry);
 *   it wins over the view's chart settings. Functions and values that are not plain JSON are left
 *   out with a console warning
 * @property {boolean | string} [shareLink]  "Copy link" in the Templates menu and opening a shared
 *   link: `true` links to the page's own address, a string to that base URL; the view travels in the
 *   URL fragment (`#pivot=`, `#pivot-<storageKey>=` with a storageKey). Off by default
 * @property {"session"} [persistView]  "session": the view is kept in sessionStorage for this tab
 *   (per `storageKey`) and comes back when the page is loaded again
 * @property {"on" | "off"} [fieldInfo]  the "i" of the field descriptions: "on" or "off" decides it
 *   (and Options has no switch for it); without it the user switches it in Options → Help (on by default,
 *   remembered like the tips). Screen readers keep the descriptions either way
 * @property {"on" | "off"} [zoneInfo]  the "i" next to the zone titles that explains each zone, as `fieldInfo`
 * @property {boolean} [loading]  the host is loading the data: the report shows its skeleton (before
 *   the first data) or covers its result (later loads)
 */

/**
 * @typedef {object} TipDismiss
 * @property {string | null} id  the tip dismissed, "*" when every tip was switched off, null when tips came back
 * @property {string[]} dismissed  every dismissed id now, to pass back as `dismissedTips`
 */

export { PivotReport } from "./PivotReport.jsx";
export { LABELS } from "./labels.js";
