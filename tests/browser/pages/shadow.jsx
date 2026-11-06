// The report inside a shadow root, as the web component <pivot-report> will mount it: the stylesheet
// is linked inside the root, the theme comes from the shadow host's data-theme.
import React from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import { DATASETS } from "../../../examples/playground/src/data.js";

const host = document.getElementById("app");
host.id = "shadow-host";
const shadow = host.attachShadow({ mode: "open" });
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "./pivotkit-react.css";
shadow.append(link);
const mount = document.createElement("div");
shadow.append(mount);
createRoot(mount).render(<PivotReport data={DATASETS.sales.make(2000)} defaultView={DATASETS.sales.presets[0].view} />);
