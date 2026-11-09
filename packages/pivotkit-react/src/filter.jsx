/*
 * The filter popover of a field that is not placed yet (the field list's "Filter…"): its values with row
 * counts (pivotkit-core's fieldItems), a search, select all and none, "only this value", and a
 * condition on the label by the field's type (conditionKind: text, a number's label; none for dates). Changes are a draft until Apply, so one filter is one undo step; the × of the
 * condition's text removes the condition at once. A field that is not placed yet (the field list's
 * "Filter…") is filtered on a draft that puts it into Filters: Apply places it with the selection,
 * Cancel leaves the report as it was.
 */

import React, { useMemo, useState } from "react";
import { CATALOG, fieldItems, fieldLabel } from "pivotkit-core";
import { ClearInput } from "./clear-input.jsx";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { Popover } from "./popover.jsx";
import { filtersOf, selectedItems } from "./view-ops.js";
import { conditionKind, setItemFilter, setLabelFilter } from "./menu-ops.js";

/** Values listed at once; the search finds the others. */
export const FILTER_LIST_MAX = 300;

/** A value as a key of the set of values picked. */
export const keyOf = (v) => JSON.stringify(v);

/**
 * The values of a field to pick from: a search, Select all and Select none (of what the search
 * shows), and, in a part that scrolls (`children` after them), each value with its row count and
 * "Only". `selected` holds the keys (keyOf) of the values picked; `onChange` gets the next set. The
 * filter popover keeps it as a draft until Apply, the Filter level of a chip menu applies it at once.
 * With `tail`, the items a rule leaves out (`isOut`) are taken out of the list and handed to `render`
 * with the row function, for a folded group at the end of the list (the Filter level; `searching`
 * says whether a search is on, which shows them); the group's markup is the caller's.
 * @param {{ items: Array<{ value: unknown, label: string, count: number, kept?: boolean }>, selected: Set<string>, onChange: (next: Set<string>) => void,
 *   labels: any, locale: string, autoFocus?: boolean, tail?: { isOut: (item: any) => boolean, render: (out: any[], row: (item: any) => React.ReactNode, searching: boolean) => React.ReactNode }, children?: React.ReactNode }} props
 */
export function ValueList({ items, selected, onChange, labels, locale, autoFocus = false, tail, children }) {
    const [query, setQuery] = useState("");
    const q = query.trim().toLocaleLowerCase();
    const matching = q ? items.filter((i) => i.label.toLocaleLowerCase().includes(q)) : items;
    const inList = tail ? matching.filter((i) => !tail.isOut(i)) : matching;
    const out = tail ? matching.filter((i) => tail.isOut(i)) : [];
    const shown = inList.slice(0, FILTER_LIST_MAX);
    const setAll = (on) => {
        const next = new Set(selected);
        for (const i of matching) {
            if (on) {
                next.add(keyOf(i.value));
            } else {
                next.delete(keyOf(i.value));
            }
        }
        onChange(next);
    };
    const toggle = (v) => {
        const next = new Set(selected);
        const k = keyOf(v);
        if (next.has(k)) {
            next.delete(k);
        } else {
            next.add(k);
        }
        onChange(next);
    };
    const row = (i, muted) => {
        const k = keyOf(i.value);
        return (
            <li key={k} className={`pk-value${muted ? " pk-value-out" : ""}`}>
                <label>
                    <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(i.value)} />
                    <span className="pk-value-label">{i.label}</span>
                    <span className="pk-count">{i.count.toLocaleString(locale)}</span>
                </label>
                <button type="button" className="pk-link pk-only" onClick={() => onChange(new Set([k]))} aria-label={`${labels.onlyThis}: ${i.label}`}>
                    {labels.onlyThis}
                </button>
            </li>
        );
    };
    return (
        <>
            <label className="pk-search">
                <Icon name="search" />
                <span className="pk-sr">{labels.searchValues}</span>
                <ClearInput type="search" value={query} placeholder={labels.searchValues} onChange={setQuery} clearLabel={labels.clearText} data-autofocus={autoFocus ? "" : undefined} data-testid="filter-search" />
            </label>
            <div className="pk-filter-actions">
                <button type="button" className="pk-link" onClick={() => setAll(true)} data-testid="select-all">
                    {labels.selectAll}
                </button>
                <button type="button" className="pk-link" onClick={() => setAll(false)} data-testid="select-none">
                    {labels.selectNone}
                </button>
            </div>
            {/* the middle scrolls when the window is low; what is above and below it stays in view */}
            <div className="pk-filter-body">
                <ul className="pk-values" role="list">
                    {shown.map((i) => row(i, false))}
                    {inList.length > shown.length ? (
                        <li className="pk-hint pk-values-more">{fill(labels.valuesShown, { shown: shown.length, total: inList.length.toLocaleString(locale) })}</li>
                    ) : null}
                    {out.length && tail ? tail.render(out, (i) => row(i, true), q !== "") : null}
                </ul>
                {children}
            </div>
        </>
    );
}

