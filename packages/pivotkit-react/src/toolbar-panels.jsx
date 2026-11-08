/*
 * The panels of the toolbar's menus: the chart type with how the chart is drawn, Options (totals,
 * expand and collapse, help), Views (the saved views, sharing, loading a view) and Export (the files,
 * and the table on the clipboard). They load with
 * the chip menus on demand (menus.js), so the first load of a page stays small.
 */

import React, { useEffect, useId, useRef, useState } from "react";
import { VIEW_FILE_LIMITS } from "pivotkit-core";
import { CHART_TYPES, CHART_TYPE_NAMES, SLICE_TYPES, chartTypeOf } from "./chart-types.js";
import { ClearInput } from "./clear-input.jsx";
import { Icon } from "./icons.jsx";
import { fill, hostFailure } from "./labels.js";
import { Option } from "./popover.jsx";
import { Section, SettingInfo } from "./section.jsx";
import { withoutSections } from "./sections.js";
import { SHORTCUTS } from "./tips.js";
import { TOTALS, totalNoEffect } from "./view-ops.js";
import { canSaveAs, isLoadedEntry, saveAsTarget, saveTarget } from "./view-save.js";
import { storeViews } from "./view-store.js";

function ChartTypeOptions({ view, plan, labels, onChart, close }) {
    const current = chartTypeOf(view.chart);
    return CHART_TYPE_NAMES.map((p) => (
        <Option
            key={p}
            icon={CHART_TYPES[p].icon}
            checked={view.display === "chart" && current === p}
            // what "Automatic" draws for this view now
            hint={p === "auto" && plan ? fill(labels.chartAutoNow, { type: labels.chartTypes[plan.name] }) : undefined}
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

/** The value labels a chart type offers: a share in percent is a pie's and a donut's. */
const VALUE_LABELS = { slices: ["auto", "off", "value", "percent", "both"], other: ["auto", "off", "value"] };
const LABEL_POSITIONS = ["outside", "inside"];
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
function ChartDisplay({ view, plan, labels, onDisplay }) {
    const chart = view.chart;
    // the type drawn: an automatic chart's is the one the data chose
    const drawn = plan ? plan.name : chartTypeOf(chart);
    const pie = SLICE_TYPES.includes(drawn);
    // bars, lines and areas have a category axis
    const axis = CHART_TYPES[drawn].axis;
    const choices = pie ? VALUE_LABELS.slices : VALUE_LABELS.other;
    // a pie's "percent" on another type draws the value: it shows as "Value" there
    const valueLabels = !pie && (chart.valueLabels === "percent" || chart.valueLabels === "both") ? "value" : chart.valueLabels;
    // folded, the title names the settings that are not the default ("Legend, Title"), else "Automatic"
    const changed = [
        [valueLabels !== "auto", labels.valueLabels],
        [pie && (chart.labelPosition ?? "outside") !== "outside", labels.labelPosition],
        [chart.legend !== "auto", labels.legend],
        [Boolean(chart.title), labels.chartTitle],
        [axis && chart.axisLabels !== "auto", labels.axisLabels],
        [axis && view.rows.length >= 2 && chart.groupLabels !== "auto", labels.groupLabels],
        [(drawn === "line" || drawn === "area") && chart.smooth, labels.smoothLines]
    ].flatMap(([on, name]) => (on ? [name] : []));
    return (
        <Section title={labels.chartDisplay} id="chartDisplay" state={changed.join(", ") || labels.formatAuto} changed={changed.length > 0}>
            <div className="pk-subtitle">{labels.valueLabels}</div>
            <div className="pk-choice-grid">
                {choices.map((v) => (
                    <Option key={v} checked={valueLabels === v} onSelect={() => onDisplay({ valueLabels: v })} testId={`labels-${v}`}>
                        {labels.valueLabelNames[v]}
                    </Option>
                ))}
            </div>
            {pie ? (
                <>
                    <div className="pk-subtitle pk-setting-row">
                        <span>{labels.labelPosition}</span>
                        <SettingInfo id="labelPosition" name={labels.labelPosition} />
                    </div>
                    <div className="pk-choice-grid">
                        {LABEL_POSITIONS.map((v) => (
                            <Option key={v} checked={(chart.labelPosition ?? "outside") === v} disabled={chart.valueLabels === "off"} onSelect={() => onDisplay({ labelPosition: v })} testId={`label-position-${v}`}>
                                {labels.labelPositionNames[v]}
                            </Option>
                        ))}
                    </div>
                </>
            ) : null}
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
                    <div className="pk-subtitle pk-setting-row">
                        <span>{labels.groupLabels}</span>
                        <SettingInfo id="groupLabels" name={labels.groupLabels} />
                    </div>
                    <div className="pk-choice-grid">
                        {GROUP_LABELS.map((v) => (
                            <Option key={v} checked={chart.groupLabels === v} onSelect={() => onDisplay({ groupLabels: v })} testId={`groups-${v}`}>
                                {labels.groupLabelNames[v]}
                            </Option>
                        ))}
                    </div>
                </>
            ) : null}
            {drawn === "line" || drawn === "area" ? <Switch checked={chart.smooth} onChange={(on) => onDisplay({ smooth: on })} testId="chart-smooth">{labels.smoothLines}</Switch> : null}
        </Section>
    );
}

/** The chart type menu: the types (a pick closes it) and how the chart is drawn. */
export function ChartTypePanel({ view, plan, labels, onChart, onDisplay, close }) {
    return (
        <>
            <Section title={labels.chartType} id="chartType">
                <div className="pk-choice-grid">
                    <ChartTypeOptions view={view} plan={plan} labels={labels} onChart={onChart} close={close} />
                </div>
            </Section>
            <ChartDisplay view={view} plan={plan} labels={labels} onDisplay={onDisplay} />
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

/**
 * A switch: a checkbox drawn as a track, on one line, with an "i" (`info`, an id of
 * labels.settingInfo) next to it. Disabled, it says why under it (`reason`).
 * @param {{ checked: boolean, onChange: (on: boolean) => void, testId?: string, children: React.ReactNode,
 *   disabled?: boolean, reason?: string | null, info?: string, name?: string }} props
 */
function Switch({ checked, onChange, testId, children, disabled, reason, info, name }) {
    const reasonId = useId();
    return (
        <div className="pk-setting-row">
            <label className={`pk-switch${disabled ? " pk-disabled" : ""}`}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={disabled && reason ? reasonId : undefined} data-testid={testId} />
                <span className="pk-switch-track" aria-hidden="true" />
                <span className="pk-switch-text">
                    {children}
                    {disabled && reason ? (
                        <span id={reasonId} className="pk-option-hint" data-testid={testId ? `${testId}-reason` : undefined}>
                            {reason}
                        </span>
                    ) : null}
                </span>
            </label>
            {info ? <SettingInfo id={info} name={name ?? ""} /> : null}
        </div>
    );
}

/** "Reset menu sections": every section open or folded as at first, the tips as they are; off while nothing differs. */
function ResetSections({ list, change, labels }) {
    const rest = withoutSections(list);
    return (
        <Option icon="reset" onSelect={() => change(rest, null)} disabled={rest.length === list.length} testId="reset-sections">
            {labels.resetSections}
        </Option>
    );
}

export function OptionsPanel({ view, labels, onTotal, onExpand, onCollapse, close, tips, mod, folding, help }) {
    return (
        <>
            <Section title={labels.totals} id="totals">
                {/* a total that would change nothing in this view is off-limits, with the reason */}
                {TOTALS.map((key) => {
                    const why = totalNoEffect(view, key);
                    return (
                        <Switch key={key} checked={view.totals[key]} onChange={(on) => onTotal(key, on)} disabled={why !== null} reason={why ? labels[why] : null} info={key} name={labels[key]} testId={`total-${key}`}>
                            {labels[key]}
                        </Switch>
                    );
                })}
            </Section>
            <Section title={labels.zones.rows}>
                {/* each only when it would change something; when not, a line says why */}
                <Option icon="chevronDown" onSelect={() => { close(); onExpand(); }} disabled={!folding.canExpand} reason={folding.why.expand ? labels[folding.why.expand] : undefined} testId="expand-all">{labels.expandAll}</Option>
                <Option icon="chevronRight" onSelect={() => { close(); onCollapse(); }} disabled={!folding.canCollapse} reason={folding.why.collapse ? labels[folding.why.collapse] : undefined} testId="collapse-all">{labels.collapseAll}</Option>
            </Section>
            {/* help: the tips, and the "i" of settings, zones and fields: one switch, unless the host decides each */}
            <Section title={labels.help} id="help">
                {tips.controls ? <Switch checked={tips.on} onChange={tips.onOn} testId="show-tips">{labels.showTips}</Switch> : null}
                {help?.explanations ? <Switch checked={help.explanations.on} onChange={help.explanations.set} testId="show-explanations">{labels.showSettingInfo}</Switch> : null}
                {tips.controls ? <Option icon="reset" onSelect={() => tips.onReset()} disabled={!tips.canReset} testId="reset-tips">{labels.resetTips}</Option> : null}
                {/* the sections' folding is kept apart from the tips: its own way back to the start */}
                {help?.sections ? <ResetSections list={help.sections[0]} change={help.sections[1]} labels={labels} /> : null}
                <details className="pk-more">
                    <summary className="pk-more-title" data-testid="shortcuts-title">{labels.shortcutsTitle}</summary>
                    <Shortcuts labels={labels} mod={mod} />
                </details>
            </Section>
        </>
    );
}

/**
 * A question in place of what asked it (Save as onto a name that is taken, Save over a shared view):
 * it takes the focus on Cancel, so Enter never writes over a view by accident; Cancel (`onNo`) gives
 * the focus back to whatever comes in its place.
 * @param {{ question: string, action: string, cancel: string, onYes: () => void, onNo: () => void, testId: string, yesId: string, noId: string }} props
 */
function Confirm({ question, action, cancel, onYes, onNo, testId, yesId, noId }) {
    const no = useRef(/** @type {HTMLButtonElement | null} */ (null));
    useEffect(() => {
        no.current?.focus({ preventScroll: true });
    }, []);
    return (
        <div className="pk-confirm pk-save-confirm" role="group" aria-label={question} data-testid={testId}>
            <span className="pk-confirm-text">{question}</span>
            <button type="button" className="pk-btn pk-primary" data-testid={yesId} onClick={onYes}>
                {action}
            </button>
            <button ref={no} type="button" className="pk-btn" data-autofocus="" data-testid={noId} onClick={onNo}>
                {cancel}
            </button>
        </div>
    );
}

/**
 * Save the view under a name (Save as). A name that is taken asks first, in place of the field
 * (`resolve`: view-save.js's saveAsTarget): Replace writes over that view, Cancel goes back to the
 * field with the name in it. A save closes the menu, as Save "…" does (the focus goes back to its
 * button); the note says whether it was saved.
 * @param {{ labels: any, button: string, onSave: (name: string, target: any) => unknown, resolve: (name: string) => any, close: () => void }} props
 */
function SaveView({ labels, button, onSave, resolve, close }) {
    const [name, setName] = useState("");
    // the save that would replace a view, while the question is open
    const [asking, setAsking] = useState(/** @type {any} */ (null));
    const field = useRef(/** @type {HTMLInputElement | null} */ (null));
    const asked = useRef(false);
    useEffect(() => {
        // Cancel gives the focus back to the field (the question took it)
        if (asking) {
            asked.current = true;
        } else if (asked.current) {
            field.current?.focus({ preventScroll: true });
        }
    }, [asking]);
    if (asking) {
        return (
            <Confirm
                question={fill(labels.replaceConfirm, { name: asking.name })}
                action={labels.replaceAction}
                cancel={labels.cancel}
                testId="replace-confirm"
                yesId="confirm-replace"
                noId="cancel-replace"
                onYes={() => {
                    close();
                    onSave(asking.name, asking.target);
                }}
                onNo={() => setAsking(null)}
            />
        );
    }
    return (
        <form
            className="pk-inline-form"
            onSubmit={(e) => {
                e.preventDefault();
                const wanted = name.trim();
                const target = wanted ? resolve(wanted) : null;
                if (target?.replaces) {
                    setAsking({ name: wanted, target });
                } else if (target) {
                    close();
                    onSave(wanted, target);
                }
            }}
        >
            <ClearInput type="text" value={name} onChange={setName} clearLabel={labels.clearText} placeholder={labels.viewName} aria-label={labels.viewName} maxLength={120} data-testid="saved-view-name" inputRef={field} />
            <button type="submit" className="pk-btn pk-primary" disabled={!name.trim()}>
                {button}
            </button>
        </form>
    );
}

/**
 * Before a view for other data is applied: what does not fit, and the choices (load it anyway, let
 * the host switch to its data and load it there, or cancel). Names from the file are text only. It
 * takes the focus when it appears (it replaces the form the focus was in), unless `quiet` (a link at
 * the page's load: the focus stays where the page put it).
 * @param {{ check: { lines: string[], load: () => void, switchTo?: { name: string, run: () => void } }, labels: any, onCancel: () => void, close: () => void, title?: string, quiet?: boolean }} props
 */
export function LoadCheck({ check, labels, onCancel, close, title, quiet = false }) {
    const titleId = useId();
    const first = useRef(/** @type {HTMLButtonElement | null} */ (null));
    useEffect(() => {
        if (!quiet) {
            first.current?.focus({ preventScroll: true });
        }
    }, [quiet]);
    return (
        <div className="pk-load-check" role="group" aria-labelledby={titleId} data-testid="load-check">
            <p id={titleId} className="pk-load-check-title">
                <Icon name="info" size={16} />
                <span>{title ?? labels.loadCheckTitle}</span>
            </p>
            <ul className="pk-load-check-lines">
                {check.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                ))}
            </ul>
            <div className="pk-load-check-actions">
                {check.switchTo ? (
                    <button ref={first} type="button" className="pk-btn pk-primary" data-autofocus="" data-testid="load-switch" onClick={() => { close(); check.switchTo?.run(); }}>
                        {fill(labels.switchAndLoad, { source: check.switchTo.name })}
                    </button>
                ) : null}
                <button ref={check.switchTo ? undefined : first} type="button" className={check.switchTo ? "pk-btn" : "pk-btn pk-primary"} data-autofocus={check.switchTo ? undefined : ""} data-testid="load-anyway" onClick={() => { close(); check.load(); }}>
                    {labels.loadAnyway}
                </button>
                <button type="button" className="pk-btn" data-testid="load-cancel" onClick={onCancel}>
                    {labels.cancel}
                </button>
            </div>
            {check.switchTo ? <p className="pk-hint">{labels.switchStartsFresh}</p> : null}
        </div>
    );
}

/**
 * "Load view…": a view file, a view pasted as JSON or a link, or a .pivotkit.json file. Nothing
 * changes until it is loaded; what cannot be used is said in the panel; a view for other data asks
 * first (LoadCheck); what was left out after the load is said above the result.
 */
function LoadView({ labels, onLoadText, close }) {
    const [text, setText] = useState("");
    const [problem, setProblem] = useState(/** @type {string | null} */ (null));
    const [check, setCheck] = useState(/** @type {any} */ (null));
    const [busy, setBusy] = useState(false);
    const file = useRef(/** @type {HTMLInputElement | null} */ (null));
    const field = useRef(/** @type {HTMLTextAreaElement | null} */ (null));
    const problemId = useId();
    // opened from its menu entry, which is gone now: the focus goes into the field
    useEffect(() => {
        if (!check) {
            field.current?.focus({ preventScroll: true });
        }
    }, [check]);
    const load = async (value) => {
        setBusy(true);
        const outcome = await onLoadText(value);
        setBusy(false);
        if (typeof outcome === "string") {
            setProblem(outcome);
        } else if (outcome) {
            setCheck(outcome);
        } else {
            close();
        }
    };
    if (check) {
        return <LoadCheck check={check} labels={labels} onCancel={() => setCheck(null)} close={close} />;
    }
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
                            content = chosen.size > VIEW_FILE_LIMITS.text ? null : await chosen.text();
                        } catch {
                            content = null;
                        }
                        if (content === null) {
                            setProblem(chosen.size > VIEW_FILE_LIMITS.text ? labels.viewFailed.tooLarge : labels.viewFailed.file);
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
        <Section title={labels.share} id="share">
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
            {/* what leaves the report with a view: filter values can be values of the data */}
            <p className="pk-hint pk-menu-hint" data-testid="share-privacy">
                {labels.sharePrivacy}
            </p>
        </Section>
    );
}

