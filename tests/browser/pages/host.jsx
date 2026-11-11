// A host page as PowerShell Universal renders a component: React comes from the page (import map),
// pivotkit-react is its own file, the view is controlled, and the page renders again every 200 ms
// with a new copy of the rows (and the same dataKey). ?persist keeps the view per tab (persistView),
// ?options passes chartOptions (a new object on every render), ?xss a chartOptions with markup in a
// tooltip formatter, ?loading holds the data back for 800 ms, ?broken starts on a view with parts the
// data cannot use (a field it lacks, an unknown format), ?import allows loading data (pivotkit-xlsx
// as a plugin, a new plugins array on every render, no worker; window.__loads keeps onDataLoad's
// details). window.__chartOption() reads the option
// the chart draws, from the ECharts the report loaded (the same module through the import map).
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import xlsxReader from "pivotkit-xlsx";
import { DATASETS } from "../../../examples/playground/src/data.js";

const rows = DATASETS.sales.make(2000);
const query = new URLSearchParams(location.search);
const start = query.has("broken") ? { rows: ["Region", "Hostname"], values: [{ field: "Revenue", agg: "sum", format: "money" }] } : DATASETS.sales.presets[0].view;

function Host() {
    const [view, setView] = useState(start);
    const [tick, setTick] = useState(0);
    const [loading, setLoading] = useState(query.has("loading"));
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 200);
        const l = setTimeout(() => setLoading(false), 800);
        return () => {
            clearInterval(t);
            clearTimeout(l);
        };
    }, []);
    const extra = {
        ...(query.has("persist") ? { persistView: "session", storageKey: "host" } : {}),
        ...(query.has("options") ? { chartOptions: { title: { textStyle: { fontSize: 20 } }, series: { barMaxWidth: 12 }, grid: { left: 40 } } } : {}),
        ...(query.has("xss") ? { chartOptions: { tooltip: { formatter: '<img src="x" onerror="window.__xss = true">' }, series: { barMaxWidth: 10 } } } : {}),
        ...(query.has("import") ? { allowImport: true, plugins: [xlsxReader], onDataLoad: (d) => window.__loads.push(d), templateStore: "browser", storageKey: "host-import", source: { id: "sales", name: "Sales" } } : {})
    };
    return (
        <>
            <p data-testid="host-renders">{tick}</p>
            <PivotReport data={loading ? [] : [...rows]} dataKey={loading ? "none" : "sales-2000"} view={view} onViewChange={setView} height={640} loading={loading} {...extra} />
        </>
    );
}

window.__pivotkitReact = React.version;
window.__loads = [];
window.__chartOption = async () => {
    const { getInstanceByDom } = await import("echarts/core");
    const chart = getInstanceByDom(document.querySelector('[data-testid="pivot-chart"]'));
    return chart ? JSON.parse(JSON.stringify(chart.getOption(), (k, v) => (typeof v === "function" ? "[function]" : v))) : null;
};
createRoot(document.getElementById("app")).render(<Host />);
