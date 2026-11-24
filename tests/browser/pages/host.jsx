// A host page as PowerShell Universal renders a component: React comes from the page (import map),
// pivotkit-react is its own file, the view is controlled, and the page renders again every 200 ms
// with a new copy of the rows (and the same dataKey). Query parameters change the host:
//
// - ?persist keeps the view per tab (persistView).
// - ?options passes chartOptions, a new object on every render. ?xss passes one with markup in a
//   tooltip formatter (window.__xss is set if it runs).
// - ?loading holds the data back for 800 ms.
// - ?broken starts on a view with parts the data cannot use (a field it lacks, an unknown format).
// - ?import allows loading data: pivotkit-xlsx as a plugin, a new plugins array on every render, no
//   worker. window.__loads keeps onDataLoad's details. A sheet named in window.__refuseSheet is
//   refused (onDataLoad returns false).
// - ?importlimits sets importLimits rows 1,000 and cells 100 and limits columns 4: the host's 2,000
//   rows and its grid of more than 100 cells stay, a file gets all three.
// - ?remount adds the host's buttons that mount the report again with a new React key, as PowerShell
//   Universal does on its light/dark switch and Sync-UDElement. Each starts the controlled view again
//   at the host's start view, as a remounted component does:
//   - "Mount again" with the same data; "New data" with other rows under another dataKey (a second
//     click goes back to the first rows);
//   - "Mount empty" with no rows yet (a host without `loading` whose data is on its way), which come
//     300 ms later;
//   - "Mount twice" mounts it again and once more in the host's layout effect right after, so the
//     report mounted between is gone before it renders a second time; "Mount twice, 30 ms apart" as
//     Sync-UDElement does (measured);
//   - "Host's view" passes the host's start view again without a new mount.
// - ?two adds a second report under its own storageKey. ?nokey leaves storageKey out.
// - ?zonesopen keeps the zones open (zones="open").
// - ?asyncecho passes the view back a moment after onViewChange (50 ms, or ?asyncecho=<ms>), as a host
//   whose view goes through its server. A view not passed back yet is dropped when the report is
//   mounted again, as a remounted component starts with its own state.
// - ?manualecho keeps each view of onViewChange until the test calls window.__echoNext(), which passes
//   the oldest back: the test decides when the host answers.
// - ?exportcolumns=A,B sets exportData to { columns: ["A", "B"] }, ?exportcolumnstext=A to
//   { columns: "A" }, ?exportdata to true. Without them exportData is off, as by default.
// - ?drillexport sets drillDownExport.
// - ?nodata passes no rows and starts on an empty view, as a PowerShell Universal report with an empty
//   -Data. ?nodata=columns passes columnar data with columns but no rows and starts on a view that
//   places one of them.
// - ?printself has onExport take the report's print (returns false; window.__hostPrinted keeps the
//   file name).
// - ?strict renders the page in React's StrictMode (effects mounted, cleaned up and mounted again).
//
// For the tests: window.__order logs onDataLoad ("data:<cause>") and onViewChange ("view") in their
// order. window.__chartOption() reads the option the chart draws, from the ECharts the report loaded
// (the same module through the import map). window.__pivotkitReact is the React version.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import xlsxReader from "pivotkit-xlsx";
import { DATASETS } from "../../../examples/playground/src/data.js";

const rows = DATASETS.sales.make(2000);
const otherRows = DATASETS.sales.make(500);
const query = new URLSearchParams(location.search);
const echoDelay = Number(query.get("asyncecho")) || 50;
// ?nodata=columns: the columns of the sales data with no rows
const noRows = { columns: ["Region", "Revenue"], types: ["string", "number"], data: [[], []] };
const start = query.has("nodata") ? (query.get("nodata") === "columns" ? { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }] } : {}) : query.has("broken") ? { rows: ["Region", "Hostname"], values: [{ field: "Revenue", agg: "sum", format: "money" }] } : DATASETS.sales.presets[0].view;

