/*
 * The row on top of the result: the tabs Table, Chart and, on a wide report, Both (#51), the settings
 * of what is shown ("Table settings", "Chart settings", both with Both), Enlarge and Full screen. The tabs are ARIA tabs with manual
 * activation (WAI-ARIA Authoring Practices, tabs pattern): one Tab stop, left and right (Home, End)
 * move the focus, Enter or Space shows the tab, since the chart loads on demand. The result below
 * is their tab panel. In the narrow layout, and on a wider report whose row has no room for their
 * whole names (use-tabs-fit.js), the settings button says "Settings" only, Enlarge and Full screen
 * show their icon only; their whole names stay for assistive technology and as a tooltip. Where
 * even that has no room beside the tabs, the buttons move together to a line above them, at the
 * right; the Tab order stays tabs first (#706). Left and right do not mirror: the report has no
 * right-to-left layout. The settings load with the menus (menus.js).
 */

import React, { useRef } from "react";
import { CHART_TYPES } from "./chart-types.js";
import { Icon } from "./icons.jsx";
import { MenuPanel } from "./lazy-menus.jsx";
import { MenuButton } from "./popover.jsx";
import { tabStep } from "./rove.js";
import { useTabsFit } from "./use-tabs-fit.js";

/** The tabs, in order, by the view each shows; a tab's test id is `show-<view>`. */
const TABS = Object.freeze(/** @type {const} */ (["table", "chart", "both"]));

/**
 * The id of a tab, from the id of the panel it controls.
 * @param {string} panelId
 * @param {"table" | "chart" | "both"} display
 */
export const tabId = (panelId, display) => `${panelId}-${display}`;

/**
 * @param {any} props  see PivotReport for what each one does. `panelId`: the result's id (the tab
 *   panel); `narrow`: a narrow report, the short form always; `shown`: what the result shows
 *   ("both" only on a wide report);
 *   `both`: whether the tab Both is offered; `big`: use-big-result.js's Enlarge and Full screen
 */
export function ViewTabs(props) {
    const { view, labels, panelId, narrow, shown = view.display, both = false, onDisplay, plan, big } = props;
    const list = useRef(/** @type {HTMLDivElement | null} */ (null));
    const row = useRef(/** @type {HTMLDivElement | null} */ (null));
    const tabs = TABS.filter((d) => d !== "both" || both);
    // the arrow keys move the focus between the tabs; showing one is the tab's own click
    const onKeyDown = (/** @type {React.KeyboardEvent} */ e) => {
        const buttons = /** @type {HTMLElement[]} */ ([...(list.current?.querySelectorAll('[role="tab"]') ?? [])]);
        const at = buttons.indexOf(/** @type {HTMLElement} */ (e.target));
        const next = at < 0 ? null : tabStep(e.key, at, buttons.length);
        if (next !== null) {
            e.preventDefault();
            buttons[next].focus();
        }
    };
    // the short form: always on a narrow report, else when the whole names have no room
    const texts = [labels.table, labels.chart, labels.both, labels.tableSettings, labels.chartSettings, labels.enlarge, labels.reduce, labels.fullScreen];
    const fit = useTabsFit(row, !narrow, [shown, both, big.enlarged, big.fullOk, ...texts].join("\n"));
    const short = narrow || fit;
    // a name as a tooltip and for a screen reader where only the icon shows
    const iconOnly = (/** @type {string} */ name) => (short ? { "aria-label": name, title: name } : {});
    // with both shown, Enlarge says what it enlarges (#51)
    const enlargeTitle = shown === "both" && !big.enlarged ? { title: labels.enlargeBoth } : {};
    return (
        <div ref={row} className="pk-result-head" data-pk-short={short ? "" : undefined} data-testid="view-tabs-row">
            <div ref={list} className="pk-tabs" role="tablist" aria-label={labels.view} onKeyDown={onKeyDown}>
                {tabs.map((d) => (
                    <button
                        key={d}
                        type="button"
                        role="tab"
                        id={tabId(panelId, d)}
                        aria-selected={shown === d}
                        aria-controls={panelId}
                        tabIndex={shown === d ? 0 : -1}
                        className="pk-tab"
                        onClick={() => (shown === d ? undefined : onDisplay(d))}
                        data-testid={`show-${d}`}
                    >
                        {/* an automatic chart's icon is the type it draws; Both its own */}
                        <Icon name={/** @type {any} */ (d === "table" ? "table" : d === "both" ? "layout" : CHART_TYPES[plan.name].icon)} />
                        <span>{d === "table" ? labels.table : d === "both" ? labels.both : labels.chart}</span>
                    </button>
                ))}
            </div>
            {/* the buttons move together: without room beside the tabs, to a line above them (#706) */}
            <div className="pk-result-actions">
                {shown !== "chart" ? <SettingsButton kind="table" {...props} narrow={short} /> : null}
                {shown !== "table" ? <SettingsButton kind="chart" {...props} narrow={short} /> : null}
                <button type="button" className="pk-btn pk-pressable pk-small-btn" data-pk-on={big.enlarged ? "" : undefined} onClick={big.toggleEnlarged} data-testid="enlarge" {...enlargeTitle} {...iconOnly(big.enlarged ? labels.reduce : labels.enlarge)}>
                    <Icon name="enlarge" size={14} />
                    {/* says what a click does: Enlarge, or Reduce while enlarged; a changing name is no
                        toggle (no aria-pressed), the highlight shows the state (data-pk-on) */}
                    {short ? null : <span className="pk-btn-text">{big.enlarged ? labels.reduce : labels.enlarge}</span>}
                </button>
                {big.fullOk ? (
                    <button type="button" className="pk-btn pk-pressable pk-small-btn" aria-pressed={big.full} onClick={big.toggleFull} data-testid="full-screen" {...iconOnly(labels.fullScreen)}>
                        <Icon name="fullScreen" size={14} />
                        {short ? null : <span className="pk-btn-text">{labels.fullScreen}</span>}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

/**
 * The settings of the table or of the chart: a button with its panel. With both shown, each part has
 * its own (#51), with the test id `table-settings` or `chart-settings`; else `view-settings`. In the
 * short form it says "Settings".
 * @param {any} props  ViewTabs' props, and `kind`: "table" or "chart"; `narrow`: the short form
 */
function SettingsButton(props) {
    const { kind, view, labels, narrow, plan } = props;
    const chart = kind === "chart";
    const settings = chart ? labels.chartSettings : labels.tableSettings;
    return (
        <MenuButton label={settings} icon="sliders" text={narrow ? labels.settingsShort : settings} name={narrow ? settings : undefined} title={narrow ? settings : undefined} className="pk-btn pk-small-btn" role="dialog" align="end" testId={props.shown === "both" ? `${kind}-settings` : "view-settings"} popoverClass={chart ? "pk-chart-menu" : undefined}>
            {(close) =>
                chart ? (
                    <MenuPanel
                        name="ChartSettingsPanel"
                        loadingText={labels.loadingMenu}
                        props={{ view, plan, encoded: props.encoded, lineChecks: props.lineChecks, labels, locale: props.locale, onChart: props.onChart, onDisplay: props.onChartDisplay, close, series: props.chartSeries, colors: props.chartColors, folding: props.folding, onExpand: props.onExpand, onCollapse: props.onCollapse }}
                    />
                ) : (
                    <MenuPanel name="TableSettingsPanel" loadingText={labels.loadingMenu} props={{ view, labels, onTotal: props.onTotal, onExpand: props.onExpand, onCollapse: props.onCollapse, close, folding: props.folding }} />
                )
            }
        </MenuButton>
    );
}
