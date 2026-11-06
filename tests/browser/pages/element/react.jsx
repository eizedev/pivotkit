// A page with a React of its own (from the import map: React 18 or, in the React 19 job, React 19)
// that renders <pivot-report> in its tree and renders again every 200 ms. The element keeps its own
// bundled React 18.3.1; neither may disturb the other.
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DATASETS } from "../../../../examples/playground/src/data.js";

const rows = DATASETS.sales.make(1000);
const start = DATASETS.sales.presets[0].view;
// React 19 sets a prop as a property when the element has one and listens for a custom event with
// `on` + its exact name (react.dev, "Custom HTML elements"); React 18 needs a ref for both
const react19 = Number(React.version.split(".")[0]) >= 19;

function Host() {
    const [tick, setTick] = useState(0);
    const [count, setCount] = useState(0);
    const report = useRef(null);
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 200);
        return () => clearInterval(t);
    }, []);
    useEffect(() => {
        if (react19) {
            return undefined;
        }
        // React 18 passes only attributes to a custom element: the properties are set here
        const el = report.current;
        el.data = rows;
        el.defaultView = start;
        const onChange = () => setCount((n) => n + 1);
        el.addEventListener("pivot-view-change", onChange);
        return () => el.removeEventListener("pivot-view-change", onChange);
    }, []);
    const props19 = react19 ? { data: rows, defaultView: start, "onpivot-view-change": () => setCount((n) => n + 1) } : {};
    return (
        <>
            <p data-testid="host-renders">{tick}</p>
            <p data-testid="host-changes">{count}</p>
            <button type="button" data-testid="host-button" onClick={() => setCount((n) => n + 100)}>
                Host button
            </button>
            <pivot-report ref={report} height="560" theme="light" {...props19} />
        </>
    );
}

window.__pivotkitReact = React.version;
createRoot(document.getElementById("app")).render(<Host />);
