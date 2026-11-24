// Compiled by `npm run test:types` against the generated declarations, through the package's own
// exports map: the element, its properties and its events as a TypeScript user sees them.
import { EVENTS, PivotReportElement, define, type CellClick, type ColumnarData, type DataLoad, type ExportFile, type FieldDefaults, type PivotReportEventMap, type PivotView, type ReaderPlugin, type SourceEntry, type SourceSwitch, type Template, type TemplateDelete, type TemplatePublish, type TemplateSave, type TipDismiss } from "pivotkit-element";
import { EVENTS as EVENTS_ONLY, define as defineOnly } from "pivotkit-element/element";

const el: PivotReportElement = document.createElement("pivot-report");
const found: PivotReportElement | null = document.querySelector("pivot-report");
const start: PivotView = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
const templates: Template[] = [{ name: "By region", view: start, scope: "user", deletable: true }];

el.data = [{ Region: "North", Units: 3 }];
el.defaultView = start;
el.templates = templates;
el.theme = "dark";
el.height = "100%";
el.height = 480;
el.saveTemplates = true;
el.drillDown = false;
el.fieldDefaults = { Units: { agg: "average", format: "number:1", label: "Units sold", description: "How many.", href: "https://example.org", type: "number" } };
el.tips = "top,cells";
el.storageKey = "sales";
el.dismissedTips = ["top"];
// @ts-expect-error a theme is light, dark or auto
el.theme = "blue";
// @ts-expect-error data is an array of objects
el.data = "rows";

el.addEventListener("pivot-view-change", (e) => {
    el.view = e.detail.view;
    const rows: string[] | undefined = e.detail.view.rows;
    return rows;
});
el.addEventListener("pivot-cell-click", (e) => {
    const cell: CellClick = e.detail;
    return cell.count + cell.rows.length;
});
el.addEventListener("pivot-template-save", (e) => e.detail.respondWith(fetch(`/templates/${e.detail.name}`, { method: "PUT", body: JSON.stringify(e.detail.view) })));
el.addEventListener("pivot-template-delete", (e) => e.detail.respondWith(Promise.resolve(`${e.detail.name}:${e.detail.scope}`)));
el.addEventListener("pivot-template-publish", (e) => e.detail.respondWith(fetch(`/shared/${e.detail.name}`, { method: "PUT", body: JSON.stringify(e.detail.view) })));
el.templateStore = "browser";
el.canPublish = true;
el.templates = [{ file: { format: "pivotkit-view", formatVersion: 1, name: "From a file", view: {} }, scope: "shared" }];
// composed: a listener on the document knows the detail too
document.addEventListener("pivot-export", (e) => {
    const file: ExportFile = e.detail;
    if (file.kind === "csv" || file.kind === "print") e.preventDefault();
});

el.addEventListener("pivot-tip-dismiss", (e) => {
    const list: string[] = e.detail.dismissed;
    el.dismissedTips = list;
    return e.detail.id;
});

// the data shown, the data the page can switch to, and the switch a loaded view asks for
el.sourceId = "sales";
el.sourceName = "Sales";
el.sources = [{ id: "weather", name: "Weather" }];
el.settingInfo = "off";
el.addEventListener("pivot-source-switch", (e) => {
    const id: string = e.detail.source.id;
    el.defaultView = e.detail.view;
    return id;
});

// loading data: the attribute's property, the limits of a loaded file, reader plugins, columnar data, the event of the data shown
el.allowImport = true;
el.importLimits = { rows: 1_000 };
// the import worker at an app's own path (#194): a URL as text or object, null for the default
el.importWorkerUrl = "assets/import-worker.js";
el.importWorkerUrl = new URL("https://example.com/assets/import-worker.js");
el.importWorkerUrl = null;
const workerUrl: string | URL | null = el.importWorkerUrl;
const importRows: number | undefined = el.importLimits?.rows;
el.plugins = [{ apiVersion: 1, kind: "reader", name: "jsonl", label: "JSON Lines", accept: [".jsonl"], load: () => import("./consumer.js") }];
el.data = { columns: ["Team", "Hours"], types: ["string", "number"], data: [["A"], [1]] };
el.addEventListener("pivot-data-load", (e) => {
    const rows: number = e.detail.rows;
    if (e.detail.cause === "load" && e.detail.file && e.detail.file.size > 1e6) e.preventDefault();
    return rows + (e.detail.source?.id ?? "").length;
});

// every type an event or a property uses comes from the package root too
const typed: { defaults: FieldDefaults; tip: (d: TipDismiss) => string; load: (d: DataLoad) => number; entry: SourceEntry; switched: (d: SourceSwitch) => string; plugin: ReaderPlugin; columns: ColumnarData; save: (d: TemplateSave) => string; remove: (d: TemplateDelete) => string; publish: (d: TemplatePublish) => string } = {
    defaults: { agg: "sum" },
    tip: (d) => d.id ?? "",
    load: (d) => d.rows,
    entry: { id: "sales" },
    switched: (d) => d.source.id,
    plugin: el.plugins![0],
    columns: { columns: ["Team"], data: [["A"]] },
    save: (d) => d.name,
    remove: (d) => d.name,
    publish: (d) => d.name
};

const eventName: keyof PivotReportEventMap = EVENTS.viewChange;
const sameEventName: keyof PivotReportEventMap = EVENTS_ONLY.viewChange;
const ctor: CustomElementConstructor | undefined = define("my-report") ?? defineOnly("other-report");
export { el, found, eventName, sameEventName, ctor, typed };
