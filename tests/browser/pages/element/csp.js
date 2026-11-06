// The report under a strict Content-Security-Policy (no 'unsafe-inline', no 'unsafe-eval', see
// csp.html): every violation the page reports is kept in window.__violations.
import { DATASETS } from "../../../../examples/playground/src/data.js";

window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective}: ${e.blockedURI} ${e.sample ?? ""}`.trim()));
const el = document.getElementById("strict");
el.data = DATASETS.sales.make(1000);
el.defaultView = DATASETS.sales.presets[0].view;
