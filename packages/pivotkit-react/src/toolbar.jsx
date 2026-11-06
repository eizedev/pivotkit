/*
 * The toolbar: Table | Chart with the chart type, Undo, Redo, Reset, the table options (totals,
 * expand and collapse), templates and export. On a narrow report the buttons show icons only and the
 * field list opens from here.
 */

import React, { useState } from "react";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { MenuButton, Option, Section } from "./popover.jsx";
import { CHART_PRESETS, chartPresetOf } from "./view-ops.js";

const CHART_ICON = { bar: "chart", stacked: "stacked", horizontal: "horizontal", line: "line", area: "area", pie: "pie", heatmap: "heatmap" };

/** @param {{ icon: any, label: string, onClick: () => void, disabled?: boolean, showText?: boolean, testId?: string, shortcut?: string }} props */
function IconButton({ icon, label, onClick, disabled, showText, testId, shortcut }) {
    return (
        <button type="button" className="pk-btn" onClick={onClick} disabled={disabled} aria-label={showText ? undefined : label} title={shortcut ? `${label} (${shortcut})` : label} data-testid={testId}>
            <Icon name={icon} />
            {showText ? <span className="pk-btn-text">{label}</span> : null}
        </button>
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
 * @param {any} props  see PivotReport for what each one does
 */
export function Toolbar({ view, labels, size, canUndo, canRedo, canReset, onUndo, onRedo, onReset, onDisplay, onChart, onTotal, onExpand, onCollapse, templates, onLoadTemplate, onSaveTemplate, onDeleteTemplate, onExport, chartReady, onShowFields }) {
    const wide = size === "wide";
    const showText = size !== "narrow";
    const preset = chartPresetOf(view.chart);
    const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
    return (
        <div className="pk-toolbar" role="toolbar" aria-label={labels.toolbar}>
            {size === "narrow" ? (
                <button type="button" className="pk-btn" onClick={onShowFields} data-testid="show-fields">
                    <Icon name="panel" />
                    <span className="pk-btn-text">{labels.showFields}</span>
                </button>
            ) : null}
            <div className="pk-segmented" role="radiogroup" aria-label={labels.view}>
                <button type="button" role="radio" aria-checked={view.display === "table"} onClick={() => onDisplay("table")} data-testid="show-table">
                    <Icon name="table" />
                    {showText ? <span>{labels.table}</span> : <span className="pk-sr">{labels.table}</span>}
                </button>
                <button type="button" role="radio" aria-checked={view.display === "chart"} onClick={() => onDisplay("chart")} data-testid="show-chart">
                    <Icon name={/** @type {any} */ (CHART_ICON[preset])} />
                    {showText ? <span>{labels.chart}</span> : <span className="pk-sr">{labels.chart}</span>}
                </button>
            </div>
            <MenuButton label={labels.chartType} icon={CHART_ICON[preset]} text={wide ? labels.chartTypes[preset] : undefined} showText={wide} testId="chart-type">
                {(close) =>
                    Object.keys(CHART_PRESETS).map((p) => (
                        <Option
                            key={p}
                            inMenu
                            icon={CHART_ICON[p]}
                            checked={view.display === "chart" && preset === p}
                            onSelect={() => {
                                close();
                                onChart(p);
                            }}
                            testId={`chart-${p}`}
                        >
                            {labels.chartTypes[p]}
                        </Option>
                    ))
                }
            </MenuButton>
            <span className="pk-sep" aria-hidden="true" />
            <IconButton icon="undo" label={labels.undo} onClick={onUndo} disabled={!canUndo} showText={wide} testId="undo" shortcut={`${mod}Z`} />
            <IconButton icon="redo" label={labels.redo} onClick={onRedo} disabled={!canRedo} showText={wide} testId="redo" shortcut={`${mod}⇧Z`} />
            <IconButton icon="reset" label={labels.reset} onClick={onReset} disabled={!canReset} showText={wide} testId="reset" />
            <span className="pk-grow" />
            <MenuButton label={labels.options} icon="sliders" text={showText ? labels.options : undefined} showText={showText} role="dialog" align="end" testId="options">
                {(close) => (
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
                )}
            </MenuButton>
            <MenuButton label={labels.templates} icon="bookmark" text={showText ? labels.templates : undefined} showText={showText} role="dialog" align="end" testId="templates">
                {(close) => (
                    <>
                        <Section title={labels.templates}>
                            {templates.length === 0 ? <p className="pk-hint">{labels.noTemplates}</p> : null}
                            {templates.map((t) => (
                                <div key={t.name} className="pk-template">
                                    <Option icon="bookmark" onSelect={() => { close(); onLoadTemplate(t); }} testId={`template-${t.name}`}>
                                        {t.name}
                                    </Option>
                                    {onDeleteTemplate ? (
                                        <button type="button" className="pk-icon-btn" onClick={() => onDeleteTemplate(t.name)} aria-label={fill(labels.deleteTemplate, { name: t.name })} title={fill(labels.deleteTemplate, { name: t.name })}>
                                            <Icon name="trash" />
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                        </Section>
                        {onSaveTemplate ? (
                            <Section title={labels.saveTemplate}>
                                <SaveTemplate labels={labels} onSave={onSaveTemplate} close={close} />
                            </Section>
                        ) : null}
                    </>
                )}
            </MenuButton>
            <MenuButton label={labels.exportLabel} icon="download" text={showText ? labels.exportLabel : undefined} showText={showText} align="end" testId="export">
                {(close) => (
                    <>
                        <Option inMenu icon="file" onSelect={() => { close(); onExport("xlsx"); }} testId="export-xlsx">{labels.exportXlsx}</Option>
                        <Option inMenu icon="file" onSelect={() => { close(); onExport("csv"); }} testId="export-csv">{labels.exportCsv}</Option>
                        <Option inMenu icon="image" disabled={!chartReady} onSelect={() => { close(); onExport("png"); }} testId="export-png">{labels.exportPng}</Option>
                    </>
                )}
            </MenuButton>
        </div>
    );
}
