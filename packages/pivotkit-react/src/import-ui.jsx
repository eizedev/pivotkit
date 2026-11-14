/*
 * Loading data in the browser (allowImport): the Data menu (where the data shown comes from, Load
 * data…, Back to original data), the overlay while a file is dragged over the report, the dialog that
 * reads the file (progress, Cancel) and previews it before it replaces the data (the sheet of a
 * workbook, the first rows, a type per column, the readers' notes), and the source line under the
 * result. Loaded on first use (lazy-import.jsx), with its texts (import-labels.js); the report itself
 * keeps only the button, the drop handlers and the file input.
 *
 * The preview reads the file once; another type for a column is pivotkit-core's retype() of the
 * values as read, another sheet reads the file again. "Load data" encodes the table (the columns as
 * the preview shows them) and hands it to the report, which records the step for Undo.
 */

import React, { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { encode } from "pivotkit-core";
import { IMPORT_TYPES, fileName, retype } from "pivotkit-core/import";
import { useFormName, useModal } from "./dom.js";
import { Icon } from "./icons.jsx";
import { errorText, importLabels, noteText } from "./import-labels.js";
import { formatsOf, readImport, sheetsOf } from "./import-run.js";
import { shownName, sourceIdOf } from "./import-source.js";
import { fill, messageOf, plural } from "./labels.js";
import { Group, LayerContext, Option, hasTopLayer, useTopLayer } from "./popover.jsx";

/** Rows and columns the preview shows. */
export const PREVIEW_ROWS = 8;
export const PREVIEW_COLUMNS = 60;

/** The texts of a list of format names: "CSV or text, JSON and Excel workbook". */
function listOf(items, locale) {
    try {
        return new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
    } catch {
        return items.join(", ");
    }
}

/** A file's size for people: "13.2 MB". */
function sizeText(bytes, locale) {
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let u = 0;
    while (n >= 1000 && u < units.length - 1) {
        n /= 1000;
        u += 1;
    }
    return `${n.toLocaleString(locale, { maximumFractionDigits: u === 0 ? 0 : 1 })} ${units[u]}`;
}

/**
 * The Data menu: where the data shown comes from, and loading.
 * @param {{ labels: any, locale: string, source: { name: string | null, rows: number, columns: number, imported: boolean },
 *   plugins: any[], onPick: () => void, onBack: () => void, close: () => void }} props
 */
export function DataPanel({ labels, locale, source, plugins, onPick, onBack, close }) {
    const t = importLabels(labels);
    const where = { lang: labels.lang, locale };
    return (
        <div className="pk-data-menu" data-testid="data-menu">
            <Group title={t.dataSource} testId="data-source">
                <p data-testid="data-name">
                    <strong>{source.name ?? t.hostData}</strong>
                </p>
                <p className="pk-hint" data-testid="data-size">{`${plural(t.rows, source.rows, where)} × ${plural(t.columns, source.columns, where)}`}</p>
                {source.imported ? <p className="pk-hint">{t.fromFile}</p> : null}
            </Group>
            <Group title={t.load}>
                <Option icon="upload" onSelect={() => { close(); onPick(); }} testId="load-file">
                    {t.loadFile}
                </Option>
                {source.imported ? (
                    <Option icon="reset" hint={t.backHint} onSelect={() => { close(); onBack(); }} testId="back-to-original">
                        {t.backToOriginal}
                    </Option>
                ) : null}
                <p className="pk-hint" data-testid="drop-hint">{`${t.dropHint}. ${fill(t.formats, { formats: listOf(formatsOf(plugins, t.formatNames), locale) })}`}</p>
            </Group>
        </div>
    );
}

/**
 * Over the whole report while a file is dragged over it: where to let go, and what it reads. In the
 * top layer like the menus, placed on the part of the report on screen; it takes no pointer events,
 * so the report's drop handlers get them.
 * @param {{ labels: any, locale: string, plugins: any[], box: () => DOMRect | undefined }} props  `box`: the report's
 */
export function DropOverlay({ labels, locale, plugins, box: boxOf }) {
    const t = importLabels(labels);
    const { layer } = useContext(LayerContext);
    const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [top] = useState(hasTopLayer);
    useTopLayer(true, [ref], null, layer);
    const box = boxOf();
    if (!layer || !box) {
        return null;
    }
    const view = layer.ownerDocument.defaultView;
    const left = Math.max(0, box.left);
    const topEdge = Math.max(0, box.top);
    const style = {
        left,
        top: topEdge,
        width: Math.max(0, Math.min(box.right, view?.innerWidth ?? box.right) - left),
        height: Math.max(0, Math.min(box.bottom, view?.innerHeight ?? box.bottom) - topEdge)
    };
    return createPortal(
        <div ref={ref} {...(top ? { popover: "manual" } : {})} className="pk-drop" style={style} aria-hidden="true" data-testid="drop-overlay">
            <div>
                <Icon name="upload" size={24} />
                <strong>{t.dropTitle}</strong>
                <span>{fill(t.formats, { formats: listOf(formatsOf(plugins, t.formatNames), locale) })}</span>
            </div>
        </div>,
        layer
    );
}

/**
 * Where the data shown comes from, under the result while a file's data is shown.
 * @param {{ labels: any, source: { name: string, sheet?: string | null } }} props
 */
export function SourceLine({ labels, source }) {
    const t = importLabels(labels);
    return (
        <span className="pk-row-label pk-source" data-testid="source-line">
            <Icon name="file" size={14} />
            {fill(source.sheet ? t.sourceSheet : t.sourceLine, { name: source.name, sheet: source.sheet ?? "" })}
        </span>
    );
}

/** A value of the preview as text: a number in the locale, a yes or no, a date as it was read. */
function cellText(value, type, t, locale) {
    if (value === null || value === undefined) {
        return "";
    }
    if (type === "boolean") {
        return value ? t.yes : t.no;
    }
    if (type === "number" && typeof value === "number") {
        return value.toLocaleString(locale, { maximumFractionDigits: 10 });
    }
    const text = String(value).replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)(?::00(?:\.000)?)?$/, "$1 $2");
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/**
 * @typedef {object} LoadedData  what "Load data" hands the report
 * @property {import("pivotkit-core").Encoded} encoded
 * @property {{ id: string, name: string }} source  the id for the saved views (import-source.js), the name shown
 * @property {{ name: string, size: number, type: string }} file
 * @property {string | null} sheet
 * @property {readonly string[]} sheets  the names of the workbook's sheets ([] for a file with one table)
 * @property {File} blob  the file itself, to read another of its sheets (a view made on it, sheet-views.js)
 * @property {number} rows
 * @property {Array<{ name: string, type: string }>} columns
 * @property {Array<{ code: string, params: Record<string, unknown>, message: string }>} notes
 */

