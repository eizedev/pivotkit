/*
 * The menus of the chips, in levels (levels.jsx): the first level says in one row per topic what is
 * set, and a topic opens its own level in place. A field on Rows or Columns: sort (A to Z and Z to A
 * side by side, by a value), Filter (filter-level.jsx: quick choices of a date, the values with their
 * counts, the rules), the grouping of a date or a number, Top items, Move to. A field in Filters: the
 * same Filter, Move to. A value: Summarize by, Show as, Number format, Highlight, Name, Move to. The topics are data
 * (chip-topics.js); this module draws the levels that hold a form. Every choice applies at once; a
 * number typed applies a moment after the typing stops, a name on Enter or when the field is left,
 * and Escape in a field gives back what applies. Remove field is the menu's last item.
 */

import React, { useId, useState } from "react";
import { fieldLabel } from "pivotkit-core";
import { ClearInput } from "./clear-input.jsx";
import { useFormName } from "./dom.js";
import { FilterLevel } from "./filter-level.jsx";
import { HelpContext } from "./help.js";
import { InfoButton } from "./info.jsx";
import { fill } from "./labels.js";
import { LevelMenu, MenuItem, useAppliedText, useLater } from "./levels.jsx";
import { MeasurePick, NumberField, choiceIndex, fieldKeys, measuresOf, readNumber } from "./menu-fields.jsx";
import { numberText } from "./numbers.js";
import { groupingName, valueLabel } from "./names.js";
import { TOP_COUNTS, axisTopics, filterZoneTopics, valueTopics } from "./menu-topics.js";
import { filtersOf, groupField, groupingOf, sourceOf } from "./view-ops.js";
import { binProblem, setTopFilter, updateValue } from "./menu-ops.js";

/**
 * The Top items level: Off, Top 3, Top 5, Top 10, or a count of one's own, largest or smallest
 * first ("Top N…"), by a value when the view has several. A choice applies at once, the count a
 * moment after the typing stops.
 */
function TopLevel({ view, field, types, labels, locale, commit, back }) {
    const top = filtersOf(view, field, ["top"])[0];
    const { choices, names } = measuresOf(view, types, labels, top?.by);
    const [by, setBy] = useState(() => choiceIndex(choices, top?.by));
    const quick = top && !top.bottom && TOP_COUNTS.includes(top.count) ? top.count : null;
    const [own, setOwn] = useState(Boolean(top) && quick === null);
    const [bottom, setBottom] = useState(Boolean(top?.bottom));
    const [count, setCount] = useState(numberText(top?.count ?? 10, locale));
    const later = useLater();
    const counted = readNumber(count, { kind: "count", labels, locale });
    const name = fieldLabel(field, labels.core);
    const set = (t) => commit(setTopFilter(view, field, t, top), { step: "top", field: name });
    const applyOwn = (next) => {
        const s = { bottom, count, by, ...next };
        const n = readNumber(s.count, { kind: "count", labels, locale }).value;
        if (n !== null) {
            set({ count: n, bottom: s.bottom, by: choices[s.by] });
        }
    };
    const groupName = useFormName();
    const radio = (id, text, checked, onPick) => (
        <label className="pk-radio">
            <input type="radio" name={groupName} checked={checked} onChange={onPick} data-autofocus={checked ? "" : undefined} data-testid={`top-${id}`} />
            <span>{text}</span>
        </label>
    );
    return (
        <div className="pk-level-form">
            <div role="radiogroup" aria-label={labels.topN} className="pk-radios">
                {radio("off", labels.off, !top && !own, () => {
                    setOwn(false);
                    set(null);
                })}
                {TOP_COUNTS.map((n) => (
                    <React.Fragment key={n}>
                        {radio(String(n), fill(labels.topBadge, { count: n.toLocaleString(locale) }), !own && quick === n, () => {
                            setOwn(false);
                            set({ count: n, bottom: false, by: choices[by] });
                        })}
                    </React.Fragment>
                ))}
                {radio("own", labels.topOwn, own, () => {
                    setOwn(true);
                    applyOwn({});
                })}
            </div>
            {own ? (
                <div className="pk-inline-form">
                    <div className="pk-segmented pk-small" role="group" aria-label={labels.topN}>
                        {[false, true].map((b) => (
                            <button
                                key={String(b)}
                                type="button"
                                aria-pressed={bottom === b}
                                onClick={() => {
                                    setBottom(b);
                                    applyOwn({ bottom: b });
                                }}
                                data-testid={b ? "top-bottom" : "top-top"}
                            >
                                {b ? labels.bottom : labels.top}
                            </button>
                        ))}
                    </div>
                    <NumberField
                        value={count}
                        onChange={(t) => {
                            setCount(t);
                            later.later(() => applyOwn({ count: t }));
                        }}
                        onKeyDown={fieldKeys({
                            now: later.now,
                            restore: () => {
                                later.cancel();
                                const was = numberText(top?.count ?? 10, locale);
                                if (count === was) {
                                    return false;
                                }
                                setCount(was);
                                return true;
                            },
                            back
                        })}
                        onBlur={later.now}
                        problem={counted.problem}
                        label={labels.topCount}
                        testId="top-count"
                        className="pk-field-label pk-narrow-input"
                    />
                </div>
            ) : null}
            <div className="pk-inline-form">
                <MeasurePick choices={choices} names={names} index={by} onChange={(i) => {
                        setBy(i);
                        if (top) {
                            set({ count: top.count, bottom: Boolean(top.bottom), by: choices[i] });
                        }
                    }} label={labels.topBy} prefix={labels.topBy} testId="top-by" />
            </div>
        </div>
    );
}

