/*
 * The toolbar: Table | Chart, the chart type with how the chart is drawn (value labels, legend, title,
 * smooth lines), Undo, Redo, Reset, Layout (the zones folded into one line or open), the table options
 * (totals, expand and collapse), templates with sharing (link, JSON, file) and export. (Swap rows and
 * columns sits with the zones.) Every button keeps its text. When the
 * report is too narrow for all of them, the less used ones move, one by one, into a "More" menu
 * (OVERFLOW_ORDER); Table | Chart, Undo and Export always stay, with their text.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { CHART_TYPES, CHART_TYPE_NAMES, chartTypeOf } from "./chart-types.js";
import { ClearInput } from "./clear-input.jsx";
import { useIsoLayoutEffect } from "./iso.js";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { MenuButton, Option, Popover, Section } from "./popover.jsx";
import { SHORTCUTS } from "./tips.js";

/** The buttons that move into "More" when the toolbar is too narrow, first to go first. */
export const OVERFLOW_ORDER = Object.freeze(["reset", "redo", "layout", "templates", "options", "chartType"]);

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

/** The value labels a chart type offers: a share in percent is a pie's. */
const VALUE_LABELS = { pie: ["auto", "off", "value", "percent", "both"], other: ["auto", "off", "value"] };
const LEGENDS = ["auto", "bottom", "right", "off"];
const AXIS_LABELS = ["auto", "all", "nth"];
const GROUP_LABELS = ["auto", "on", "off"];

/** The chart's title: applied with Enter or Apply; the × removes it at once. */
function ChartTitle({ title, labels, onDisplay }) {
    const [text, setText] = useState(title ?? "");
    // a title changed elsewhere (Undo, a link) shows here; the field keeps its element and the focus
    const [last, setLast] = useState(title);
    if (title !== last) {
        setLast(title);
        setText(title ?? "");
    }
    return (
        <form
            className="pk-inline-form"
            onSubmit={(e) => {
                e.preventDefault();
                onDisplay({ title: text.trim() || null });
            }}
        >
            <ClearInput
                type="text"
                value={text}
                onChange={setText}
                onClear={() => (title ? onDisplay({ title: null }) : undefined)}
                clearLabel={labels.clearText}
                placeholder={labels.chartTitleNone}
                aria-label={labels.chartTitle}
                maxLength={200}
                data-testid="chart-title"
            />
            <button type="submit" className="pk-btn pk-primary" disabled={(text.trim() || null) === (title ?? null)}>
                {labels.apply}
            </button>
        </form>
    );
}

/**
 * How the chart is drawn: value labels, legend, title, smooth lines (line and area). Each choice
 * applies at once and the panel stays open, so the chart behind it shows the change.
 */
function ChartDisplay({ view, labels, onDisplay }) {
    const chart = view.chart;
    const pie = chart.type === "pie";
    // bars, lines and areas have a category axis
    const axis = CHART_TYPES[chartTypeOf(chart)].axis;
    const choices = pie ? VALUE_LABELS.pie : VALUE_LABELS.other;
    // a pie's "percent" on another type draws the value: it shows as "Value" there
    const valueLabels = !pie && (chart.valueLabels === "percent" || chart.valueLabels === "both") ? "value" : chart.valueLabels;
    return (
        <Section title={labels.chartDisplay}>
            <div className="pk-subtitle">{labels.valueLabels}</div>
            <div className="pk-choice-grid">
                {choices.map((v) => (
                    <Option key={v} checked={valueLabels === v} onSelect={() => onDisplay({ valueLabels: v })} testId={`labels-${v}`}>
                        {labels.valueLabelNames[v]}
                    </Option>
                ))}
            </div>
            <div className="pk-subtitle">{labels.legend}</div>
            <div className="pk-choice-grid">
                {LEGENDS.map((v) => (
                    <Option key={v} checked={chart.legend === v} onSelect={() => onDisplay({ legend: v })} testId={`legend-${v}`}>
                        {labels.legendNames[v]}
                    </Option>
                ))}
            </div>
            <div className="pk-subtitle">{labels.chartTitle}</div>
            <ChartTitle title={chart.title} labels={labels} onDisplay={onDisplay} />
            {axis ? (
                <>
                    <div className="pk-subtitle">{labels.axisLabels}</div>
                    <div className="pk-choice-grid">
                        {AXIS_LABELS.map((v) => (
                            <Option key={v} checked={chart.axisLabels === v} onSelect={() => onDisplay({ axisLabels: v })} testId={`axis-${v}`}>
                                {labels.axisLabelNames[v]}
                            </Option>
                        ))}
                    </div>
                </>
            ) : null}
            {axis && view.rows.length >= 2 ? (
                <>
                    <div className="pk-subtitle">{labels.groupLabels}</div>
                    <div className="pk-choice-grid">
                        {GROUP_LABELS.map((v) => (
                            <Option key={v} checked={chart.groupLabels === v} onSelect={() => onDisplay({ groupLabels: v })} testId={`groups-${v}`}>
                                {labels.groupLabelNames[v]}
                            </Option>
                        ))}
                    </div>
                </>
            ) : null}
            {chart.type === "line" || chart.type === "area" ? <Switch checked={chart.smooth} onChange={(on) => onDisplay({ smooth: on })} testId="chart-smooth">{labels.smoothLines}</Switch> : null}
        </Section>
    );
}

