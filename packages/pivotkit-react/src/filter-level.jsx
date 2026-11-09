/*
 * The Filter level of a field's menu (chip-menus.jsx), on Rows, Columns and in Filters, in this
 * order: what it keeps now in words (the items picked and the rules, as the chip says them) with
 * Clear picks and Remove the rules; for a date field the quick choices (All, This year, Last [N]
 * years, Last [N] months, each with the days it keeps, "2022–2026"; "Custom rules" while the rules
 * hold more); the items to pick with their counts; then, folded each time the level opens, "More
 * ways to filter": the rules, sentences that all apply together (and) - the item itself compared
 * (a number, a date, a grouping's item; for dates also "is in the last N years"), its total compared
 * ("Count of Released is greater than 3"), a rule on its name. Every change applies at once (one
 * undo step each); a number a moment after the typing stops, Escape in a field gives back what
 * applies. Loaded with the menus (menus.js).
 */

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { CATALOG, LIMITS, fieldItems, fieldLabel } from "pivotkit-core";
import { ClearInput } from "./clear-input.jsx";
import { keyOf, ValueList } from "./filter.jsx";
import { Icon } from "./icons.jsx";
import { fill, plural } from "./labels.js";
import { useAppliedText, useLater } from "./levels.jsx";
import { MeasurePick, NumberField, choiceIndex, fieldKeys, measuresOf, readNumber } from "./menu-fields.jsx";
import { rangeText } from "./names.js";
import { numberText, parseNumber } from "./numbers.js";
import { filtersOf, selectedItems } from "./view-ops.js";
import { RULES_MAX, RULE_TYPES, conditionKind, quickChoice, removeRules, ruleKind, ruleText, setItemFilter, setQuickRange, setRule } from "./menu-ops.js";

