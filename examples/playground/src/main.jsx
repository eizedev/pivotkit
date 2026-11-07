// The pivotkit playground: <PivotReport> with real public data (snapshots) and generated data, presets
// per data set (the real ones with field descriptions), a language and a theme switch, templates kept in the browser, and the engine timings of the last change. The report
// is controlled (view + onViewChange) and the page renders again on every timing, as a host like
// PowerShell Universal does: undo must survive that. The address is the share link: the data set and
// the start template in the query (?data=weather&start=<slug of the template's name>; these two are the
// playground's own), the current view in the fragment (#pivot-playground=..., pivotkit's share format,
// written on every change and read by the report through shareLink), so a reload keeps the view and
// "Copy link" copies all three.
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import { encodeViewLink } from "pivotkit-core/link";
import "pivotkit-react/styles.css";
import "./playground.css";
import { DATASETS, REAL } from "./data.js";
import { withDescriptions } from "./descriptions.js";

const SIZES = [2000, 4000, 100000];
const params = new URLSearchParams(location.search);
// the report's storageKey; its view is in the fragment under "pivot-<storageKey>" (pivotkit-react's rule)
const STORAGE_KEY = "playground";
const LINK_PARAM = `pivot-${STORAGE_KEY}`;

/** A template's name as it stands in the address: "Which teams are slowest?" -> "which-teams-are-slowest". */
const slug = (name) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * The start template from the address: start=<slug>, else preset=<n> (its place in the list), -1 for
 * "Empty report" (start=empty or empty), else the first.
 */
function startOf(presets) {
    if (params.has("empty") || params.get("start") === "empty") return -1;
    const bySlug = params.has("start") ? presets.findIndex((p) => slug(p.name) === params.get("start")) : -1;
    if (bySlug >= 0) return bySlug;
    const n = Number(params.get("preset") ?? 0) || 0;
    return Math.max(0, Math.min(presets.length - 1, n));
}

/** The page's address with other query parameters (null removes one) and, optionally, without the view. */
function address(query, { keepView = true } = {}) {
    const url = new URL(location.href);
    for (const [k, v] of Object.entries(query)) {
        if (v === null) url.searchParams.delete(k);
        else url.searchParams.set(k, String(v));
    }
    if (!keepView) url.hash = withoutView(url.hash);
    return url.toString();
}