/**
 * Number ranges: their size and where they start (Excel's "Starting at"), applied together with
 * Apply (the field becomes another field, so the menu closes); Off takes them away. An empty start is
 * 0, as its placeholder says; a start whose ranges could not hold the field's numbers (`range`, see
 * binProblem) is refused with a note under the input.
 */
function BinsLevel({ view, field, labels, locale, range, regroup, back }) {
    const grouping = groupingOf(view, field);
    const bins = grouping?.by === "bin" ? grouping : null;
    const [size, setSize] = useState(numberText(bins?.size, locale));
    const [start, setStart] = useState(numberText(bins?.origin, locale));
    const [tried, setTried] = useState(false);
    const problemId = useId();
    const sized = readNumber(size, { kind: "size", tried, labels, locale });
    const started = readNumber(start, { required: false, labels, locale });
    const n = sized.value;
    const s = start.trim() === "" ? 0 : started.value;
    const far = n !== null && s !== null && binProblem(n, s, range) === "far";
    const number = (x) => x.toLocaleString(locale, { maximumFractionDigits: 6 });
    return (
        <form
            className="pk-inline-form pk-bin-form"
            onSubmit={(e) => {
                e.preventDefault();
                // an empty size takes the ranges away, as Remove ranges does
                if (bins && size.trim() === "") {
                    regroup(null);
                    return;
                }
                setTried(true);
                if (n !== null && s !== null && !far) {
                    regroup("bin", n, s);
                }
            }}
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    back();
                }
            }}
        >
            <NumberField value={size} onChange={setSize} problem={sized.problem} label={labels.binSize} shown={labels.binSize} testId="bin-size" autoFocus />
            <label className="pk-field-label">
                <span>{labels.binStart}</span>
                <ClearInput type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={start} placeholder="0" onChange={setStart} clearLabel={labels.clearText} data-testid="bin-start" aria-invalid={far || started.problem ? true : undefined} aria-describedby={far || started.problem ? problemId : undefined} />
            </label>
            {started.problem ? (
                <p id={problemId} className="pk-form-problem" data-testid="bin-start-problem">
                    {started.problem}
                </p>
            ) : far && range && s !== null && n !== null ? (
                <p id={problemId} className="pk-form-problem" data-testid="bin-problem">
                    {fill(labels.binStartFar, { start: number(s), min: number(range.min), max: number(range.max) })}
                </p>
            ) : null}
            {/* a start the ranges cannot hold has its note; Apply waits for another start */}
            <button type="submit" className="pk-btn pk-primary" disabled={far} data-testid="bin-apply">
                {labels.apply}
            </button>
            {bins ? (
                <button type="button" className="pk-btn" onClick={() => regroup(null)} data-testid="bin-off">
                    {labels.binsOff}
                </button>
            ) : null}
        </form>
    );
}

/** A value's name: applies on Enter or when the field is left; the × gives the default name back at once. */
function NameLevel({ view, index, labels, commit, back }) {
    const spec = view.values[index];
    const name = valueLabel(spec, labels);
    const note = { step: "value", field: name };
    const text = useAppliedText(spec.label ?? "", (t) => commit(updateValue(view, index, { label: t.trim() || null }), note), 0);
    return (
        <div className="pk-inline-form pk-level-form">
            {/* the default is the placeholder */}
            <ClearInput
                type="text"
                value={text.text}
                placeholder={valueLabel({ ...spec, label: null }, labels)}
                onChange={text.set}
                onBlur={text.flush}
                onKeyDown={fieldKeys({
                    now: () => {
                        text.flush();
                        back();
                    },
                    restore: text.restore,
                    back
                })}
                onClear={() => (spec.label ? commit(updateValue(view, index, { label: null }), note) : undefined)}
                clearLabel={labels.defaultName}
                aria-label={labels.rename}
                maxLength={200}
                data-autofocus=""
                data-testid="value-name"
            />
            <p className="pk-hint">{labels.nameHint}</p>
        </div>
    );
}

/**
 * The head of a chip menu: the field's name, with its "i" (the field's description and its "Learn
 * more", and `extra`, a paragraph of the report's own after it) when there is one.
 * @param {{ name: string, info?: { description: string, href?: string }, extra?: string | null, labels: any }} props
 */
