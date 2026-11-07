/*
 * The filter popover of a field: its values with row counts (pivotkit-core's fieldItems), a search,
 * select all and none, "only this value", and a condition on the label. Changes are a draft until
 * Apply, so one filter is one undo step.
 */

import React, { useMemo, useState } from "react";
import { CATALOG, fieldItems, fieldLabel } from "pivotkit-core";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { Popover } from "./popover.jsx";
import { filtersOf, selectedItems, setItemFilter, setLabelFilter } from "./view-ops.js";

/** Values listed at once; the search finds the others. */
export const FILTER_LIST_MAX = 300;

const keyOf = (v) => JSON.stringify(v);

function FilterBody({ view, field, encoded, locale, labels, commit, close }) {
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
    const apply = () => {
        let next = setItemFilter(view, field, all.filter((v) => selected.has(keyOf(v))), all);
        next = setLabelFilter(next, field, op ? { op, value: text } : null);
        close();
        commit(next, { step: "filter", field: fieldLabel(field, labels.core) });
    };
    return (
        <form
            className="pk-filter"
            onSubmit={(e) => {
                e.preventDefault();
                apply();
            }}
        >
            <div className="pk-popover-head">
                <h3>{fill(labels.filterTitle, { field: fieldLabel(field, labels.core) })}</h3>
                <span className="pk-muted">{fill(labels.selected, { count: selected.size.toLocaleString(locale) })}</span>
            </div>
            <label className="pk-search">
                <Icon name="search" />
                <span className="pk-sr">{labels.searchValues}</span>
                <input type="search" value={query} placeholder={labels.searchValues} onChange={(e) => setQuery(e.target.value)} data-autofocus="" />
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
                {op ? <input type="text" value={text} onChange={(e) => setText(e.target.value)} aria-label={labels.conditionValue} placeholder={labels.conditionValue} maxLength={1000} /> : null}
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
 * @param {{ target: { field: string, anchor: HTMLElement } | null, onClose: () => void, view: object,
 *   encoded: import("pivotkit-core").Encoded, locale: string, labels: import("./labels.js").UiLabels, commit: (v: object) => void }} props
 */
export function FilterPopover({ target, onClose, view, encoded, locale, labels, commit }) {
    const anchor = useMemo(() => ({ current: target ? target.anchor : null }), [target]);
    return (
        <Popover open={Boolean(target)} anchor={anchor} onClose={onClose} label={target ? fill(labels.filterTitle, { field: fieldLabel(target.field, labels.core) }) : ""} className="pk-filter-popover">
            {target ? <FilterBody key={target.field} view={view} field={target.field} encoded={encoded} locale={locale} labels={labels} commit={commit} close={onClose} /> : null}
        </Popover>
    );
}