/** The chart type menu: the types (a pick closes it) and how the chart is drawn. */
function ChartTypePanel({ view, labels, onChart, onDisplay, close }) {
    return (
        <>
            <Section title={labels.chartType}>
                <div className="pk-choice-grid">
                    <ChartTypeOptions view={view} labels={labels} onChart={onChart} close={close} />
                </div>
            </Section>
            <ChartDisplay view={view} labels={labels} onDisplay={onDisplay} />
        </>
    );
}

/** The keyboard shortcuts, in words: "Ctrl + Z" (⌘ on a Mac). */
function Shortcuts({ labels, mod }) {
    const key = (k) => (k === "Mod" ? (mod === "⌘" ? "⌘" : labels.keys.Mod) : Object.hasOwn(labels.keys, k) ? labels.keys[k] : k);
    return (
        <dl className="pk-shortcuts" data-testid="shortcuts">
            {SHORTCUTS.map((s) => (
                <div key={s.text} className="pk-shortcut">
                    <dt>
                        {s.keys.map((k, i) => (
                            <React.Fragment key={k}>
                                {i ? " + " : null}
                                <kbd>{key(k)}</kbd>
                            </React.Fragment>
                        ))}
                    </dt>
                    <dd>{labels.shortcuts[s.text]}</dd>
                </div>
            ))}
        </dl>
    );
}

/** A switch: a checkbox drawn as a track. */
function Switch({ checked, onChange, testId, children }) {
    return (
        <label className="pk-switch">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
            <span className="pk-switch-track" aria-hidden="true" />
            <span>{children}</span>
        </label>
    );
}

function OptionsPanel({ view, labels, onTotal, onExpand, onCollapse, close, tips, mod, folding, help }) {
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
                {/* each only when it would change something; when not, a line says why */}
                <Option icon="chevronDown" onSelect={() => { close(); onExpand(); }} disabled={!folding.canExpand} hint={folding.why.expand ? labels[folding.why.expand] : undefined} testId="expand-all">{labels.expandAll}</Option>
                <Option icon="chevronRight" onSelect={() => { close(); onCollapse(); }} disabled={!folding.canCollapse} hint={folding.why.collapse ? labels[folding.why.collapse] : undefined} testId="collapse-all">{labels.collapseAll}</Option>
            </Section>
            {/* help: the tips and the two kinds of "i", each a switch unless the host decides */}
            <Section title={labels.help}>
                {tips.controls ? <Switch checked={tips.on} onChange={tips.onOn} testId="show-tips">{labels.showTips}</Switch> : null}
                {help?.fieldInfo ? <Switch checked={help.fieldInfo.on} onChange={help.fieldInfo.set} testId="show-field-info">{labels.showFieldInfo}</Switch> : null}
                {help?.zoneInfo ? <Switch checked={help.zoneInfo.on} onChange={help.zoneInfo.set} testId="show-zone-info">{labels.showZoneInfo}</Switch> : null}
                {tips.controls ? <Option icon="reset" onSelect={() => tips.onReset()} disabled={!tips.canReset} testId="reset-tips">{labels.resetTips}</Option> : null}
                <details className="pk-more">
                    <summary className="pk-more-title" data-testid="shortcuts-title">{labels.shortcutsTitle}</summary>
                    <Shortcuts labels={labels} mod={mod} />
                </details>
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
            <ClearInput type="text" value={name} onChange={setName} clearLabel={labels.clearText} placeholder={labels.templateName} aria-label={labels.templateName} maxLength={120} data-testid="template-name" />
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
/**
 * "Load view…": a view pasted as JSON or a link, or a .json file. Nothing changes until it is loaded;
 * what cannot be used is said in the panel, what was left out after the load.
 */
function LoadView({ labels, onLoadText, close }) {
    const [text, setText] = useState("");
    const [problem, setProblem] = useState(/** @type {string | null} */ (null));
    const [busy, setBusy] = useState(false);
    const file = useRef(/** @type {HTMLInputElement | null} */ (null));
    const field = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
    const problemId = useId();
    // opened from its menu entry, which is gone now: the focus goes into the field
    useEffect(() => {
        field.current?.focus({ preventScroll: true });
    }, []);
    const load = async (value) => {
        setBusy(true);
        const failed = await onLoadText(value);
        setBusy(false);
        if (failed) {
            setProblem(failed);
        } else {
            close();
        }
    };
    return (
        <form
            className="pk-inline-form pk-load-view"
            onSubmit={(e) => {
                e.preventDefault();
                load(text);
            }}
        >
            <p className="pk-hint">{labels.loadViewHint}</p>
            <ClearInput
                multiline
                value={text}
                onChange={(v) => {
                    setText(v);
                    setProblem(null);
                }}
                clearLabel={labels.clearText}
                aria-label={labels.loadViewText}
                placeholder={labels.loadViewText}
                rows={4}
                spellCheck={false}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? problemId : undefined}
                data-testid="load-view-text"
                inputRef={field}
            />
            {problem ? (
                <p id={problemId} className="pk-form-problem" role="alert" data-testid="load-view-problem">
                    {problem}
                </p>
            ) : null}
            <input
                ref={file}
                type="file"
                accept="application/json,.json"
                className="pk-sr"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="load-view-file"
                onChange={async (e) => {
                    const chosen = e.target.files?.[0];
                    e.target.value = "";
                    if (chosen) {
                        let content;
                        try {
                            content = chosen.size > 1_000_000 ? null : await chosen.text();
                        } catch {
                            content = null;
                        }
                        if (content === null) {
                            setProblem(chosen.size > 1_000_000 ? labels.viewFailed.tooLarge : labels.viewFailed.file);
                        } else {
                            load(content);
                        }
                    }
                }}
            />
            <button type="button" className="pk-btn" onClick={() => file.current?.click()} disabled={busy} data-testid="load-view-choose">
                <Icon name="file" />
                <span className="pk-btn-text">{labels.chooseFile}</span>
            </button>
            <button type="submit" className="pk-btn pk-primary" disabled={busy || !text.trim()} data-testid="load-view-apply">
                {labels.load}
            </button>
        </form>
    );
}

