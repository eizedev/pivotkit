/*
 * The toolbar: Table | Chart, the chart type with how the chart is drawn (value labels, legend, title,
 * smooth lines), Undo, Redo, Reset, Layout (the zones folded into one line or open), the table options
 * (totals, expand and collapse, help), the name of the view loaded (with a mark while it has unsaved
 * changes, next to Views), Views (Save, Save as and New; the saved views and sharing: link, JSON,
 * file) and export. (Swap rows and columns sits with the zones.) Every button keeps its text. When the report
 * is too narrow for all of them, the less used ones move, one by one, into a "More" menu
 * (OVERFLOW_ORDER), always in the same order whatever their state, by the toolbar's width and not by
 * the length of the texts (TOOLBAR_ROOM); Table | Chart, Undo with Redo and Export always stay, with
 * their text.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHART_TYPES, chartTypeOf } from "./chart-types.js";
import { useIsoLayoutEffect } from "./iso.js";
import { Icon } from "./icons.jsx";
import { LABELS, fill } from "./labels.js";
import { MenuPanel } from "./lazy-menus.jsx";
import { MenuButton, Option, Popover } from "./popover.jsx";
import { OVERFLOW_ORDER, overflowLevel, toolbarRoom, toolbarTexts } from "./overflow.js";

/** @param {{ icon: any, label: string, onClick: () => void, disabled?: boolean, testId?: string, shortcut?: string }} props */
function TextButton({ icon, label, onClick, disabled, testId, shortcut }) {
    return (
        <button type="button" className="pk-btn" onClick={onClick} disabled={disabled} title={shortcut ? `${label} (${shortcut})` : undefined} aria-keyshortcuts={shortcut ? shortcut.replace("⌘", "Meta+").replace("⇧", "Shift+") : undefined} data-testid={testId}>
            <Icon name={icon} />
            <span className="pk-btn-text">{label}</span>
        </button>
    );
}

/** A canvas for measuring texts, made once. @type {CanvasRenderingContext2D | null | undefined} */
let measuring;

