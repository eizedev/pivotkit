/*
 * The four zones (Filters, Columns, Rows, Values) with their chips, each zone a shelf: its title, its
 * "i" and "+ Add" at its left, its chips flowing beside them (styles.css). "+ Add" opens the zone's
 * menu of every field (add-menu.jsx); after a pick the focus goes to the new chip and the zones'
 * status line says what was added or moved. A chip is dragged to reorder or
 * move it, removed with its x, and its menu (chip-menus.jsx) holds everything else. A chip says what
 * is set on it in words: the grouping in its name ("Created by month"), "3 of 4" for a filter,
 * "Top 5", the sort; screen readers get the same in its name. After a chip is removed the focus goes
 * to its neighbour, or to the zone. The zones sit in a section "Fields in the report": its heading
 * row (SectionHead) folds them, says what is placed while they are folded, and holds Swap rows and
 * columns, which works folded too. A drag
 * opens the folded zones while it lasts, so a field can still be dropped.
 */

import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { fieldLabel } from "pivotkit-core";
import { LimitsContext, itemsOf } from "./limits-context.js";
import { MenuPanel } from "./lazy-menus.jsx";
import { columnText, itemRuleText, layoutSummary, sortText, valueConditionText, valueLabels } from "./names.js";
import { ChipList, useActiveDrag, useChip, useDropTarget } from "./dnd.jsx";
import { Icon, TYPE_ICON, ZONE_ICON } from "./icons.jsx";
import { InfoButton } from "./info.jsx";
import { fill } from "./labels.js";
import { MenuButton } from "./popover.jsx";
import { ZONES, dateSpan, filterZoneFields, filtersOf, isEmptyPick, numberRange, removeAt, selectedItems, sortOf, sourceOf } from "./view-ops.js";

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
function fieldState(view, field, encoded, locale, labels, sourceType, limits) {
    const items = filtersOf(view, field, ["in"]).filter((f) => !isEmptyPick(f));
    const compared = filtersOf(view, field, ["compare"]);
    // the items' labels: for "3 of 12", and a grouping's key in words ("from Mar 2025")
    const info = items.length || compared.length ? itemsOf(encoded, field, { view, locale, limits }) : null;
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
    const rules = filtersOf(view, field, ["relative", "compare", "text"]).map((f) => itemRuleText(f, labels, locale, { timeZone: encoded.timeZone, date, labelOf, span, weekStart: view.formatting?.weekStart }));
    const top = filtersOf(view, field, ["top"])[0] ?? null;
    const condition = filtersOf(view, field, ["value"])[0] ?? null;
    const sort = sortOf(view, field);
    // a sort by one column says which, as the table names it (#70)
    const sortColumn = sort?.column ? columnText(view, sort.column, encoded, labels, locale, limits) : undefined;
    return { summary, rules, top, condition, sort, sortColumn };
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
        words.push(fill(labels.stateSorted, { order: sortText(view, state.sort, labels, state.sortColumn) }));
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
        // the glyph of the table's sorted header: one glyph for one order
        parts.push(<Icon key="sort" name={desc ? "arrowDown" : "arrowUp"} size={12} className="pk-chip-badge pk-sort-glyph" />);
    }
    return parts.length ? <>{parts}</> : null;
}

