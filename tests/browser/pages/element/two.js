// Two elements on one page: #sales uncontrolled with a start view and the template events answered
// by promises, #tickets controlled by the page (it sets `view` from every pivot-view-change until
// window.__echo is false). Every event the page sees is logged in window.__events with where it was
// heard and what its composed path held.
import { DATASETS } from "../../../../examples/playground/src/data.js";

window.__events = [];
window.__echo = true;
const log = (where) => (e) => {
    const path = e.composedPath();
    window.__events.push({
        where,
        type: e.type,
        target: e.target.id,
        bubbles: e.bubbles,
        composed: e.composed,
        // the element, the document and the window are on the path; the shadow root too, from inside
        path: { element: path.includes(e.target), document: path.includes(document), window: path.includes(window) },
        detail: JSON.parse(JSON.stringify({ ...e.detail, blob: undefined, rows: e.detail.rows?.length, respondWith: undefined }))
    });
};
for (const type of ["pivot-view-change", "pivot-cell-click", "pivot-template-save", "pivot-template-delete", "pivot-export"]) {
    document.addEventListener(type, log("document"));
}

const sales = document.getElementById("sales");
sales.data = DATASETS.sales.make(2000);
sales.defaultView = DATASETS.sales.presets[0].view;
const saved = [];
const presets = DATASETS.sales.presets;
sales.templates = presets;
sales.addEventListener("pivot-template-save", (e) => {
    const { name, view } = e.detail;
    e.detail.respondWith(
        new Promise((resolve, reject) =>
            setTimeout(() => {
                if (name === "fail") {
                    reject(new Error("the server said no"));
                    return;
                }
                saved.push({ name, view, deletable: true });
                sales.templates = [...presets, ...saved];
                resolve();
            }, 50)
        )
    );
});
sales.addEventListener("pivot-template-delete", (e) => {
    e.detail.respondWith(
        new Promise((resolve) =>
            setTimeout(() => {
                saved.splice(saved.findIndex((t) => t.name === e.detail.name), 1);
                sales.templates = [...presets, ...saved];
                resolve();
            }, 50)
        )
    );
});
// the CSV goes to the page instead of a download
window.__kept = [];
sales.addEventListener("pivot-export", (e) => {
    // a CSV and a copy of the table: the page keeps them (no download, nothing on the clipboard)
    if (e.detail.kind === "csv" || e.detail.kind === "copy-table") {
        e.preventDefault();
        e.detail.blob.text().then((text) => window.__kept.push({ name: e.detail.fileName, text, given: e.detail.text }));
    }
});

const tickets = document.getElementById("tickets");
tickets.data = DATASETS.tickets.make(500);
tickets.fieldDefaults = DATASETS.tickets.fieldDefaults;
tickets.view = DATASETS.tickets.presets[0].view;
tickets.addEventListener("pivot-view-change", (e) => {
    if (window.__echo) {
        tickets.view = e.detail.view;
    }
});
