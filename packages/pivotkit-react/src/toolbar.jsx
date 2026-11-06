/*
 * The toolbar: Table | Chart, the chart type, Undo, Redo, Reset, the table options (totals, expand
 * and collapse), templates and export. (Swap rows and columns sits with the zones.) Every button keeps its text. When the
 * report is too narrow for all of them, the less used ones move, one by one, into a "More" menu
 * (OVERFLOW_ORDER); Table | Chart, Undo and Export always stay, with their text.
 */

import React, { useCallback, useRef, useState } from "react";
import { CHART_TYPES, CHART_TYPE_NAMES, chartTypeOf } from "./chart-types.js";
import { useIsoLayoutEffect } from "./iso.js";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { MenuButton, Option, Popover, Section } from "./popover.jsx";

/** The buttons that move into "More" when the toolbar is too narrow, first to go first. */
export const OVERFLOW_ORDER = Object.freeze(["reset", "redo", "templates", "options", "chartType"]);

/** @param {{ icon: any, label: string, onClick: () => void, disabled?: boolean, testId?: string, shortcut?: string }} props */
function TextButton({ icon, label, onClick, disabled, testId, shortcut }) {
    return (
        <button type="button" className="pk-btn" onClick={onClick} disabled={disabled} title={shortcut ? `${label} (${shortcut})` : undefined} aria-keyshortcuts={shortcut ? shortcut.replace("⌘", "Meta+").replace("⇧", "Shift+") : undefined} data-testid={testId}>
            <Icon name={icon} />
            <span className="pk-btn-text">{label}</span>
        </button>
    );
}

function ChartTypeOptions({ view, labels, onChart, close }) {
    const current = chartTypeOf(view.chart);
    return CHART_TYPE_NAMES.map((p) => (
        <Option
            key={p}
            inMenu
            icon={CHART_TYPES[p].icon}
            checked={view.display === "chart" && current === p}
            onSelect={() => {
                close();
                onChart(p);
            }}
            testId={`chart-${p}`}
        >
            {labels.chartTypes[p]}
        </Option>
    ));
}

function OptionsPanel({ view, labels, onTotal, onExpand, onCollapse, close }) {
    return (
        <>
            <Section title={labels.totals}>
                {["grandTotalRow", "grandTotalColumn", "rowSubtotals", "colSubtotals"].map((key) => (
                    <label key={key} className="pk-switch">
                        <input type="checkbox" checked={view.totals[key]} onChange={(e) => onTotal(key, e.target.checked)} data-testid={`total-${key}`} />
                        <span className="pk-switch-track" aria-hidden="true" />
                        <span>{labels[key]}</span>
                    </label>
                ))}
            </Section>
            <Section title={labels.zones.rows}>
                <Option icon="chevronDown" onSelect={() => { close(); onExpand(); }}>{labels.expandAll}</Option>
                <Option icon="chevronRight" onSelect={() => { close(); onCollapse(); }} disabled={view.rows.length < 2}>{labels.collapseAll}</Option>
            </Section>
        </>
    );
}

function SaveTemplate({ labels, onSave, close }) {
    const [name, setName] = useState("");
    return (
        <form
            className="pk-inline-form"
            onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) {
                    close();
                    onSave(name.trim());
                }
            }}
        >
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={labels.templateName} aria-label={labels.templateName} maxLength={120} data-testid="template-name" />
            <button type="submit" className="pk-btn pk-primary" disabled={!name.trim()}>
                {labels.save}
            </button>
        </form>
    );
}

/**
 * The templates: load one, save the view, delete one the host marked `deletable`. A delete asks
 * first, in place, and the entry goes only when the host's callback has finished. Names need not be
 * unique (a saved template may have a preset's name): every entry is shown, keyed and confirmed by its
 * place in the list.
 */