/**
 * What the Views menu's buttons do, from what the report passes (PivotReport: templateActions): save
 * the view under a new name (the host's onSaveTemplate wins over the browser store), save the loaded
 * view where it is kept (view-save.js), delete an entry (a host's goes to
 * its onDeleteTemplate, a stored one to the store) and publish a user's view (onPublishTemplate, when
 * the host allows it). Each says "saved", "deleted" or "published" when it is kept (a promise
 * resolved), or why not; the delete and the publish resolve to whether they were kept.
 * @param {any} ctx
 * @param {any} labels  with the menus' texts
 */
function viewActions(ctx, labels) {
    const run = (task, done, failed, rejected, name) =>
        Promise.resolve()
            .then(task)
            .then(
                () => {
                    ctx.announce(fill(done, { name }));
                    return true;
                },
                (e) => {
                    ctx.announce(hostFailure(failed, rejected, e), { tone: "error" });
                    return false;
                }
            );
    const write = (change) => storeViews(ctx.viewsText, change, labels, ctx.locale, ctx.keep);
    /**
     * One save (view-save.js: a SaveWrite), said as "saved" or why not; once kept, the view as it was
     * at the click is that saved view (a slow host's answer may come after further changes). The view
     * is the one shown, normalized against the data by the history, as every view the report hands out.
     */
    const save = (target, name) => {
        const key = ctx.viewKey;
        return run(
            () =>
                target.kind === "publish"
                    ? ctx.onPublish(name, ctx.view)
                    : target.kind === "host"
                      ? ctx.onSave(name, ctx.view, { scope: "user" })
                      : write({ name, view: ctx.view, sourceId: ctx.sourceId, replace: target.at }),
            labels.toastSaved,
            labels.toastSaveFailed,
            labels.toastSaveRejected,
            name
        ).then((ok) => ok && ctx.onSaved({ name, scope: target.kind === "publish" ? "shared" : "user", store: target.kind === "store", storeSource: target.kind === "store" ? target.storeSource : null }, key));
    };
    return {
        // Save and Save as: where to is view-save.js's (the host's onSaveTemplate wins over the store)
        save,
        remove: ctx.onDelete || ctx.store ? (t) => run(() => (t.at !== undefined ? write({ remove: t.at, removeName: t.name }) : ctx.onDelete(t.name, { scope: t.scope })), labels.toastDeleted, labels.toastDeleteFailed, labels.toastDeleteRejected, t.name) : null,
        publish: ctx.onPublish ? (t) => run(() => ctx.onPublish(t.name, ctx.normalized(t.view)), labels.toastPublished, labels.toastPublishFailed, labels.toastPublishRejected, t.name) : null
    };
}

