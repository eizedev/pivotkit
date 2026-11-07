// A host page as PowerShell Universal renders a component: React comes from the page (import map),
// pivotkit-react is its own file, the view is controlled, and the page renders again every 200 ms
// with a new copy of the rows (and the same dataKey). ?persist keeps the view per tab (persistView),
// ?options passes chartOptions (a new object on every render), ?loading holds the data back for 800 ms.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import { DATASETS } from "../../../examples/playground/src/data.js";

const rows = DATASETS.sales.make(2000);
const start = DATASETS.sales.presets[0].view;
const query = new URLSearchParams(location.search);

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
        ...(query.has("options") ? { chartOptions: { title: { textStyle: { fontSize: 20 } }, series: { barMaxWidth: 12 }, grid: { left: 40 } } } : {})
    };
    return (
        <>
            <p data-testid="host-renders">{tick}</p>
            <PivotReport data={loading ? [] : [...rows]} dataKey={loading ? "none" : "sales-2000"} view={view} onViewChange={setView} height={640} loading={loading} {...extra} />
        </>
    );
}

window.__pivotkitReact = React.version;
createRoot(document.getElementById("app")).render(<Host />);
