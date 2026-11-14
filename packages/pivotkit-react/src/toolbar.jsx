/*
 * The toolbar: Table | Chart, the chart type with how the chart is drawn (value labels, legend, title,
 * smooth lines), Undo, Redo, Start over (Reset to the start view, New, an empty report), Layout (the
 * zones folded into one line or open), the table options (totals, expand and collapse, help), the
 * name of the view loaded (with a mark while it has unsaved changes, next to Views), Data (with
 * allowImport: where the data comes from and loading a file, with a dot while a file's data is
 * shown), Views (Save and
 * Save as; the saved views and sharing: link, JSON, file) and export. (Swap rows and columns sits with
 * the zones.) Every button keeps its text. When the report is too narrow for all of them, the less
 * used ones move into a "More" menu (OVERFLOW_ORDER), only those the room left cannot hold, measured
 * with the texts shown; More holds them in groups (MORE_GROUPS), Start over's two actions as entries
 * of their own. Table | Chart, Undo with Redo and Export always stay, with their text.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHART_TYPES, chartTypeOf } from "./chart-types.js";
import { useIsoLayoutEffect } from "./iso.js";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { MenuPanel } from "./lazy-menus.jsx";
import { Group, MenuButton, Option, Popover } from "./popover.jsx";
import { MORE_GROUPS, OVERFLOW_ORDER, overflowHidden, toolbarRoom, toolbarTexts } from "./overflow.js";

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
 * The room (px) of each part of the toolbar, measured: its texts in the report's language, in the
 * font the toolbar is drawn in, plus what the buttons on screen have around their text. Null where
 * the browser cannot measure (then overflowHidden's estimate in em applies).
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
 * Which entries of OVERFLOW_ORDER are in "More": overflowHidden() of the toolbar's width and the
 * room of its parts with the texts shown (measuredRoom); more of them, in the order, only while the
 * buttons still do not fit (a font that came later, the name of a loaded view). Measured again when
 * the width or the texts change.
 * @param {React.RefObject<HTMLElement | null>} ref
 * @param {string} key  changes when the buttons change (another language, the zones folded or open)
 * @param {boolean} narrow  the report is narrow (the Fields button is in the toolbar)
 * @param {string[]} present  the entries of OVERFLOW_ORDER this toolbar has
 * @param {ReturnType<typeof toolbarTexts>} texts
 * While a menu of a toolbar button is open (aria-expanded), nothing moves: a change of the width or
 * the texts (another language) waits until it closes, so an open menu keeps its button, its place
 * and its focus. (A panel opened from "More" is not held: it closes when its button fits again.)
 * @returns {string[]}
 */
function useOverflow(ref, key, narrow, present, texts) {
    const [decided, setDecided] = useState(/** @type {string[]} */ ([]));
    // how many more of those shown go, in the order, because the toolbar still does not fit
    const [extra, setExtra] = useState(0);
    const [measure, setMeasure] = useState(0);
    const [lastKey, setLastKey] = useState(key);
    const latest = useRef({ texts, present });
    // a decision that waits for an open menu to close
    const waiting = useRef(false);
    // before the effect below, which reads it
    useIsoLayoutEffect(() => {
        latest.current = { texts, present };
    });
    const isOpen = (/** @type {HTMLElement} */ el) => Boolean(el.querySelector('[aria-expanded="true"]'));
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
            if (isOpen(el)) {
                waiting.current = true;
                return;
            }
            waiting.current = false;
            const em = parseFloat(getComputedStyle(el).fontSize) || 14;
            const room = measuredRoom(el, latest.current.texts);
            const own = latest.current.present;
            setDecided(room ? overflowHidden(width, narrow, own, room) : overflowHidden(width / em, narrow, own));
            setExtra(0);
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
        // a menu of the toolbar closed: what waited for it is decided now
        const mo = typeof MutationObserver === "function" ? new MutationObserver(() => waiting.current && decide()) : null;
        mo?.observe(el, { subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
        // a web font that arrives later draws the texts wider or narrower
        let live = true;
        el.ownerDocument.fonts?.ready.then(() => live && width >= 0 && decide(), () => undefined);
        return () => {
            live = false;
            ro.disconnect();
            mo?.disconnect();
        };
    }, [ref, narrow, key]);
    const order = OVERFLOW_ORDER.filter((id) => present.includes(id));
    const shown = order.filter((id) => !decided.includes(id));
    const more = shown.slice(0, extra);
    useIsoLayoutEffect(() => {
        const el = ref.current;
        if (el && !isOpen(el) && el.scrollWidth > el.clientWidth + 1 && extra < shown.length) {
            setExtra(extra + 1);
        }
    }, [ref, extra, measure, key, shown.length]);
    return order.filter((id) => decided.includes(id) || more.includes(id));
}

/**
 * @param {any} props  see PivotReport for what each one does
 */
