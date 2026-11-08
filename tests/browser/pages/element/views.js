// One element with templates in both groups: a shared view given as a view file (its name from the
// file), a shared view an admin may delete, the user's own views in the browser store
// (template-store="browser") and "Publish as shared view" (can-publish). The page keeps the shared
// views and answers the publish and the delete with promises; every template event is logged in
// window.__events.
import { toViewFile } from "pivotkit-core";
import { DATASETS } from "../../../../examples/playground/src/data.js";

window.__events = [];
for (const type of ["pivot-template-save", "pivot-template-delete", "pivot-template-publish"]) {
    document.addEventListener(type, (e) => window.__events.push({ type, detail: JSON.parse(JSON.stringify({ ...e.detail, respondWith: undefined })) }));
}

const report = document.getElementById("views");
const [first, second] = DATASETS.sales.presets;
report.data = DATASETS.sales.make(2000);
report.defaultView = first.view;
const fixed = [
    { file: toViewFile(first.view, { name: "From a view file", source: { id: "sales" } }), scope: "shared" },
    { name: "Team view", view: second.view, scope: "shared", deletable: true }
];
let published = [];
const show = () => (report.templates = [...fixed, ...published]);
show();
const later = (run) => (e) => e.detail.respondWith(new Promise((resolve) => setTimeout(() => resolve(run(e.detail)), 50)));
report.addEventListener(
    "pivot-template-publish",
    later(({ name, view }) => {
        published = [...published, { name, view, scope: "shared", deletable: true }];
        show();
    })
);
report.addEventListener(
    "pivot-template-delete",
    later(({ name }) => {
        published = published.filter((t) => t.name !== name);
        const at = fixed.findIndex((t) => t.name === name);
        if (at >= 0) {
            fixed.splice(at, 1);
        }
        show();
    })
);
