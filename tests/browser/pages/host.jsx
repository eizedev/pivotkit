// A host page as PowerShell Universal renders a component: React comes from the page (import map),
// pivotkit-react is its own file, the view is controlled, and the page renders again every 200 ms
// with a new copy of the rows (and the same dataKey).
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import { DATASETS } from "../../../examples/playground/src/data.js";

const rows = DATASETS.sales.make(2000);
const start = DATASETS.sales.presets[0].view;

function Host() {
    const [view, setView] = useState(start);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 200);
        return () => clearInterval(t);
    }, []);
    return (
        <>
            <p data-testid="host-renders">{tick}</p>
            <PivotReport data={[...rows]} dataKey="sales-2000" view={view} onViewChange={setView} height={640} />
        </>
    );
}

window.__pivotkitReact = React.version;
createRoot(document.getElementById("app")).render(<Host />);
