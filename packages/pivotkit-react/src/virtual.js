/*
 * Virtual scrolling of the table body: only the rows in view (plus some overscan) are rendered,
 * between two spacer rows that keep the scroll height. Rows have one fixed height. Merged row labels
 * that start above the window are drawn again in its first row, cut to the window.
 */

/** Body rows from which the table body is virtualized. */
export const VIRTUAL_FROM = 300;

/**
 * The window of rows to render.
 * @param {{ count: number, scrollTop: number, viewport: number, rowHeight: number, overscan?: number }} p
 * @returns {{ start: number, end: number, padTop: number, padBottom: number }}
 */
export function windowOf({ count, scrollTop, viewport, rowHeight, overscan = 12 }) {
    const h = Math.max(1, rowHeight);
    const first = Math.floor(Math.max(0, scrollTop) / h);
    const start = Math.max(0, Math.min(count, first - overscan));
    const end = Math.max(start, Math.min(count, first + Math.ceil(Math.max(0, viewport) / h) + overscan));
    return { start, end, padTop: start * h, padBottom: (count - end) * h };
}

/**
 * The cells of the body rows start..end-1 of a grid, with row spans cut to the window.
 * @param {import("pivotkit-core").Grid} grid
 * @param {number} start  body row index (0 is the first row after the header)
 * @param {number} end    exclusive
 * @returns {Array<{ index: number, cells: Array<{ cell: import("pivotkit-core").GridCell, col: number, rowSpan: number, colSpan: number }> }>}
 */
export function sliceRows(grid, start, end) {
    const h = grid.headerRows;
    const out = [];
    for (let r = start; r < end; r++) {
        const row = grid.rows[h + r];
        const cells = [];
        row.forEach((cell, col) => {
            if (cell) {
                cells.push({ cell, col, rowSpan: Math.min(cell.rowSpan ?? 1, end - r), colSpan: cell.colSpan ?? 1 });
            }
        });
        out.push({ index: r, cells });
    }
    if (start > 0 && out.length > 0) {
        // label cells merged from a row above the window: drawn in the window's first row
        const first = out[0].cells;
        for (const m of grid.merges) {
            const top = m.row - h;
            if (top >= 0 && top < start && top + m.rowSpan > start) {
                const cell = grid.rows[m.row][m.col];
                first.push({ cell, col: m.col, rowSpan: Math.min(top + m.rowSpan, end) - start, colSpan: m.colSpan });
            }
        }
        first.sort((a, b) => a.col - b.col);
    }
    return out;
}

/**
 * The whole row label of body row `r`, every level joined with " / " ("Linux / Ubuntu"): in the
 * virtual table a label is cut to one line, and this is how a focused value or a tapped label shows it
 * in full. A level merged down from a row above is read there; the empty rest of a label spanning
 * sideways is skipped.
 * @param {import("pivotkit-core").Grid} grid
 * @param {number} r  body row index
 */
export function rowLabelOf(grid, r) {
    const row = grid.headerRows + r;
    const texts = [];
    for (let c = 0; c < grid.rowHeaderColumns; c++) {
        const own = grid.rows[row]?.[c];
        const merge = own ? null : grid.merges.find((m) => m.row <= row && row < m.row + m.rowSpan && m.col <= c && c < m.col + m.colSpan);
        const cell = own ?? (merge && merge.col === c ? grid.rows[merge.row][merge.col] : null);
        if (cell && cell.text) {
            texts.push(cell.text);
        }
    }
    return texts.join(" / ");
}

/**
 * The longest row labels of a column by their number of characters, at most `n`: what a virtual table
 * measures for the column's width once, instead of the rows it happens to show (they change as it
 * scrolls). With each label whether it has a group's toggle in front of it and whether it is a total's
 * (drawn bolder). A label spanning several columns (a total) is left out: it widens no single column.
 * @param {import("pivotkit-core").Grid} grid
 * @param {number} col  a row label column (below grid.rowHeaderColumns)
 * @param {number} n
 * @returns {Array<{ text: string, toggle: boolean, total: boolean }>}
 */
export function longestLabels(grid, col, n) {
    /** @type {Array<{ text: string, toggle: boolean, total: boolean }>} */
    const out = [];
    if (n < 1) {
        return out;
    }
    for (let r = grid.headerRows; r < grid.rows.length; r++) {
        const cell = grid.rows[r][col];
        if (!cell || cell.kind !== "rowHeader" || !cell.text || (cell.colSpan ?? 1) > 1) {
            continue;
        }
        // kept sorted, longest first: a label shorter than the n-th is passed by
        if (out.length === n && cell.text.length <= out[n - 1].text.length) {
            continue;
        }
        const entry = { text: cell.text, toggle: Boolean(cell.toggle), total: Boolean(cell.total) };
        let at = out.length;
        while (at > 0 && out[at - 1].text.length < entry.text.length) {
            at--;
        }
        out.splice(at, 0, entry);
        if (out.length > n) {
            out.pop();
        }
    }
    return out;
}
