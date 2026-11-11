// The element loading data under a strict Content-Security-Policy (import.html): its own import
// worker (dist/import-worker.js) for CSV and JSON, pivotkit-xlsx's dist/ as a plugin (the property
// `plugins`), every pivot-data-load in window.__loads, every violation of the policy in
// window.__violations. ?refuse prevents the loads, ?columnar sets the data as columns, ?empty sets
// none. window.__selects counts the native <select> elements the report creates: WebKit reports a
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
if (query.has("columnar")) {
    el.data = { columns: ["Team", "Hours"], types: ["string", "number"], data: [["Network", "Server", "Network"], [1.5, 2, 4]] };
} else if (!query.has("empty")) {
    el.data = DATASETS.sales.make(1000);
    el.defaultView = DATASETS.sales.presets[0].view;
}
// pivotkit-xlsx as a page without a bundler loads it: its dist/, by URL at run time
const xlsx = await import(new URL("../packages/pivotkit-xlsx/dist/index.js", location.href).href);
el.plugins = [xlsx.default];
window.__ready = true;