/** A fragment without the view's entry; every other entry stays as it is. */
function withoutView(hash) {
    return hash.replace(/^#/, "").split("&").filter((e) => e && !e.startsWith(`${LINK_PARAM}=`)).join("&");
}

/** Writes the view into the fragment without a new history entry: reload keeps it, the address shares it. */
function writeView(view) {
    let text;
    try {
        text = encodeViewLink(view);
    } catch {
        // too large for a link (long filter lists): the address keeps no view
        text = null;
    }
    // only the view's entry changes; the rest of the fragment stays as it is (pivotkit's rule)
    const kept = withoutView(location.hash);
    const hash = [kept, text ? `${LINK_PARAM}=${text}` : ""].filter(Boolean).join("&");
    history.replaceState(history.state, "", `${location.pathname}${location.search}${hash ? `#${hash}` : ""}`);
}
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
 * (null until then), with the day the snapshot was fetched (null for generated data).
 */
function useRows(dataset, size) {
    const set = DATASETS[dataset];
    const generated = useMemo(() => (set.make ? set.make(size) : null), [set, size]);
    const [loaded, setLoaded] = useState({ dataset: null, rows: null, fetched: null });
    useEffect(() => {
        if (!set.load) return undefined;
        let live = true;
        set.load().then(({ rows, fetched }) => {
            if (live) setLoaded({ dataset, rows, fetched });
        });
        return () => {
            live = false;
        };
    }, [set, dataset]);
    if (set.make) return { rows: generated, fetched: null };
    return loaded.dataset === dataset ? { rows: loaded.rows, fetched: loaded.fetched } : { rows: null, fetched: null };
}

/** The report with its view in this page's state, as a host keeps a saved view, and in the address. */
function Report({ start, ...props }) {
    const [view, setView] = useState(start);
    const change = (next) => {
        setView(next);
        writeView(next);
    };
    return <PivotReport view={view} onViewChange={change} {...props} />;
}

function App() {
    const [dataset, setDataset] = useState(Object.hasOwn(DATASETS, params.get("data") ?? "") ? params.get("data") : "tickets");
    const [size, setSize] = useState(SIZES.includes(Number(params.get("rows"))) ? Number(params.get("rows")) : 4000);
    const [lang, setLang] = useState(params.get("lang") === "de" ? "de" : "en");
    const [theme, setTheme] = useState(["light", "dark"].includes(params.get("theme")) ? params.get("theme") : "auto");
    const [preset, setPreset] = useState(() => startOf(DATASETS[dataset].presets));
    const [saved, setSaved] = useState(() => stored(`pivotkit-templates-${dataset}`, []));
    const [lastClick, setLastClick] = useState(null);
    const timings = useTimings();

    const { rows, fetched } = useRows(dataset, size);
    const { presets, source } = DATASETS[dataset];
    // the host decides what can be deleted: the user's own templates, not the presets
    const templates = useMemo(() => [...presets, ...saved.map((t) => ({ ...t, deletable: true }))], [presets, saved]);
    const start = preset >= 0 ? presets[preset].view : undefined;
    // the address says which data and template the report starts from, in words (the view stays)
    const startName = preset >= 0 ? slug(presets[preset].name) : "empty";
    useEffect(() => {
        history.replaceState(history.state, "", address({ data: dataset, start: startName, preset: null, empty: null }));
    }, [dataset, startName]);
    // Copy link: this page with the data set and the start (and the generated rows), the view is added
    // by the report; the language, theme and height stay the viewer's own
    // (the rest of the fragment, a hash route say, stays in the link as the report keeps it)
    const routeHash = withoutView(location.hash);
    const shareUrl = `${location.origin}${location.pathname}?${new URLSearchParams({ data: dataset, start: startName, ...(DATASETS[dataset].make ? { rows: String(size) } : {}) })}${routeHash ? `#${routeHash}` : ""}`;

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
        <div className={source?.credit ? "pg pg-has-credit" : "pg"}>
            <header className="pg-head">
                <div className="pg-title">
                    <img className="pg-logo" src="./icon.svg" alt="" width="34" height="34" />
                    <div>
                        <h1>pivotkit playground</h1>
                        {source ? (
                            <p data-testid="pg-source">
                                Data: <a href={source.href} target="_blank" rel="noopener">{source.text}</a>, <a href={source.licenceHref} target="_blank" rel="noopener">{source.licence}</a>
                                {fetched ? <span data-testid="pg-as-of">, as of {fetched}</span> : null}. Pick a question under Start, then change it.
                                {source.credit ? <small className="pg-credit" data-testid="pg-credit">{source.credit}</small> : null}
                            </p>
                        ) : (
                            <p>Generated data with a fixed seed. Drag fields, click values, export.</p>
                        )}
                    </div>
                </div>
                <div className="pg-controls">
                    <label>
                        Data
                        <select value={dataset} onChange={(e) => { history.replaceState(history.state, "", address({ data: e.target.value, start: null, preset: null, rows: null, empty: null }, { keepView: false })); setDataset(e.target.value); setPreset(0); setSaved(stored(`pivotkit-templates-${e.target.value}`, [])); }} data-testid="pg-dataset">
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
                            <select value={size} onChange={(e) => { history.replaceState(history.state, "", address({ rows: e.target.value }, { keepView: false })); setSize(Number(e.target.value)); }} data-testid="pg-size">
                                {SIZES.map((s) => <option key={s} value={s}>{s.toLocaleString("en-US")}</option>)}
                            </select>
                        </label>
                    ) : null}
                    <label>
                        Start
                        <select value={preset} onChange={(e) => { const p = Number(e.target.value); history.replaceState(history.state, "", address({ start: p < 0 ? "empty" : slug(presets[p].name), preset: null, empty: null }, { keepView: false })); setPreset(p); }} data-testid="pg-preset">
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
            {/* while a real data set's snapshot loads, the report shows its skeleton (loading) */}
            <Report
                key={`${dataset}:${size}:${preset}`}
                start={start}
                data={rows ?? []}
                loading={!rows}
                templates={templates}
                onSaveTemplate={saveTemplate}
                onDeleteTemplate={deleteTemplate}
                fieldDefaults={withDescriptions(DATASETS[dataset].fieldDefaults, dataset)}
                storageKey={STORAGE_KEY}
                shareLink={shareUrl}
                onCellClick={(c) => setLastClick({ row: c.row, col: c.col, count: c.count })}
                locale={lang === "de" ? "de-DE" : "en-US"}
                height={fixedHeight ?? "calc(100vh - var(--pg-head-h))"}
                className={fixedHeight ? "pg-fixed" : undefined}
                fileName={`pivotkit-${dataset}`}
            />
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
