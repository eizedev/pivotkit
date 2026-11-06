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
