// Compiled by `npm run test:types` against the generated declarations, through the package's own
// exports map: the element, its properties and its events as a TypeScript user sees them.
import { EVENTS, PivotReportElement, define, type CellClick, type ExportFile, type PivotReportEventMap, type PivotView, type Template } from "pivotkit-element";
import { EVENTS as EVENTS_ONLY, define as defineOnly } from "pivotkit-element/element";

const el: PivotReportElement = document.createElement("pivot-report");
const found: PivotReportElement | null = document.querySelector("pivot-report");
const start: PivotView = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
const templates: Template[] = [{ name: "By region", view: start, deletable: true }];

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
el.addEventListener("pivot-template-delete", (e) => e.detail.respondWith(Promise.resolve(e.detail.name)));
// composed: a listener on the document knows the detail too
document.addEventListener("pivot-export", (e) => {
    const file: ExportFile = e.detail;
    if (file.kind === "csv") e.preventDefault();
});

el.addEventListener("pivot-tip-dismiss", (e) => {
    const list: string[] = e.detail.dismissed;
    el.dismissedTips = list;
    return e.detail.id;
});

const eventName: keyof PivotReportEventMap = EVENTS.viewChange;
const sameEventName: keyof PivotReportEventMap = EVENTS_ONLY.viewChange;
const ctor: CustomElementConstructor | undefined = define("my-report") ?? defineOnly("other-report");
export { el, found, eventName, sameEventName, ctor };
