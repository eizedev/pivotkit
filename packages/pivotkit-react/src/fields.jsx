/*
 * The field list: every column of the data with its type, searchable, each one draggable into a zone,
 * with a quick add (click: numbers go to Values, everything else to Rows) and a menu for every zone.
 * Dropping a chip here removes it from the report. On a narrow report it is a modal drawer. A field
 * shows its display name and, when the host describes it (fieldDefaults), an "i" with the description;
 * the search finds a field by its name, its display name and its description. A field not in the report
 * yet has "Filter…" in its menu: the filter opens at once, and Apply puts the field into Filters.
 *
 * For the keyboard the list is one stop of the Tab order (a roving tabindex): the arrow keys move up
 * and down between the fields and left and right between a field's grip, name, "i" and menu; Enter
 * on a name adds the field, Space on the grip picks it up, Shift+F10 (or the context menu key) opens
 * the menu of the field in focus. A link before it skips to the toolbar.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ClearInput } from "./clear-input.jsx";
import { useModal } from "./dom.js";
import { useActiveDrag, useDragSource, useDropTarget } from "./dnd.jsx";
import { fieldMatches } from "./field-info.js";
import { Icon, TYPE_ICON, ZONE_ICON } from "./icons.jsx";
import { InfoButton } from "./info.jsx";
import { fill } from "./labels.js";
import { fieldAction } from "./names.js";
import { SLOTS, opensMenu, roveTarget } from "./rove.js";
import { MenuButton, Option } from "./popover.jsx";
import { ZONES } from "./view-ops.js";


function FieldItem({ field, labels, zones, onAdd, onNote, onFilter, name, info, showInfo, stop }) {
    const { setNodeRef, isDragging, itemProps, handleProps } = useDragSource(`field:${field.name}`, { kind: "field", field: field.name, type: field.type, label: name });
    const item = useRef(/** @type {HTMLLIElement | null} */ (null));
    const menu = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const ref = (el) => {
        item.current = el;
        setNodeRef(el);
    };
    const typeLabel = labels.types[field.type] ?? field.type;
    // what a click does, said where it is said: the title and the accessible description
    const action = fieldAction(name, field.type, zones, labels);
    const describedBy = useId();
    // the one control of the list in the Tab order (FieldPanel), -1 for every other
    const slots = SLOTS.filter((x) => x !== "info" || (info && showInfo));
    const own = stop && slots.includes(stop) ? stop : stop ? "name" : null;
    const tab = (slot) => (own === slot ? 0 : -1);
    return (
        <li className={`pk-field${isDragging ? " pk-dragging" : ""}${zones.length ? " pk-placed" : ""}`} ref={ref} {...itemProps} data-field={field.name}>
            {/* the grip: dragged into a zone; a click opens the field's menu (Add to, Filter…) */}
            <span className="pk-handle" {...handleProps} tabIndex={tab("handle")} data-pk-slot="handle" aria-label={fill(labels.dragHandle, { field: name })} title={labels.dragIntoZone} onClick={() => menu.current?.click()}>
                <Icon name="grip" size={18} />
            </span>
            <span className={`pk-type pk-type-${field.type}`} title={typeLabel}>
                <Icon name={/** @type {any} */ (TYPE_ICON[field.type] ?? "text")} size={14} />
                <span className="pk-sr">{typeLabel}</span>
            </span>
            <button
                type="button"
                className="pk-field-name"
                tabIndex={tab("name")}
                data-pk-slot="name"
                onClick={() => {
                    if (action.kind) {
                        onAdd(field.name, action.zone);
                    } else {
                        onNote(fill(labels.alreadyIn, { field: name, zone: labels.zones[action.zone] }));
                    }
                }}
                // no title without an action: it would become the description
                title={action.description ? `${action.name} \u2013 ${action.description}` : undefined}
                aria-label={zones.length ? action.name : undefined}
                // a description of the field joins the action's (aria-describedby wins over aria-description)
                aria-description={info ? undefined : action.description || undefined}
                aria-describedby={info ? describedBy : undefined}
            >
                {/* two lines at most; the whole name on hover */}
                <span className="pk-field-title" title={name}>
                    {name}
                </span>
            </button>
            {info ? (
                <span id={describedBy} className="pk-sr">
                    {[action.description, info.description].filter(Boolean).join(". ")}
                </span>
            ) : null}
            {zones.length ? (
                <span className="pk-badges" aria-hidden="true">
                    {zones.map((z) => (
                        <span key={z} className={`pk-badge pk-badge-${z}`} aria-hidden="true" title={fill(labels.inZone, { zone: labels.zones[z] })}>
                            <Icon name={/** @type {any} */ (ZONE_ICON[z])} size={12} />
                        </span>
                    ))}
                </span>
            ) : null}
            {/* after the badges: the "i" of every described field stands in one column */}
            {info && showInfo ? <InfoButton info={info} name={name} labels={labels} tabIndex={tab("info")} slot="info" /> : null}
            <MenuButton label={fill(labels.fieldMenu, { field: name })} icon="more" className="pk-icon-btn pk-field-menu" testId={`field-menu-${field.name}`} buttonRef={menu} tabIndex={tab("menu")} slot="menu">
                {(close) => (
                    <>
                        {ZONES.map((zone) => (
                            <Option
                                key={zone}
                                inMenu
                                icon={zone === "values" ? "sigma" : zone === "filters" ? "filter" : zone}
                                onSelect={() => {
                                    close();
                                    onAdd(field.name, zone);
                                }}
                            >
                                {fill(labels.addTo, { zone: labels.zones[zone] })}
                            </Option>
                        ))}
                        {zones.length === 0 && onFilter ? (
                            <Option
                                inMenu
                                icon="filter"
                                onSelect={() => {
                                    close();
                                    onFilter(field.name, item.current);
                                }}
                                testId={`field-filter-${field.name}`}
                            >
                                {labels.filter}
                            </Option>
                        ) : null}
                    </>
                )}
            </MenuButton>
        </li>
    );
}