/** Share this view: a link (when the host allows links), the JSON, a file; and load one. */
function ShareSection({ labels, share, close }) {
    const [loading, setLoading] = useState(false);
    if (loading) {
        return (
            <Section title={labels.loadView.replace(/…$/, "")}>
                <LoadView labels={labels} onLoadText={share.loadText} close={close} />
            </Section>
        );
    }
    return (
        <Section title={labels.share}>
            {share.canLink ? (
                <Option icon="link" onSelect={() => { close(); share.copyLink(); }} testId="copy-link">
                    {labels.copyLink}
                </Option>
            ) : null}
            <Option icon="copy" onSelect={() => { close(); share.copyJson(); }} testId="copy-json">
                {labels.copyJson}
            </Option>
            <Option icon="download" onSelect={() => { close(); share.download(); }} testId="download-view">
                {labels.downloadView}
            </Option>
            <Option icon="upload" onSelect={() => setLoading(true)} testId="load-view">
                {labels.loadView}
            </Option>
        </Section>
    );
}

function TemplatesPanel({ templates, labels, onLoad, onSave, onDelete, close, share }) {
    const [confirming, setConfirming] = useState(/** @type {number | null} */ (null));
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        // the link module, before a click asks for it: a copy right in the click is allowed everywhere
        share?.prepare?.();
    }, [share]);
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
            {share ? <ShareSection labels={labels} share={share} close={close} /> : null}
        </>
    );
}

/**
 * How many entries of OVERFLOW_ORDER are in "More": raised until the toolbar fits in one line,
 * measured again from none when the toolbar gets wider.
 * @param {React.RefObject<HTMLElement | null>} ref
 * @param {string} key  changes when the buttons change (another language, the zones folded or open):
 *   then it is measured again from none
 * @param {number} max  how many entries can move
 */
function useOverflow(ref, key, max) {
    const [level, setLevel] = useState(0);
    const width = useRef(0);
    const [measure, setMeasure] = useState(0);
    const [lastKey, setLastKey] = useState(key);
    if (key !== lastKey) {
        setLastKey(key);
        setLevel(0);
    }
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
        if (el && el.scrollWidth > el.clientWidth + 1 && level < max) {
            setLevel(level + 1);
        }
    }, [ref, level, measure, key, max]);
    return level;
}

/**
 * @param {any} props  see PivotReport for what each one does
 */
