/*
 * What a cell of the table's header names, for its look and for screen readers: a field's name gets
 * its zone's icon and fill (a repeated value name the icon alone), and each header cell the scope of
 * the cells it heads. The empty corner gets a label that names the fields on each axis.
 */
import { fieldLabel } from "pivotkit-core";

/**
 * The field a header cell names, as the table draws it; null for an item, a total or the empty corner.
 * `zone`: "rows", "cols" or "values"; `fill`: the zone's fill (a value name repeated over the columns,
 * two or more values, has its icon alone); `scope`: a row field's name heads its column of row labels,
 * a column field's name (in the corner, left of its items) heads its row of items.
 * @param {{ values: unknown[] }} view
 * @param {{ kind: string, field?: string, valueIndex?: number }} cell
 * @param {boolean} last  the cell is in the header's last row
 * @returns {{ zone: "rows" | "cols" | "values", fill: boolean, scope: "col" | "row" } | null}
 */
export function headerField(view, cell, last) {
    if (cell.kind === "corner" && cell.field) {
        return last ? { zone: "rows", fill: true, scope: "col" } : { zone: "cols", fill: true, scope: "row" };
    }
    if (cell.kind === "colHeader" && cell.valueIndex !== undefined && last) {
        return { zone: "values", fill: view.values.length < 2, scope: "col" };
    }
    return null;
}

/**
 * The scope of a header cell: a field's name as headerField gives it, an item's or a value's header
 * heads its column.
 * @param {{ kind: string }} cell
 * @param {{ scope: "col" | "row" } | null} named  headerField's
 * @returns {"col" | "row" | undefined}
 */
export function scopeOf(cell, named) {
    if (named) {
        return named.scope;
    }
    return cell.kind === "colHeader" ? "col" : undefined;
}

/**
 * The words of the empty corner for a screen reader: the fields on each axis ("Rows: Team, Category;
 * Columns: Priority, Channel"), the zones' names as the report writes them.
 * @param {{ rows: string[], cols: string[] }} view
 * @param {{ zones: Record<string, string>, core: any }} labels
 * @returns {string}
 */
export function cornerLabel(view, labels) {
    return [["rows", view.rows], ["cols", view.cols]]
        .filter(([, fields]) => fields.length > 0)
        .map(([zone, fields]) => `${labels.zones[zone]}: ${fields.map((f) => fieldLabel(f, labels.core)).join(", ")}`)
        .join("; ");
}