function TemplatesPanel({ templates, labels, onLoad, onSave, onDelete, close }) {
    const [confirming, setConfirming] = useState(/** @type {number | null} */ (null));
    const [busy, setBusy] = useState(false);
    return (
        <>
            <Section title={labels.templates}>
                {templates.length === 0 ? <p className="pk-hint">{labels.noTemplates}</p> : null}
                {templates.map((t, i) =>
                    confirming === i ? (
                        <div key={`${i}:${t.name}`} className="pk-template pk-confirm" role="group" aria-label={fill(labels.deleteConfirm, { name: t.name })}>
                            <span className="pk-confirm-text">{fill(labels.deleteConfirm, { name: t.name })}</span>
                            <button
                                type="button"
                                className="pk-btn pk-danger-btn"
                                disabled={busy}
                                data-autofocus=""
                                data-testid="confirm-delete"
                                onClick={async () => {
                                    setBusy(true);
                                    const ok = await onDelete(t.name);
                                    setBusy(false);
                                    if (ok) {
                                        setConfirming(null);
                                    }
                                }}
                            >
                                {labels.deleteAction}
                            </button>
                            <button type="button" className="pk-btn" disabled={busy} onClick={() => setConfirming(null)}>
                                {labels.cancel}
                            </button>
                        </div>
                    ) : (
                        <div key={`${i}:${t.name}`} className="pk-template">
                            <Option icon="bookmark" onSelect={() => { close(); onLoad(t); }} testId={`template-${t.name}`}>
                                {t.name}
                            </Option>
                            {onDelete && t.deletable === true ? (
                                <button type="button" className="pk-icon-btn" onClick={() => setConfirming(i)} aria-label={fill(labels.deleteTemplate, { name: t.name })} title={fill(labels.deleteTemplate, { name: t.name })}>
                                    <Icon name="trash" />
                                </button>
                            ) : null}
                        </div>
                    )
                )}
            </Section>
            {onSave ? (
                <Section title={labels.saveTemplate}>
                    <SaveTemplate labels={labels} onSave={onSave} close={close} />
                </Section>
            ) : null}
        </>
    );
}

/**
 * How many entries of OVERFLOW_ORDER are in "More": raised until the toolbar fits in one line,
 * measured again from none when the toolbar gets wider.
 * @param {React.RefObject<HTMLElement | null>} ref
 * @param {string} key  changes when the texts change (another language)
 */
