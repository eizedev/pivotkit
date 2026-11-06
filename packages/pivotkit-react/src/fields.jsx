/*
 * The field list: every column of the data with its type, searchable, each one draggable into a zone,
 * with a quick add (click: numbers go to Values, everything else to Rows) and a menu for every zone.
 * Dropping a chip here removes it from the report. On a narrow report it is a modal drawer.
 */

import React, { useMemo, useRef, useState } from "react";
import { useModal } from "./dom.js";
import { useActiveDrag, useDragSource, useDropTarget } from "./dnd.jsx";
import { Icon, TYPE_ICON } from "./icons.jsx";
import { fill } from "./labels.js";
import { fieldAction } from "./names.js";
import { MenuButton, Option } from "./popover.jsx";
import { ZONES } from "./view-ops.js";

const ZONE_ICON = { rows: "rows", cols: "cols", values: "sigma", filters: "filter" };

function FieldItem({ field, labels, zones, onAdd }) {
    const { setNodeRef, isDragging, itemProps, handleProps } = useDragSource(`field:${field.name}`, { kind: "field", field: field.name, type: field.type, label: field.name });
    const typeLabel = labels.types[field.type] ?? field.type;
    // what a click does, said where it is said: the title and the accessible description
    const action = fieldAction(field.name, field.type, zones, labels);
    return (
        <li className={`pk-field${isDragging ? " pk-dragging" : ""}${zones.length ? " pk-placed" : ""}`} ref={setNodeRef} {...itemProps} data-field={field.name}>
            <span className="pk-handle" {...handleProps} aria-label={fill(labels.dragHandle, { field: field.name })} title={labels.fieldsHint}>
                <Icon name="grip" size={18} />
            </span>
            <span className={`pk-type pk-type-${field.type}`} title={typeLabel}>
                <Icon name={/** @type {any} */ (TYPE_ICON[field.type] ?? "text")} size={14} />
                <span className="pk-sr">{typeLabel}</span>
            </span>
            <button
                type="button"
                className="pk-field-name"
                onClick={() => {
                    if (action.kind) {
                        onAdd(field.name, action.zone);
                    }
                }}
                title={action.description ? `${action.name} \u2013 ${action.description}` : action.name}
                aria-label={zones.length ? action.name : undefined}
                aria-description={action.description || undefined}
            >
                {field.name}
            </button>
            {zones.length ? (
                <span className="pk-badges" aria-hidden="true">
                    {zones.map((z) => (
                        <span key={z} className={`pk-badge pk-badge-${z}`} aria-hidden="true" title={fill(labels.inZone, { zone: labels.zones[z] })}>
                            <Icon name={/** @type {any} */ (ZONE_ICON[z])} size={12} />
                        </span>
                    ))}
                </span>
            ) : null}
            <MenuButton label={fill(labels.fieldMenu, { field: field.name })} icon="more" className="pk-icon-btn pk-field-menu" testId={`field-menu-${field.name}`}>
                {(close) =>
                    ZONES.map((zone) => (
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
                    ))
                }
            </MenuButton>
        </li>
    );
}

/**
 * @param {{ fields: Array<{ name: string, type: string }>, placed: Map<string, string[]>, labels: import("./labels.js").UiLabels,
 *   onAdd: (field: string, zone: string) => void, drawer: boolean, open: boolean, onClose: () => void }} props
 */
export function FieldPanel({ fields, placed, labels, onAdd, drawer, open, onClose }) {
    const [query, setQuery] = useState("");
    const active = useActiveDrag();
    const { setNodeRef, isOver } = useDropTarget("panel", { kind: "panel" });
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? fields.filter((f) => f.name.toLowerCase().includes(q)) : fields;
    }, [fields, query]);
    const removing = active && active.kind !== "field";
    const modal = drawer && open;
    const el = useRef(/** @type {HTMLElement | null} */ (null));
    const { onKeyDown } = useModal(el, modal, onClose, "[data-pk-opener='fields']");
    const ref = (node) => {
        el.current = node;
        setNodeRef(node);
    };
    return (
        <aside
            className={`pk-panel${removing ? " pk-removing" : ""}${isOver && removing ? " pk-over" : ""}`}
            ref={ref}
            aria-label={labels.panel}
            role={modal ? "dialog" : undefined}
            aria-modal={modal ? true : undefined}
            onKeyDown={modal ? onKeyDown : undefined}
        >
            <div className="pk-panel-head">
                <h2 className="pk-panel-title">{labels.fields}</h2>
                {drawer ? (
                    <button type="button" className="pk-icon-btn" onClick={onClose} aria-label={labels.hideFields} title={labels.hideFields}>
                        <Icon name="x" />
                    </button>
                ) : null}
            </div>
            <p className="pk-hint">{labels.fieldsHint}</p>
            <label className="pk-search">
                <Icon name="search" />
                <span className="pk-sr">{labels.searchFields}</span>
                <input type="search" value={query} placeholder={labels.searchFields} onChange={(e) => setQuery(e.target.value)} data-autofocus="" />
            </label>
            <ul className="pk-field-list">
                {shown.map((f) => (
                    <FieldItem key={f.name} field={f} labels={labels} zones={placed.get(f.name.toLowerCase()) ?? []} onAdd={onAdd} />
                ))}
            </ul>
            {shown.length === 0 ? <p className="pk-hint">{fields.length ? fill(labels.noFieldMatch, { query }) : labels.emptyFields}</p> : null}
            {removing ? (
                <div className="pk-remove-hint" aria-hidden="true">
                    <Icon name="trash" /> {labels.dropToRemove}
                </div>
            ) : null}
        </aside>
    );
}
