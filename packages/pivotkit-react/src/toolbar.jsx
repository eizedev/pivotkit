/*
 * The toolbar: Table | Chart, the chart type with how the chart is drawn (value labels, legend, title,
 * smooth lines), Undo, Redo, Reset, Layout (the zones folded into one line or open), the table options
 * (totals, expand and collapse, help), Views (the saved views and sharing: link, JSON, file) and
 * export. (Swap rows and columns sits with the zones.) Every button keeps its text. When the report
 * is too narrow for all of them, the less used ones move, one by one, into a "More" menu
 * (OVERFLOW_ORDER), always in the same order whatever their state; Table | Chart, Undo and Export
 * always stay, with their text.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CHART_TYPES, chartTypeOf } from "./chart-types.js";
import { useIsoLayoutEffect } from "./iso.js";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { MenuPanel } from "./lazy-menus.jsx";
import { MenuButton, Option, Popover } from "./popover.jsx";
import { SettingInfo } from "./section.jsx";

/**
 * The buttons that move into "More" when the toolbar is too narrow, first to go first. The order
 * never depends on a button's own state (Layout open or folded), so a click never moves it.
 */
export const OVERFLOW_ORDER = Object.freeze(["reset", "redo", "layout", "views", "options", "chartType"]);

/** @param {{ icon: any, label: string, onClick: () => void, disabled?: boolean, testId?: string, shortcut?: string }} props */
function TextButton({ icon, label, onClick, disabled, testId, shortcut }) {
    return (
        <button type="button" className="pk-btn" onClick={onClick} disabled={disabled} title={shortcut ? `${label} (${shortcut})` : undefined} aria-keyshortcuts={shortcut ? shortcut.replace("⌘", "Meta+").replace("⇧", "Shift+") : undefined} data-testid={testId}>
            <Icon name={icon} />
            <span className="pk-btn-text">{label}</span>
        </button>
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
    const viewsButton = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const [panel, setPanel] = useState(/** @type {"options" | "views" | "chartType" | null} */ (null));
    const order = OVERFLOW_ORDER;
    const level = useOverflow(bar, `${labels.lang}:${labels.undo}:${size}`, order.length);
    const hidden = new Set(order.slice(0, level));
    // a panel opened from "More" closes when its own button is back in the toolbar
    if (panel && !hidden.has(panel)) {
        setPanel(null);
    }
    const closePanel = useCallback(() => setPanel(null), []);
    // a tip asked for the Views menu: "More" shows it when its button is in there, else the
    // button is clicked (after the render, so the button is there)
    const request = props.viewsRequest ?? 0;
    const [seenRequest, setSeenRequest] = useState(request);
    const [clickFor, setClickFor] = useState(0);
    if (request !== seenRequest) {
        setSeenRequest(request);
        if (hidden.has("views")) {
            setPanel("views");
        } else {
            setClickFor(request);
        }
    }
    useEffect(() => {
        const button = viewsButton.current;
        if (clickFor > 0 && button && button.getAttribute("aria-expanded") !== "true") {
            button.click();
        }
    }, [clickFor]);
    const preset = chartTypeOf(view.chart);
    const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
    const chartTypeText = fill(labels.chartTypeIs, { type: labels.chartTypes[preset] });
    const panels = {
        // the panels load with the chip menus (menus.js), on demand
        options: (close) => <MenuPanel name="OptionsPanel" loadingText={labels.loadingMenu} props={{ view, labels, onTotal, onExpand, onCollapse, close, tips, mod, folding, help: props.help }} />,
        views: (close) => <MenuPanel name="ViewsPanel" loadingText={labels.loadingMenu} props={{ templates, labels, onLoad: onLoadTemplate, onSave: onSaveTemplate, onDelete: onDeleteTemplate, close, share }} />,
        chartType: (close) => <MenuPanel name="ChartTypePanel" loadingText={labels.loadingMenu} props={{ view, labels, onChart, onDisplay: onChartDisplay, close }} />
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
            // a toggle of the zones: the same text, open or folded; aria-pressed says which
            button: () => (
                <button key="layout" type="button" className="pk-btn pk-pressable" onClick={onLayout} aria-pressed={!layoutFolded} aria-controls={zonesId} title={labels.showLayout} data-testid="layout">
                    <Icon name="layout" />
                    <span className="pk-btn-text">{labels.layout}</span>
                </button>
            ),
            entry: (close) => <Option key="layout" inMenu icon="layout" checked={!layoutFolded} onSelect={() => { close(); onLayout(); }} testId="more-layout">{labels.layout}</Option>
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
        views: {
            place: "end",
            button: () => (
                <MenuButton key="views" label={labels.views} icon="bookmark" text={labels.views} role="dialog" align="end" testId="views" buttonRef={viewsButton}>
                    {panels.views}
                </MenuButton>
            ),
            entry: (close) => <Option key="views" inMenu icon="bookmark" onSelect={() => { close(); setPanel("views"); }} testId="more-views">{`${labels.views}…`}</Option>
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
            {/* a dialog, not a menu: Tab reaches the "i" of each format */}
            <MenuButton label={labels.exportLabel} icon="download" text={labels.exportLabel} role="dialog" align="end" testId="export">
                {(close) => (
                    <>
                        <div className="pk-setting-row">
                            <Option icon="file" onSelect={() => { close(); onExport("xlsx"); }} testId="export-xlsx">{labels.exportXlsx}</Option>
                            <SettingInfo id="exportXlsx" name={labels.exportXlsx} />
                        </div>
                        <div className="pk-setting-row">
                            <Option icon="file" onSelect={() => { close(); onExport("csv"); }} testId="export-csv">{labels.exportCsv}</Option>
                            <SettingInfo id="exportCsv" name={labels.exportCsv} />
                        </div>
                        <Option icon="image" disabled={!chartReady} reason={view.display !== "chart" ? labels.exportPngNeedsChart : undefined} onSelect={() => { close(); onExport("png"); }} testId="export-png">{labels.exportPng}</Option>
                    </>
                )}
            </MenuButton>
            {level > 0 ? (
                <MenuButton label={labels.more} icon="more" text={labels.more} align="end" testId="more" buttonRef={more}>
                    {(close) => ORDER.filter((id) => hidden.has(id)).map((id) => actions[id].entry(close))}
                </MenuButton>
            ) : null}
            {panel ? (
                <Popover open anchor={more} onClose={closePanel} label={panel === "chartType" ? chartTypeText : panel === "views" ? labels.views : labels.options} role="dialog" align="end">
                    {panels[panel](closePanel)}
                </Popover>
            ) : null}
        </div>
    );
}