function useOverflow(ref, key) {
    const [level, setLevel] = useState(0);
    const width = useRef(0);
    const [measure, setMeasure] = useState(0);
    useIsoLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver !== "function") {
            return undefined;
        }
        const ro = new ResizeObserver(([entry]) => {
            const w = Math.round(entry.contentRect.width);
            if (w > width.current + 1) {
                // wider: start over and let the layout effect below take entries out again
                setLevel(0);
            }
            width.current = w;
            setMeasure((m) => m + 1);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    useIsoLayoutEffect(() => {
        const el = ref.current;
        if (el && el.scrollWidth > el.clientWidth + 1 && level < OVERFLOW_ORDER.length) {
            setLevel(level + 1);
        }
    }, [ref, level, measure, key]);
    return level;
}

/**
 * @param {any} props  see PivotReport for what each one does
 */
export function Toolbar(props) {
    const { view, labels, size, canUndo, canRedo, canReset, onUndo, onRedo, onReset, onDisplay, onChart, onTotal, onExpand, onCollapse, templates, onLoadTemplate, onSaveTemplate, onDeleteTemplate, onExport, chartReady, onShowFields } = props;
    const bar = useRef(/** @type {HTMLDivElement | null} */ (null));
    const more = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const [panel, setPanel] = useState(/** @type {"options" | "templates" | null} */ (null));
    const level = useOverflow(bar, `${labels.lang}:${labels.undo}:${size}`);
    const hidden = new Set(OVERFLOW_ORDER.slice(0, level));
    // a panel opened from "More" closes when its own button is back in the toolbar
    if (panel && !hidden.has(panel)) {
        setPanel(null);
    }
    const closePanel = useCallback(() => setPanel(null), []);
    const preset = chartTypeOf(view.chart);
    const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
    const chartTypeText = fill(labels.chartTypeIs, { type: labels.chartTypes[preset] });
    const panels = {
        options: (close) => <OptionsPanel view={view} labels={labels} onTotal={onTotal} onExpand={onExpand} onCollapse={onCollapse} close={close} />,
        templates: (close) => <TemplatesPanel templates={templates} labels={labels} onLoad={onLoadTemplate} onSave={onSaveTemplate} onDelete={onDeleteTemplate} close={close} />
    };
    /**
     * Every action that can move into "More", defined once: its button in the toolbar and its entry
     * in the menu. `place` is the group of the toolbar it stands in.
     * @type {Record<string, { place: "chart" | "history" | "end", button: () => React.ReactNode, entry: (close: () => void) => React.ReactNode }>}
     */
    const actions = {
        chartType: {
            place: "chart",
            button: () => (
                <MenuButton key="chartType" label={chartTypeText} icon={CHART_TYPES[preset].icon} text={chartTypeText} testId="chart-type">
                    {(close) => <ChartTypeOptions view={view} labels={labels} onChart={onChart} close={close} />}
                </MenuButton>
            ),
            entry: (close) => (
                <Section key="chartType" title={chartTypeText}>
                    <ChartTypeOptions view={view} labels={labels} onChart={onChart} close={close} />
                </Section>
            )
        },
        redo: {
            place: "history",
            button: () => <TextButton key="redo" icon="redo" label={labels.redo} onClick={onRedo} disabled={!canRedo} testId="redo" shortcut={`${mod}⇧Z`} />,
            entry: (close) => <Option key="redo" inMenu icon="redo" disabled={!canRedo} onSelect={() => { close(); onRedo(); }} testId="more-redo">{labels.redo}</Option>
        },
        reset: {
            place: "history",
            button: () => <TextButton key="reset" icon="reset" label={labels.reset} onClick={onReset} disabled={!canReset} testId="reset" />,
            entry: (close) => <Option key="reset" inMenu icon="reset" disabled={!canReset} onSelect={() => { close(); onReset(); }} testId="more-reset">{labels.reset}</Option>
        },
        options: {
            place: "end",
            button: () => (
                <MenuButton key="options" label={labels.options} icon="sliders" text={labels.options} role="dialog" align="end" testId="options">
                    {panels.options}
                </MenuButton>
            ),
            entry: (close) => <Option key="options" inMenu icon="sliders" onSelect={() => { close(); setPanel("options"); }} testId="more-options">{`${labels.options}…`}</Option>
        },
        templates: {
            place: "end",
            button: () => (
                <MenuButton key="templates" label={labels.templates} icon="bookmark" text={labels.templates} role="dialog" align="end" testId="templates">
                    {panels.templates}
                </MenuButton>
            ),
            entry: (close) => <Option key="templates" inMenu icon="bookmark" onSelect={() => { close(); setPanel("templates"); }} testId="more-templates">{`${labels.templates}…`}</Option>
        }
    };
    // the order of the table is the order in the toolbar and in the menu
    const ORDER = Object.keys(actions);
    const buttons = (place) => ORDER.filter((id) => actions[id].place === place && !hidden.has(id)).map((id) => actions[id].button());
    return (
        <div className={`pk-toolbar${level >= OVERFLOW_ORDER.length ? " pk-wrap" : ""}`} role="toolbar" aria-label={labels.toolbar} ref={bar} data-overflow={level}>
            {size === "narrow" ? (
                <button type="button" className="pk-btn" onClick={onShowFields} data-testid="show-fields" data-pk-opener="fields">
                    <Icon name="panel" />
                    <span className="pk-btn-text">{labels.showFields}</span>
                </button>
            ) : null}
            <div className="pk-segmented" role="group" aria-label={labels.view}>
                <button type="button" aria-pressed={view.display === "table"} onClick={() => onDisplay("table")} data-testid="show-table">
                    <Icon name="table" />
                    <span>{labels.table}</span>
                </button>
                <button type="button" aria-pressed={view.display === "chart"} onClick={() => onDisplay("chart")} data-testid="show-chart">
                    <Icon name={/** @type {any} */ (CHART_TYPES[preset].icon)} />
                    <span>{labels.chart}</span>
                </button>
            </div>
            {buttons("chart")}
            <span className="pk-sep" aria-hidden="true" />
            <TextButton icon="undo" label={labels.undo} onClick={onUndo} disabled={!canUndo} testId="undo" shortcut={`${mod}Z`} />
            {buttons("history")}
            <span className="pk-grow" />
            {buttons("end")}
            <MenuButton label={labels.exportLabel} icon="download" text={labels.exportLabel} align="end" testId="export">
                {(close) => (
                    <>
                        <Option inMenu icon="file" onSelect={() => { close(); onExport("xlsx"); }} testId="export-xlsx">{labels.exportXlsx}</Option>
                        <Option inMenu icon="file" onSelect={() => { close(); onExport("csv"); }} testId="export-csv">{labels.exportCsv}</Option>
                        <Option inMenu icon="image" disabled={!chartReady} onSelect={() => { close(); onExport("png"); }} testId="export-png">{labels.exportPng}</Option>
                    </>
                )}
            </MenuButton>
            {level > 0 ? (
                <MenuButton label={labels.more} icon="more" text={labels.more} align="end" testId="more" buttonRef={more}>
                    {(close) => ORDER.filter((id) => hidden.has(id)).map((id) => actions[id].entry(close))}
                </MenuButton>
            ) : null}
            {panel ? (
                <Popover open anchor={more} onClose={closePanel} label={labels[panel]} role="dialog" align="end">
                    {panels[panel](closePanel)}
                </Popover>
            ) : null}
        </div>
    );
}