const twin = (op) => op === "between" || op === "notBetween";
/** The first letter as a sentence starts: "last {count} years" in a list of choices is "Last …". */
const capital = (text, locale) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
/** Rules as a text that does not depend on the order of their keys (normalize() writes its own order). */
const rulesKeyOf = (rules) => JSON.stringify(rules, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
/** The kind of row a rule is: the item itself (a comparison or a relative range), its total, its name. */
const rowKind = (f) => (f.type === "value" ? "total" : f.type === "label" ? "name" : "item");

/**
 * The quick choices of a date field: All, This year, Last [N] years and (`fk.months`) Last [N]
 * months, each with the days it keeps; "Custom rules" while the field's rules hold more. A choice
 * applies at once, a count typed a moment after the typing stops (and picks its choice).
 */
function QuickChoices({ ctx }) {
    const { view, field, labels, locale, fk, timeZone, commit, note, back } = ctx;
    const quick = quickChoice(view, field, fk.months);
    const counts = { year: quick.id === "years" ? quick.count : 5, month: quick.id === "months" ? quick.count : 12 };
    const [texts, setTexts] = useState({ year: numberText(counts.year, locale), month: numberText(counts.month, locale) });
    // a change that came from elsewhere (Undo, a rule, the search) shows in a count not being typed in
    const [editing, setEditing] = useState(/** @type {string | null} */ (null));
    const quickKey = `${quick.id}:${quick.count ?? ""}`;
    const [seen, setSeen] = useState(quickKey);
    if (quickKey !== seen) {
        setSeen(quickKey);
        const synced = { ...texts };
        for (const unit of /** @type {const} */ (["year", "month"])) {
            if (unit !== editing) {
                synced[unit] = numberText(counts[unit], locale);
            }
        }
        setTexts(synced);
    }
    const lang = { lang: labels.lang, locale };
    const later = useLater();
    const group = useId();
    const set = (range) => commit(setQuickRange(view, field, range), note);
    const radio = (id, checked, onPick, name, children) => (
        <label className="pk-radio pk-quick">
            <input type="radio" name={group} checked={checked} onChange={onPick} aria-label={name} data-autofocus={checked && ctx.hint !== "conditions" ? "" : undefined} data-testid={`quick-${id}`} />
            {children}
        </label>
    );
    const counted = (unit) => {
        const read = readNumber(texts[unit], { kind: "count", max: CATALOG.relativeMaxCount, labels, locale });
        const n = read.value;
        const id = unit === "year" ? "years" : "months";
        const shown = n ?? counts[unit];
        // "Last [5] years", "Letztes [1] Jahr": the words around the count, in its number
        // (the form of that count with a place for the field instead of the number)
        const forms = Object.fromEntries(Object.entries(labels.quickLast[unit]).map(([k, v]) => [k, String(v).replace("{count}", "{n}")]));
        const words = plural(forms, shown, lang);
        const [before, after] = words.split("{n}");
        const pick = () => set({ unit, count: shown });
        return (
            <div className="pk-quick-row" key={unit}>
                {radio(id, quick.id === id, pick, fill(words, { n: shown.toLocaleString(locale) }), <span aria-hidden="true">{before}</span>)}
                <NumberField
                    value={texts[unit]}
                    onChange={(t) => {
                        setTexts({ ...texts, [unit]: t });
                        later.later(() => {
                            const v = readNumber(t, { kind: "count", max: CATALOG.relativeMaxCount, labels, locale }).value;
                            if (v !== null) {
                                set({ unit, count: v });
                            }
                        });
                    }}
                    onKeyDown={fieldKeys({
                        now: later.now,
                        restore: () => {
                            later.cancel();
                            const was = numberText(counts[unit], locale);
                            if (texts[unit] === was) {
                                return false;
                            }
                            setTexts({ ...texts, [unit]: was });
                            return true;
                        },
                        back
                    })}
                    onBlur={() => {
                        setEditing(null);
                        later.now();
                    }}
                    onFocus={() => setEditing(unit)}
                    problem={read.problem}
                    label={labels.quickCount[unit]}
                    testId={`quick-${id}-count`}
                    className="pk-field-label pk-count-input"
                />
                <span aria-hidden="true">{after}</span>
                <span className="pk-hint">{rangeText(unit, shown, locale, timeZone)}</span>
            </div>
        );
    };
    return (
        <div role="radiogroup" aria-label={labels.quickTitle} className="pk-radios pk-quick-choices" data-testid="quick-choices">
            {radio("all", quick.id === "all", () => set(null), labels.filterAll, <span>{labels.filterAll}</span>)}
            {radio("thisYear", quick.id === "thisYear", () => set({ unit: "year", count: 1 }), capital(labels.relative.year, locale), (
                <>
                    <span>{capital(labels.relative.year, locale)}</span>
                    <span className="pk-hint">{rangeText("year", 1, locale, timeZone)}</span>
                </>
            ))}
            {counted("year")}
            {fk.months ? counted("month") : null}
            {quick.id === "custom" ? radio("custom", true, () => undefined, labels.quickCustom, <span>{labels.quickCustom}</span>) : null}
        </div>
    );
}

/**
 * A rule on the item itself: "Released (Year) [is from] [2022]", "Price [is between] [10] and
 * [20]", for dates also "Released [is in the last] [5] [years]" (a relative range). The value is a
 * number typed, a day, or one of a grouping's items. Applies once it is complete.
 */
function ItemRule({ rule, ctx, apply, first }) {
    const { field, labels, locale, fk, items } = ctx;
    const words = fk.dates ? labels.dateOps : labels.valueOps;
    const ops = fk.dates ? [...CATALOG.valueOps, "last"] : CATALOG.valueOps;
    const textOf = (v) => (v === undefined ? "" : fk.item === "number" ? numberText(v, locale) : String(v));
    const compared = rule?.type === "compare" ? rule : null;
    const ranged = rule?.type === "relative" ? rule : null;
    const [s, setS] = useState(() => ({
        op: ranged ? "last" : compared?.op ?? ">=",
        a: textOf(compared?.value),
        b: textOf(compared?.value2),
        count: numberText(ranged?.count ?? 5, locale),
        unit: ranged?.unit ?? "year"
    }));
    const later = useLater();
    const read = (text) => (fk.item === "number" ? parseNumber(text, locale) : fk.item === "date" ? (/^\d{4,}-\d{2}-\d{2}$/.test(text) ? text : null) : text === "" ? null : Number(text));
    const entryOf = (x) => {
        if (x.op === "last") {
            const n = readNumber(x.count, { kind: "count", max: CATALOG.relativeMaxCount, labels, locale }).value;
            return n !== null ? { field, type: "relative", unit: x.unit, count: n } : null;
        }
        const [a, b] = [read(x.a), read(x.b)];
        return a === null || (twin(x.op) && b === null) ? null : { field, type: "compare", op: x.op, value: a, ...(twin(x.op) ? { value2: b } : {}) };
    };
    const change = (patch, wait = false) => {
        const next = { ...s, ...patch };
        setS(next);
        const run = () => {
            const entry = entryOf(next);
            if (entry) {
                apply(entry);
            }
        };
        if (wait) {
            later.later(run);
        } else {
            later.cancel();
            run();
        }
    };
    const restore = () => {
        later.cancel();
        const was = { a: textOf(compared?.value), b: textOf(compared?.value2), count: numberText(ranged?.count ?? 5, locale) };
        if (s.a === was.a && s.b === was.b && s.count === was.count) {
            return false;
        }
        setS({ ...s, ...was });
        return true;
    };
    const keys = fieldKeys({ now: later.now, restore, back: ctx.back });
    const value = (key, label, testId) => {
        if (fk.item === "number") {
            const problem = readNumber(s[key], { required: false, labels, locale }).problem;
            return <NumberField value={s[key]} onChange={(t) => change({ [key]: t }, true)} onKeyDown={keys} onBlur={later.now} problem={problem} label={label} testId={testId} className="pk-field-label pk-narrow-input" />;
        }
        if (fk.item === "date") {
            return <input type="date" value={s[key]} onChange={(e) => change({ [key]: e.target.value })} aria-label={label} data-testid={testId} />;
        }
        // a grouping: one of its items ("2022", "Mar 2025"), or the view's own when the data has it no more
        const listed = items.filter((i) => typeof i.value === "number");
        const own = s[key] !== "" && !listed.some((i) => String(i.value) === s[key]);
        return (
            <select value={s[key]} onChange={(e) => change({ [key]: e.target.value })} aria-label={label} data-testid={testId}>
                <option value="" disabled>
                    {labels.ruleValue}
                </option>
                {own ? <option value={s[key]}>{s[key]}</option> : null}
                {listed.map((i) => (
                    <option key={String(i.value)} value={String(i.value)}>
                        {i.label}
                    </option>
                ))}
            </select>
        );
    };
    const label = fk.item === "date" ? labels.ruleDate : labels.ruleValue;
    // "im letzten Monat", "in den letzten 3 Monaten": the words follow the count
    const lang = { lang: labels.lang, locale };
    const counted = readNumber(s.count, { kind: "count", max: CATALOG.relativeMaxCount, labels, locale });
    const many = counted.value ?? 2;
    return (
        <>
            <span className="pk-rule-subject">{fieldLabel(field, labels.core)}</span>
            <select className="pk-rule-op" value={s.op} onChange={(e) => change({ op: e.target.value })} aria-label={labels.valueFilterOp} data-autofocus={first ? "" : undefined} data-testid="rule-item-op">
                {ops.map((o) => (
                    <option key={o} value={o}>
                        {o === "last" ? plural(labels.lastOp, many, lang) : words[o] ?? o}
                    </option>
                ))}
            </select>
            {s.op === "last" ? (
                <>
                    <NumberField
                        value={s.count}
                        onChange={(t) => change({ count: t }, true)}
                        onKeyDown={keys}
                        onBlur={later.now}
                        problem={counted.problem}
                        label={labels.quickCount[s.unit]}
                        testId="rule-last-count"
                        className="pk-field-label pk-count-input"
                    />
                    <select value={s.unit} onChange={(e) => change({ unit: e.target.value })} aria-label={labels.ruleUnit} data-testid="rule-last-unit">
                        {CATALOG.relativeUnits.map((u) => (
                            <option key={u} value={u}>
                                {plural(labels.ruleUnits[u], many, lang)}
                            </option>
                        ))}
                    </select>
                </>
            ) : (
                <>
                    {value("a", label, "rule-item-value")}
                    {twin(s.op) ? (
                        <>
                            <span>{labels.valueFilterTo}</span>
                            {value("b", `${labels.valueFilterTo} ${label}`, "rule-item-value2")}
                        </>
                    ) : null}
                    {/* a blank item passes no comparison: said where "is not" would suggest otherwise */}
                    {s.op === "!=" || s.op === "notBetween" ? (
                        <span className="pk-hint pk-rule-note" data-testid="rule-blanks">
                            {labels.blanksOut}
                        </span>
                    ) : null}
                </>
            )}
        </>
    );
}

/**
 * A rule on the item's total: "[Count of Released] [is greater than] [3]", by a value of the view
 * (named in full; "Count of rows" when Values is empty). Applies once its numbers are there.
 */
function TotalRule({ rule, ctx, apply, first }) {
    const { view, types, labels, locale } = ctx;
    const { choices, names } = measuresOf(view, types, labels, rule?.by);
    const [s, setS] = useState(() => ({ by: choiceIndex(choices, rule?.by), op: rule?.op ?? ">", a: numberText(rule?.value, locale), b: numberText(rule?.value2, locale) }));
    const later = useLater();
    const change = (patch, wait = false) => {
        const next = { ...s, ...patch };
        setS(next);
        const run = () => {
            const [a, b] = [parseNumber(next.a, locale), parseNumber(next.b, locale)];
            if (a !== null && (!twin(next.op) || b !== null)) {
                const by = choices[next.by];
                apply({ field: ctx.field, type: "value", by: { field: by.field, agg: by.agg }, op: next.op, value: a, ...(twin(next.op) ? { value2: b } : {}) });
            }
        };
        if (wait) {
            later.later(run);
        } else {
            later.cancel();
            run();
        }
    };
    const restore = () => {
        later.cancel();
        const was = { a: numberText(rule?.value, locale), b: numberText(rule?.value2, locale) };
        if (s.a === was.a && s.b === was.b) {
            return false;
        }
        setS({ ...s, ...was });
        return true;
    };
    const keys = fieldKeys({ now: later.now, restore, back: ctx.back });
    const number = (key, label, testId, shown) => (
        <NumberField value={s[key]} onChange={(t) => change({ [key]: t }, true)} onKeyDown={keys} onBlur={later.now} problem={readNumber(s[key], { required: false, labels, locale }).problem} label={label} shown={shown} testId={testId} className="pk-field-label pk-narrow-input" />
    );
    return (
        <>
            <span className="pk-rule-subject pk-rule-lead">{fill(labels.ruleWhose, { field: fieldLabel(ctx.field, labels.core) })}</span>
            <MeasurePick choices={choices} names={names} index={s.by} onChange={(i) => change({ by: i })} label={labels.valueFilterBy} testId="value-filter-by" />
            <select className="pk-rule-op" value={s.op} onChange={(e) => change({ op: e.target.value })} aria-label={labels.valueFilterOp} data-autofocus={first ? "" : undefined} data-testid="value-filter-op">
                {CATALOG.valueOps.map((o) => (
                    <option key={o} value={o}>
                        {labels.valueOps[o] ?? o}
                    </option>
                ))}
            </select>
            {number("a", labels.valueFilterNumber, "value-filter-number")}
            {twin(s.op) ? number("b", `${labels.valueFilterTo} ${labels.valueFilterNumber}`, "value-filter-number2", labels.valueFilterTo) : null}
        </>
    );
}

/** A rule on the item's name: "The name [contains] [an]"; the text applies a moment after the typing stops. */
function NameRule({ rule, ctx, apply, first }) {
    const { field, labels } = ctx;
    const [op, setOp] = useState(rule?.op ?? "contains");
    const send = (o, value) => {
        if (value !== "") {
            apply({ field, type: "label", op: o, value });
        }
    };
    const text = useAppliedText(rule?.value ?? "", (value) => send(op, value));
    return (
        <>
            <span className="pk-rule-subject">{labels.ruleName}</span>
            <select
                className="pk-rule-op"
                value={op}
                onChange={(e) => {
                    setOp(e.target.value);
                    send(e.target.value, text.text);
                }}
                aria-label={labels.condition}
                data-autofocus={first ? "" : undefined}
                data-testid="filter-condition-op"
            >
                {CATALOG.labelOps.map((o) => (
                    <option key={o} value={o}>
                        {labels.labelOps[o] ?? o}
                    </option>
                ))}
            </select>
            <ClearInput
                type="text"
                value={text.text}
                onChange={text.set}
                onBlur={text.flush}
                onKeyDown={fieldKeys({ now: text.flush, restore: text.restore, back: ctx.back })}
                onClear={() => text.set("")}
                clearLabel={labels.clearText}
                aria-label={labels.conditionValue}
                placeholder={labels.conditionValue}
                maxLength={1000}
                data-testid="filter-condition-text"
            />
        </>
    );
}

const ROWS = { item: ItemRule, total: TotalRule, name: NameRule };

/**
 * The rules of a field, all together ("and"): one row each with its × , a new one (`draft`) while it
 * is not complete, and the buttons that add one, at most RULES_MAX per field and LIMITS.filters in
 * the view. `focusFirst`: opened from the search, the focus on the first row (or the first button).
 */
function RuleEditor({ ctx, rules, focusFirst }) {
    const { view, field, labels, commit, note, fk, nameKind } = ctx;
    const [draft, setDraft] = useState(/** @type {"item" | "total" | "name" | null} */ (null));
    // rows are keyed by their place; a change the rows did not make (a quick choice, Remove, Undo)
    // draws them again from the view
    const [gen, setGen] = useState(0);
    const rulesKey = rulesKeyOf(rules);
    const [seen, setSeen] = useState(rulesKey);
    // the rules a row's own change leads to: the rows stay as they are (focus, what is typed)
    const [own, setOwn] = useState(/** @type {string | null} */ (null));
    if (rulesKey !== seen) {
        setSeen(rulesKey);
        if (rulesKey !== own) {
            setGen(gen + 1);
            setDraft(null);
        }
    }
    const box = useRef(/** @type {HTMLFieldSetElement | null} */ (null));
    // after a removal the focus goes to the first button that adds a rule; a new rule takes it
    const focusAdd = useRef(false);
    useEffect(() => {
        if (focusAdd.current) {
            focusAdd.current = false;
            /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(".pk-rule-adds button:not([disabled])"))?.focus();
        }
    }, [gen]);
    useEffect(() => {
        if (draft) {
            // the new rule in view, whole (it may start below the menu's edge), and its first control focused
            const row = /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(".pk-rule:last-child"));
            /** @type {HTMLElement | null | undefined} */ (row?.querySelector("[data-autofocus]"))?.focus({ preventScroll: true });
            row?.scrollIntoView?.({ block: "nearest" });
        }
    }, [draft]);
    const kinds = /** @type {Array<"item" | "total" | "name">} */ (["item", "total", "name"]).filter((k) => (k === "item" ? Boolean(fk.item) : k === "name" ? Boolean(nameKind) : true));
    const count = rules.length + (draft ? 1 : 0);
    const full = count >= RULES_MAX || view.filters.length >= LIMITS.filters;
    const addText = { item: fill(labels.addRuleItem, { field: fieldLabel(field, labels.core) }), total: labels.addRuleTotal, name: labels.addRuleName };
    const row = (rule, kind, i) => {
        const Row = ROWS[kind];
        const apply = (entry) => {
            const next = setRule(view, field, rule, entry);
            setOwn(rulesKeyOf(filtersOf(next, field, RULE_TYPES)));
            if (!rule) {
                setDraft(null);
            }
            commit(next, note);
        };
        const remove = () => {
            focusAdd.current = true;
            if (rule) {
                commit(setRule(view, field, rule, null), note);
            } else {
                setDraft(null);
                setGen(gen + 1);
            }
        };
        return (
            <li key={`${gen}:${i}`} className="pk-rule" data-testid="rule" data-kind={kind}>
                {i > 0 ? <span className="pk-rule-and">{labels.ruleAnd}</span> : null}
                <span className="pk-rule-body">
                    <Row rule={rule} ctx={ctx} apply={apply} first={(focusFirst && i === 0) || (!rule && draft !== null)} />
                </span>
                <button type="button" className="pk-icon-btn pk-rule-remove" onClick={remove} aria-label={labels.removeRule} title={labels.removeRule} data-testid="rule-remove">
                    <Icon name="x" size={14} />
                </button>
            </li>
        );
    };
    return (
        <fieldset ref={box} className="pk-condition pk-rules" data-testid="rules">
            <legend>{labels.rulesTitle}</legend>
            <p className="pk-hint">{count ? labels.rulesKeep : labels.rulesNone}</p>
            {count ? (
                <ul className="pk-rule-list" role="list">
                    {/* one list, so a new rule keeps its row (and the focus) once it applies */}
                    {[...rules.map((r, i) => row(r, rowKind(r), i)), ...(draft ? [row(null, draft, rules.length)] : [])]}
                </ul>
            ) : null}
            <div className="pk-rule-adds" role="group" aria-label={labels.addRule}>
                {kinds.map((k, i) => (
                    <button
                        key={k}
                        type="button"
                        className="pk-btn pk-small-btn"
                        disabled={full}
                        onClick={() => setDraft(k)}
                        data-autofocus={focusFirst && !count && i === 0 ? "" : undefined}
                        data-testid={`rule-add-${k}`}
                    >
                        <Icon name="plus" size={14} />
                        <span className="pk-btn-text">{addText[k]}</span>
                    </button>
                ))}
            </div>
            {full ? <p className="pk-hint">{fill(labels.rulesFull, { max: RULES_MAX })}</p> : null}
        </fieldset>
    );
}

