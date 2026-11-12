// The element loading data under a strict Content-Security-Policy (import.html): its own import
// worker (dist/import-worker.js) for CSV and JSON, pivotkit-xlsx's dist/ as a plugin (the property
// `plugins`), every pivot-data-load in window.__loads, every violation of the policy in
// window.__violations. ?refuse prevents the loads, ?columnar sets the data as columns, ?empty sets
// none, ?limits sets limits.importCells to 10 (a workbook's larger sheet fails), ?importlimits sets
// importLimits.rows to 3 (the page's 1,000 rows show, a file of 4 rows is refused). ?key sets storageKey. ?controlled
// controls the view (set again from every pivot-view-change) and starts it again at the start view
// whenever the element is put back, as a host that renders it anew. window.__putBackTwice() takes the
// element out of the page and puts it back twice in a row: the second time as soon as the report
// mounted the first time has restored its file (its pivot-data-load "restore"), before it renders again. window.__selects counts the native <select> elements the report creates: WebKit reports a
// style-src-attr violation for each (its own shadow tree of the control), with or without pivotkit.
import { DATASETS } from "../../../../examples/playground/src/data.js";

window.__violations = [];
window.__loads = [];
window.__selects = 0;
document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective}: ${e.blockedURI} ${e.sample ?? ""}`.trim()));
const query = new URLSearchParams(location.search);
const el = document.getElementById("report");
customElements.whenDefined("pivot-report").then(() => {
    const count = (nodes) => {
        for (const n of nodes) {
            if (n.nodeType === 1) {
                window.__selects += (n.matches("select") ? 1 : 0) + n.querySelectorAll("select").length;
            }
        }
    };
    new MutationObserver((records) => records.forEach((r) => count(r.addedNodes))).observe(el.shadowRoot, { childList: true, subtree: true });
});
el.addEventListener("pivot-data-load", (e) => {
    window.__loads.push(JSON.parse(JSON.stringify(e.detail)));
    if (query.has("refuse") && e.detail.cause === "load") {
        e.preventDefault();
    }
});
if (query.has("key")) {
    el.storageKey = "element-import";
}
const startView = DATASETS.sales.presets[0].view;
if (query.has("controlled")) {
    el.view = startView;
    el.addEventListener("pivot-view-change", (e) => {
        el.view = e.detail.view;
    });
}
/** Out of the page (the element unmounts its report a microtask later), then back. */
const putBack = async () => {
    const parent = el.parentNode;
    el.remove();
    await Promise.resolve();
    if (query.has("controlled")) {
        el.view = startView;
    }
    parent.append(el);
};
window.__putBackTwice = () =>
    new Promise((done) => {
        const restored = (e) => {
            if (e.detail.cause === "restore") {
                el.removeEventListener("pivot-data-load", restored);
                queueMicrotask(() => putBack().then(done));
            }
        };
        el.addEventListener("pivot-data-load", restored);
        putBack();
    });
if (query.has("limits")) {
    el.limits = { importCells: 10 };
}
if (query.has("importlimits")) {
    // uploads of at most 3 rows; the page's own 1,000 rows are not capped by it
    el.importLimits = { rows: 3 };
}
if (query.has("columnar")) {
    el.data = { columns: ["Team", "Hours"], types: ["string", "number"], data: [["Network", "Server", "Network"], [1.5, 2, 4]] };
} else if (!query.has("empty")) {
    el.data = DATASETS.sales.make(1000);
    el.defaultView = startView;
}
// pivotkit-xlsx as a page without a bundler loads it: its dist/, by URL at run time
const xlsx = await import(new URL("../packages/pivotkit-xlsx/dist/index.js", location.href).href);
el.plugins = [xlsx.default];
window.__ready = true;