/**
 * The Views menu: "This view" (Save the loaded view under its name, or why not; Save as, the name
 * field; New, an empty report), the templates in two groups, "Shared views" (the host's, for
 * everyone) and "My views" (the user's own: the host's or the browser store's), each shown only when
 * it has entries ("My views" also when the user can save), then sharing. An entry loads its view; a deletable one
 * has a delete button, a shared one that is not has the "i" that says who changes shared views, and
 * a user's view offers "Publish as shared view" when the host allows it. Delete and publish ask
 * first, in place; the entry changes only when the host's callback (or the browser store) has
 * finished, and the focus goes back to the entry in that place. Names need not be unique: every
 * entry is shown, keyed and confirmed by its place in the list.
 * @param {{ templates: import("./templates.js").TemplateEntry[], labels: any, onLoad: (t: any) => void, actions: any, close: () => void, share?: any }} props
 */
export function ViewsPanel({ templates, labels, onLoad, actions, close, share }) {
    const { save, remove: onDelete, publish: onPublish } = viewActions(actions, labels);
    const can = { host: Boolean(actions.onSave), store: Boolean(actions.store), publish: Boolean(onPublish), sourceId: actions.sourceId };
    const target = saveTarget(actions.loaded, templates, can, actions.empty);
    // Save over a shared view asks first: everyone sees the change
    const [askShared, setAskShared] = useState(false);
    // "My views" says where they are kept while the browser store takes the saves
    const store = actions.store && !actions.onSave;
    const [confirming, setConfirming] = useState(/** @type {{ at: number, kind: "delete" | "publish" } | null} */ (null));
    const [busy, setBusy] = useState(false);
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    // the entry the focus goes back to once a question in its place is gone: by its key, else (it was
    // deleted) the entry now at its place in the menu
    const [refocus, setRefocus] = useState(/** @type {{ key: string, place: number } | null} */ (null));
    useEffect(() => {
        // the link module, before a click asks for it: a copy right in the click is allowed everywhere
        share?.prepare?.();
    }, [share]);
    useEffect(() => {
        if (refocus && box.current) {
            const entries = [...box.current.querySelectorAll("[data-pk-entry]")];
            const entry = entries.find((el) => el.getAttribute("data-pk-entry") === refocus.key) ?? entries[Math.min(refocus.place, entries.length - 1)];
            /** @type {HTMLElement | null} */ ((entry ?? box.current).querySelector("[data-pk-option]"))?.focus({ preventScroll: true });
            setRefocus(null);
        }
    }, [refocus, templates]);
    /** An entry's key in the menu: its group, its place in the browser store and its name. */
    const keyOf = (t) => `${t.scope}:${t.at ?? ""}:${t.name}`;
    useEffect(() => {
        // a question in an entry's place takes the focus (a click does not focus a button everywhere: Safari)
        if (confirming) {
            /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(".pk-confirm [data-autofocus]"))?.focus({ preventScroll: true });
        }
    }, [confirming]);
    const answer = (t) => {
        setConfirming(null);
        const entries = box.current ? [...box.current.querySelectorAll("[data-pk-entry], .pk-confirm")] : [];
        setRefocus({ key: keyOf(t), place: Math.max(0, entries.findIndex((el) => el.classList.contains("pk-confirm"))) });
    };
    const entry = (t, at) => {
        if (confirming && confirming.at === at) {
            const kind = confirming.kind;
            const publish = kind === "publish";
            const question = fill(publish ? labels.publishConfirm : labels.deleteConfirm, { name: t.name });
            return (
                <div key={`${at}:${t.name}`} className="pk-template pk-confirm" role="group" aria-label={question}>
                    <span className="pk-confirm-text">{question}</span>
                    <button
                        type="button"
                        className={publish ? "pk-btn pk-primary" : "pk-btn pk-danger-btn"}
                        disabled={busy}
                        data-autofocus=""
                        data-testid={`confirm-${kind}`}
                        onClick={async () => {
                            setBusy(true);
                            const ok = await (publish ? onPublish : onDelete)?.(t);
                            setBusy(false);
                            if (ok) {
                                answer(t);
                            }
                        }}
                    >
                        {publish ? labels.publishAction : labels.deleteAction}
                    </button>
                    <button type="button" className="pk-btn" disabled={busy} onClick={() => answer(t)}>
                        {labels.cancel}
                    </button>
                </div>
            );
        }
        const button = (kind, icon, text) => (
            <button type="button" className="pk-icon-btn" onClick={() => setConfirming({ at, kind })} aria-label={text} title={text} data-testid={`${kind}-view-${t.name}`}>
                <Icon name={icon} />
            </button>
        );
        return (
            <div key={`${at}:${t.name}`} className="pk-template" data-pk-entry={keyOf(t)}>
                <Option icon="bookmark" current={isLoadedEntry(t, actions.loaded)} onSelect={() => { close(); onLoad(t); }} testId={`saved-view-${t.name}`}>
                    {t.name}
                </Option>
                {onPublish && t.scope === "user" ? button("publish", "upload", fill(labels.publishView, { name: t.name })) : null}
                {onDelete && t.deletable ? button("delete", "trash", fill(labels.deleteView, { name: t.name })) : t.scope === "shared" && sharedChange ? <SettingInfo id="sharedView" name={t.name} /> : null}
            </div>
        );
    };
    // the "i" on a shared view says who changes shared views: only where someone here can (a shared
    // view the host lets delete, or Publish), so no report claims admins it does not have
    const sharedChange = Boolean(onPublish) || templates.some((t) => t.scope === "shared" && t.deletable);
    const group = (scope) => templates.map((t, at) => (t.scope === scope ? entry(t, at) : null)).filter(Boolean);
    const shared = group("shared");
    const mine = group("user");
    return (
        <div ref={box} className="pk-views">
            <Section title={labels.thisView} id="thisView">
                {target && askShared && target.kind === "publish" ? (
                    <Confirm
                        question={fill(labels.replaceSharedConfirm, { name: actions.loaded.name })}
                        action={labels.replaceAction}
                        cancel={labels.cancel}
                        testId="replace-shared-confirm"
                        yesId="confirm-replace-shared"
                        noId="cancel-replace-shared"
                        onYes={() => { close(); save(target, actions.loaded.name); }}
                        onNo={() => setAskShared(false)}
                    />
                ) : target ? (
                    <Option icon="save" onSelect={() => { if (target.kind === "publish") { setAskShared(true); } else { close(); save(target, actions.loaded.name); } }} disabled={target.kind === null} reason={target.kind === null ? labels[target.why] : undefined} testId="save-loaded">
                        {fill(labels.saveNamed, { name: actions.loaded.name })}
                    </Option>
                ) : null}
                {canSaveAs(can) ? (
                    <>
                        <div className="pk-subtitle">{actions.loaded ? labels.saveAs : labels.saveView}</div>
                        <SaveView labels={labels} button={actions.loaded ? labels.saveAs.replace(/…$/, "") : labels.save} onSave={(name, t) => save(t, name)} resolve={(name) => saveAsTarget(name, templates, can)} close={close} />
                    </>
                ) : null}
                <div className="pk-setting-row">
                    <Option icon="newFile" onSelect={() => { close(); actions.onNew(); }} disabled={!actions.canNew} reason={actions.canNew ? undefined : labels.newAlready} testId="new-report">
                        {labels.newEmpty}
                    </Option>
                    <SettingInfo id="newReport" name={labels.newEmpty} />
                </div>
            </Section>
            {shared.length ? (
                <Section title={labels.sharedViews} id="sharedViews">
                    {shared}
                </Section>
            ) : null}
            {mine.length || canSaveAs(can) || !shared.length ? (
                <Section title={labels.myViews} id="myViews">
                    {/* empty: one line, with the store's note in short */}
                    {mine.length ? mine : <p className="pk-hint" data-testid={store ? "store-note" : undefined}>{store ? labels.noViewsStore : labels.noViews}</p>}
                    {store && mine.length ? (
                        <p className="pk-hint pk-menu-hint" data-testid="store-note">
                            {labels.storeNote}
                        </p>
                    ) : null}
                </Section>
            ) : null}
            {share ? <ShareSection labels={labels} share={share} close={close} /> : null}
        </div>
    );
}