export function Toolbar(props) {
    const { view, labels, size, canUndo, canRedo, canReset, onUndo, onRedo, onReset, onDisplay, onChart, onChartDisplay, onTotal, onExpand, onCollapse, folding, templates, onLoadTemplate, onSaveTemplate, onDeleteTemplate, onExport, chartReady, onShowFields, layoutFolded, onLayout, zonesId, share } = props;
    const tips = { controls: props.tipsControls, on: props.tipsOn, onOn: props.onTipsOn, canReset: props.canResetTips, onReset: props.onResetTips };
    const bar = useRef(/** @type {HTMLDivElement | null} */ (null));
    const more = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const templatesButton = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const [panel, setPanel] = useState(/** @type {"options" | "templates" | "chartType" | null} */ (null));
    // while the zones are folded, Layout stays in the toolbar: it is the way back to them
    const order = layoutFolded ? OVERFLOW_ORDER.filter((id) => id !== "layout") : OVERFLOW_ORDER;
    const level = useOverflow(bar, `${labels.lang}:${labels.undo}:${size}:${layoutFolded}`, order.length);
    const hidden = new Set(order.slice(0, level));
    // a panel opened from "More" closes when its own button is back in the toolbar
    if (panel && !hidden.has(panel)) {
        setPanel(null);
    }
    const closePanel = useCallback(() => setPanel(null), []);
    // a tip asked for the Templates menu: "More" shows it when its button is in there, else the
    // button is clicked (after the render, so the button is there)
    const request = props.templatesRequest ?? 0;
    const [seenRequest, setSeenRequest] = useState(request);
    const [clickFor, setClickFor] = useState(0);
    if (request !== seenRequest) {
        setSeenRequest(request);
        if (hidden.has("templates")) {
            setPanel("templates");
        } else {
            setClickFor(request);
        }
    }
    useEffect(() => {
        const button = templatesButton.current;
        if (clickFor > 0 && button && button.getAttribute("aria-expanded") !== "true") {
            button.click();
        }
    }, [clickFor]);
    const preset = chartTypeOf(view.chart);
    const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
    const chartTypeText = fill(labels.chartTypeIs, { type: labels.chartTypes[preset] });
    const panels = {
        options: (close) => <OptionsPanel view={view} labels={labels} onTotal={onTotal} onExpand={onExpand} onCollapse={onCollapse} close={close} tips={tips} mod={mod} folding={folding} help={props.help} />,
        templates: (close) => <TemplatesPanel templates={templates} labels={labels} onLoad={onLoadTemplate} onSave={onSaveTemplate} onDelete={onDeleteTemplate} close={close} share={share} />,
        chartType: (close) => <ChartTypePanel view={view} labels={labels} onChart={onChart} onDisplay={onChartDisplay} close={close} />
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
                <MenuButton key="chartType" label={chartTypeText} icon={CHART_TYPES[preset].icon} text={chartTypeText} role="dialog" testId="chart-type" popoverClass="pk-chart-menu">
                    {panels.chartType}
                </MenuButton>
            ),
            entry: (close) => <Option key="chartType" inMenu icon={CHART_TYPES[preset].icon} onSelect={() => { close(); setPanel("chartType"); }} testId="more-chart-type">{`${chartTypeText}…`}</Option>
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
        layout: {
            place: "end",
            // a disclosure of the zones: the same text, open or not; aria-expanded says which
            button: () => (
                <button key="layout" type="button" className="pk-btn" onClick={onLayout} aria-expanded={!layoutFolded} aria-controls={zonesId} title={layoutFolded ? labels.showLayout : labels.hideLayout} data-testid="layout">
                    <Icon name="layout" />
                    <span className="pk-btn-text">{labels.layout}</span>
                </button>
            ),
            entry: (close) => <Option key="layout" inMenu icon="layout" onSelect={() => { close(); onLayout(); }} testId="more-layout">{layoutFolded ? labels.showLayout : labels.hideLayout}</Option>
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
                <MenuButton key="templates" label={labels.templates} icon="bookmark" text={labels.templates} role="dialog" align="end" testId="templates" buttonRef={templatesButton}>
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
        <div className={`pk-toolbar${level >= order.length ? " pk-wrap" : ""}`} role="toolbar" aria-label={labels.toolbar} ref={bar} data-overflow={level}>
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
                        <Option inMenu icon="file" onSelect={() => { close(); onExport("xlsx"); }} testId="export-xlsx" hint={labels.exportXlsxHint}>{labels.exportXlsx}</Option>
                        <Option inMenu icon="file" onSelect={() => { close(); onExport("csv"); }} testId="export-csv" hint={labels.exportCsvHint}>{labels.exportCsv}</Option>
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
                <Popover open anchor={more} onClose={closePanel} label={panel === "chartType" ? chartTypeText : labels[panel]} role="dialog" align="end">
                    {panels[panel](closePanel)}
                </Popover>
            ) : null}
        </div>
    );
}
