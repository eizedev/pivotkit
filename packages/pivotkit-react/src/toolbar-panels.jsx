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
import { useFormName } from "./dom.js";
import { Icon } from "./icons.jsx";
import { fill, hostFailure } from "./labels.js";
import { Option } from "./popover.jsx";
import { Section, SettingInfo } from "./section.jsx";
import { shareActions } from "./share-actions.js";
import { SHORTCUTS } from "./tips.js";
import { LevelMenu } from "./levels.jsx";
import { afterDelete, entryIds, optionTopics } from "./menu-topics.js";
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
 * One group of the chart's Display (Value labels, Legend, ...): its title, with an "i" where it needs
 * explaining, and its choices; a dashed rule between the groups (styles.css: .pk-subsection).
 * @param {{ title?: string, info?: string, children: React.ReactNode }} props
 */
function Sub({ title, info, children }) {
    const titleId = useId();
    return (
        <div className="pk-subsection" role={title ? "group" : undefined} aria-labelledby={title ? titleId : undefined}>
            {title ? (
                <div className={`pk-subtitle${info ? " pk-setting-row" : ""}`}>
                    <span id={titleId}>{title}</span>
                    {info ? <SettingInfo id={info} name={title} /> : null}
                </div>
            ) : null}
            {children}
        </div>
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
    return (
        <Section title={labels.chartDisplay}>
            <Sub title={labels.valueLabels}>
                <div className="pk-choice-grid">
                    {choices.map((v) => (
                        <Option key={v} checked={valueLabels === v} onSelect={() => onDisplay({ valueLabels: v })} testId={`labels-${v}`}>
                            {labels.valueLabelNames[v]}
                        </Option>
                    ))}
                </div>
            </Sub>
            {pie ? (
                <Sub title={labels.labelPosition} info="labelPosition">
                    <div className="pk-choice-grid">
                        {LABEL_POSITIONS.map((v) => (
                            <Option key={v} checked={(chart.labelPosition ?? "outside") === v} disabled={chart.valueLabels === "off"} onSelect={() => onDisplay({ labelPosition: v })} testId={`label-position-${v}`}>
                                {labels.labelPositionNames[v]}
                            </Option>
                        ))}
                    </div>
                </Sub>
            ) : null}
            <Sub title={labels.legend}>
                <div className="pk-choice-grid">
                    {LEGENDS.map((v) => (
                        <Option key={v} checked={chart.legend === v} onSelect={() => onDisplay({ legend: v })} testId={`legend-${v}`}>
                            {labels.legendNames[v]}
                        </Option>
                    ))}
                </div>
            </Sub>
            <Sub title={labels.chartTitle}>
                <ChartTitle title={chart.title} labels={labels} onDisplay={onDisplay} />
            </Sub>
            {axis ? (
                <Sub title={labels.axisLabels}>
                    <div className="pk-choice-grid">
                        {AXIS_LABELS.map((v) => (
                            <Option key={v} checked={chart.axisLabels === v} onSelect={() => onDisplay({ axisLabels: v })} testId={`axis-${v}`}>
                                {labels.axisLabelNames[v]}
                            </Option>
                        ))}
                    </div>
                </Sub>
            ) : null}
            {axis && view.rows.length >= 2 ? (
                <Sub title={labels.groupLabels} info="groupLabels">
                    <div className="pk-choice-grid">
                        {GROUP_LABELS.map((v) => (
                            <Option key={v} checked={chart.groupLabels === v} onSelect={() => onDisplay({ groupLabels: v })} testId={`groups-${v}`}>
                                {labels.groupLabelNames[v]}
                            </Option>
                        ))}
                    </div>
                </Sub>
            ) : null}
            {drawn === "line" || drawn === "area" ? (
                <Sub>
                    <Switch checked={chart.smooth} onChange={(on) => onDisplay({ smooth: on })} testId="chart-smooth">
                        {labels.smoothLines}
                    </Switch>
                </Sub>
            ) : null}
        </Section>
    );
}

/** The chart type menu: the types (a pick closes it) and how the chart is drawn. */
export function ChartTypePanel({ view, plan, labels, onChart, onDisplay, close }) {
    return (
        <>
            <Section title={labels.chartType}>
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
 * A switch: a checkbox drawn as a track, on one line (the chart's smooth lines).
 * @param {{ checked: boolean, onChange: (on: boolean) => void, testId?: string, children: React.ReactNode }} props
 */
function Switch({ checked, onChange, testId, children }) {
    const name = useFormName();
    return (
        <label className="pk-switch">
            <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
            <span className="pk-switch-track" aria-hidden="true" />
            <span className="pk-switch-text">{children}</span>
        </label>
    );
}

/**
 * The Options menu (topics in menu-topics.js): the totals, Expand all and Collapse all, help with the
 * keyboard shortcuts as a level. A switch or an action applies at once and the menu stays open (the
 * report behind it shows the change); Expand all and Collapse all close it.
 */
export function OptionsPanel({ view, labels, onTotal, onExpand, onCollapse, close, tips, mod, folding, help }) {
    const topics = optionTopics({
        view,
        labels,
        folding,
        tips,
        explanations: help?.explanations ?? null,
        act: {
            total: onTotal,
            expand: () => onExpand(labels),
            collapse: () => onCollapse(labels),
            tipsOn: (on) => tips.onOn(on),
            resetTips: () => tips.onReset(),
            explain: (on) => help?.explanations?.set(on)
        }
    });
    return <LevelMenu name={labels.options} labels={labels} topics={topics} close={close} onPick={runChoice(close)} panel={(id) => (id === "shortcuts" ? <Shortcuts labels={labels} mod={mod} /> : null)} />;
}

/** What a choice of a toolbar menu in levels does: closes the menu first when it says so, then runs. */
const runChoice = (close) => (/** @type {import("./menu-topics.js").Choice} */ c) => {
    if (c.closes) {
        close();
    }
    c.run?.();
};

/**
 * A question in place of what asked it (Save as onto a name that is taken; in a level of its own:
 * delete or publish a view, Save over a shared view):
 * it takes the focus on Cancel, so Enter never writes over a view by accident; Cancel (`onNo`) gives
 * the focus back to whatever comes in its place.
 * @param {{ question: string, action: string, cancel: string, onYes: () => void, onNo: () => void, testId: string, yesId: string, noId: string,
 *   danger?: boolean, busy?: boolean, focusYes?: boolean }} props  `busy`: while the host answers, both wait;
 *   `focusYes`: the action takes the focus (a delete or a publish the user just asked for), not Cancel
 */
function Confirm({ question, action, cancel, onYes, onNo, testId, yesId, noId, danger = false, busy = false, focusYes = false }) {
    const no = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const yes = useRef(/** @type {HTMLButtonElement | null} */ (null));
    useEffect(() => {
        (focusYes ? yes : no).current?.focus({ preventScroll: true });
    }, [focusYes]);
    return (
        <div className="pk-confirm pk-save-confirm" role="group" aria-label={question} data-testid={testId}>
            <span className="pk-confirm-text">{question}</span>
            <button ref={yes} type="button" className={danger ? "pk-btn pk-danger-btn" : "pk-btn pk-primary"} disabled={busy} data-autofocus={focusYes ? "" : undefined} data-testid={yesId} onClick={onYes}>
                {action}
            </button>
            <button ref={no} type="button" className="pk-btn" disabled={busy} data-autofocus={focusYes ? undefined : ""} data-testid={noId} onClick={onNo}>
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
 * "Open view file…": a view file, a view pasted as JSON or a link, or a .pivotkit.json file. Nothing
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
    const fileName = useFormName();
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
                name={`${fileName}-file`}
                accept="application/json,.json"
                className="pk-sr"
                tabIndex={-1}
                aria-hidden="true"
                aria-label={labels.chooseFile}
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
 * The Views menu in levels: what persists, as one list to scan in groups - "This view" (Save the
 * loaded view under its name, or why not; Save as…), "Shared views" (the host's, for everyone) and
 * "My views" (the user's own: the host's or the browser store's), each shown only when it has entries
 * ("My views" also when the user can save), then "Share this view" (copy a link or the JSON, download
 * the view file, open one). Save as…, Open view file… and the questions before a change open levels
 * of their own. (Starting over, New and Reset, is the toolbar's Start over.) An
 * entry loads its view; a deletable one has Delete next to it, a user's view Publish when the host
 * allows it, a shared one that is not deletable the "i" that says who changes shared views. Delete,
 * publish and Save over a shared view ask first, in a level; the entry changes only when the host's
 * callback (or the browser store) has finished, and the focus goes back to the entry in that place
 * (the next one after a delete). Names need not be unique: every entry is shown, keyed by its group,
 * its name and how often the name came before.
 * @param {{ templates: import("./templates.js").TemplateEntry[], labels: any, onLoad: (t: any) => void, actions: any, close: () => void, share?: any }} props
 */
export function ViewsPanel({ templates, labels, onLoad, actions, close, share }) {
    const { save, remove: onDelete, publish: onPublish } = viewActions(actions, labels);
    const can = { host: Boolean(actions.onSave), store: Boolean(actions.store), publish: Boolean(onPublish), sourceId: actions.sourceId };
    const target = saveTarget(actions.loaded, templates, can, actions.empty);
    // "My views" says where they are kept while the browser store takes the saves
    const store = actions.store && !actions.onSave;
    // the question a level asks: delete or publish an entry, or Save over a shared view
    const [asking, setAsking] = useState(/** @type {{ kind: "delete" | "publish" | "replaceShared", t?: any, focus?: string } | null} */ (null));
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        // the link module, before a click asks for it: a copy right in the click is allowed everywhere
        share?.prepare?.();
    }, [share]);
    // the "i" on a shared view says who changes shared views: only where someone here can (a shared
    // view the host lets delete, or Publish), so no report claims admins it does not have
    const sharedChange = Boolean(onPublish) || templates.some((t) => t.scope === "shared" && t.deletable);
    const ids = entryIds(templates);
    const group = (scope) => templates.flatMap((t, at) => (t.scope === scope ? [at] : []));
    /** @returns {import("./menu-topics.js").Choice} */
    const entry = (at, list) => {
        const t = templates[at];
        const id = ids[at];
        // after a delete the focus goes to the entry that takes its place
        const next = afterDelete(list, list.indexOf(at));
        const ask = (kind, focus) => () => setAsking({ kind, t, focus });
        return {
            id,
            testId: `saved-view-${t.name}`,
            text: t.name,
            icon: "bookmark",
            current: isLoadedEntry(t, actions.loaded),
            closes: true,
            run: () => onLoad(t),
            info: t.scope === "shared" && sharedChange && !(onDelete && t.deletable) ? "sharedView" : undefined,
            actions: [
                ...(onPublish && t.scope === "user" ? [{ id: `publish:${id}`, testId: `publish-view-${t.name}`, text: t.name, label: fill(labels.publishView, { name: t.name }), icon: "upload", open: "confirm", backTo: `item:${id}`, run: ask("publish", `item:${id}`) }] : []),
                ...(onDelete && t.deletable ? [{ id: `delete:${id}`, testId: `delete-view-${t.name}`, text: t.name, label: fill(labels.deleteView, { name: t.name }), icon: "trash", open: "confirm", backTo: `item:${id}`, run: ask("delete", next === undefined ? undefined : `item:${ids[next]}`) }] : [])
            ]
        };
    };
    const shared = group("shared");
    const mine = group("user");
    /** @type {import("./menu-topics.js").Choice[]} */
    const thisView = [];
    if (target) {
        thisView.push({
            id: "save-loaded",
            text: fill(labels.saveNamed, { name: actions.loaded.name }),
            icon: "save",
            disabled: target.kind === null,
            reason: target.kind === null ? labels[target.why] : undefined,
            // over a shared view: asked first, everyone sees the change
            ...(target.kind === "publish" ? { open: "confirm", run: () => setAsking({ kind: "replaceShared" }) } : { closes: true, run: () => save(target, actions.loaded.name) })
        });
    }
    if (canSaveAs(can)) {
        thisView.push({ id: "save-as", text: actions.loaded ? labels.saveAs : `${labels.saveView}…`, icon: "save", open: "saveAs" });
    }
    const act = share ? shareActions(share, labels) : null;
    const question =
        asking?.kind === "replaceShared"
            ? { text: fill(labels.replaceSharedConfirm, { name: actions.loaded?.name }), action: labels.replaceAction, testId: "replace-shared-confirm", yesId: "confirm-replace-shared", noId: "cancel-replace-shared" }
            : asking
              ? { text: fill(asking.kind === "publish" ? labels.publishConfirm : labels.deleteConfirm, { name: asking.t.name }), action: asking.kind === "publish" ? labels.publishAction : labels.deleteAction, testId: `${asking.kind}-confirm`, yesId: `confirm-${asking.kind}`, noId: `cancel-${asking.kind}` }
              : null;
    /** @type {import("./menu-topics.js").Topic[]} */
    const topics = [
        ...(thisView.length ? [{ id: "thisView", title: labels.thisView, kind: /** @type {const} */ ("inline"), titled: true, groups: [{ choices: thisView }] }] : []),
        ...(shared.length ? [{ id: "sharedViews", title: labels.sharedViews, kind: /** @type {const} */ ("inline"), titled: true, groups: [{ choices: shared.map((at) => entry(at, shared)) }] }] : []),
        ...(mine.length || canSaveAs(can) || !shared.length
            ? [
                  {
                      id: "myViews",
                      title: labels.myViews,
                      kind: /** @type {const} */ ("inline"),
                      titled: true,
                      groups: [{ choices: mine.map((at) => entry(at, mine)) }],
                      // empty: one line, with the store's note in short
                      note: mine.length ? (store ? labels.storeNote : null) : store ? labels.noViewsStore : labels.noViews,
                      noteId: store ? "store-note" : undefined
                  }
              ]
            : []),
        ...(act
            ? [
                  {
                      id: "share",
                      title: labels.shareThisView,
                      kind: /** @type {const} */ ("inline"),
                      titled: true,
                      groups: [
                          {
                              choices: [
                                  ...(share.canLink ? [{ id: "copy-link", text: labels.copyLink, icon: "link", closes: true, run: act.copyLink }] : []),
                                  { id: "copy-json", text: labels.copyJson, icon: "copy", closes: true, run: act.copyJson },
                                  { id: "download-view", text: labels.downloadView, icon: "download", closes: true, run: act.download },
                                  { id: "load-view", text: labels.loadView, icon: "upload", open: "load" }
                              ]
                          }
                      ],
                      // what leaves the report with a view: filter values can be values of the data
                      note: labels.sharePrivacy,
                      noteId: "share-privacy"
                  }
              ]
            : []),
        { id: "saveAs", title: labels.saveAs, levelTitle: (actions.loaded ? labels.saveAs : labels.saveView).replace(/…$/, ""), kind: "panel", hidden: true },
        { id: "load", title: labels.loadView, levelTitle: labels.loadView.replace(/…$/, ""), kind: "panel", hidden: true },
        { id: "confirm", title: question?.action ?? "", kind: "panel", hidden: true }
    ];
    const panel = (id, back) => {
        if (id === "saveAs") {
            return <SaveView labels={labels} button={actions.loaded ? labels.saveAs.replace(/…$/, "") : labels.save} onSave={(name, t) => save(t, name)} resolve={(name) => saveAsTarget(name, templates, can)} close={close} />;
        }
        if (id === "load" && act) {
            return <LoadView labels={labels} onLoadText={act.loadText} close={close} />;
        }
        if (id === "confirm" && question && asking) {
            return (
                <Confirm
                    question={question.text}
                    action={question.action}
                    cancel={labels.cancel}
                    danger={asking.kind === "delete"}
                    focusYes={asking.kind !== "replaceShared"}
                    busy={busy}
                    testId={question.testId}
                    yesId={question.yesId}
                    noId={question.noId}
                    onNo={() => back()}
                    onYes={async () => {
                        if (asking.kind === "replaceShared") {
                            close();
                            save(target, actions.loaded.name);
                            return;
                        }
                        setBusy(true);
                        const ok = await (asking.kind === "publish" ? onPublish : onDelete)?.(asking.t);
                        setBusy(false);
                        if (ok) {
                            back(asking.focus);
                        }
                    }}
                />
            );
        }
        return null;
    };
    return <LevelMenu name={labels.views} labels={labels} topics={topics} close={close} onPick={runChoice(close)} panel={panel} focusAgain={templates.length} />;
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
            <Section title={labels.exportDownload}>
                <ExportOption icon="file" text={labels.exportXlsx} info="exportXlsx" onSelect={run("xlsx")} {...off} testId="export-xlsx" />
                <ExportOption icon="file" text={labels.exportCsv} info="exportCsv" onSelect={run("csv")} {...off} testId="export-csv" />
                <ExportOption icon="image" text={labels.exportPng} disabled={empty || !chartReady} reason={empty ? off.reason : display !== "chart" ? labels.exportPngNeedsChart : undefined} onSelect={run("png")} testId="export-png" />
            </Section>
            <Section title={labels.exportCopy}>
                <ExportOption icon="copy" text={labels.copyTable} info="copyTable" onSelect={run("copy-table")} {...off} testId="export-copy-table" />
                <ExportOption icon="copy" text={labels.copyDataJson} info="copyDataJson" onSelect={run("copy-json")} {...off} testId="export-copy-json" />
            </Section>
        </>
    );
}
