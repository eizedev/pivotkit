// The pivotkit playground: <PivotReport> with real public data (snapshots) and generated data, presets
// per data set, a language and a theme switch, templates kept in the browser, and the engine timings of the last change. The report
// is controlled (view + onViewChange) and the page renders again on every timing, as a host like
// PowerShell Universal does: undo must survive that.
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import "pivotkit-react/styles.css";
import "./playground.css";
import { DATASETS, REAL } from "./data.js";

const SIZES = [2000, 4000, 100000];
const params = new URLSearchParams(location.search);
// ?height=480: the report at a fixed height in px, as a host card gives it (else the window's height)
const fixedHeight = /^\d{3,4}$/.test(params.get("height") ?? "") ? Number(params.get("height")) : null;

function stored(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
    } catch {
        return fallback;
    }
}

function store(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // private mode or storage switched off: templates last for this page only
    }
}

/** The last engine timings from the performance timeline (pivotkit:encode, :computePivot, :toGrid). */
function useTimings() {
    const [t, setT] = useState({});
    useEffect(() => {
        if (typeof PerformanceObserver !== "function") return undefined;
        const po = new PerformanceObserver((list) => {
            const next = {};
            for (const e of list.getEntries()) {
                if (e.name.startsWith("pivotkit:")) next[e.name.slice(9)] = e.duration;
            }
            setT((old) => ({ ...old, ...next }));
        });
        po.observe({ type: "measure", buffered: true });
        return () => po.disconnect();
    }, []);
    return t;
}

const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The rows of a data set: generated ones at once, a real one's snapshot after its chunk has loaded
 * (null until then).
 */
function useRows(dataset, size) {
    const set = DATASETS[dataset];
    const generated = useMemo(() => (set.make ? set.make(size) : null), [set, size]);
    const [loaded, setLoaded] = useState({ dataset: null, rows: null });
    useEffect(() => {
        if (!set.load) return undefined;
        let live = true;
        set.load().then((rows) => {
            if (live) setLoaded({ dataset, rows });
        });
        return () => {
            live = false;
        };
    }, [set, dataset]);
    return set.make ? generated : loaded.dataset === dataset ? loaded.rows : null;
}

/** The report with its view in this page's state, as a host keeps a saved view. */
function Report({ start, ...props }) {
    const [view, setView] = useState(start);
    return <PivotReport view={view} onViewChange={setView} {...props} />;
}

