/*
 * The panels of the toolbar's menus and of the settings beside the tabs: Chart settings (the chart
 * type with how the chart is drawn), Table settings (totals, expand and collapse), More (Help, and the
 * toolbar's buttons that do not fit), Views (the saved views, sharing, loading a view) and Export (the
 * files, and the table on the clipboard). They load with the chip menus on demand (menus.js), so the
 * first load of a page stays small.
 */

import React, { useEffect, useId, useRef, useState } from "react";
import { VIEW_FILE_LIMITS, referenceLineRules, swapAxes } from "pivotkit-core";
import { CHART_TYPES, CHART_TYPE_NAMES, ITEM_TYPES, chartTypeOf } from "./chart-types.js";
import { ClearInput } from "./clear-input.jsx";
import { useFormName } from "./dom.js";
import { parseTarget } from "./menu-ops.js";
import { numberText } from "./numbers.js";
import { dataExportFor } from "./export-scope.js";
import { Icon } from "./icons.jsx";
import { fill, hostFailure } from "./labels.js";
import { Option } from "./popover.jsx";
import { Section, SettingInfo } from "./section.jsx";
import { shareActions } from "./share-actions.js";
import { SHORTCUTS } from "./tip-state.js";
import { LevelMenu } from "./levels.jsx";
import { afterDelete, chartTopics, entryIds, moreTopics, tableTopics } from "./menu-topics.js";
import { canSaveAs, isLoadedEntry, saveAsTarget, saveTarget } from "./view-save.js";
import { hexColor } from "./export-run.js";
import { storeViews } from "./view-store.js";