function FilterBody({ view: current, base, field, encoded, locale, labels, commit, close }) {
    // the view the filter applies to: the report's, or a draft with the field placed in Filters
    const view = base ?? current;
    const info = useMemo(() => fieldItems(encoded, field, { view, locale, labels: labels.core }), [encoded, field, view, locale, labels]);
    const all = useMemo(() => (info ? info.items.map((i) => i.value) : []), [info]);
    const [selected, setSelected] = useState(() => new Set(selectedItems(view, field, all).map(keyOf)));
    const label = filtersOf(view, field, ["label"])[0];
    const [op, setOp] = useState(label?.op ?? "");
    const [text, setText] = useState(label?.value ?? "");
    if (!info) {
        return null;
    }
    const name = fieldLabel(field, labels.core);
    const apply = () => {
        let next = setItemFilter(view, field, all.filter((v) => selected.has(keyOf(v))), all);
        next = setLabelFilter(next, field, op ? { op, value: text } : null);
        close();
        commit(next, { step: "filter", field: name });
    };
    // a condition the type has none for (a loaded view's) still shows, so it can be taken off
    const kind = conditionKind(encoded, view, field) ?? (label ? "text" : null);
    return (
        <form
            className="pk-filter"
            onSubmit={(e) => {
                e.preventDefault();
                apply();
            }}
        >
            <div className="pk-popover-head">
                <h3>{fill(labels.filterTitle, { field: name })}</h3>
                <span className="pk-muted">{fill(labels.selected, { count: selected.size.toLocaleString(locale) })}</span>
            </div>
            <ValueList items={info.items} selected={selected} onChange={setSelected} labels={labels} locale={locale} autoFocus>
            {kind ? (
            <fieldset className="pk-condition">
                <legend>{kind === "number" ? labels.conditionNumber : labels.condition}</legend>
                <select value={op} onChange={(e) => setOp(e.target.value)} aria-label={kind === "number" ? labels.conditionNumber : labels.condition}>
                    <option value="">{labels.conditionNone}</option>
                    {CATALOG.labelOps.map((o) => (
                        <option key={o} value={o}>
                            {labels.labelOps[o] ?? o}
                        </option>
                    ))}
                </select>
                {op ? (
                    <ClearInput
                        type="text"
                        value={text}
                        onChange={setText}
                        // the condition goes at once (one undo step); the values chosen stay a draft
                        onClear={() => {
                            if (!base && filtersOf(view, field, ["label"]).length) {
                                commit(setLabelFilter(view, field, null), { step: "filter", field: name });
                            }
                        }}
                        clearLabel={labels.clearText}
                        aria-label={labels.conditionValue}
                        placeholder={labels.conditionValue}
                        maxLength={1000}
                        data-testid="filter-condition-text"
                    />
                ) : null}
            </fieldset>
            ) : null}
            </ValueList>
            <div className="pk-popover-foot">
                <button type="button" className="pk-btn" onClick={close}>
                    {labels.cancel}
                </button>
                <button type="submit" className="pk-btn pk-primary" data-testid="filter-apply">
                    {labels.apply}
                </button>
            </div>
        </form>
    );
}

/**
 * @param {{ target: { field: string, anchor: HTMLElement, base?: object } | null, onClose: () => void, view: object,
 *   encoded: import("pivotkit-core").Encoded, locale: string, labels: import("./labels.js").UiLabels, commit: (v: object, note?: any) => void }} props
 *   `target.base`: the draft view of a field that is not placed yet (it goes into Filters on Apply)
 */
export function FilterPopover({ target, onClose, view, encoded, locale, labels, commit }) {
    const anchor = useMemo(() => ({ current: target ? target.anchor : null }), [target]);
    return (
        <Popover open={Boolean(target)} anchor={anchor} onClose={onClose} label={target ? fill(labels.filterTitle, { field: fieldLabel(target.field, labels.core) }) : ""} className="pk-filter-popover" fill>
            {target ? <FilterBody key={target.field} view={view} base={target.base} field={target.field} encoded={encoded} locale={locale} labels={labels} commit={commit} close={onClose} /> : null}
        </Popover>
    );
}