export function Toolbar(props) {
    const { view, labels, size, canUndo, canRedo, canReset, startEmpty, canNew, onUndo, onRedo, onReset, onNew, loadedView, empty, onDisplay, onChart, onChartDisplay, onTotal, onExpand, onCollapse, folding, templates, onLoadTemplate, templateActions, onExport, chartReady, onShowFields, layoutFolded, onLayout, zonesId, share } = props;
    const tips = { controls: props.tipsControls, on: props.tipsOn, onOn: props.onTipsOn, canReset: props.canResetTips, onReset: props.onResetTips };
    const bar = useRef(/** @type {HTMLDivElement | null} */ (null));
    const more = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const viewsButton = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const [panel, setPanel] = useState(/** @type {"options" | "views" | "chartType" | "data" | null} */ (null));
    // the Data menu (allowImport): its panel, and whether a file's data is shown (the dot)
    const data = props.data;
    // every text a part of the toolbar can show in the report's language
    const texts = useMemo(() => toolbarTexts(labels), [labels]);
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
        chartType: (close) => <MenuPanel name="ChartTypePanel" loadingText={labels.loadingMenu} props={{ view, plan, labels, onChart, onDisplay: onChartDisplay, close }} />,
        data: (close) => data?.panel(close)
    };
    // the dot while a file's data is shown (dot() below), with its words for a screen reader
    const loadedMark = (testId) => (data?.loaded ? dot(testId, labels.dataLoaded) : null);
    // Start over's two actions, in its menu and as entries of More (`prefix` of their test ids): each
    // says what it does, or, while it does nothing, why. Reset is off where it would do what New does
    // (the start view is the empty report).
    const resetWhy = !canReset ? labels.resetAlready : startEmpty ? labels.resetStartEmpty : undefined;
    const startOverItems = (close, prefix) => [
        <Option key="reset" inMenu icon="reset" hint={labels.resetHint} disabled={Boolean(resetWhy)} reason={resetWhy} onSelect={() => { close(); onReset(); }} testId={`${prefix}reset`}>
            {labels.reset}
        </Option>,
        <Option key="new" inMenu icon="newFile" hint={labels.newHint} disabled={!canNew} reason={labels.newAlready} onSelect={() => { close(); onNew(); }} testId={`${prefix}new-report`}>
            {labels.newEmpty}
        </Option>
    ];
    /**
     * Every action that can move into "More", defined once: its button in the toolbar and its entries
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
        startOver: {
            place: "history",
            button: () => (
                <MenuButton key="startOver" label={labels.startOver} icon="reset" text={labels.startOver} testId="start-over" arrowOpens off={resetWhy && !canNew ? labels.newAlready : undefined}>
                    {(close) => startOverItems(close, "")}
                </MenuButton>
            ),
            entry: (close) => startOverItems(close, "more-")
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
            entry: (close) => <Option key="layout" inMenu checkbox icon="layout" checked={!layoutFolded} onSelect={() => { close(); onLayout(); }} testId="more-layout">{labels.layout}</Option>
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
        ...(data
            ? {
                  data: {
                      place: /** @type {const} */ ("end"),
                      button: () => (
                          <MenuButton key="data" label={labels.data} icon="file" text={labels.data} role="dialog" align="end" testId="data" mark={loadedMark("data-loaded")}>
                              {panels.data}
                          </MenuButton>
                      ),
                      entry: (close) => <Option key="data" inMenu icon="file" onSelect={() => { close(); setPanel("data"); }} testId="more-data">{`${labels.data}…`}{loadedMark("more-data-loaded")}</Option>
                  }
              }
            : {}),
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
    // the order of the table is the order in the toolbar
    const ORDER = Object.keys(actions);
    // the entries of OVERFLOW_ORDER this toolbar has (no Data button without allowImport: its place costs nothing)
    const present = OVERFLOW_ORDER.filter((id) => ORDER.includes(id));
    const hiddenList = useOverflow(bar, `${labels.lang}:${labels.undo}:${size}:${present.join()}`, size === "narrow", present, texts);
    const hidden = new Set(hiddenList);
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
    const buttons = (place) => ORDER.filter((id) => actions[id].place === place && !hidden.has(id)).map((id) => actions[id].button());
    // a dot with its words for a screen reader: unsaved changes (after the name, and on "More" while
    // Views is in there), a file's data shown (on Data, and on "More" while Data is in there)
    const dot = (testId, text) => (
        <span className="pk-view-changed" data-testid={testId}>
            <span className="pk-sr">{text}</span>
        </span>
    );
    const changedMark = (testId) => dot(testId, labels.unsavedChanges);
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
    const wrap = hidden.size > 0 && hidden.size >= present.length;
    // More: what moved, in its groups, a rule between them (Start over's group named for a screen reader)
    const moreGroups = (close) =>
        MORE_GROUPS.map((group) => group.filter((id) => hidden.has(id))).flatMap((ids) =>
            ids.length
                ? [
                      <Group key={ids[0]} menu label={ids[0] === "startOver" ? labels.startOver : undefined}>
                          {ids.map((id) => actions[id].entry(close))}
                      </Group>
                  ]
                : []
        );
    return (
        <div className={`pk-toolbar${wrap ? " pk-wrap" : ""}`} role="toolbar" aria-label={labels.toolbar} ref={bar} data-overflow={hidden.size}>
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
                {(close) => <MenuPanel name="ExportPanel" loadingText={labels.loadingMenu} props={{ labels, onExport, chartReady, display: view.display, empty, dataExport: props.dataExport, prepare: props.prepareExport, close }} />}
            </MenuButton>
            {hidden.size > 0 ? (
                <MenuButton label={labels.more} icon="more" text={labels.more} align="end" testId="more" buttonRef={more} arrowOpens mark={hidden.has("views") && loadedView?.changed ? changedMark("more-changed") : hidden.has("data") ? loadedMark("more-loaded") : null}>
                    {moreGroups}
                </MenuButton>
            ) : null}
            {/* a toolbar in two lines (a phone): the name last, in the room left on its line */}
            {wrap ? name : null}
            {panel ? (
                <Popover open anchor={more} onClose={closePanel} label={panel === "chartType" ? chartTypeText : panel === "views" ? labels.views : panel === "data" ? labels.data : labels.options} role="dialog" align="end" className={panel === "chartType" ? "pk-chart-menu" : undefined}>
                    {panels[panel](closePanel)}
                </Popover>
            ) : null}
        </div>
    );
}