/**
 * The Filter level. `hint` "conditions": opened from the search on a rule, with "More ways to filter"
 * open and the focus on its first rule.
 */
export function FilterLevel({ view, field, encoded, types, labels, locale, commit, back, hint }) {
    const info = useMemo(() => fieldItems(encoded, field, { view, locale, labels: labels.core }), [encoded, field, view, locale, labels]);
    const [more, setMore] = useState(hint === "conditions");
    const moreId = useId();
    // "More ways to filter" opened: what it holds in view, as far as the menu's height allows
    const moreBody = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [opened, setOpened] = useState(false);
    useEffect(() => {
        if (opened) {
            moreBody.current?.scrollIntoView?.({ block: "nearest" });
        }
    }, [opened]);
    if (!info) {
        return null;
    }
    const name = fieldLabel(field, labels.core);
    const note = { step: "filter", field: name };
    const all = info.items.map((i) => i.value);
    const picked = selectedItems(view, field, all);
    const selected = new Set(picked.map(keyOf));
    const fk = ruleKind(encoded, view, field);
    const rules = filtersOf(view, field, RULE_TYPES);
    // a rule on the names the type has none for (a loaded view's) still shows, so it can be taken off
    const nameKind = conditionKind(encoded, view, field) ?? (rules.some((r) => r.type === "label") ? "text" : null);
    const timeZone = encoded.timeZone;
    const labelOf = (v) => info.items.find((i) => i.value === v)?.label;
    const ctx = { view, field, types, labels, locale, commit, note, back, fk, nameKind, timeZone, hint, items: info.items };
    const say = (f) => ruleText(view, f, { labels, locale, timeZone, date: fk.dates, labelOf });
    // the first line: the items the picks and the rules on the items keep ("2 of 36 items shown: last 2
    // years"), then the rules on totals, which keep groups ("plus Count of rows > 3")
    const onItems = rules.filter((f) => f.type !== "value").map(say);
    const onTotals = rules.filter((f) => f.type === "value").map(say);
    const number = (n) => n.toLocaleString(locale);
    const shown = info.items.filter((i) => i.kept && selected.has(keyOf(i.value))).length;
    const keeps = onItems.length
        ? fill(picked.length < all.length ? labels.itemsShownPicked : labels.itemsShown, { shown: number(shown), total: number(all.length), picked: number(picked.length), rules: onItems.join(labels.listAnd) })
        : fill(labels.itemsPicked, { shown: number(picked.length), total: number(all.length) });
    const itemsFiltered = picked.length < all.length || filtersOf(view, field, ["include"]).length > 0;
    return (
        <div className="pk-filter pk-filter-level">
            <div className="pk-level-result">
                <p role="status" data-testid="filter-result">
                    {onTotals.length ? fill(labels.pickedPlus, { picked: keeps, conditions: onTotals.join(labels.listAnd) }) : keeps}
                </p>
                {itemsFiltered ? (
                    <button type="button" className="pk-link pk-link-button" onClick={() => commit(setItemFilter(view, field, all, all), note)} data-testid="filter-clear-picks">
                        {labels.clearPicks}
                    </button>
                ) : null}
                {rules.length ? (
                    <button type="button" className="pk-link pk-link-button" onClick={() => commit(removeRules(view, field), note)} data-testid="filter-remove-conditions">
                        {labels.removeConditions}
                    </button>
                ) : null}
            </div>
            {fk.dates ? <QuickChoices ctx={ctx} /> : null}
            <ValueList items={info.items} selected={selected} outText={labels.ruleOut} onChange={(next) => commit(setItemFilter(view, field, all.filter((v) => next.has(keyOf(v))), all), note)} labels={labels} locale={locale} autoFocus={!more && !fk.dates}>
                <button type="button" className="pk-more-filters" aria-expanded={more} aria-controls={moreId} onClick={() => {
                        setMore(!more);
                        setOpened(!more);
                    }} data-testid="filter-more">
                    <Icon name={more ? "chevronDown" : "chevronRight"} size={16} />
                    {labels.moreFilters}
                    {rules.length && !more ? <span className="pk-section-mark">{" ●"}</span> : null}
                </button>
                {more ? (
                    <div id={moreId} ref={moreBody} className="pk-more-filters-body">
                        <RuleEditor ctx={ctx} rules={rules} focusFirst={hint === "conditions"} />
                    </div>
                ) : null}
            </ValueList>
        </div>
    );
}
