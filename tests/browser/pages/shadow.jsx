// The report inside a shadow root as a React host would mount it there (the web component
// pivotkit-element adopts a constructed stylesheet instead, see element.spec.js): the stylesheet
// is linked inside the root, the theme comes from the shadow host's data-theme. window.__chartOption()
// reads the colours the chart draws with, from the ECharts bundled here.
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
createRoot(mount).render(<PivotReport data={DATASETS.sales.make(2000)} defaultView={DATASETS.sales.presets[0].view} zones="open" />);

window.__chartOption = async () => {
    const { getInstanceByDom } = await import("echarts/core");
    const el = shadow.querySelector('[data-testid="pivot-chart"]');
    const option = el ? getInstanceByDom(el)?.getOption() : null;
    return option ? { palette: option.color } : null;
};