function Chip({ id, zone, index, count, field, text, title, typeName, view, types, labels, commit, onRemove, state, locale, defaultsOf, earlier, rangeOf, info, showInfo, encoded }) {
    const { setNodeRef, isDragging, style, itemProps, handleProps } = useChip(id, { kind: "chip", zone, index, count, field, label: text, type: typeName });
    const badges = state ? <Badges state={state} view={view} labels={labels} locale={locale} /> : null;
    const words = stateWords(state, view, labels, locale);
    // the chip in full, as its accessible name and, hovered anywhere, its tooltip: a badge cut to
    // "…" or a name cut by a narrow chip is whole there
    // `title`: the name with the years a date grouping combines, for the tooltip and screen readers
    const full = title ?? text;
    const name = words ? `${full}, ${words}` : title;
    const remove = () => onRemove(zone, index, text);
    return (
        <li ref={setNodeRef} style={style} className={`pk-chip pk-chip-${zone}${zone === "filters" ? "" : " pk-zone-fill"}${isDragging ? " pk-dragging" : ""}`} {...itemProps} data-chip={text}>
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

/**
 * "+ Add" of a zone: its menu of every field (add-menu.jsx), loaded with the menus.
 * @param {{ zone: string, labels: any, menu: Record<string, any> }} props  `menu`: the menu's props but `zone` and `close`
 */
function AddButton({ zone, labels, menu }) {
    const name = fill(labels.addFieldTo, { zone: labels.zones[zone] });
    return (
        <MenuButton label={name} name={name} title={name} icon="plus" text={labels.addField} className="pk-zone-add" role="dialog" popoverClass="pk-chip-menu" fill testId={`add-field-${zone}`}>
            {(close) => <MenuPanel name="AddMenu" loadingText={labels.loadingMenu} props={{ ...menu, labels, zone, close }} />}
        </MenuButton>
    );
}

function Zone({ zone, entries, labels, children, explain, add }) {
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
    // the light goes when its animation (pk-flash, the only one of the zone itself; a chip's own end
    // event bubbles up and is not it) ends, so it lasts as long as --pk-duration says (a timer
    // would cut a host's longer one). With reduced motion no animation runs and no end event comes:
    // the class stays and does nothing, and the next chip does not light the zone either.
    const flashed = (e) => e.target === e.currentTarget && setFlash(false);
    return (
        <section ref={setNodeRef} tabIndex={-1} className={`pk-zone pk-zone-${zone}${isOver ? " pk-over" : ""}${dragging ? " pk-dropping" : ""}${flash ? " pk-flash" : ""}`} aria-label={labels.zones[zone]} data-zone={zone} onAnimationEnd={flashed}>
            <div className="pk-zone-head">
                <h3 className="pk-zone-title">
                    <Icon name={/** @type {any} */ (ZONE_ICON[zone])} size={14} />
                    {labels.zones[zone]}
                </h3>
                {/* what the zone does, with an example: shown while tips are on */}
                {explain ? <InfoButton info={{ description: labels.zoneInfo[zone] }} name={labels.zones[zone]} labels={labels} className="pk-zone-info" testId={`zone-info-${zone}`} /> : null}
                {add ? <AddButton zone={zone} labels={labels} menu={add} /> : null}
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

/** How long (ms) the status line stays empty before it says what "+ Add" did, and how long it says it. */
const SAY_AFTER = 100;
const SAY_FOR = 8000;

/**
 * The chip under the pointer while a field or a chip is dragged (dnd.jsx: renderOverlay).
 * @param {{ src: { field: string, type?: string, label?: string }, typeOf: (field: string) => string }} props
 */
export function DragChip({ src, typeOf }) {
    const type = src.type ?? typeOf(src.field);
    return (
        <div className="pk-chip pk-overlay">
            <Icon name="grip" size={14} />
            <span className={`pk-type pk-type-${type}`}>
                <Icon name={/** @type {any} */ (TYPE_ICON[type] ?? "text")} size={13} />
            </span>
            <span className="pk-chip-text">{src.label ?? src.field}</span>
        </div>
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
        values: valueLabels(view.values, labels).map((text, i) => {
            const v = view.values[i];
            // stable across reorders, so a moved chip keeps its element; a repeated value gets a number
            const key = `${v.agg}:${v.field}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
            return { id: `chip:values:${key}:${seen.get(key)}`, field: v.field, text, type: v.field ? typeOf(v.field) : "number", index: i };
        })
    };
}

/**
 * The section's heading row, one line in every state and size: the fold button (a chevron and the
 * heading), the section's "i" (the zones' own InfoButton: what the section is for, while
 * explanations show), the summary while folded (what is placed, cut with "…"; a click on it folds or
 * opens too) and Swap rows and columns at the end. The fold button is named by its heading and,
 * folded, described by the summary, which is its tooltip too. Three buttons side by side, none
 * inside another; the Tab order is fold, "i", Swap. In the narrow layout Swap shows its icon only.
 */
function SectionHead({ entries, labels, id, open, onFold, onSwap, canSwap, buttonRef, explain }) {
    const own = useId();
    const parts = layoutSummary(entries, labels);
    const text = parts.length ? parts.map((p) => `${p.title}: ${p.fields}`).join(" · ") : labels.layoutEmpty;
    return (
        <div className="pk-section-row">
            <button
                ref={buttonRef}
                type="button"
                className="pk-section-fold"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                aria-labelledby={`${own}-t`}
                aria-describedby={open ? undefined : `${own}-s`}
                title={open ? undefined : text}
                onClick={onFold}
                data-testid="layout-summary"
            >
                <Icon name="chevronRight" className="pk-section-chevron" />
                <span id={`${own}-t`} className="pk-section-heading">
                    {labels.zonesTitle}
                </span>
            </button>
            {explain ? <InfoButton info={{ description: labels.zonesHint }} name={labels.zonesTitle} labels={labels} className="pk-section-info" testId="zones-info" /> : null}
            {open ? (
                <span className="pk-grow" />
            ) : (
                // the button's description and a larger target for the pointer; the keys use the button
                <span id={`${own}-s`} className="pk-section-sub" onClick={onFold} data-testid="zones-sub">
                    {parts.length
                        ? parts.map((p, i) => (
                              <React.Fragment key={p.zone}>
                                  {/* read too: the description is the line as it shows */}
                                  {i ? " · " : null}
                                  <span className="pk-zones-summary-zone">{p.title}:</span> {p.fields}
                              </React.Fragment>
                          ))
                        : labels.layoutEmpty}
                </span>
            )}
            {/* the text goes in the narrow layout (styles.css): the title keeps it as a tooltip */}
            <button type="button" className="pk-btn pk-small-btn pk-swap" onClick={onSwap} disabled={!canSwap} data-testid="swap" title={labels.swap}>
                <Icon name="swap" size={14} />
                <span className="pk-btn-text">{labels.swap}</span>
            </button>
        </div>
    );
}

/**
 * @param {{ view: any, types: Map<string, string>, labels: import("./labels.js").UiLabels,
 *   commit: (view: object, note?: any) => boolean, earlier?: () => any[],
 *   encoded: import("pivotkit-core").Encoded, locale: string, onSwap: () => void,
 *   id: string, folded: boolean, onFold: () => void, narrow?: boolean, defaultsOf?: (field: string) => import("./index.js").FieldDefaults | undefined,
 *   infoOf?: (field: string) => import("./field-info.js").FieldInfo | undefined, titleOf?: (field: string) => string | undefined,
 *   explain?: boolean, showInfo?: boolean,
 *   adding?: { fields: Array<{ name: string, type: string }>, placed: Map<string, string[]>, nameOf: (field: string) => string,
 *     info: Map<string, import("./field-info.js").FieldInfo>, placeName: (field: string, zone: string) => string,
 *     onAdd: (field: string, zone: string) => boolean, filterDraft: (field: string) => { field: string, base: object | undefined },
 *     fullText: (zone: string, count: number) => string | null } }} props
 *   `explain`: an "i" next to each zone's title that says what the zone does; `showInfo` false: no "i"
 *   of a field description on the chips (Options → Help)
 *   `folded`: the section folded to its heading row; `onFold`: fold or open it; `defaultsOf`: the host's settings for a source field (fieldDefaults);
 *   `infoOf`: the host's description of a field (its source field's for a grouping); `earlier`: the
 *   history's views before this one (a value's own colours for its Highlight); `titleOf`: a
 *   field's name with the years its date grouping combines, the chip's tooltip (the chip shows the
 *   plain name); `adding`: what "+ Add"
 *   needs (the fields, where each is placed, how a pick is placed); without it there is no "+ Add"
 */
export function Zones({ view, types, labels, commit, earlier, encoded, locale, onSwap, id, folded, onFold, defaultsOf, infoOf, titleOf, explain = false, showInfo = true, adding }) {
    const limits = useContext(LimitsContext);
    const entries = useMemo(() => zoneEntries(view, types, labels), [view, types, labels]);
    // while something is dragged the zones are open, so it can be dropped into one
    const dragging = Boolean(useActiveDrag());
    // whether the focus is in the zones: when they fold, it moves to the fold button instead of getting lost
    const focusInside = useRef(false);
    const summary = useRef(/** @type {HTMLButtonElement | null} */ (null));
    // the state of every field chip, once per view (a filter summary counts the field's values)
    const states = useMemo(() => {
        const map = new Map();
        for (const zone of ["filters", "cols", "rows"]) {
            for (const e of entries[zone]) {
                map.set(e.field, fieldState(view, e.field, encoded, locale, labels, e.type, limits));
            }
        }
        return map;
    }, [entries, view, encoded, locale, labels, limits]);
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
    // a field placed by "+ Add": the zone, where it came from and the chips before, so the new chip is
    // found once the view has it (a step the report refused adds none)
    const added = useRef(/** @type {{ zone: string, from: string | null, ids: Set<string> } | null} */ (null));
    // the status line: emptied first and filled a moment later, so the same words (a second "Sum of
    // Revenue added to Values") are announced again; emptied again after a while, so a screen reader
    // that walks the page later finds no stale words
    const [said, setSaid] = useState("");
    const sayTimers = useRef(/** @type {ReturnType<typeof setTimeout>[]} */ ([]));
    useEffect(() => () => sayTimers.current.forEach(clearTimeout), []);
    useEffect(() => {
        const at = added.current;
        if (!at) {
            return;
        }
        added.current = null;
        const fresh = entries[at.zone].find((e) => !at.ids.has(e.id));
        if (!fresh) {
            return;
        }
        const chip = root.current?.querySelectorAll(`[data-zone="${at.zone}"] .pk-chip`)[fresh.index];
        /** @type {HTMLElement | null | undefined} */ (chip?.querySelector(".pk-chip-label"))?.focus({ preventScroll: true });
        const text = fill(at.from ? labels.movedFrom : labels.steps.added, { field: fresh.text, zone: labels.zones[at.zone], from: at.from ? labels.zones[at.from] : "" });
        sayTimers.current.forEach(clearTimeout);
        setSaid("");
        sayTimers.current = [setTimeout(() => setSaid(text), SAY_AFTER), setTimeout(() => setSaid(""), SAY_FOR)];
    }, [entries, labels]);
    const addMenu = useMemo(
        () =>
            adding
                ? {
                      ...adding,
                      view,
                      commit,
                      encoded,
                      locale,
                      onAdded: (zone) => (from, run) => {
                          added.current = { zone, from, ids: new Set(entries[zone].map((e) => e.id)) };
                          // a step the report refused (a zone at its limit): no chip to wait for
                          if (!run()) {
                              added.current = null;
                          }
                      }
                  }
                : null,
        [adding, view, commit, encoded, locale, entries]
    );
    // the fold button stays where it is, folded or open, and keeps the focus; the zones folded with
    // the focus in them (a smaller report): it goes to the fold button
    useEffect(() => {
        if (folded && focusInside.current) {
            focusInside.current = false;
            summary.current?.focus({ preventScroll: true });
        }
    }, [folded]);
    const open = !folded || dragging;
    return (
        <div className="pk-zone-section" data-pk-open={open ? "" : undefined} data-testid="zone-section">
            <SectionHead entries={entries} labels={labels} id={id} open={open} onFold={onFold} onSwap={onSwap} canSwap={view.rows.length + view.cols.length > 0} buttonRef={summary} explain={explain} />
            {/* what "+ Add" did, for screen readers: the chip shows it on screen */}
            <span className="pk-sr" role="status" data-testid="zones-status">
                {said}
            </span>
            {open ? (
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
                            add={addMenu ? { ...addMenu, onAdded: addMenu.onAdded(zone) } : null}
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
                                    title={e.field ? titleOf?.(e.field) : undefined}
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
            ) : null}
        </div>
    );
}
