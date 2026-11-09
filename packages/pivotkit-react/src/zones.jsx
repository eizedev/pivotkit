/*
 * The four zones (Filters, Columns, Rows, Values) with their chips. A chip is dragged to reorder or
 * move it, removed with its x, and its menu (chip-menus.jsx) holds everything else. A chip says what
 * is set on it in words: the grouping in its name ("Created by month"), "3 of 4" for a filter,
 * "Top 5", the sort; screen readers get the same in its name. After a chip is removed the focus goes
 * to its neighbour, or to the zone. In the compact layout the zones fold into one line that says what
 * is in them; a drag opens them while it lasts, so a field can still be dropped.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fieldItems, fieldLabel } from "pivotkit-core";
import { MenuPanel } from "./lazy-menus.jsx";
import { itemRuleText, layoutSummary, sortText, valueConditionText, valueLabel } from "./names.js";
import { ChipList, useActiveDrag, useChip, useDropTarget } from "./dnd.jsx";
import { Icon, TYPE_ICON, ZONE_ICON } from "./icons.jsx";
import { InfoButton } from "./info.jsx";
import { fill } from "./labels.js";
import { MenuButton } from "./popover.jsx";
import { ZONES, dateSpan, filterZoneFields, filtersOf, numberRange, removeAt, selectedItems, sortOf, sourceOf } from "./view-ops.js";

/**
 * What is set on a field: its item filter as "shown of total" (null without one), its rules on the
 * items themselves in short ("last 5 years (2022–2026)", "from 2022"), its top N, its value condition
 * and its sort, for the chip's badges and its accessible name.
 * @param {any} view
 * @param {string} field
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {string} locale
 * @param {import("./labels.js").UiLabels} labels
 * @param {string} sourceType  the type of the field's source (a grouped date is a date)
 */
function fieldState(view, field, encoded, locale, labels, sourceType) {
    const items = filtersOf(view, field, ["include", "exclude"]).filter((f) => f.type === "include" || f.items.length > 0);
    const compared = filtersOf(view, field, ["compare"]);
    // the items' labels: for "3 of 12", and a grouping's key in words ("from Mar 2025")
    const info = items.length || compared.length ? fieldItems(encoded, field, { view, locale }) : null;
    /** @type {{ shown: number, total: number } | null} */
    let summary = null;
    if (items.length && info) {
        const all = info.items.map((i) => i.value);
        summary = { shown: selectedItems(view, field, all).length, total: all.length };
    }
    const labelOf = (v) => info?.items.find((i) => i.value === v)?.label;
    const date = sourceType === "date";
    // the data's first and last date: a relative range says the data's share of it
    const span = date ? dateSpan(encoded, sourceOf(view, field)) : null;
    const rules = filtersOf(view, field, ["relative", "compare", "label"]).map((f) => itemRuleText(f, labels, locale, { timeZone: encoded.timeZone, date, labelOf, span }));
    const top = filtersOf(view, field, ["top"])[0] ?? null;
    const condition = filtersOf(view, field, ["value"])[0] ?? null;
    return { summary, rules, top, condition, sort: sortOf(view, field) };
}

/**
 * What is set on a chip in words, for its accessible name: "filtered 3 of 4, Top 5, Sum of Revenue >
 * 1,000, sorted A to Z".
 */
function stateWords(state, view, labels, locale) {
    if (!state) {
        return "";
    }
    const words = [];
    if (state.summary) {
        words.push(`${labels.stateFiltered} ${fill(labels.filterSummary, { shown: state.summary.shown.toLocaleString(locale), total: state.summary.total.toLocaleString(locale) })}`);
    }
    words.push(...state.rules);
    if (state.top) {
        words.push(fill(state.top.bottom ? labels.bottomBadge : labels.topBadge, { count: state.top.count.toLocaleString(locale) }));
    }
    if (state.condition) {
        words.push(valueConditionText(view, state.condition, labels, locale));
    }
    if (state.sort) {
        words.push(fill(labels.stateSorted, { order: sortText(view, state.sort, labels) }));
    }
    return words.join(", ");
}

/**
 * The badges of a chip, as siblings of its name in the label (no wrapper: the name and a badge in
 * words share the label's room, see `.pk-chip-name` in styles.css). The whole of every badge is in
 * the chip's title and its accessible name, so the badges themselves are hidden from assistive
 * technology.
 */