function MenuHead({ name, info, extra, labels }) {
    const text = (
        <>
            {info?.description}
            {info?.href ? (
                <>
                    {" "}
                    <a href={info.href} target="_blank" rel="noopener noreferrer" className="pk-learn-more">
                        {labels.learnMore}
                    </a>
                </>
            ) : null}
            {info?.description && extra ? (
                <>
                    <br />
                    <br />
                </>
            ) : null}
            {extra}
        </>
    );
    return (
        <div className="pk-level-name">
            <span className="pk-level-name-text" data-testid="menu-head">
                {name}
            </span>
            {info?.description || extra ? <InfoButton info={{ description: /** @type {any} */ (text) }} name={name} labels={labels} className="pk-menu-info" testId="menu-info" /> : null}
        </div>
    );
}

/** The last item of a chip's menu: takes the field (or value) out of the report. */
function RemoveItem({ labels, onRemove, close }) {
    return (
        <MenuItem
            id="menu-remove"
            text={labels.remove}
            icon="trash"
            danger
            onSelect={() => {
                close();
                onRemove();
            }}
        />
    );
}

/** A choice of a topic, applied: the menu closes first when the chip is replaced or moves away. */
const picker = (commit, close) => (/** @type {import("./menu-topics.js").Choice} */ choice) => {
    const next = choice.change?.();
    if (choice.closes) {
        close();
    }
    if (next) {
        commit(next.view, next.note);
    }
};

/** The menu of a chip on Rows or Columns. */
export function AxisMenu({ view, zone, index, field, types, labels, commit, close, onRemove, defaultsOf, rangeOf, locale, info, state, encoded }) {
    const source = sourceOf(view, field);
    const topics = axisTopics({ view, zone, index, field, types, labels, locale, state, defaultsOf, encoded });
    const regroup = (unit, size, origin) => {
        close();
        const sourceName = fieldLabel(source, labels.core);
        const grouped = unit ? groupingName(sourceName, unit, labels, size) : null;
        commit(groupField(view, field, unit, { size, origin, name: grouped ?? undefined }).view, { step: "group", field: sourceName });
    };
    const panel = (id, back, hint) =>
        id === "filter" ? (
            <FilterLevel view={view} field={field} encoded={encoded} types={types} labels={labels} locale={locale} commit={commit} back={back} hint={hint} />
        ) : id === "top" ? (
            <TopLevel view={view} field={field} types={types} labels={labels} locale={locale} commit={commit} back={back} />
        ) : id === "bins" ? (
            <BinsLevel view={view} field={field} labels={labels} locale={locale} range={rangeOf?.(source) ?? null} regroup={regroup} back={back} />
        ) : null;
    const name = fieldLabel(field, labels.core);
    return (
        <LevelMenu
            name={name}
            labels={labels}
            locale={locale}
            topics={topics}
            close={close}
            onPick={picker(commit, close)}
            panel={panel}
            search
            // the same name as the chip and the levels' titles ("Date by month"); the "i" is the source field's
            head={<MenuHead name={name} info={info} labels={labels} />}
            foot={<RemoveItem labels={labels} onRemove={onRemove} close={close} />}
        />
    );
}

/** The menu of a chip in Filters (the whole report): the same Filter level, Move to. */
export function FilterMenu({ view, index, field, types, labels, commit, close, onRemove, locale, info, state, encoded }) {
    const name = fieldLabel(field, labels.core);
    return (
        <LevelMenu
            name={name}
            labels={labels}
            locale={locale}
            topics={filterZoneTopics({ view, index, field, types, labels, locale, state, encoded })}
            close={close}
            onPick={picker(commit, close)}
            panel={(id, back, hint) => (id === "filter" ? <FilterLevel view={view} field={field} encoded={encoded} types={types} labels={labels} locale={locale} commit={commit} back={back} hint={hint} /> : null)}
            search
            head={<MenuHead name={name} info={info} labels={labels} />}
            foot={<RemoveItem labels={labels} onRemove={onRemove} close={close} />}
        />
    );
}

/** The menu of a value chip. */
export function ValueMenu({ view, index, types, labels, commit, close, onRemove, defaultsOf, info, earlier, locale = "en-US" }) {
    const { explain } = React.useContext(HelpContext);
    const name = valueLabel(view.values[index], labels);
    const topics = valueTopics({ view, index, types, labels, locale, defaultsOf, earlier });
    return (
        <LevelMenu
            name={name}
            labels={labels}
            locale={locale}
            topics={topics}
            close={close}
            onPick={picker(commit, close)}
            panel={(id, back) => (id === "name" ? <NameLevel view={view} index={index} labels={labels} commit={commit} back={back} /> : null)}
            search
            // the "i" at the top: the field's description, and (with the explanations on) why a value has no filter
            head={<MenuHead name={name} info={info} extra={explain ? labels.settingInfo.valuesFilter : null} labels={labels} />}
            foot={<RemoveItem labels={labels} onRemove={onRemove} close={close} />}
        />
    );
}
