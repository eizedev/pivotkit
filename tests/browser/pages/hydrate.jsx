// Server rendering and hydration: the report is rendered to HTML (react-dom/server, as a server
// would) and hydrated with the same props, with dismissed tips already in localStorage under its
// storageKey. A hydration mismatch is a console error, which fails the test (fixtures.js).
import React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server.browser";
import { PivotReport } from "pivotkit-react";
import { DATASETS } from "../../../examples/playground/src/data.js";

const report = <PivotReport data={DATASETS.sales.make(500)} dataKey="sales-500" defaultView={DATASETS.sales.presets[0].view} storageKey="hydrate" height={600} />;
const container = document.getElementById("app");
// as on a server: no storage while the HTML is made, then the browser's again
const own = Object.getOwnPropertyDescriptor(window, "localStorage");
Object.defineProperty(window, "localStorage", { configurable: true, get: () => undefined });
container.innerHTML = renderToString(report);
if (own) {
    Object.defineProperty(window, "localStorage", own);
} else {
    delete window.localStorage;
}
window.__serverTips = [...container.querySelectorAll("[data-tip]")].map((e) => e.getAttribute("data-tip"));
hydrateRoot(container, report, {
    onRecoverableError: (error) => console.error(`hydration: ${error instanceof Error ? error.message : String(error)}`)
});