function App() {
    const [dataset, setDataset] = useState(params.get("data") in DATASETS ? params.get("data") : "tickets");
    const [size, setSize] = useState(SIZES.includes(Number(params.get("rows"))) ? Number(params.get("rows")) : 4000);
    const [lang, setLang] = useState(params.get("lang") === "de" ? "de" : "en");
    const [theme, setTheme] = useState(["light", "dark"].includes(params.get("theme")) ? params.get("theme") : "auto");
    const [preset, setPreset] = useState(() => (params.has("empty") ? -1 : Math.max(0, Math.min(DATASETS[dataset].presets.length - 1, Number(params.get("preset") ?? 0) || 0))));
    const [saved, setSaved] = useState(() => stored(`pivotkit-templates-${dataset}`, []));
    const [lastClick, setLastClick] = useState(null);
    const timings = useTimings();

    const rows = useRows(dataset, size);
    const { presets, source } = DATASETS[dataset];
    // the host decides what can be deleted: the user's own templates, not the presets
    const templates = useMemo(() => [...presets, ...saved.map((t) => ({ ...t, deletable: true }))], [presets, saved]);
    const start = preset >= 0 ? presets[preset].view : undefined;

    useEffect(() => {
        // the host page's theme, as PowerShell Universal sets it; "auto" leaves it to the system
        if (theme === "auto") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

    // asynchronous, as a host that stores templates on a server: the report waits for the promise
    const saveTemplate = async (name, view) => {
        await later(30);
        const next = [...saved.filter((t) => t.name !== name), { name, view }];
        setSaved(next);
        store(`pivotkit-templates-${dataset}`, next);
    };
    const deleteTemplate = async (name) => {
        await later(30);
        const next = saved.filter((t) => t.name !== name);
        setSaved(next);
        store(`pivotkit-templates-${dataset}`, next);
    };
    const ms = (k) => (timings[k] === undefined ? "–" : `${timings[k].toFixed(1)} ms`);

    return (
        <div className="pg">
            <header className="pg-head">
                <div className="pg-title">
                    <img className="pg-logo" src="./icon.svg" alt="" width="34" height="34" />
                    <div>
                        <h1>pivotkit playground</h1>
                        {source ? (
                            <p data-testid="pg-source">
                                Data: <a href={source.href} target="_blank" rel="noopener">{source.text}</a>, <a href={source.licenceHref} target="_blank" rel="noopener">{source.licence}</a>. Pick a question under Start, then change it.
                            </p>
                        ) : (
                            <p>Generated data with a fixed seed. Drag fields, click values, export.</p>
                        )}
                    </div>
                </div>
                <div className="pg-controls">
                    <label>
                        Data
                        <select value={dataset} onChange={(e) => { setDataset(e.target.value); setPreset(0); setSaved(stored(`pivotkit-templates-${e.target.value}`, [])); }} data-testid="pg-dataset">
                            <optgroup label="Real data">
                                {Object.keys(REAL).map((k) => <option key={k} value={k}>{DATASETS[k].label}</option>)}
                            </optgroup>
                            <optgroup label="Generated data">
                                {["tickets", "sales", "assets"].map((k) => <option key={k} value={k}>{DATASETS[k].label}</option>)}
                            </optgroup>
                        </select>
                    </label>
                    {DATASETS[dataset].make ? (
                        <label>
                            Rows
                            <select value={size} onChange={(e) => setSize(Number(e.target.value))} data-testid="pg-size">
                                {SIZES.map((s) => <option key={s} value={s}>{s.toLocaleString("en-US")}</option>)}
                            </select>
                        </label>
                    ) : null}
                    <label>
                        Start
                        <select value={preset} onChange={(e) => setPreset(Number(e.target.value))} data-testid="pg-preset">
                            <option value={-1}>Empty report</option>
                            {presets.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
                        </select>
                    </label>
                    <label>
                        Language
                        <select value={lang} onChange={(e) => setLang(e.target.value)} data-testid="pg-lang">
                            <option value="en">English</option>
                            <option value="de">Deutsch</option>
                        </select>
                    </label>
                    <label>
                        Theme
                        <select value={theme} onChange={(e) => setTheme(e.target.value)} data-testid="pg-theme">
                            <option value="auto">Auto</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </label>
                </div>
            </header>
            {rows ? <Report
                key={`${dataset}:${size}:${preset}`}
                start={start}
                data={rows}
                templates={templates}
                onSaveTemplate={saveTemplate}
                onDeleteTemplate={deleteTemplate}
                fieldDefaults={DATASETS[dataset].fieldDefaults}
                onCellClick={(c) => setLastClick({ row: c.row, col: c.col, count: c.count })}
                locale={lang === "de" ? "de-DE" : "en-US"}
                height={fixedHeight ?? "calc(100vh - var(--pg-head-h))"}
                className={fixedHeight ? "pg-fixed" : undefined}
                fileName={`pivotkit-${dataset}`}
            /> : <div className="pg-loading" data-testid="pg-loading" style={{ height: fixedHeight ?? "calc(100vh - var(--pg-head-h))" }}>Loading the data…</div>}
            <footer className="pg-foot" aria-live="off">
                <span data-testid="pg-timings">encode {ms("encode")} · computePivot {ms("computePivot")} · toGrid {ms("toGrid")}</span>
                <span data-testid="pg-last-click">{lastClick ? `onCellClick: ${JSON.stringify(lastClick.row)} × ${JSON.stringify(lastClick.col)}, ${lastClick.count} rows` : ""}</span>
            </footer>
        </div>
    );
}

// the React the page runs on, for the browser test of the React 19 job
window.__pivotkitReact = React.version;
createRoot(document.getElementById("app")).render(<App />);