function ChartTypeOptions({ view, plan, labels, onChart, close }) {
    const current = chartTypeOf(view.chart);
    // a type that needs more values than the view has (bars and lines: two) is greyed out, with why
    const short = (/** @type {string} */ p) => (CHART_TYPES[p].values ?? 0) > view.values.length && current !== p;
    return CHART_TYPE_NAMES.map((p) => (
        <Option
            key={p}
            icon={CHART_TYPES[p].icon}
            checked={view.display !== "table" && current === p}
            disabled={short(p) || undefined}
            reason={short(p) ? labels.chartNeedsValues : undefined}
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

/**
 * The legend's entries of the chart drawn: a pie's and a donut's slices, the series of bars, lines
 * and areas; a heatmap has none.
 * @param {string} drawn  the picker entry drawn
 * @param {{ categories: string[], series: Array<{ name: string }> } | null | undefined} series  toSeries'
 */
function legendNames(drawn, series) {
    if (!series || drawn === "heatmap") {
        return [];
    }
    return [...new Set(ITEM_TYPES.includes(drawn) ? series.categories : series.series.map((s) => s.name))];
}

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
 * The colour each series or slice is drawn with, by name, from the chart's ECharts option: its own
 * colour where it has one (a fixed one, chart.colors or the host's colorMap), else the palette's of its
 * place, as ECharts gives it.
 * @param {any} instance  the chart's ECharts instance
 * @returns {Map<string, string>}
 */
function colorsDrawn(instance) {
    const out = new Map();
    const option = instance.getOption?.();
    const palette = Array.isArray(option?.color) ? option.color : [];
    const of = (/** @type {any} */ item, /** @type {number} */ i) => item?.itemStyle?.color ?? palette[i % Math.max(1, palette.length)];
    for (const [i, s] of (option?.series ?? []).entries()) {
        if (s.type === "pie") {
            (s.data ?? []).forEach((/** @type {any} */ d, /** @type {number} */ j) => out.set(String(d.name), of(d, j)));
        } else {
            out.set(String(s.name), of(s, i));
        }
    }
    return out;
}

/**
 * The target line's value (Display › Reference lines › Target): applied with Enter or Apply; the ×
 * and "Remove the target" remove it at once. For a value shown in percent, "25%" is a share
 * (parseTarget), a hint says how to type it, and a bare number above 1 gets a soft warning:
 * "25 is 2,500 %".
 */
function TargetField({ target, labels, locale, format, onTarget }) {
    const [text, setText] = useState(numberText(target, locale));
    // a target changed elsewhere (Undo, a link) shows here; the field keeps its element and the focus
    const [last, setLast] = useState(target);
    if (target !== last) {
        setLast(target);
        setText(numberText(target, locale));
    }
    const value = parseTarget(text, locale, format);
    const bad = text.trim() !== "" && value === null;
    const hintId = useId();
    const warnId = useId();
    // percent: a share (0.25 is 25 %); percent100: the percent itself (25 is 25 %)
    const share = /^percent(?!100)/.test(format ?? "");
    const hint = share ? labels.targetPercent : /^percent100/.test(format ?? "") ? labels.targetPercent100 : null;
    const typed = text.trim();
    const high = share && value !== null && value > 1 && !typed.endsWith("%");
    const shown = (n) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(n);
    const describedBy = [hint ? hintId : "", high ? warnId : ""].filter(Boolean).join(" ") || undefined;
    return (
        <>
            <form
                className="pk-inline-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!bad) {
                        onTarget(value);
                    }
                }}
            >
                <ClearInput
                    type="text"
                    inputMode="decimal"
                    value={text}
                    onChange={setText}
                    onClear={() => (target !== null ? onTarget(null) : undefined)}
                    clearLabel={labels.clearText}
                    placeholder={labels.targetNone}
                    aria-label={labels.core.referenceLines.target}
                    aria-invalid={bad || undefined}
                    aria-describedby={describedBy}
                    data-testid="chart-target"
                />
                <button type="submit" className="pk-btn pk-primary" disabled={bad || value === target}>
                    {labels.apply}
                </button>
            </form>
            {hint ? (
                <p id={hintId} className="pk-hint pk-subtitle" data-testid="target-hint">
                    {hint}
                </p>
            ) : null}
            {high ? (
                <p id={warnId} className="pk-hint pk-subtitle" role="status" data-testid="target-warning">
                    {fill(labels.targetPercentHigh, { typed, shown: shown(/** @type {number} */ (value)), share: shown(/** @type {number} */ (value) / 100) })}
                </p>
            ) : null}
            {target !== null ? (
                <button type="button" className="pk-btn" onClick={() => onTarget(null)} data-testid="target-remove">
                    {labels.targetRemove}
                </button>
            ) : null}
        </>
    );
}

/**
 * Chart settings: the types (a pick closes it), then how the chart is drawn, in levels as the other
 * menus (levels.jsx, menu-topics.js chartTopics): a row per topic with what is set, each opening its
 * level (Value labels, Legend, Title, Axis, Tooltip, Reference lines with its Target, Series, Layout
 * with the groups of Rows folded or not). Each choice applies at once and the menu stays open, so the
 * chart behind it shows the change; folding the groups closes it.
 */
export function ChartSettingsPanel({ view, plan, encoded, lineChecks, labels, locale, onChart, onDisplay, close, series, colors, folding, onExpand, onCollapse }) {
    const drawn = plan ? plan.name : chartTypeOf(view.chart);
    const names = legendNames(drawn, series);
    // which reference lines the chart can draw: the drawn chart's checks with its numbers, else the
    // view's rules (rows and columns swapped where the chart swaps them) and a note that the chart is not drawn yet
    const lines = view.chart.referenceLines;
    const plain = plan?.chart && encoded ? referenceLineRules(plan.swap ? swapAxes(view) : view, { ...view.chart, ...plan.chart }, encoded) : { average: true, trend: true, target: true, extremes: true };
    const rules = lineChecks ?? { ...plain, notes: ["table"] };
    // the colour each series or slice is drawn with, as #rrggbb, read again after each draw of the chart
    const [drawnColors, setDrawnColors] = useState(/** @type {Map<string, string>} */ (new Map()));
    useEffect(() => {
        const instance = colors?.chart?.current;
        if (!instance) {
            return undefined;
        }
        const ctx = instance.getDom?.()?.ownerDocument?.createElement("canvas").getContext("2d") ?? null;
        const read = () => setDrawnColors(new Map([...colorsDrawn(instance)].map(([name, c]) => [name, hexColor(String(c), ctx) ?? ""])));
        read();
        instance.on("finished", read);
        return () => instance.off("finished", read);
    }, [colors?.chart]);
    const topics = chartTopics({ view, drawn, labels, names, act: { display: onDisplay, expand: () => onExpand(labels), collapse: () => onCollapse(labels) }, lines: { rules, targetText: numberText(lines?.target, locale) }, drawnColors, folding });
    const head = (
        <Section title={labels.chartType}>
            {/* named with the type chosen ("Chart type: Automatic"), as the tab's icon shows the one drawn */}
            <div className="pk-choice-grid" role="group" aria-label={fill(labels.chartTypeIs, { type: labels.chartTypes[plan?.auto ? "auto" : drawn] })} data-testid="chart-types">
                <ChartTypeOptions view={view} plan={plan} labels={labels} onChart={onChart} close={close} />
            </div>
        </Section>
    );
    return (
        <LevelMenu
            name={labels.chartSettings}
            labels={labels}
            topics={topics}
            close={close}
            onPick={runChoice(close)}
            head={head}
            panel={(id) =>
                id === "title" ? (
                    <ChartTitle title={view.chart.title} labels={labels} onDisplay={onDisplay} />
                ) : id === "linesTarget" ? (
                    <TargetField target={lines?.target ?? null} labels={labels} locale={locale} format={lineChecks?.format} onTarget={(target) => onDisplay({ referenceLines: { ...lines, target } })} />
                ) : null
            }
        />
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
 * Table settings (topics in menu-topics.js): the totals, then Expand all and Collapse all. A switch
 * applies at once and the menu stays open (the table behind it shows the change); Expand all and
 * Collapse all close it.
 */
export function TableSettingsPanel({ view, labels, onTotal, onExpand, onCollapse, close, folding }) {
    const topics = tableTopics({ view, labels, folding, act: { total: onTotal, expand: () => onExpand(labels), collapse: () => onCollapse(labels) } });
    return <LevelMenu name={labels.tableSettings} labels={labels} topics={topics} close={close} onPick={runChoice(close)} panel={() => null} />;
}

/**
 * More (topics in menu-topics.js): Help first, a level with the tips' switches and the keyboard
 * shortcuts, then the toolbar's buttons that do not fit (`foot`, drawn by the toolbar in the groups of
 * MORE_GROUPS). A switch keeps Help open.
 */
export function MorePanel({ labels, tips, mod, help, close, foot }) {
    const topics = moreTopics({
        labels,
        tips,
        explanations: help?.explanations ?? null,
        act: { tipsOn: (on) => tips.onOn(on), resetTips: () => tips.onReset(), explain: (on) => help?.explanations?.set(on) }
    });
    return <LevelMenu name={labels.more} labels={labels} topics={topics} close={close} onPick={runChoice(close)} foot={foot?.(close)} panel={(id) => (id === "shortcuts" ? <Shortcuts labels={labels} mod={mod} /> : null)} />;
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
 * What the Views menu's buttons do, from what the report passes (use-saved-views.js: actions): save
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
                    ? ctx.onPublish(name, ctx.view, { source: ctx.source })
                    : target.kind === "host"
                      ? ctx.onSave(name, ctx.view, { scope: "user", source: ctx.source })
                      : write({ name, view: ctx.view, sourceId: ctx.sourceId, sheet: ctx.sheet, replace: target.at }),
            labels.toastSaved,
            labels.toastSaveFailed,
            labels.toastSaveRejected,
            name
        ).then((ok) => ok && ctx.onSaved({ name, scope: target.kind === "publish" ? "shared" : "user", store: target.kind === "store", storeSource: target.kind === "store" ? target.storeSource : null, storeSheet: target.kind === "store" ? storedSheet(target, ctx) : null }, key));
    };
    return {
        // Save and Save as: where to is view-save.js's (the host's onSaveTemplate wins over the store)
        save,
        remove: ctx.onDelete || ctx.store ? (t) => run(() => (t.at !== undefined ? write({ remove: t.at, removeName: t.name }) : ctx.onDelete(t.name, { scope: t.scope })), labels.toastDeleted, labels.toastDeleteFailed, labels.toastDeleteRejected, t.name) : null,
        // a view of the menu is published with the data it was made for, which is the data shown unless
        // the entry names other data (a view of the browser store kept for another file or sheet)
        publish: ctx.onPublish ? (t) => run(() => ctx.onPublish(t.name, ctx.normalized(t.view), { source: entrySource(t, ctx.source) }), labels.toastPublished, labels.toastPublishFailed, labels.toastPublishRejected, t.name) : null
    };
}

/**
 * The data an entry of the Views menu was made for, as the host's callbacks get a source: the browser
 * store's by its id and sheet, a host's view file's source id and sheet (named as the data shown when
 * it is that data); the data shown when the entry names none (a host's view, which the host lists for
 * the data shown; a view of the browser store saved without data), as onSaveTemplate gets it.
 * @param {{ sourceId?: string, sheetOf?: string, fileSource?: string, sheet?: string }} t
 * @param {{ id: string, name?: string, params?: Record<string, string> } | null | undefined} shown
 */
const entrySource = (t, shown) => {
    const id = t.sourceId ?? t.sheetOf ?? t.fileSource;
    if (!id) {
        return shown ?? null;
    }
    return { id, ...(shown?.id === id && shown.name ? { name: shown.name } : {}), ...(t.sheet ? { params: { sheet: t.sheet } } : {}) };
};

/**
 * The sheet a save into the browser store leaves its view with: the sheet shown when the view is
 * stored for the data shown (a new one, or one saved before views named their sheet, which takes it:
 * view-store.js), else the sheet it had.
 * @param {{ storeSource: string | null, storeSheet?: string | null }} target
 * @param {{ sourceId?: string, sheet?: string | null }} ctx
 */
const storedSheet = (target, ctx) => (target.storeSource && target.storeSource === ctx.sourceId ? (ctx.sheet ?? null) : (target.storeSheet ?? null));

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
    const can = { host: Boolean(actions.onSave), store: Boolean(actions.store), publish: Boolean(onPublish), sourceId: actions.sourceId, sheet: actions.sheet ?? null };
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
            // while a workbook's sheet is shown, a view made on a sheet says which (two views of a
            // name can be kept, one per sheet; one of another sheet reads that sheet when opened)
            hint: t.sheet && actions.sheet ? fill(labels.viewSheet, { sheet: t.sheet }) : undefined,
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
 * @param {{ icon: string, text: string, info?: string, onSelect: () => void, testId: string, disabled?: boolean, reason?: string, onIntent?: () => void }} props
 *   `onIntent`: when the pointer comes to the entry, presses on it or the focus does (an entry with
 *   its "i")
 */
export function ExportOption({ icon, text, info, onSelect, testId, disabled, reason, onIntent }) {
    const option = (
        <Option icon={icon} onSelect={onSelect} disabled={disabled} reason={reason} testId={testId}>
            {text}
        </Option>
    );
    return info ? (
        <div className="pk-setting-row" onPointerEnter={onIntent} onPointerDown={onIntent} onFocus={onIntent}>
            {option}
            <SettingInfo id={/** @type {any} */ (info)} name={text} />
        </div>
    ) : (
        option
    );
}

/**
 * The Export menu: the table as a file (Excel, CSV), the chart as an image (PNG, SVG), an HTML report,
 * printing (or saving as PDF from the print dialog), the table on the clipboard (as shown, or its data
 * as JSON), and last, when the host turns it on (exportData), the source data: every row as it is,
 * CSV or JSON, apart from the table's exports so the two are not taken for each other. The export module loads when the menu opens, so a copy happens right in
 * the click; so does a print (the print frame is made ready when the menu opens, the report's modules
 * load when Print is pointed at or focused: use-export.js). An empty report (no field placed) has no table to export: those entries are off, and say
 * so; the source data is there all the same, while the data have rows (#585). The chart's images are off while the table is shown.
 * `dataExport`: the host's exportData with the data shown, read by export-scope.js (#259).
 * @param {{ labels: import("./labels.js").UiLabels, onExport: (kind: string) => void, chartReady: boolean, display: string, empty?: boolean,
 *   dataExport?: { exportData: unknown, encoded: import("pivotkit-core").Encoded | null }, prepare: (what: "menu" | "print") => (() => void) | undefined, close: () => void }} props
 */
export function ExportPanel({ labels, onExport, chartReady, display, empty = false, dataExport, prepare, close }) {
    const source = dataExport ? dataExportFor(dataExport.exportData, dataExport.encoded).source : false;
    useEffect(() => prepare("menu"), [prepare]);
    const run = (kind) => () => {
        close();
        onExport(kind);
    };
    // nothing to export yet: off, with the reason
    const off = empty ? { disabled: true, reason: labels.exportNeedsField } : {};
    // no rows: the source data are off too; a field placed would not turn them on (#585)
    const noRows = (dataExport?.encoded?.length ?? 0) === 0 ? { disabled: true, reason: labels.exportNeedsRows } : {};
    return (
        <>
            <Section title={labels.exportDownload}>
                <ExportOption icon="file" text={labels.exportXlsx} info="exportXlsx" onSelect={run("xlsx")} {...off} testId="export-xlsx" />
                <ExportOption icon="file" text={labels.exportCsv} info="exportCsv" onSelect={run("csv")} {...off} testId="export-csv" />
                <ExportOption icon="file" text={labels.exportHtml} info="exportHtml" onSelect={run("html")} {...off} testId="export-html" />
                <ExportOption icon="image" text={labels.exportPng} disabled={empty || !chartReady} reason={empty ? off.reason : display === "table" ? labels.exportPngNeedsChart : undefined} onSelect={run("png")} testId="export-png" />
                <ExportOption icon="image" text={labels.exportSvg} disabled={empty || display === "table"} reason={empty ? off.reason : display === "table" ? labels.exportPngNeedsChart : undefined} onSelect={run("svg")} testId="export-svg" />
            </Section>
            <Section title={labels.exportPrintGroup}>
                <ExportOption icon="print" text={labels.exportPrint} info="exportPrint" onSelect={run("print")} {...off} testId="export-print" onIntent={() => prepare("print")} />
            </Section>
            <Section title={labels.exportCopy}>
                <ExportOption icon="copy" text={labels.copyTable} info="copyTable" onSelect={run("copy-table")} {...off} testId="export-copy-table" />
                <ExportOption icon="copy" text={labels.copyDataJson} info="copyDataJson" onSelect={run("copy-json")} {...off} testId="export-copy-json" />
                <ExportOption icon="image" text={labels.copyChart} disabled={empty || !chartReady} reason={empty ? off.reason : display === "table" ? labels.exportPngNeedsChart : undefined} onSelect={run("copy-chart")} testId="export-copy-chart" />
            </Section>
            {source ? (
                <Section title={labels.exportDataGroup}>
                    <ExportOption icon="file" text={labels.exportDataCsv} info="exportDataCsv" onSelect={run("data-csv")} {...noRows} testId="export-data-csv" />
                    <ExportOption icon="file" text={labels.exportDataJson} info="exportDataJson" onSelect={run("data-json")} {...noRows} testId="export-data-json" />
                </Section>
            ) : null}
        </>
    );
}
