/*
 * The filter popover of a field: "Remove filter" at the top while it filters, its values with row
 * counts (pivotkit-core's fieldItems), a search, select all and none, "only this value", and a
 * condition on the label. Changes are a draft until Apply, so one filter is one undo step; the × of the
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
import { filtersOf, hasFilter, removeFilters, selectedItems, setItemFilter, setLabelFilter } from "./view-ops.js";

/** Values listed at once; the search finds the others. */
export const FILTER_LIST_MAX = 300;

const keyOf = (v) => JSON.stringify(v);

function FilterBody({ view: current, base, field, encoded, locale, labels, commit, close }) {
    // the view the filter applies to: the report's, or a draft with the field placed in Filters
    const view = base ?? current;
    const info = useMemo(() => fieldItems(encoded, field, { view, locale, labels: labels.core }), [encoded, field, view, locale, labels]);
    const all = useMemo(() => (info ? info.items.map((i) => i.value) : []), [info]);
    const [selected, setSelected] = useState(() => new Set(selectedItems(view, field, all).map(keyOf)));
    const [query, setQuery] = useState("");
    const label = filtersOf(view, field, ["label"])[0];
    const [op, setOp] = useState(label?.op ?? "");
    const [text, setText] = useState(label?.value ?? "");
    if (!info) {
        return null;
    }
    const q = query.trim().toLocaleLowerCase();
    const matching = q ? info.items.filter((i) => i.label.toLocaleLowerCase().includes(q)) : info.items;
    const shown = matching.slice(0, FILTER_LIST_MAX);
    const setAll = (on) => {
        const next = new Set(selected);
        for (const i of matching) {
            if (on) {
                next.add(keyOf(i.value));
            } else {
                next.delete(keyOf(i.value));
            }
        }
        setSelected(next);
    };
    const toggle = (v) => {
        const next = new Set(selected);
        const k = keyOf(v);
        if (next.has(k)) {
            next.delete(k);
        } else {
            next.add(k);
        }
        setSelected(next);
    };
    const name = fieldLabel(field, labels.core);
    const apply = () => {
        let next = setItemFilter(view, field, all.filter((v) => selected.has(keyOf(v))), all);
        next = setLabelFilter(next, field, op ? { op, value: text } : null);
        close();
        commit(next, { step: "filter", field: name });
    };
    const filtering = !base && hasFilter(view, field);
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
            {filtering ? (
                <button
                    type="button"
                    className="pk-btn pk-remove-filter"
                    onClick={() => {
                        close();
                        commit(removeFilters(view, field), { step: "filter", field: name });
                    }}
                    data-testid="filter-remove"
                >
                    <Icon name="x" />
                    <span className="pk-btn-text">{labels.removeFilter}</span>
                </button>
            ) : null}
            <label className="pk-search">
                <Icon name="search" />
                <span className="pk-sr">{labels.searchValues}</span>
                <ClearInput type="search" value={query} placeholder={labels.searchValues} onChange={setQuery} clearLabel={labels.clearText} data-autofocus="" data-testid="filter-search" />
            </label>
            <div className="pk-filter-actions">
                <button type="button" className="pk-link" onClick={() => setAll(true)}>
                    {labels.selectAll}
                </button>
                <button type="button" className="pk-link" onClick={() => setAll(false)}>
                    {labels.selectNone}
                </button>
            </div>
            <ul className="pk-values" role="list">
                {shown.map((i) => {
                    const k = keyOf(i.value);
                    return (
                        <li key={k} className="pk-value">
                            <label>
                                <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(i.value)} />
                                <span className="pk-value-label">{i.label}</span>
                                <span className="pk-count">{i.count.toLocaleString(locale)}</span>
                            </label>
                            <button type="button" className="pk-link pk-only" onClick={() => setSelected(new Set([k]))} aria-label={`${labels.onlyThis}: ${i.label}`}>
                                {labels.onlyThis}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {matching.length > shown.length ? <p className="pk-hint">{fill(labels.valuesShown, { shown: shown.length, total: matching.length.toLocaleString(locale) })}</p> : null}
            <fieldset className="pk-condition">
                <legend>{labels.condition}</legend>
                <select value={op} onChange={(e) => setOp(e.target.value)} aria-label={labels.condition}>
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
        <Popover open={Boolean(target)} anchor={anchor} onClose={onClose} label={target ? fill(labels.filterTitle, { field: fieldLabel(target.field, labels.core) }) : ""} className="pk-filter-popover">
            {target ? <FilterBody key={target.field} view={view} base={target.base} field={target.field} encoded={encoded} locale={locale} labels={labels} commit={commit} close={onClose} /> : null}
        </Popover>
    );
}
