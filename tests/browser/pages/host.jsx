// A host page as PowerShell Universal renders a component: React comes from the page (import map),
// pivotkit-react is its own file, the view is controlled, and the page renders again every 200 ms
// with a new copy of the rows (and the same dataKey). ?persist keeps the view per tab (persistView),
// ?options passes chartOptions (a new object on every render), ?xss a chartOptions with markup in a
// tooltip formatter, ?loading holds the data back for 800 ms, ?broken starts on a view with parts the
// data cannot use (a field it lacks, an unknown format), ?import allows loading data (pivotkit-xlsx
// as a plugin, a new plugins array on every render, no worker; window.__loads keeps onDataLoad's
// details). ?remount adds the host's buttons that mount the report again (a new React key, as
// PowerShell Universal does on its light/dark switch and Sync-UDElement): "Mount again" with the same
// data, "New data" with other rows under another dataKey (a second click goes back to the first rows); both start the controlled view again at the
// host's start view, as a remounted PowerShell Universal component does; ?two a second report under its own
// storageKey; ?nokey leaves storageKey out; "Mount empty" mounts it with no rows yet (a host without
// `loading` whose data is on its way), which come 300 ms later. "Mount twice" mounts it again and once
// more in the host's layout effect right after, so the report mounted between is gone before it
// renders a second time; "Mount twice, 30 ms apart" as PowerShell Universal's Sync-UDElement does
// (measured). "Host's view" passes the host's start view again without a new mount. ?asyncecho passes the view back a moment (50 ms, or ?asyncecho=<ms>) after onViewChange,
// as a host whose view goes through its server; a view not passed back yet is dropped when the report
// is mounted again, as a remounted PowerShell Universal component starts with its own state. window.__order logs
// onDataLoad ("data:<cause>") and onViewChange ("view") in their order. window.__chartOption() reads the option
// the chart draws, from the ECharts the report loaded (the same module through the import map).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import xlsxReader from "pivotkit-xlsx";
import { DATASETS } from "../../../examples/playground/src/data.js";

const rows = DATASETS.sales.make(2000);
const otherRows = DATASETS.sales.make(500);
const query = new URLSearchParams(location.search);
const echoDelay = Number(query.get("asyncecho")) || 50;
const start = query.has("broken") ? { rows: ["Region", "Hostname"], values: [{ field: "Revenue", agg: "sum", format: "money" }] } : DATASETS.sales.presets[0].view;

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
        if (query.has("asyncecho")) {
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
        ...(query.has("import") ? { allowImport: true, plugins: [xlsxReader], onDataLoad: (d) => (window.__loads.push(d), window.__order.push(`data:${d.cause}`)), templateStore: "browser", storageKey: "host-import", source: { id: "sales", name: "Sales" } } : {}),
        ...(query.has("nokey") ? { storageKey: undefined } : {})
    };
    const shown = loading || empty ? [] : other ? otherRows : rows;
    const dataKey = loading || empty ? "none" : other ? "sales-500" : "sales-2000";
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
                <PivotReport key={mount} data={[...shown]} dataKey={dataKey} view={view} onViewChange={onViewChange} height={640} loading={loading} {...extra} />
            </section>
            {query.has("two") ? (
                <section data-testid="second">
                    <PivotReport key={mount} data={[...shown]} dataKey={dataKey} defaultView={start} height={640} {...extra} storageKey="host-import-2" />
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
createRoot(document.getElementById("app")).render(<Host />);