/**
 * @param {{ fields: Array<{ name: string, type: string }>, placed: Map<string, string[]>, labels: import("./labels.js").UiLabels,
 *   onAdd: (field: string, zone: string) => void, onNote: (text: string) => void, drawer: boolean, open: boolean, onClose: () => void,
 *   onFilter?: (field: string, anchor: HTMLElement | null) => void, showInfo?: boolean,
 *   nameOf: (field: string) => string, info: Map<string, import("./field-info.js").FieldInfo>, onSkip?: () => void,
 *   collapsed?: boolean, onCollapse?: (collapsed: boolean) => void }} props
 *   `nameOf`: a field's display name; `info`: the host's descriptions by lower-case field name;
 *   `onSkip`: the link past the list to the toolbar (not in the drawer, which the toolbar opens);
 *   `collapsed`, `onCollapse`: the list folded to a rail ("Fields" and a search button) beside the
 *   report, and the change of it (not in the drawer)
 */
export function FieldPanel({ fields, placed, labels, onAdd, onNote, onFilter, drawer, open, onClose, nameOf, info, showInfo = true, onSkip, collapsed = false, onCollapse }) {
    const [query, setQuery] = useState("");
    const active = useActiveDrag();
    const { setNodeRef, isOver } = useDropTarget("panel", { kind: "panel" });
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? fields.filter((f) => fieldMatches(f.name, q, info.get(f.name.toLowerCase()))) : fields;
    }, [fields, query, info]);
    const removing = active && active.kind !== "field";
    const modal = drawer && open;
    const el = useRef(/** @type {HTMLElement | null} */ (null));
    const { onKeyDown } = useModal(el, modal, onClose, "[data-pk-opener='fields']");
    const ref = (node) => {
        el.current = node;
        setNodeRef(node);
    };
    // where the focus goes once the list folded or opened by a button of its own: the control that
    // stands in that button's place ("rail", "collapse") or the search field ("search")
    const refocus = useRef(/** @type {string | null} */ (null));
    const rail = collapsed && !drawer;
    useEffect(() => {
        const to = refocus.current;
        refocus.current = null;
        if (to && el.current) {
            /** @type {HTMLElement | null} */ (el.current.querySelector(`[data-pk-focus="${to}"], [data-pk-focus="${to}"] input`))?.focus();
        }
    }, [rail]);
    const fold = (next, to) => {
        refocus.current = to;
        onCollapse?.(next);
    };
    // the field and control of the list that is in the Tab order (the last one focused)
    const [stop, setStop] = useState(/** @type {{ field: string, slot: string } | null} */ (null));
    const current = stop && shown.some((f) => f.name === stop.field) ? stop : shown.length ? { field: shown[0].name, slot: "name" } : null;
    const list = useRef(/** @type {HTMLUListElement | null} */ (null));
    const keysId = useId();
    const onFocus = useCallback((e) => {
        const control = /** @type {HTMLElement} */ (e.target).closest?.("[data-pk-slot]");
        const row = control?.closest("[data-field]");
        if (control && row && list.current?.contains(row)) {
            setStop({ field: row.getAttribute("data-field") ?? "", slot: control.getAttribute("data-pk-slot") ?? "name" });
        }
    }, []);
    const onListKey = (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        // keys of a menu or an "i" opened from a field (portals) and of a field being dragged are theirs
        if (active || !list.current || !list.current.contains(target)) {
            return;
        }
        const rows = /** @type {HTMLElement[]} */ ([...list.current.querySelectorAll(":scope > [data-field]")]);
        const row = target.closest("[data-field]");
        const at = { row: rows.indexOf(/** @type {HTMLElement} */ (row)), slot: target.closest("[data-pk-slot]")?.getAttribute("data-pk-slot") ?? "name" };
        if (at.row < 0) {
            return;
        }
        if (opensMenu(e)) {
            e.preventDefault();
            /** @type {HTMLElement | null} */ (rows[at.row].querySelector("[data-pk-slot='menu']"))?.click();
            return;
        }
        const slotsOf = (i) => [...rows[i].querySelectorAll("[data-pk-slot]")].map((n) => n.getAttribute("data-pk-slot") ?? "");
        const next = roveTarget(e.key, at, rows.length, slotsOf);
        if (next) {
            e.preventDefault();
            /** @type {HTMLElement | null} */ (rows[next.row].querySelector(`[data-pk-slot='${next.slot}']`))?.focus();
        }
    };
    if (rail) {
        // a chip dropped here leaves the report, as on the open list
        return (
            <aside className={`pk-panel pk-rail${removing ? " pk-removing" : ""}${isOver && removing ? " pk-over" : ""}`} ref={ref} aria-label={labels.panel} data-testid="field-rail">
                <button type="button" className="pk-rail-open" aria-expanded={false} aria-label={labels.expandFields} title={labels.expandFields} onClick={() => fold(false, "collapse")} data-pk-focus="rail" data-testid="expand-fields">
                    <span className="pk-rail-title" aria-hidden="true">
                        {labels.fields}
                    </span>
                </button>
                <button type="button" className="pk-icon-btn" aria-label={labels.searchFields} title={labels.searchFields} onClick={() => fold(false, "search")} data-testid="rail-search">
                    <Icon name="search" />
                </button>
            </aside>
        );
    }
    return (
        <aside
            className={`pk-panel${removing ? " pk-removing" : ""}${isOver && removing ? " pk-over" : ""}`}
            ref={ref}
            aria-label={labels.panel}
            role={modal ? "dialog" : undefined}
            aria-modal={modal ? true : undefined}
            onKeyDown={modal ? onKeyDown : undefined}
        >
            {onSkip && !drawer ? (
                <button type="button" className="pk-skip" onClick={onSkip} data-testid="skip-to-toolbar">
                    {labels.skipToToolbar}
                </button>
            ) : null}
            <div className="pk-panel-head">
                <h2 className="pk-panel-title">{labels.fields}</h2>
                {onCollapse && !drawer ? (
                    <button type="button" className="pk-icon-btn" aria-expanded={true} aria-label={labels.collapseFields} title={labels.collapseFields} onClick={() => fold(true, "rail")} data-pk-focus="collapse" data-testid="collapse-fields">
                        <span aria-hidden="true">«</span>
                    </button>
                ) : null}
                {drawer ? (
                    <button type="button" className="pk-icon-btn" onClick={onClose} aria-label={labels.hideFields} title={labels.hideFields}>
                        <Icon name="x" />
                    </button>
                ) : null}
            </div>
            <p className="pk-hint">{labels.fieldsHint}</p>
            <label className="pk-search" data-pk-focus="search">
                <Icon name="search" />
                <span className="pk-sr">{labels.searchFields}</span>
                <ClearInput type="search" value={query} placeholder={labels.searchFields} onChange={setQuery} clearLabel={labels.clearText} data-autofocus="" data-testid="field-search" />
            </label>
            {/* a list (role kept where list-style: none would drop it), named, with its keys as its description */}
            <ul className="pk-field-list" ref={list} role="list" aria-label={labels.fields} aria-describedby={keysId} onFocus={onFocus} onKeyDown={onListKey} data-testid="field-list">
                {shown.map((f) => (
                    <FieldItem
                        key={f.name}
                        field={f}
                        labels={labels}
                        zones={placed.get(f.name.toLowerCase()) ?? []}
                        onAdd={onAdd}
                        onNote={onNote}
                        onFilter={onFilter}
                        showInfo={showInfo}
                        stop={current && current.field === f.name ? current.slot : null}
                        name={nameOf(f.name)}
                        // only a description makes the "i": a label alone needs no button
                        info={info.get(f.name.toLowerCase())?.description ? info.get(f.name.toLowerCase()) : undefined}
                    />
                ))}
            </ul>
            <p id={keysId} hidden>
                {labels.fieldListKeys}
            </p>
            {shown.length === 0 ? <p className="pk-hint">{fields.length ? fill(labels.noFieldMatch, { query }) : labels.emptyFields}</p> : null}
            {removing ? (
                <div className="pk-remove-hint" aria-hidden="true">
                    <Icon name="trash" /> {labels.dropToRemove}
                </div>
            ) : null}
        </aside>
    );
}