/**
 * Reads a file (progress, Cancel) and shows it before it replaces the data: the sheet, the first
 * rows with a type per column, the readers' notes; "Load data" or Cancel. Modal, in the top layer:
 * the focus moves in, Tab stays inside, Escape cancels, the focus goes back to where it was. A file
 * that cannot be read closes it with a note; the report's data stays. A job with `sheet` starts on that
 * sheet (a name); with `auto` it loads as soon as the sheet is read, without waiting for "Load data"
 * (a saved view opened on another sheet of the file shown: the person asked for that sheet already).
 * @param {{ job: { file: File, n: number, sheet?: string, auto?: boolean }, labels: any, locale: string, plugins: any[], worker?: () => Worker,
 *   limits?: object, timeZone?: string, onApply: (data: LoadedData) => void, onClose: () => void,
 *   announce: (text: string, extra?: { tone?: "error" }) => void }} props
 */
export function ImportDialog({ job, labels, locale, plugins, worker, limits, timeZone, onApply, onClose, announce }) {
    const t = importLabels(labels);
    const where = { lang: labels.lang, locale };
    const { layer } = useContext(LayerContext);
    const file = job.file;
    const name = useMemo(() => fileName(file, {}), [file]);
    // the sheet asked for: an index picked in the list, a name a job starts on, else the reader's first
    const [sheet, setSheet] = useState(/** @type {number | string | undefined} */ (job.sheet));
    const [sheets, setSheets] = useState(/** @type {import("pivotkit-core/import").SheetInfo[]} */ ([]));
    const [read, setRead] = useState(/** @type {{ table: import("pivotkit-core/import").ImportTable, sheet: number | string | undefined } | null} */ (null));
    const [types, setTypes] = useState(/** @type {import("pivotkit-core/import").ImportType[] | null} */ (null));
    const [progress, setProgress] = useState(/** @type {import("pivotkit-core/import").ImportProgress | null} */ (null));
    const [error, setError] = useState(/** @type {string | null} */ (null));
    const [busy, setBusy] = useState(false);
    // the sheet whose read failed: no preview and no Load data, the sheet list stays to pick another
    const [failed, setFailed] = useState(/** @type {number | string | undefined | null} */ (null));
    const current = read && read.sheet === sheet ? read : null;
    const reading = !current && failed !== sheet;
    // what a read takes from the report, read when it starts: a host that passes new plugins or a new
    // worker function on every render does not start the read again
    const latest = useRef({ onClose, announce, t, name, plugins, worker, locale, limits, where });
    useEffect(() => {
        latest.current = { onClose, announce, t, name, plugins, worker, locale, limits, where };
    });

    // the file, and again for another sheet; Cancel or a new file stops it
    useEffect(() => {
        const controller = new AbortController();
        let last = 0;
        const now = latest.current;
        readImport(file, {
            plugins: now.plugins,
            worker: now.worker,
            sheet,
            locale: now.locale,
            limits: now.limits,
            signal: controller.signal,
            // at most a few updates a second: a progress bar, not a render per step
            onProgress: (p) => {
                const now = Date.now();
                if (now - last > 120 || p.done >= p.total) {
                    last = now;
                    setProgress(p);
                }
            }
        }).then(
            (table) => {
                if (!controller.signal.aborted) {
                    setRead({ table, sheet });
                    setTypes(null);
                }
            },
            (e) => {
                if (controller.signal.aborted) {
                    return;
                }
                const text = fill(latest.current.t.failed, { name: latest.current.name, message: errorText(e, latest.current.name, latest.current.t, latest.current.where) });
                if (sheet === undefined) {
                    // the file itself: the dialog closes, the note stays until it is closed
                    latest.current.announce(text, { tone: "error" });
                    latest.current.onClose();
                } else {
                    setFailed(sheet);
                    setError(text);
                }
            }
        );
        return () => controller.abort();
    }, [file, sheet]);
    // the sheets of a workbook, for the choice; nothing for a file with one table
    useEffect(() => {
        const controller = new AbortController();
        sheetsOf(file, { plugins: latest.current.plugins, limits: latest.current.limits, signal: controller.signal }).then(
            (list) => !controller.signal.aborted && setSheets(list),
            () => undefined
        );
        return () => controller.abort();
    }, [file]);

    const base = current?.table ?? null;
    // the table as the preview shows it: the types the person picked, from the values as read (a type
    // that cannot be read that way keeps the types as they were and says why)
    const typed = useMemo(() => {
        if (!base || !types || types.every((ty, i) => ty === base.types[i])) {
            return { table: base, error: null };
        }
        try {
            return { table: retype(base, types), error: null };
        } catch (e) {
            return { table: base, error: messageOf(e) };
        }
    }, [base, types]);
    const shown = typed.table;

    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const scrim = useRef(/** @type {HTMLDivElement | null} */ (null));
    const applyRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const [top] = useState(hasTopLayer);
    useTopLayer(true, [scrim, box], null, layer);
    const { onKeyDown } = useModal(box, true, onClose);
    // the first rows are there: the focus goes to "Load data" (Enter loads), once; after another sheet
    // it stays on the sheet list, where the person is
    const ready = Boolean(shown) && !reading;
    const focused = useRef(false);
    useEffect(() => {
        if (ready && !focused.current) {
            focused.current = true;
            applyRef.current?.focus({ preventScroll: true });
        }
    }, [ready]);
    // the dialog closed while "Load data" was still at work (encoding, the source id): nothing loads
    const live = useRef(true);
    useEffect(() => () => void (live.current = false), []);
    const titleId = useId();
    const metaId = useId();
    const notesId = useId();
    const formName = useFormName();

    const sheetName = (() => {
        const n = shown?.notes.find((x) => x.code === "SHEET");
        return n && n.params?.sheet !== undefined ? String(n.params.sheet) : null;
    })();
    const sheetIndex = typeof sheet === "number" ? sheet : (sheets.find((s) => s.name === sheetName)?.index ?? 0);

    const apply = async () => {
        if (!shown || busy) {
            return;
        }
        setBusy(true);
        try {
            // a frame for "Load data" to show it is at work before a large table is encoded
            await new Promise((resolve) => setTimeout(resolve, 0));
            const encoded = encode({ columns: shown.columns, types: shown.types, data: shown.data }, { timeZone: timeZone ?? "UTC", limits });
            const id = await sourceIdOf(name, shown.columns);
            if (!live.current) {
                return;
            }
            onApply({
                encoded,
                source: { id, name: shownName(name) },
                file: { name, size: file.size, type: file.type },
                sheet: sheetName,
                sheets: sheets.map((s) => s.name),
                blob: file,
                rows: shown.rowCount,
                columns: shown.columns.map((c, i) => ({ name: c, type: shown.types[i] })),
                notes: shown.notes.map((n) => ({ code: n.code, params: { ...n.params }, message: n.message }))
            });
        } catch (e) {
            if (live.current) {
                setError(fill(t.failed, { name, message: errorText(e, name, t, where) }));
                setBusy(false);
            }
        }
    };

    // a job that loads by itself: once, when the sheet's rows are there and nothing is wrong
    const autoDone = useRef(false);
    useEffect(() => {
        if (job.auto && ready && shown && shown.rowCount > 0 && !typed.error && !autoDone.current) {
            autoDone.current = true;
            void apply();
        }
    });

    if (!layer) {
        return null;
    }
    const inTop = /** @type {any} */ (top ? { popover: "manual" } : {});
    const cols = shown ? shown.columns.slice(0, PREVIEW_COLUMNS) : [];
    const rows = shown ? Math.min(PREVIEW_ROWS, shown.rowCount) : 0;
    // the phase a reader reports, in words; a phase this version has no words for reads as "Reading the file"
    const phase = progress && Object.hasOwn(t.phases, String(progress.phase)) ? /** @type {any} */ (t.phases)[String(progress.phase)] : t.phases.read;
    const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;
    const meta = shown && !reading ? `${plural(t.rows, shown.rowCount, where)} · ${plural(t.columns, shown.columns.length, where)} · ${sizeText(file.size, locale)}` : sizeText(file.size, locale);
    return createPortal(
        <>
            <div ref={scrim} {...inTop} className="pk-scrim pk-import-scrim" aria-hidden="true" />
            <div ref={box} {...inTop} className="pk-import" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={shown && shown.notes.length ? `${metaId} ${notesId}` : metaId} aria-busy={reading || undefined} tabIndex={-1} onKeyDown={onKeyDown} data-testid="import-dialog">
                <div className="pk-drill-head">
                    <div className="pk-drill-heading">
                        <h2 id={titleId}>{fill(t.previewTitle, { name })}</h2>
                        <p id={metaId} className="pk-hint" role="status" data-testid="import-meta">
                            {meta}
                        </p>
                    </div>
                </div>
                <div className="pk-import-body">
                    {sheets.length > 1 ? (
                        <label className="pk-inline-form">
                            {t.sheet}
                            <select name={`${formName}-sheet`} value={sheetIndex} onChange={(e) => {
                                    setProgress(null);
                                    setError(null);
                                    setFailed(null);
                                    setTypes(null);
                                    setSheet(Number(e.target.value));
                                }} data-testid="import-sheet">
                                {sheets.map((s) => (
                                    <option key={s.index} value={s.index}>
                                        {s.visible ? s.name : fill(t.hiddenSheet, { name: s.name })}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}
                    {error || typed.error ? (
                        <p className="pk-error" role="alert" data-testid="import-error">
                            {error ?? typed.error}
                        </p>
                    ) : null}
                    {reading ? (
                        <div data-testid="import-progress">
                            <p>{fill(t.reading, { name })}</p>
                            <progress max={100} value={percent ?? undefined} aria-label={phase} />
                            <p className="pk-hint">{`${phase}${percent !== null ? ` · ${percent} %` : ""}`}</p>
                        </div>
                    ) : shown ? (
                        <>
                            {shown.rowCount === 0 ? <p data-testid="import-empty">{t.noRows}</p> : null}
                            <div className="pk-drill-body" data-testid="import-preview">
                                <table className="pk-drill-table">
                                    <caption className="pk-sr">{t.firstRows}</caption>
                                    <thead>
                                        <tr>
                                            {cols.map((c, i) => (
                                                <th key={i} scope="col">
                                                    {c}
                                                    <select
                                                        name={`${formName}-type-${i}`}
                                                        value={shown.types[i]}
                                                        aria-label={fill(t.typeOf, { column: c })}
                                                        onChange={(e) => setTypes((old) => (old ?? base?.types ?? []).map((ty, k) => (k === i ? /** @type {import("pivotkit-core/import").ImportType} */ (e.target.value) : ty)))}
                                                        data-testid={`import-type-${i}`}
                                                    >
                                                        {IMPORT_TYPES.map((ty) => (
                                                            <option key={ty} value={ty}>
                                                                {t.types[ty]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: rows }, (_, r) => (
                                            <tr key={r}>
                                                {cols.map((_, c) => (
                                                    <td key={c} className={shown.types[c] === "number" ? "pk-num" : undefined}>
                                                        {cellText(shown.data[c][r], shown.types[c], t, locale)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {shown.columns.length > cols.length ? <p className="pk-hint">{fill(t.someColumns, { shown: cols.length.toLocaleString(locale), count: shown.columns.length.toLocaleString(locale) })}</p> : null}
                            {shown.notes.length ? (
                                <div id={notesId} className="pk-note" data-testid="import-notes">
                                    <div>
                                        <h3>{plural(t.notesTitle, shown.notes.length, where)}</h3>
                                        <ul>
                                            {shown.notes.map((n, i) => (
                                                <li key={i} data-code={n.code}>
                                                    {noteText(n, t, where)}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : null}
                </div>
                <div className="pk-popover-foot">
                    <button type="button" className="pk-btn" onClick={onClose} data-autofocus="" data-testid="import-cancel">
                        {t.cancel}
                    </button>
                    {ready ? (
                        <button ref={applyRef} type="button" className="pk-btn pk-primary" onClick={apply} disabled={busy || !shown || shown.rowCount === 0} data-testid="import-apply">
                            {t.apply}
                        </button>
                    ) : null}
                </div>
            </div>
        </>,
        layer
    );
}