function Badges({ state, view, labels, locale }) {
    const parts = [];
    if (state.summary) {
        const text = fill(labels.filterSummary, { shown: state.summary.shown.toLocaleString(locale), total: state.summary.total.toLocaleString(locale) });
        parts.push(
            <span key="filter" className="pk-chip-badge pk-badge-text" aria-hidden="true">
                <Icon name="filter" size={12} />
                {text}
            </span>
        );
    }
    // the first rule on the items in the words of the Filter level ("last 5 years (2022–2026)"), "+1"
    // for more; a long one ends in "…" when the label is short of room
    if (state.rules.length) {
        const more = state.rules.length - 1;
        parts.push(
            <span key="rules" className="pk-chip-badge pk-badge-text pk-badge-condition" data-testid="rule-badge" aria-hidden="true">
                {state.summary ? null : <Icon name="filter" size={12} />}
                <span className="pk-badge-cut">{state.rules[0]}</span>
                {more ? <span>{` +${more.toLocaleString(locale)}`}</span> : null}
            </span>
        );
    }
    if (state.top) {
        const text = fill(state.top.bottom ? labels.bottomBadge : labels.topBadge, { count: state.top.count.toLocaleString(locale) });
        parts.push(
            <span key="top" className="pk-chip-badge pk-badge-text" data-testid="top-badge" aria-hidden="true">
                <Icon name="top" size={12} />
                {text}
            </span>
        );
    }
    if (state.condition) {
        const text = valueConditionText(view, state.condition, labels, locale);
        parts.push(
            <span key="condition" className="pk-chip-badge pk-badge-text pk-badge-condition" data-testid="condition-badge" aria-hidden="true">
                <Icon name="filter" size={12} />
                <span className="pk-badge-cut">{text}</span>
            </span>
        );
    }
    if (state.sort) {
        const desc = state.sort.order === "desc";
        parts.push(<Icon key="sort" name={desc ? "sortDesc" : "sortAsc"} size={12} className="pk-chip-badge" />);
    }
    return parts.length ? <>{parts}</> : null;
}

function Chip({ id, zone, index, count, field, text, typeName, view, types, labels, commit, onRemove, state, locale, defaultsOf, earlier, rangeOf, info, showInfo, encoded }) {
    const { setNodeRef, isDragging, style, itemProps, handleProps } = useChip(id, { kind: "chip", zone, index, count, field, label: text, type: typeName });
    const badges = state ? <Badges state={state} view={view} labels={labels} locale={locale} /> : null;
    const words = stateWords(state, view, labels, locale);
    // the chip in full, as its accessible name and, hovered anywhere, its tooltip: a badge cut to
    // "…" or a name cut by a narrow chip is whole there
    const name = words ? `${text}, ${words}` : undefined;
    const remove = () => onRemove(zone, index, text);
    return (
        <li ref={setNodeRef} style={style} className={`pk-chip pk-chip-${zone}${isDragging ? " pk-dragging" : ""}`} {...itemProps} data-chip={text}>
            <span className="pk-handle" {...handleProps} aria-label={fill(labels.dragHandle, { field: text })}>
                <Icon name="grip" size={16} />
            </span>
            <span className={`pk-type pk-type-${typeName}`} aria-hidden="true">
                <Icon name={/** @type {any} */ (TYPE_ICON[typeName] ?? "text")} size={13} />
            </span>
            <MenuButton
                label={fill(labels.fieldMenu, { field: text })}
                text={
                    <>
                        <span className="pk-chip-name">{text}</span>
                        {badges}
                    </>
                }
                className="pk-chip-label"
                name={name}
                title={name ?? text}
                role="dialog"
                popoverClass="pk-chip-menu"
                fill
                testId={`chip-menu-${text}`}
            >
                {(close) =>
                    zone === "values" ? (
                        <MenuPanel name="ValueMenu" loadingText={labels.loadingMenu} props={{ view, index, types, labels, commit, close, onRemove: remove, defaultsOf, info, locale, earlier }} />
                    ) : zone === "filters" ? (
                        <MenuPanel name="FilterMenu" loadingText={labels.loadingMenu} props={{ view, index, field, types, labels, commit, close, onRemove: remove, locale, info, state, encoded }} />
                    ) : (
                        <MenuPanel name="AxisMenu" loadingText={labels.loadingMenu} props={{ view, zone, index, field, types, labels, commit, close, onRemove: remove, defaultsOf, rangeOf, locale, info, state, encoded }} />
                    )
                }
            </MenuButton>
            {info && showInfo ? <InfoButton info={info} name={fieldLabel(sourceOf(view, field), labels.core)} labels={labels} className="pk-chip-info" /> : null}
            <button type="button" className="pk-chip-x" onClick={remove} aria-label={fill(labels.removeField, { field: text })} title={fill(labels.removeField, { field: text })}>
                <Icon name="x" size={14} />
            </button>
        </li>
    );
}