/**
 * One entry of an export menu: the option and, when it needs explaining, its "i".
 * @param {{ icon: string, text: string, info?: string, onSelect: () => void, testId: string, disabled?: boolean, reason?: string }} props
 */
export function ExportOption({ icon, text, info, onSelect, testId, disabled, reason }) {
    const option = (
        <Option icon={icon} onSelect={onSelect} disabled={disabled} reason={reason} testId={testId}>
            {text}
        </Option>
    );
    return info ? (
        <div className="pk-setting-row">
            {option}
            <SettingInfo id={/** @type {any} */ (info)} name={text} />
        </div>
    ) : (
        option
    );
}

/**
 * The Export menu: the table as a file (Excel, CSV), the chart as an image, and the table on the
 * clipboard (as shown, or its data as JSON). The export module loads when the menu opens, so a copy
 * happens right in the click.
 * An empty report (no field placed) has nothing to export: every entry is off, and says so.
 * @param {{ labels: import("./labels.js").UiLabels, onExport: (kind: string) => void, chartReady: boolean, display: string, empty?: boolean, prepare: () => void, close: () => void }} props
 */
export function ExportPanel({ labels, onExport, chartReady, display, empty = false, prepare, close }) {
    useEffect(() => {
        prepare();
    }, [prepare]);
    const run = (kind) => () => {
        close();
        onExport(kind);
    };
    // nothing to export yet: off, with the reason
    const off = empty ? { disabled: true, reason: labels.exportNeedsField } : {};
    return (
        <>
            <Section title={labels.exportDownload} id="exportDownload">
                <ExportOption icon="file" text={labels.exportXlsx} info="exportXlsx" onSelect={run("xlsx")} {...off} testId="export-xlsx" />
                <ExportOption icon="file" text={labels.exportCsv} info="exportCsv" onSelect={run("csv")} {...off} testId="export-csv" />
                <ExportOption icon="image" text={labels.exportPng} disabled={empty || !chartReady} reason={empty ? off.reason : display !== "chart" ? labels.exportPngNeedsChart : undefined} onSelect={run("png")} testId="export-png" />
            </Section>
            <Section title={labels.exportCopy} id="exportCopy">
                <ExportOption icon="copy" text={labels.copyTable} info="copyTable" onSelect={run("copy-table")} {...off} testId="export-copy-table" />
                <ExportOption icon="copy" text={labels.copyDataJson} info="copyDataJson" onSelect={run("copy-json")} {...off} testId="export-copy-json" />
            </Section>
        </>
    );
}
