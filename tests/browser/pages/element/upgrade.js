// Properties set on <pivot-report> before the element is defined: they are own properties of a plain
// HTMLElement then, and the element takes them over when the package loads afterwards.
import { DATASETS } from "../../../../examples/playground/src/data.js";

const el = document.getElementById("early");
el.data = DATASETS.sales.make(300);
el.defaultView = { rows: ["Channel"], values: [{ field: "Units", agg: "sum" }] };
el.theme = "dark";
el.height = 420;
window.__definedBefore = customElements.get("pivot-report") !== undefined;
// a URL the bundler leaves alone: the package loads only now
const url = new URL("../packages/pivotkit-element/dist/index.js", location.href).href;
await import(url);
window.__definedAfter = customElements.get("pivot-report") !== undefined;