function Zone({ zone, entries, labels, children, action, explain }) {
    const count = entries.length;
    const { setNodeRef, isOver } = useDropTarget(`zone:${zone}`, { kind: "zone", zone, count });
    const active = useActiveDrag();
    const dragging = Boolean(active);
    const [flash, setFlash] = useState(false);
    const [prev, setPrev] = useState(count);
    // a chip arrived: the zone lights up once (state from the previous render, not an effect)
    if (count !== prev) {
        setPrev(count);
        if (count > prev) {
            setFlash(true);
        }
    }
    useEffect(() => {
        if (!flash) {
            return undefined;
        }
        const t = setTimeout(() => setFlash(false), 600);
        return () => clearTimeout(t);
    }, [flash]);
    return (
        <section ref={setNodeRef} tabIndex={-1} className={`pk-zone pk-zone-${zone}${isOver ? " pk-over" : ""}${dragging ? " pk-dropping" : ""}${flash ? " pk-flash" : ""}`} aria-label={labels.zones[zone]} data-zone={zone}>
            <div className="pk-zone-head">
                <h3 className="pk-zone-title">
                    <Icon name={/** @type {any} */ (ZONE_ICON[zone])} size={14} />
                    {labels.zones[zone]}
                </h3>
                {/* what the zone does, with an example: shown while tips are on */}
                {explain ? <InfoButton info={{ description: labels.zoneInfo[zone] }} name={labels.zones[zone]} labels={labels} className="pk-zone-info" testId={`zone-info-${zone}`} /> : null}
                <span className="pk-grow" />
                {action}
            </div>
            <ChipList ids={entries.map((e) => e.id)}>
                <ul className="pk-chips">
                    {children}
                    {count === 0 ? <li className="pk-zone-hint">{labels.zoneHints[zone]}</li> : null}
                </ul>
            </ChipList>
        </section>
    );
}