/** The font of an element for the canvas (Firefox gives no `font` shorthand in the computed style). */
const fontOf = (style) => `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

/**
 * The room (px) of each part of the toolbar, measured: its texts in every built-in language and the
 * report's own, in the font the toolbar is drawn in, plus what the buttons on screen have around their
 * text. Null where the browser cannot measure (then overflowLevel's estimate in em applies).
 * @param {HTMLElement} el  the toolbar
 * @param {ReturnType<typeof toolbarTexts>} texts
 */
function measuredRoom(el, texts) {
    const doc = el.ownerDocument;
    if (measuring === undefined) {
        try {
            measuring = doc.createElement("canvas").getContext("2d");
        } catch {
            measuring = null;
        }
    }
    const undo = el.querySelector("[data-testid='undo']");
    const menu = el.querySelector("[data-testid='export']");
    const display = el.querySelector(".pk-segmented");
    const sep = el.querySelector(".pk-sep");
    const textOf = (node) => node?.querySelector(".pk-btn-text, span");
    if (!measuring || !undo || !menu || !display || !textOf(undo) || !textOf(display)) {
        return null;
    }
    const view = doc.defaultView;
    if (!view) {
        return null;
    }
    const fonts = { button: fontOf(view.getComputedStyle(/** @type {Element} */ (textOf(undo)))), display: fontOf(view.getComputedStyle(/** @type {Element} */ (textOf(display)))) };
    const ctx = measuring;
    const measure = (text, kind) => {
        ctx.font = fonts[kind];
        return ctx.measureText(text).width;
    };
    const w = (node) => node.getBoundingClientRect().width;
    const tw = (node) => (node ? node.getBoundingClientRect().width : 0);
    const segTexts = [...display.querySelectorAll("button > span")];
    const sepStyle = sep ? view.getComputedStyle(sep) : null;
    const chrome = {
        text: w(undo) - tw(textOf(undo)),
        menu: w(menu) - tw(textOf(menu)),
        display: w(display) - segTexts.reduce((n, s) => n + tw(s), 0),
        sep: sep && sepStyle ? w(sep) + parseFloat(sepStyle.marginLeft) + parseFloat(sepStyle.marginRight) : 0,
        // one more px per part: text widths are fractional, the buttons round them
        gap: (parseFloat(view.getComputedStyle(el).columnGap) || 0) + 1
    };
    return toolbarRoom(texts, measure, chrome);
}

/**
 * How many entries of OVERFLOW_ORDER are in "More": overflowLevel() of the toolbar's width and the
 * room of its parts with their widest text in every language (measuredRoom), so English and German
 * show the same buttons; raised further only when the buttons still do not fit (a font that came
 * later). Measured again when the width or the texts change.
 * @param {React.RefObject<HTMLElement | null>} ref
 * @param {string} key  changes when the buttons change (another language, the zones folded or open)
 * @param {boolean} narrow  the report is narrow (the Fields button is in the toolbar)
 * @param {number} max  how many entries can move
 * @param {ReturnType<typeof toolbarTexts>} texts
 */
function useOverflow(ref, key, narrow, max, texts) {
    const [level, setLevel] = useState(0);
    const [measure, setMeasure] = useState(0);
    const [lastKey, setLastKey] = useState(key);
    const latest = useRef(texts);
    // before the effect below, which reads it
    useIsoLayoutEffect(() => {
        latest.current = texts;
    });
    if (key !== lastKey) {
        setLastKey(key);
        setMeasure((m) => m + 1);
    }
    useIsoLayoutEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver !== "function") {
            return undefined;
        }
        let width = -1;
        const decide = () => {
            const em = parseFloat(getComputedStyle(el).fontSize) || 14;
            const room = measuredRoom(el, latest.current);
            setLevel(room ? overflowLevel(width, narrow, room) : overflowLevel(width / em, narrow));
            setMeasure((m) => m + 1);
        };
        const ro = new ResizeObserver(([entry]) => {
            // the width only: the toolbar's own height changes when it wraps, and must not start over
            const w = Math.round(entry.contentRect.width);
            if (w !== width) {
                width = w;
                decide();
            }
        });
        // before the first paint: the buttons never show in the toolbar for a frame and then move
        width = Math.round(el.getBoundingClientRect().width);
        decide();
        ro.observe(el);
        // a web font that arrives later draws the texts wider or narrower
        let live = true;
        el.ownerDocument.fonts?.ready.then(() => live && width >= 0 && decide(), () => undefined);
        return () => {
            live = false;
            ro.disconnect();
        };
    }, [ref, narrow, key]);
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
    const { view, labels, size, canUndo, canRedo, canReset, onUndo, onRedo, onReset, loadedView, empty, onDisplay, onChart, onChartDisplay, onTotal, onExpand, onCollapse, folding, templates, onLoadTemplate, templateActions, onExport, chartReady, onShowFields, layoutFolded, onLayout, zonesId, share } = props;
    const tips = { controls: props.tipsControls, on: props.tipsOn, onOn: props.onTipsOn, canReset: props.canResetTips, onReset: props.onResetTips };
    const bar = useRef(/** @type {HTMLDivElement | null} */ (null));
    const more = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const viewsButton = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const [panel, setPanel] = useState(/** @type {"options" | "views" | "chartType" | null} */ (null));
    const order = OVERFLOW_ORDER;
    // every text a part of the toolbar can show, in the built-in languages and the report's own
    const texts = useMemo(() => toolbarTexts([LABELS.en, LABELS.de, labels]), [labels]);
    const level = useOverflow(bar, `${labels.lang}:${labels.undo}:${size}`, size === "narrow", order.length, texts);
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
    // the type drawn (an automatic chart's icon is the type it draws) and the one chosen
    const plan = props.chartPlan ?? { name: chartTypeOf(view.chart), auto: false };
    const preset = plan.auto ? "auto" : plan.name;
    const drawnIcon = CHART_TYPES[plan.name].icon;
    const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";
    // the button shows the type next to Table | Chart; its name and the "More" entry say what it is
    const chartTypeText = fill(labels.chartTypeIs, { type: labels.chartTypes[preset] });
    const panels = {
        // the panels load with the chip menus (menus.js), on demand
        options: (close) => <MenuPanel name="OptionsPanel" loadingText={labels.loadingMenu} props={{ view, labels, onTotal, onExpand, onCollapse, close, tips, mod, folding, help: props.help }} />,
        views: (close) => <MenuPanel name="ViewsPanel" loadingText={labels.loadingMenu} props={{ templates, labels, onLoad: onLoadTemplate, actions: templateActions, close, share }} />,
        chartType: (close) => <MenuPanel name="ChartTypePanel" loadingText={labels.loadingMenu} props={{ view, plan, labels, onChart, onDisplay: onChartDisplay, close }} />
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
                <MenuButton key="chartType" label={chartTypeText} name={chartTypeText} title={chartTypeText} icon={drawnIcon} text={labels.chartTypes[preset]} role="dialog" testId="chart-type" popoverClass="pk-chart-menu">
                    {panels.chartType}
                </MenuButton>
            ),
            entry: (close) => <Option key="chartType" inMenu icon={drawnIcon} onSelect={() => { close(); setPanel("chartType"); }} testId="more-chart-type">{`${chartTypeText}…`}</Option>
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
    // the dot for unsaved changes, with its words for a screen reader: after the name, and on "More"
    // while Views is in there
    const changedMark = (testId) => (
        <span className="pk-view-changed" data-testid={testId}>
            <span className="pk-sr">{labels.unsavedChanges}</span>
        </span>
    );
    // the name of the view loaded, next to Views (before Export while Views is in "More"); it takes the
    // room left and is cut with "…"; a click opens Views (Save is one click more, also on a phone,
    // where Views is in "More")
    const name = loadedView ? (
        <button
            key="name"
            type="button"
            className="pk-view-name"
            aria-haspopup="dialog"
            title={loadedView.changed ? `${loadedView.name} (${labels.unsavedChanges})` : loadedView.name}
            onClick={() => (hidden.has("views") ? setPanel("views") : viewsButton.current?.click())}
            data-testid="view-name"
        >
            <span className="pk-view-name-text">{loadedView.name}</span>
            {loadedView.changed ? changedMark("view-changed") : null}
        </button>
    ) : null;
    const end = buttons("end");
    const at = hidden.has("views") ? end.length : end.length - 1;
    const wrap = level >= order.length;
    return (
        <div className={`pk-toolbar${wrap ? " pk-wrap" : ""}`} role="toolbar" aria-label={labels.toolbar} ref={bar} data-overflow={level}>
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
                    <Icon name={/** @type {any} */ (drawnIcon)} />
                    <span>{labels.chart}</span>
                </button>
            </div>
            {buttons("chart")}
            <span className="pk-sep" aria-hidden="true" />
            {/* Undo and Redo stay together, also when the toolbar wraps */}
            <span className="pk-toolbar-pair">
                <TextButton icon="undo" label={labels.undo} onClick={onUndo} disabled={!canUndo} testId="undo" shortcut={`${mod}Z`} />
                <TextButton icon="redo" label={labels.redo} onClick={onRedo} disabled={!canRedo} testId="redo" shortcut={`${mod}⇧Z`} />
            </span>
            {buttons("history")}
            <span className="pk-grow" />
            {end.slice(0, at)}
            {wrap ? null : name}
            {end.slice(at)}
            {/* a dialog, not a menu: Tab reaches the "i" of each format; it loads with the menus */}
            <MenuButton label={labels.exportLabel} icon="download" text={labels.exportLabel} role="dialog" align="end" testId="export">
                {(close) => <MenuPanel name="ExportPanel" loadingText={labels.loadingMenu} props={{ labels, onExport, chartReady, display: view.display, empty, prepare: props.prepareExport, close }} />}
            </MenuButton>
            {level > 0 ? (
                <MenuButton label={labels.more} icon="more" text={labels.more} align="end" testId="more" buttonRef={more} mark={hidden.has("views") && loadedView?.changed ? changedMark("more-changed") : null}>
                    {(close) => ORDER.filter((id) => hidden.has(id)).map((id) => actions[id].entry(close))}
                </MenuButton>
            ) : null}
            {/* a toolbar in two lines (a phone): the name last, in the room left on its line */}
            {wrap ? name : null}
            {panel ? (
                <Popover open anchor={more} onClose={closePanel} label={panel === "chartType" ? chartTypeText : panel === "views" ? labels.views : labels.options} role="dialog" align="end" className={panel === "chartType" ? "pk-chart-menu" : undefined}>
                    {panels[panel](closePanel)}
                </Popover>
            ) : null}
        </div>
    );
}