function Host() {
    const [view, setView] = useState(start);
    const [tick, setTick] = useState(0);
    const [loading, setLoading] = useState(query.has("loading"));
    // ?remount: the report's React key (a new one mounts it again) and which rows the host passes
    const [mount, setMount] = useState(0);
    const [other, setOther] = useState(false);
    const [empty, setEmpty] = useState(false);
    // ?asyncecho: the views on their way back
    const echoes = useRef(new Set());
    const manual = useRef([]);
    useEffect(() => {
        window.__echoNext = () => setView(manual.current.shift());
        return () => { delete window.__echoNext; };
    }, []);
    const remount = () => {
        echoes.current.forEach(clearTimeout);
        echoes.current.clear();
        setView(start);
        setMount((n) => n + 1);
    };
    // "Mount twice": the second mount in the same commit as the first mount's layout effects (a state
    // set in a layout effect on purpose: the host this page plays does it)
    const [twice, setTwice] = useState(false);
    useLayoutEffect(() => {
        if (twice) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setTwice(false);
            remount();
        }
    }, [twice]);
    useEffect(() => {
        if (!empty) {
            return undefined;
        }
        const t = setTimeout(() => setEmpty(false), 300);
        return () => clearTimeout(t);
    }, [empty]);
    const onViewChange = (next) => {
        window.__order.push("view");
        if (query.has("manualecho")) {
            manual.current.push(next);
        } else if (query.has("asyncecho")) {
            const t = setTimeout(() => {
                echoes.current.delete(t);
                setView(next);
            }, echoDelay);
            echoes.current.add(t);
        } else {
            setView(next);
        }
    };
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
        ...(query.has("import") ? { allowImport: true, plugins: [xlsxReader], onDataLoad: (d) => (window.__loads.push(d), window.__order.push(`data:${d.cause}`), !(d.sheet && d.sheet === window.__refuseSheet)), templateStore: "browser", storageKey: "host-import", source: { id: "sales", name: "Sales" } } : {}),
        ...(query.has("nokey") ? { storageKey: undefined } : {}),
        // the zones open whatever their room: a test about history reads the chips, not the fold
        ...(query.has("zonesopen") ? { zones: "open" } : {}),
        // Source data and the drill-down's exports with only these columns (a new object on every render)
        ...(query.has("exportcolumns") ? { exportData: { columns: query.get("exportcolumns").split(",") } } : {}),
        // Source data with every column
        ...(query.has("exportdata") ? { exportData: true } : {}),
        // the drill-down's copy and download, also with exportData off
        ...(query.has("drillexport") ? { drillDownExport: true } : {}),
        // a host's mistake: columns as a text, not a list
        ...(query.has("exportcolumnstext") ? { exportData: { columns: query.get("exportcolumnstext") } } : {}),
        // a host that prints the report its own way
        ...(query.has("printself") ? { onExport: (f) => (f.kind === "print" ? ((window.__hostPrinted = f.fileName), false) : undefined) } : {}),
        // a host that keeps uploads small without capping its own 2,000 rows (new objects on every render)
        ...(query.has("importlimits") ? { importLimits: { rows: 1000, cells: 100 }, limits: { columns: 4 } } : {})
    };
    const none = query.has("nodata");
    const shown = loading || empty || none ? [] : other ? otherRows : rows;
    const dataKey = loading || empty || none ? "none" : other ? "sales-500" : "sales-2000";
    return (
        <>
            <p data-testid="host-renders">{tick}</p>
            {query.has("remount") ? (
                <p>
                    <button type="button" data-testid="host-remount" onClick={remount}>
                        Mount again
                    </button>
                    <button type="button" data-testid="host-start-view" onClick={() => setView(start)}>
                        Host's view
                    </button>
                    <button type="button" data-testid="host-remount-twice" onClick={() => (setTwice(true), remount())}>
                        Mount twice
                    </button>
                    <button type="button" data-testid="host-remount-twice-30" onClick={() => (remount(), setTimeout(remount, 30))}>
                        Mount twice, 30 ms apart
                    </button>
                    <button type="button" data-testid="host-new-data" onClick={() => (setView(start), setOther((o) => !o), setMount((n) => n + 1))}>
                        New data
                    </button>
                    <button type="button" data-testid="host-remount-empty" onClick={() => (setView(start), setEmpty(true), setMount((n) => n + 1))}>
                        Mount empty
                    </button>
                </p>
            ) : null}
            <section data-testid="first">
                <PivotReport key={mount} data={query.get("nodata") === "columns" ? noRows : [...shown]} dataKey={dataKey} view={view} onViewChange={onViewChange} height={702} loading={loading} {...extra} />
            </section>
            {query.has("two") ? (
                <section data-testid="second">
                    <PivotReport key={mount} data={[...shown]} dataKey={dataKey} defaultView={start} height={702} {...extra} storageKey="host-import-2" />
                </section>
            ) : null}
        </>
    );
}

window.__pivotkitReact = React.version;
window.__loads = [];
window.__order = [];
window.__chartOption = async () => {
    const { getInstanceByDom } = await import("echarts/core");
    const chart = getInstanceByDom(document.querySelector('[data-testid="pivot-chart"]'));
    return chart ? JSON.parse(JSON.stringify(chart.getOption(), (k, v) => (typeof v === "function" ? "[function]" : v))) : null;
};
createRoot(document.getElementById("app")).render(
    query.has("strict") ? (
        <React.StrictMode>
            <Host />
        </React.StrictMode>
    ) : (
        <Host />
    )
);