/** Chip entries of every zone: id, field, text, type (of the source field: a grouped date stays a date). */
export function zoneEntries(view, types, labels) {
    const typeOf = (f) => types.get(String(sourceOf(view, f)).toLowerCase()) ?? "string";
    const seen = new Map();
    // a field's display name (fieldDefaults label); a grouping keeps the name it was given
    const text = (f) => fieldLabel(f, labels.core);
    const axis = (zone) => view[zone].map((f, i) => ({ id: `chip:${zone}:${f}`, field: f, text: text(f), type: typeOf(f), index: i }));
    return {
        filters: filterZoneFields(view).map((f, i) => ({ id: `chip:filters:${f}`, field: f, text: text(f), type: typeOf(f), index: i })),
        cols: axis("cols"),
        rows: axis("rows"),
        values: view.values.map((v, i) => {
            // stable across reorders, so a moved chip keeps its element; a repeated value gets a number
            const key = `${v.agg}:${v.field}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
            return { id: `chip:values:${key}:${seen.get(key)}`, field: v.field, text: valueLabel(v, labels), type: v.field ? typeOf(v.field) : "number", index: i };
        })
    };
}

/** The folded zones: one line with what is in them, a button that opens them. */
function ZoneSummary({ entries, labels, id, onShow, buttonRef }) {
    const parts = layoutSummary(entries, labels);
    const text = parts.length ? parts.map((p) => `${p.title}: ${p.fields}`).join(" · ") : labels.layoutEmpty;
    return (
        <button ref={buttonRef} type="button" id={id} className="pk-zones-summary" aria-expanded="false" aria-label={`${labels.showLayout}: ${text}`} title={labels.showLayout} onClick={onShow} data-testid="layout-summary">
            <Icon name="chevronRight" size={16} />
            <span className="pk-zones-summary-text">
                {parts.length
                    ? parts.map((p, i) => (
                          <React.Fragment key={p.zone}>
                              {i ? <span aria-hidden="true"> · </span> : null}
                              <span className="pk-zones-summary-zone">{p.title}:</span> {p.fields}
                          </React.Fragment>
                      ))
                    : labels.layoutEmpty}
            </span>
        </button>
    );
}

/**
 * @param {{ view: any, types: Map<string, string>, labels: import("./labels.js").UiLabels,
 *   commit: (view: object, note?: any) => void, earlier?: () => any[],
 *   encoded: import("pivotkit-core").Encoded, locale: string, onSwap: () => void,
 *   id: string, folded: boolean, onShow: () => void, defaultsOf?: (field: string) => import("./index.js").FieldDefaults | undefined,
 *   infoOf?: (field: string) => import("./field-info.js").FieldInfo | undefined, explain?: boolean, showInfo?: boolean }} props
 *   `explain`: an "i" next to each zone's title that says what the zone does; `showInfo` false: no "i"
 *   of a field description on the chips (Options → Help)
 *   `folded`: the compact layout's one line; `defaultsOf`: the host's settings for a source field (fieldDefaults);
 *   `infoOf`: the host's description of a field (its source field's for a grouping); `earlier`: the
 *   history's views before this one (a value's own colours for its Highlight)
 */
export function Zones({ view, types, labels, commit, earlier, encoded, locale, onSwap, id, folded, onShow, defaultsOf, infoOf, explain = false, showInfo = true }) {
    const entries = useMemo(() => zoneEntries(view, types, labels), [view, types, labels]);
    // while something is dragged the zones are open, so it can be dropped into one
    const dragging = Boolean(useActiveDrag());
    const showing = useRef(false);
    // whether the focus is in the zones: when they fold, it moves to the line instead of getting lost
    const focusInside = useRef(false);
    const summary = useRef(/** @type {HTMLButtonElement | null} */ (null));
    // the state of every field chip, once per view (a filter summary counts the field's values)
    const states = useMemo(() => {
        const map = new Map();
        for (const zone of ["filters", "cols", "rows"]) {
            for (const e of entries[zone]) {
                map.set(e.field, fieldState(view, e.field, encoded, locale, labels, e.type));
            }
        }
        return map;
    }, [entries, view, encoded, locale, labels]);
    // the numbers of a field, for the range form of its menu
    const rangeOf = useCallback((field) => numberRange(encoded, field), [encoded]);
    const root = useRef(/** @type {HTMLDivElement | null} */ (null));
    const focusAfter = useRef(/** @type {{ zone: string, index: number } | null} */ (null));
    const onRemove = (zone, index, text) => {
        focusAfter.current = { zone, index };
        commit(removeAt(view, zone, index), { step: "removed", field: text, removed: true });
    };
    // after a removal: the chip now at that place, the one before it, or the zone
    useEffect(() => {
        const at = focusAfter.current;
        if (!at || !root.current) {
            return;
        }
        focusAfter.current = null;
        const zone = root.current.querySelector(`[data-zone="${at.zone}"]`);
        const chips = zone ? [...zone.querySelectorAll(".pk-chip .pk-chip-label")] : [];
        const target = /** @type {HTMLElement | null} */ (chips[Math.min(at.index, chips.length - 1)] ?? zone);
        target?.focus({ preventScroll: true });
    });
    // opened from the one line: its button is gone, the focus goes to the first zone
    useEffect(() => {
        if (showing.current && !folded) {
            showing.current = false;
            /** @type {HTMLElement | null | undefined} */ (root.current?.querySelector("[data-zone]"))?.focus({ preventScroll: true });
        }
        if (folded && focusInside.current) {
            focusInside.current = false;
            summary.current?.focus({ preventScroll: true });
        }
    }, [folded]);
    if (folded && !dragging) {
        return (
            <ZoneSummary
                entries={entries}
                labels={labels}
                id={id}
                buttonRef={summary}
                onShow={() => {
                    showing.current = true;
                    onShow();
                }}
            />
        );
    }
    return (
        <div
            className="pk-zones"
            ref={root}
            id={id}
            onFocus={() => {
                focusInside.current = true;
            }}
            onBlur={(e) => {
                // a removed element blurs without a target: that keeps the flag, as the fold needs
                if (e.relatedTarget && !e.currentTarget.contains(/** @type {Node} */ (e.relatedTarget))) {
                    focusInside.current = false;
                }
            }}
        >
            {ZONES.map((zone) => (
                <Zone
                    key={zone}
                    zone={zone}
                    entries={entries[zone]}
                    labels={labels}
                    explain={explain}
                    action={
                        zone === "cols" ? (
                            // the text goes when the zone is too narrow (styles.css): the title keeps it as a tooltip
                            <button type="button" className="pk-link pk-swap" onClick={onSwap} disabled={view.rows.length + view.cols.length === 0} data-testid="swap" title={labels.swap}>
                                <Icon name="swap" size={14} />
                                <span className="pk-btn-text">{labels.swap}</span>
                            </button>
                        ) : null
                    }
                >
                    {entries[zone].map((e) => (
                        <Chip
                            key={e.id}
                            id={e.id}
                            zone={zone}
                            index={e.index}
                            count={entries[zone].length}
                            field={e.field}
                            text={e.text}
                            typeName={e.type}
                            view={view}
                            types={types}
                            labels={labels}
                            commit={commit}
                            onRemove={onRemove}
                            state={zone === "values" ? null : states.get(e.field)}
                            locale={locale}
                            defaultsOf={defaultsOf}
                            earlier={earlier}
                            rangeOf={rangeOf}
                            info={e.field ? infoOf?.(e.field) : undefined}
                            showInfo={showInfo}
                            encoded={encoded}
                        />
                    ))}
                </Zone>
            ))}
        </div>
    );
}
