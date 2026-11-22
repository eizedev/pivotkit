/*
 * Placing fields: from the field list (a click, "Add to Filters"), by "+ Add" in a zone (zones.jsx,
 * add-menu.jsx), by drag and drop (dnd.jsx), and a table header's sort. A date placed on an axis or
 * in Filters is grouped by its span; a value takes the field's settings (fieldDefaults). A zone at
 * its limit takes no more.
 */

import { useCallback, useMemo, useState } from "react";
import { suggestDateUnit } from "pivotkit-core";
import { fill } from "./labels.js";
import { groupingName } from "./names.js";
import { addField, filterZoneFields, moveField, removeAt, same, setSort, zoneMax } from "./view-ops.js";

/**
 * @param {{ view: import("pivotkit-core").View, encoded: import("pivotkit-core").Encoded, labels: any, limits: object | undefined,
 *   locale: string, commit: import("./use-steps.js").Commit, fields: ReturnType<typeof import("./use-fields.js").useFields>,
 *   info: Map<string, any>, drawer: ReturnType<typeof import("./use-drawer.js").useDrawer>, root: React.RefObject<HTMLElement | null>,
 *   noteDrag: () => void }} report  noteDrag: tells the tips of a drag
 */
export function usePlacing({ view, encoded, labels, limits, locale, commit, fields, info, drawer, root, noteDrag }) {
    const { typeOf, defaultsOf, nameOf, placed } = fields;
    // the filter popover of a field on its way into Filters, or of a chip
    const [filterTarget, setFilterTarget] = useState(/** @type {{ field: string, anchor: HTMLElement, base?: object } | null} */ (null));
    const closeFilter = useCallback(() => setFilterTarget(null), []);
    /** How a field from the field list is placed: a date grouped by its span, a value with the field's settings. */
    const placeOptions = useCallback(
        (field, zone, index = undefined) => {
            const column = encoded.column(field);
            const unit = zone !== "values" && column && column.type === "date" && !column.derived ? suggestDateUnit(encoded, field) : null;
            return { index, type: typeOf(field), defaults: defaultsOf(field), dateUnit: unit, groupName: unit && column ? groupingName(nameOf(column.name), unit, labels) : undefined };
        },
        [encoded, typeOf, defaultsOf, labels, nameOf]
    );
    const addTo = useCallback(
        (field, zone, index = undefined) => {
            const options = placeOptions(field, zone, index);
            return commit(addField(view, field, zone, options), { step: "added", field: options.groupName ?? nameOf(field), zone });
        },
        [view, placeOptions, commit, nameOf]
    );
    /** What placing a field in a zone puts there: a date's grouping, else the field. */
    const placeName = useCallback((field, zone) => placeOptions(field, zone).groupName ?? field, [placeOptions]);
    /**
     * The filter of a field on its way into Filters: the name it gets there (a date grouped as it would
     * be placed) and a draft that puts it there (a field on Rows or Columns moved), so Apply places it
     * with the selection and Cancel changes nothing; none for a field in Filters already (its own filter).
     */
    const filterDraft = useCallback(
        (field) => {
            const options = placeOptions(field, "filters");
            const name = options.groupName ?? field;
            return { field: name, base: filterZoneFields(view).some((f) => same(f, name)) ? undefined : addField(view, field, "filters", options) };
        },
        [placeOptions, view]
    );
    const { narrow, closeIfNarrow } = drawer;
    /** The field list's "Add to Filters": the field's filter (filterDraft) in a popover at the field. */
    const filterField = useCallback(
        (field, anchor) => {
            const draft = filterDraft(field);
            // on a narrow report the field list is a drawer: it closes, the filter anchors to its button
            const opener = narrow ? /** @type {HTMLElement | null} */ (root.current?.querySelector("[data-pk-opener='fields']") ?? null) : null;
            closeIfNarrow();
            const target = opener ?? anchor;
            if (target) {
                setFilterTarget({ field: draft.field, anchor: target, base: draft.base });
            }
        },
        [filterDraft, narrow, closeIfNarrow, root]
    );
    // a zone at its limit (`limits`) takes no more: its picks are off, with the reason
    const zoneFullText = useCallback(
        (zone, count) => {
            const max = zoneMax(zone, limits);
            return max !== null && count >= max ? fill(labels.zoneFull, { zone: labels.zones[zone], max: max.toLocaleString(locale) }) : null;
        },
        [limits, labels, locale]
    );
    // what "+ Add" in each zone needs (zones.jsx, add-menu.jsx)
    const adding = useMemo(
        () => ({ fields: /** @type {import("pivotkit-core").SchemaField[]} */ (fields.fields), placed, nameOf, info, placeName, onAdd: addTo, filterDraft, fullText: zoneFullText }),
        [fields.fields, placed, nameOf, info, placeName, addTo, filterDraft, zoneFullText]
    );
    const onDrop = useCallback(
        (src, target) => {
            noteDrag();
            if (target.zone === "panel") {
                if (src.kind !== "field") {
                    commit(removeAt(view, src.zone, src.index), { step: "removed", removed: true, field: src.label ?? src.field });
                }
                return;
            }
            if (src.kind === "field") {
                addTo(src.field, target.zone, target.index);
            } else {
                const zone = /** @type {any} */ (target.zone);
                const note = src.zone !== zone ? { step: "moved", field: src.label ?? src.field, zone } : { step: "reordered", zone };
                // into Values: a new value, counted or summed by the field's settings as one from the field list
                commit(moveField(view, src.zone, src.index, zone, target.index, { type: typeOf(src.field), defaults: zone === "values" && src.field ? defaultsOf(src.field) : undefined }), note);
            }
        },
        [view, typeOf, commit, addTo, defaultsOf, noteDrag]
    );
    /** A click on a table header: the field's new sort, a step Undo takes back as the chip menu's. */
    const sortFromHeader = useCallback((field, sort) => commit(setSort(view, field, sort), { step: "sort", field: nameOf(field) }), [view, commit, nameOf]);
    return { addTo, filterField, filterTarget, closeFilter, adding, onDrop, sortFromHeader };
}
