/*
 * The pivot table from pivotkit-core's grid: sticky header rows and row labels, groups that expand
 * and collapse, subtotal and total rows, subtotal columns with an edge before them and a title that
 * says what they add up, colour scales and data bars, a click (or Enter) on a value
 * for its rows (a cell with no rows behind it is not clickable; the arrow keys still stop on it). Header cells with a field name or a value name can be dragged into a zone with the
 * mouse; the same moves are in the chips' menus. From VIRTUAL_FROM body rows on only the visible rows
 * are rendered (virtual.js). The table keeps the focus where it was when a group is expanded or
 * collapsed: on the same toggle. A header of a field the host describes (fieldDefaults) carries the
 * description as its tooltip and accessible description. The text of a row field's name and of a
 * value's name is a button that sorts (view-ops.js: headerSortTarget); the cell's edges stay free.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDragSource } from "./dnd.jsx";
import { useIsoLayoutEffect } from "./iso.js";
import { Icon } from "./icons.jsx";
import { fieldLabel } from "pivotkit-core";
import { fill } from "./labels.js";
import { refLabel, sortText } from "./names.js";
import { headerSortState, headerSortTarget, nextHeaderSort } from "./view-ops.js";
import { VIRTUAL_FROM, longestLabels, rowLabelOf, sliceRows, windowOf } from "./virtual.js";
import { commonCap } from "./label-room.js";

const totalClass = (t) => (t === 2 ? " pk-grand" : t === 1 ? " pk-sub" : "");

/** The labels of a row label column a virtual table measures for its width: the longest by characters. */
const MEASURED_LABELS = 50;
/** The widest a row label column of a virtual table gets, in em: a longer label ends in "…" (its title is whole). */
const LABEL_MAX_EM = 28;

/** Pixels added to the widest label: the layout rounds, a font's hinting differs by a pixel. */
const LABEL_SLACK = 2;

/**
 * The width of each row label column of a virtual table, in px: its longest labels (by characters)
 * measured in the table itself (a hidden span next to a label, so its font, weight, figures and size
 * are the table's; a total's label bold, as drawn), with a group's toggle where a label has one, at
 * most LABEL_MAX_EM. Measured per grid and again when the font changes (see the effect), so the
 * column keeps its width while the rows on screen change (#110, #121).
 * @param {import("pivotkit-core").Grid} grid
 * @param {HTMLTableElement} table
 * @returns {number[] | null}
 */
function labelWidths(grid, table) {
    const text = table.querySelector("tbody th.pk-rowHeader .pk-th-text");
    const content = text?.parentElement;
    if (!text || !content) {
        return null;
    }
    const probe = table.ownerDocument.createElement("span");
    probe.className = "pk-th-text";
    probe.setAttribute("aria-hidden", "true");
    Object.assign(probe.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre", width: "auto", minWidth: "0", maxWidth: "none", overflow: "visible" });
    content.append(probe);
    try {
        const widthOf = (/** @type {{ text: string, total: boolean }} */ l) => {
            probe.style.fontWeight = l.total ? "var(--pk-weight-bold)" : "";
            probe.textContent = l.text;
            return probe.getBoundingClientRect().width;
        };
        const em = parseFloat(getComputedStyle(text).fontSize) || 14;
        const toggle = table.querySelector(".pk-toggle");
        const gap = parseFloat(getComputedStyle(content).columnGap) || 0;
        const toggleWidth = (toggle ? toggle.getBoundingClientRect().width : em * 1.7) + gap;
        const widths = [];
        for (let c = 0; c < grid.rowHeaderColumns; c++) {
            const most = Math.max(0, ...longestLabels(grid, c, MEASURED_LABELS).map((l) => widthOf(l) + (l.toggle ? toggleWidth : 0)));
            widths.push(Math.min(Math.ceil(most) + LABEL_SLACK, LABEL_MAX_EM * em));
        }
        return widths;
    } finally {
        probe.remove();
    }
}

/** The width of an element's box, in px. */
const widthOf = (/** @type {Element} */ el) => el.getBoundingClientRect().width;

/**
 * How much room the row labels, the field names and the value names take (#584, styles.css). The
 * first that keeps the table inside its box wins:
 * - "natural": each at its natural width, on one line;
 * - "share": the table as wide as its box, every label and name wraps between words as needed;
 * - no attribute: the caps, with --pk-row-room the widest a row label may be for the table to fit
 *   beside its value columns.
 * Each step is measured from the same start, so the outcome never depends on the last one: the
 * states cannot take turns. Set on the element, not rendered, before the first paint. The box keeps
 * its scroll bar's gutter (styles.css), so its width does not change with the state.
 * @param {HTMLTableElement} table
 * @param {HTMLElement} box the table's scroll box
 * @param {number} columns the row label columns
 */
function fitLabels(table, box, columns) {
    if (box.clientWidth === 0) {
        return;
    }
    const over = () => box.scrollWidth - box.clientWidth;
    table.setAttribute("data-pk-labels", "natural");
    table.style.removeProperty("--pk-row-room");
    const head = table.tHead ? table.tHead.rows : [];
    const last = head[head.length - 1];
    const overflow = over();
    if (overflow <= 0 || !last) {
        return;
    }
    // each label column's natural width, without the cell's padding, border and drag grip
    const cells = [...last.cells].slice(0, columns);
    const extras = cells.map((cell) => {
        const s = getComputedStyle(cell);
        const grip = cell.querySelector(":scope > .pk-th-grip");
        return parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth) + (grip ? widthOf(grip) + parseFloat(getComputedStyle(grip).marginLeft) : 0);
    });
    const widths = cells.map((cell, c) => widthOf(cell) - extras[c]);
    // wrapping can give back at most the width of what may wrap: the value names, and the row labels
    // unless a virtual table fixes them. Beyond that the layout pass of "share" is spared.
    const names = [...last.querySelectorAll("th.pk-colHeader .pk-th-content")].reduce((sum, el) => sum + widthOf(el), 0);
    const pliable = names + (table.classList.contains("pk-virtual") ? 0 : widths.reduce((a, b) => a + b, 0));
    if (overflow < pliable) {
        table.setAttribute("data-pk-labels", "share");
        if (over() <= 0) {
            return;
        }
    }
    // the caps; the value columns' width with their names capped too: what they leave the labels
    table.removeAttribute("data-pk-labels");
    const values = widthOf(table) - cells.reduce((sum, cell) => sum + widthOf(cell), 0);
    const room = commonCap(widths, box.clientWidth - values - extras.reduce((a, b) => a + b, 0));
    // Infinity: every label fits beside the capped value names at its natural width. That width, not
    // rounded, makes the table fit by construction: the labels take at most the room they were given
    table.style.setProperty("--pk-row-room", `${Number.isFinite(room) ? Math.floor(room) : Math.max(0, ...widths)}px`);
}

/** What the labels' width depends on besides the grid: the table's font and size. */
const fontOf = (/** @type {HTMLTableElement} */ table) => {
    const s = getComputedStyle(table);
    return `${s.fontFamily}|${s.fontSize}|${s.fontWeight}`;
};

/** The middle of the theme's colour scale: the host's --pk-scale-mid, else halfway from low to high. */
const SCALE_MID = "var(--pk-scale-mid, color-mix(in srgb, var(--pk-scale-low), var(--pk-scale-high)))";

/**
 * Inline style of a value cell with conditional formatting: custom properties the stylesheet reads.
 * @returns {any}
 */
function conditionalStyle(cell) {
    const s = cell.style;
    if (!s) {
        return undefined;
    }
    if (s.scale !== undefined && s.color) {
        return { "--pk-cell-bg": s.color };
    }
    if (s.scale !== undefined) {
        // a scale without colours of its own: the theme's low and high colours (--pk-scale-*), through
        // a middle colour where the host sets --pk-scale-mid (else halfway between them)
        const t = Math.max(0, Math.min(1, s.scale));
        const [from, to, part] = t < 0.5 ? ["var(--pk-scale-low)", SCALE_MID, t * 2] : [SCALE_MID, "var(--pk-scale-high)", (t - 0.5) * 2];
        return { "--pk-cell-bg": `color-mix(in srgb, ${to} ${Math.round(part * 100)}%, ${from})` };
    }
    if (s.bar !== undefined) {
        return { "--pk-bar": `${Math.round(s.bar * 1000) / 10}%`, ...(s.color ? { "--pk-bar-color": s.color } : {}) };
    }
    return undefined;
}

/** A value cell with rows behind it: a click or Enter opens them. */
const drillable = (cell) => cell.valueIndex !== undefined && cell.hasRows !== false;

/** The first value cell of the body: row (from 0) and column, or null. */
function firstValueCell(grid) {
    for (let r = 0; r < grid.rows.length - grid.headerRows; r++) {
        const c = grid.rows[grid.headerRows + r].findIndex((cell) => cell && cell.kind === "value" && cell.valueIndex !== undefined);
        if (c !== -1) {
            return { r, c };
        }
    }
    return null;
}

/** A header cell that can be dragged into a zone: a field name in the corner or a value name. */
function DraggableHeader({ cell, source, children, className, style, colSpan, rowSpan, scope, description, tooltip = true, sort }) {
    const { setNodeRef, isDragging, itemProps } = useDragSource(`table:${source.zone}:${source.index}:${source.field ?? ""}`, source);
    return (
        <th ref={setNodeRef} {...itemProps} className={`${className} pk-draggable${isDragging ? " pk-dragging" : ""}`} style={style} colSpan={colSpan} rowSpan={rowSpan} scope={scope} data-kind={cell.kind} title={tooltip ? description : undefined} aria-description={description} aria-sort={sort ?? undefined}>
            {children}
            <Icon name="grip" size={12} className="pk-th-grip" />
        </th>
    );
}

/** The key of a toggle, to find it again after the table changed. */
const toggleKey = (axis, path) => `${axis}:${JSON.stringify(path)}`;

function Toggle({ toggle, text, labels, onToggle }) {
    const name = fill(toggle.collapsed ? labels.expand : labels.collapse, { label: text });
    return (
        <button type="button" className={`pk-toggle${toggle.collapsed ? "" : " pk-open"}`} aria-expanded={!toggle.collapsed} aria-label={name} title={name} data-pk-toggle={toggleKey(toggle.axis, toggle.path)} onClick={() => onToggle(toggle.axis, toggle.path)}>
            <Icon name="chevronRight" size={16} />
        </button>
    );
}

/**
 * @param {{ grid: import("pivotkit-core").Grid, view: any, labels: import("./labels.js").UiLabels,
 *   onToggle: (axis: string, path: any[]) => void, onCell: (cell: object) => void, version: unknown, hintId?: string,
 *   onRowLabel?: (label: string | null) => void, infoOf?: (field: string) => { description?: string } | undefined, showInfo?: boolean,
 *   typeOf?: (field: string) => string | undefined, hostOrdered?: (field: string) => boolean, onSort?: (field: string, sort: object | null) => void }} props
 *   `onRowLabel`: the whole label of the row of a focused value or a tapped row label while the table
 *   is virtual (its labels are cut to one line); null when there is none to show; `infoOf`: the host's
 *   description of a field; `showInfo` false: no tooltip for it (the accessible description stays);
 *   `onSort`: a header was clicked, the field's new sort entry (setSort's argument); `typeOf` the
 *   column type of a field (of its source for a grouping), `hostOrdered` whether the host gives the field an order
 */
export function PivotTable({ grid, view, labels, onToggle: toggleGroup, onCell, version, hintId, onRowLabel, infoOf, showInfo = true, typeOf = () => undefined, hostOrdered = () => false, onSort }) {
    const wrap = useRef(/** @type {HTMLDivElement | null} */ (null));
    const table = useRef(/** @type {HTMLTableElement | null} */ (null));
    const bodyCount = grid.rows.length - grid.headerRows;
    const virtual = bodyCount >= VIRTUAL_FROM;
    const [scroll, setScroll] = useState({ top: 0, height: 600 });
    const [rowHeight, setRowHeight] = useState(34);
    const [lefts, setLefts] = useState(/** @type {number[]} */ ([]));
    const [tops, setTops] = useState(/** @type {number[]} */ ([]));
    const [headHeight, setHeadHeight] = useState(0);
    // the width of the table's box, measured: the sticky offsets of the label columns follow it
    const [width, setWidth] = useState(0);
    const [active, setActive] = useState(/** @type {{ r: number, c: number } | null} */ (null));
    // a virtual table's row label columns: one width each, measured once per grid (labelWidths)
    const [labelsWide, setLabelsWide] = useState(/** @type {{ grid: unknown, font: string, fonts: number, widths: number[] } | null} */ (null));
    // web fonts that finished loading (document.fonts): the labels are measured again
    const [fontsLoaded, setFontsLoaded] = useState(0);
    // the table's font (fontOf), read when it resizes; and what fitLabels last measured for
    const [font, setFont] = useState("");
    const fitted = useRef(/** @type {unknown[]} */ ([]));
    const fixedWidths = virtual && labelsWide?.grid === grid ? labelsWide.widths : null;
    // the cell the arrow keys moved to, until a render with it as the active cell has focused it: the
    // effect runs after every render, also one that commits before the move's (a scroll), whose
    // active cell is still the one before
    const focusNext = useRef(/** @type {{ r: number, c: number } | null} */ (null));
    // what a screen reader hears after a header sorted the rows
    const [sortNote, setSortNote] = useState("");
    const focusToggle = useRef(/** @type {string | null} */ (null));
    const onToggle = useCallback(
        (axis, path) => {
            focusToggle.current = toggleKey(axis, path);
            toggleGroup(axis, path);
        },
        [toggleGroup]
    );

    // a virtual table measures its row labels before the first paint of a grid, and again when the
    // table's font or size changed (a host's --pk-font-size, a theme) or a web font arrived; never
    // because other rows came into view
    useIsoLayoutEffect(() => {
        const t = table.current;
        if (!virtual || !t) {
            return;
        }
        const font = fontOf(t);
        if (labelsWide?.grid !== grid || labelsWide.font !== font || labelsWide.fonts !== fontsLoaded) {
            const widths = labelWidths(grid, t);
            if (widths) {
                setLabelsWide({ grid, font, fonts: fontsLoaded, widths });
            }
        }
    });
    useEffect(() => {
        const fonts = table.current?.ownerDocument.fonts;
        if (!fonts) {
            return undefined;
        }
        let live = true;
        const loaded = () => live && setFontsLoaded((n) => n + 1);
        fonts.addEventListener?.("loadingdone", loaded);
        // a font still loading when the table was first measured
        if (fonts.status === "loading") {
            fonts.ready.then(loaded, () => undefined);
        }
        return () => {
            live = false;
            fonts.removeEventListener?.("loadingdone", loaded);
        };
    }, []);

    // the measured height of a body row and the widths of the row label columns (sticky offsets)
    useIsoLayoutEffect(() => {
        const t = table.current;
        if (!t) {
            return;
        }
        // first: the labels' width decides the heights and widths measured below. Once for each
        // table, grid, box width, font and fixed label widths: a new view alone does not change it
        const key = [t, grid, width, font, fontsLoaded, fixedWidths];
        if (wrap.current && !key.every((v, i) => v === fitted.current[i])) {
            fitted.current = key;
            fitLabels(t, wrap.current, grid.rowHeaderColumns);
        }
        const row = t.tBodies[0]?.querySelector("tr[data-r]");
        if (row && row.getBoundingClientRect().height > 0) {
            setRowHeight(row.getBoundingClientRect().height);
        }
        const headRows = t.tHead ? [...t.tHead.rows] : [];
        setHeadHeight(t.tHead ? t.tHead.offsetHeight : 0);
        // fractional: offsetTop rounds, and a row 36.8 px high left a 0.2 px gap under the first header
        // row through which the body showed while it scrolled (#9)
        const top = t.tHead ? t.tHead.getBoundingClientRect().top : 0;
        const ys = headRows.map((tr) => tr.getBoundingClientRect().top - top);
        setTops((old) => (old.length === ys.length && old.every((v, i) => Math.abs(v - ys[i]) < 0.01) ? old : ys));
        const last = headRows[headRows.length - 1];
        if (last) {
            const xs = [];
            let x = 0;
            for (let c = 0; c < grid.rowHeaderColumns && c < last.cells.length; c++) {
                xs.push(x);
                x += last.cells[c].getBoundingClientRect().width;
            }
            setLefts((old) => (old.length === xs.length && old.every((v, i) => Math.abs(v - xs[i]) < 0.5) ? old : xs));
        }
        // width and fonts: whether the table fits, and the labels' cap, follow the report and its font
    }, [grid, version, width, font, fixedWidths, fontsLoaded]);

    useEffect(() => {
        const el = wrap.current;
        if (!el) {
            return undefined;
        }
        const update = () => {
            setScroll({ top: el.scrollTop, height: el.clientHeight });
            setWidth(el.clientWidth);
            // a host's --pk-font-size or a theme resizes the table alone: its labels fit again
            if (table.current) {
                setFont(fontOf(table.current));
            }
        };
        update();
        const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
        ro?.observe(el);
        // the table itself too: a new font or size changes it, and its labels are measured again
        if (table.current) {
            ro?.observe(table.current);
        }
        return () => ro?.disconnect();
    }, []);

    const head = headHeight || rowHeight * grid.headerRows;
    const win = virtual ? windowOf({ count: bodyCount, scrollTop: scroll.top - head, viewport: scroll.height, rowHeight }) : { start: 0, end: bodyCount, padTop: 0, padBottom: 0 };
    const rows = useMemo(() => sliceRows(grid, win.start, win.end), [grid, win.start, win.end]);

    // the body row the status line names, while it does
    // (with its grid: a row of another grid names nothing)
    const [shownRow, setLabelRow] = useState(/** @type {{ r: number, span: number, grid: unknown } | null} */ (null));
    const labelRow = shownRow && shownRow.grid === grid ? shownRow : null;
    // a label shown for another grid (or a table no longer virtual) would name the wrong row
    useEffect(() => {
        onRowLabel?.(null);
    }, [grid, onRowLabel]);
    const showRowLabel = virtual && onRowLabel
        ? (/** @type {number} */ r, span = 1) => {
              setLabelRow({ r, span, grid });
              onRowLabel(rowLabelOf(grid, r));
          }
        : undefined;
    const clearRowLabel = () => {
        if (labelRow !== null) {
            setLabelRow(null);
            onRowLabel?.(null);
        }
    };
    // the label goes when the focus leaves the table, or when its row is scrolled out of view
    const onScroll = (/** @type {React.UIEvent<HTMLDivElement>} */ e) => {
        const box = e.currentTarget;
        setScroll({ top: box.scrollTop, height: box.clientHeight });
        const row = labelRow;
        if (row !== null) {
            // the rows it names (a merged label: all of them), against the box under the sticky header
            const y = head + row.r * rowHeight - box.scrollTop;
            if (y + row.span * rowHeight <= head || y >= box.clientHeight) {
                clearRowLabel();
            }
        }
    };
    const onBlur = (/** @type {React.FocusEvent<HTMLDivElement>} */ e) => {
        if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
            clearRowLabel();
        }
    };

    // the first value cell takes the focus stop of the table
    const firstValue = useMemo(() => firstValueCell(grid), [grid]);
    const current = active && active.r < bodyCount && grid.rows[grid.headerRows + active.r]?.[active.c]?.kind === "value" ? active : firstValue;

    const move = (dr, dc) => {
        if (!current) {
            return;
        }
        let { r, c } = current;
        const valueAt = (rr, cc) => {
            const cell = grid.rows[grid.headerRows + rr]?.[cc];
            return cell && cell.kind === "value" && cell.valueIndex !== undefined;
        };
        for (let step = 0; step < Math.max(bodyCount, grid.columnCount); step++) {
            r += dr;
            c += dc;
            if (r < 0 || r >= bodyCount || c < grid.rowHeaderColumns || c >= grid.columnCount) {
                return;
            }
            if (valueAt(r, c)) {
                break;
            }
        }
        if (!valueAt(r, c)) {
            return;
        }
        focusNext.current = { r, c };
        setActive({ r, c });
        const el = wrap.current;
        if (virtual && el) {
            const y = (grid.headerRows + r) * rowHeight;
            if (y < el.scrollTop + rowHeight * grid.headerRows || y + rowHeight > el.scrollTop + el.clientHeight) {
                el.scrollTop = Math.max(0, y - el.clientHeight / 2);
            }
        }
    };

    useEffect(() => {
        const key = focusToggle.current;
        if (key && table.current) {
            focusToggle.current = null;
            const button = [...table.current.querySelectorAll("button[data-pk-toggle]")].find((b) => b.getAttribute("data-pk-toggle") === key);
            /** @type {HTMLElement | undefined} */ (button)?.focus({ preventScroll: true });
        }
        const next = focusNext.current;
        if (next && current && current.r === next.r && current.c === next.c) {
            // a virtual table may not show the row yet: the request waits for a render that does
            const td = /** @type {HTMLElement | null} */ (table.current?.querySelector(`td[data-r="${current.r}"][data-c="${current.c}"]`));
            if (td) {
                focusNext.current = null;
                td.focus({ preventScroll: false });
            }
        }
    });

    const onKeyDown = (e) => {
        const keys = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
        if (keys[e.key] && e.target instanceof HTMLTableCellElement) {
            e.preventDefault();
            const [dr, dc] = keys[e.key];
            move(dr, dc);
        } else if ((e.key === "Enter" || e.key === " ") && e.target instanceof HTMLTableCellElement && current) {
            e.preventDefault();
            const cell = grid.rows[grid.headerRows + current.r][current.c];
            if (cell && drillable(cell)) {
                onCell(cell);
            }
        }
    };

    /** The text of a sortable header: a button with the arrow of its order (null: not sortable). */
    const sortButton = (cell, target) => {
        const state = headerSortState(view, target);
        const next = nextHeaderSort(view, target, hostOrdered(target.field));
        const field = fieldLabel(target.field, labels.core);
        const column = target.column ? columnNames.get(JSON.stringify(target.column)) : undefined;
        // a sort in words; no entry is the field's default order
        const words = (s) => sortText(view, s ?? { by: hostOrdered(target.field) ? "custom" : "label", order: "asc" }, labels, s?.column ? columnNames.get(JSON.stringify(s.column)) : undefined);
        // a header keeps its width: its arrow sits in the cell's padding before the text (styles.css
        // .pk-th-sort-aside), so twelve months do not widen the table (#70) and a word that fits the
        // header is not broken for the arrow's room ("Categor" over "y" on a phone)
        // the arrow of the order in use, else of the one a click gives (shown on hover and focus)
        const down = state.chosen ? state.order === "descending" : next?.order === "desc";
        const click = () => {
            onSort?.(target.field, next);
            setSortNote(fill(labels.headerSorted, { field, order: words(next) }));
        };
        return {
            // aria-sort only on the header whose sort was chosen (a custom order too): one at a time (WAI-ARIA APG)
            sort: state.chosen || state.order === "other" ? state.order : null,
            content: (
                <button type="button" className={`pk-th-sort${state.chosen ? " pk-sorted" : ""} pk-th-sort-aside`} title={target.ref && next ? fill(next.order === "desc" ? labels.headerSortDesc : labels.headerSortAsc, { value: column ? fill(labels.valueInColumn, { value: refLabel(view, target.ref, labels), column }) : refLabel(view, target.ref, labels) }) : fill(labels.headerSort, { field, order: words(next) })} onClick={click}>
                    <span className="pk-th-text">{cell.text}</span>
                    <Icon name={down ? "arrowDown" : "arrowUp"} size={14} className="pk-th-arrow" />
                </button>
            )
        };
    };

    // the columns' names as the header writes them, by path: "2025 › Jul" for a sort by one column
    const columnNames = (() => {
        const texts = new Map();
        for (const row of grid.rows.slice(0, grid.headerRows)) {
            for (const cell of row) {
                // a subtotal's header ("2024 Total") has its group's path: the group's own label names it
                if (cell?.kind === "colHeader" && cell.valueIndex === undefined && !cell.total && cell.colPath?.length) {
                    texts.set(JSON.stringify(cell.colPath), cell.text);
                }
            }
        }
        const names = new Map();
        for (const key of texts.keys()) {
            const path = JSON.parse(key);
            names.set(key, path.map((_, i) => texts.get(JSON.stringify(path.slice(0, i + 1))) ?? String(path[i])).join(" › "));
        }
        return names;
    })();

    // the first column of a subtotal column's values: an edge before it sets it apart from its group
    const subStart = (col) => {
        const data = grid.dataColumns[col - grid.rowHeaderColumns];
        return data && data.total === 1 && data.valueIndex <= 0 ? " pk-sub-start" : "";
    };
    const stickyStyle = (col, extra) => (col < grid.rowHeaderColumns && lefts[col] !== undefined ? { left: lefts[col], ...extra } : extra);
    const headerCell = (cell, r, c) => {
        const top = { top: tops[r] ?? r * rowHeight };
        const sticky = c < grid.rowHeaderColumns;
        const className = `pk-th pk-${cell.kind}${totalClass(cell.total)}${subStart(c)}${sticky ? " pk-sticky" : ""}`;
        const target = onSort ? headerSortTarget(view, cell, typeOf) : null;
        const sorting = target ? sortButton(cell, target) : null;
        const content = (
            <span className="pk-th-content">
                {cell.toggle ? <Toggle toggle={cell.toggle} text={cell.text} labels={labels} onToggle={onToggle} /> : null}
                {sorting ? sorting.content : <span className="pk-th-text">{cell.text}</span>}
            </span>
        );
        const props = { className, style: stickyStyle(c, top), colSpan: cell.colSpan, rowSpan: cell.rowSpan, scope: cell.kind === "colHeader" ? "col" : undefined };
        if (cell.kind === "corner" && !cell.field && !cell.text) {
            // an empty corner names nothing: a plain cell, not a header without a name
            return <td key={c} className={`${className} pk-blank`} style={props.style} colSpan={cell.colSpan} rowSpan={cell.rowSpan} />;
        }
        if (cell.kind === "corner" && cell.field) {
            const zone = view.rows.includes(cell.field) ? "rows" : "cols";
            return (
                <DraggableHeader key={c} {...props} cell={cell} source={{ kind: "table", field: cell.field, zone, index: view[zone].indexOf(cell.field), label: cell.text }} description={infoOf?.(cell.field)?.description} tooltip={showInfo} sort={sorting?.sort}>
                    {content}
                </DraggableHeader>
            );
        }
        if (cell.kind === "colHeader" && cell.valueIndex !== undefined && r === grid.headerRows - 1) {
            const spec = view.values[cell.valueIndex];
            return (
                <DraggableHeader key={c} {...props} cell={cell} source={{ kind: "table", field: spec?.field ?? null, zone: "values", index: cell.valueIndex, label: cell.text }} description={spec?.field ? infoOf?.(spec.field)?.description : undefined} tooltip={showInfo} sort={sorting?.sort}>
                    {content}
                </DraggableHeader>
            );
        }
        // a subtotal column's label says what it adds up (the same text as the tip)
        const title = cell.kind === "colHeader" && cell.total === 1 && r < grid.headerRows - 1 ? labels.tips.colSubtotals : undefined;
        return (
            <th key={c} {...props} title={title} aria-sort={sorting?.sort ?? undefined}>
                {content}
            </th>
        );
    };

    const bodyCell = ({ cell, col, rowSpan, colSpan }, r) => {
        if (cell.kind === "rowHeader") {
            return (
                <th key={col} scope="row" className={`pk-th pk-rowHeader pk-sticky${totalClass(cell.total)}${rowSpan > 1 ? " pk-span" : ""}`} style={stickyStyle(col)} rowSpan={rowSpan > 1 ? rowSpan : undefined} colSpan={colSpan > 1 ? colSpan : undefined} title={virtual ? cell.text : undefined} onClick={showRowLabel ? () => showRowLabel(r, rowSpan) : undefined}>
                    <span className="pk-th-content" style={fixedWidths && colSpan <= 1 && fixedWidths[col] !== undefined ? { width: fixedWidths[col] } : undefined}>
                        {cell.toggle ? <Toggle toggle={cell.toggle} text={cell.text} labels={labels} onToggle={onToggle} /> : null}
                        <span className="pk-th-text">{cell.text}</span>
                    </span>
                </th>
            );
        }
        const isValue = cell.valueIndex !== undefined;
        const clickable = isValue && drillable(cell);
        const focus = current && current.r === r && current.c === col;
        const cond = conditionalStyle(cell);
        return (
            <td
                key={col}
                className={`pk-td${totalClass(cell.total)}${subStart(col)}${clickable ? " pk-clickable" : ""}${cell.valueType === "text" ? " pk-text" : ""}${cond ? (cell.style.bar !== undefined ? " pk-has-bar" : " pk-has-scale") : ""}`}
                style={cond}
                data-r={r}
                data-c={col}
                tabIndex={isValue ? (focus ? 0 : -1) : undefined}
                onClick={clickable ? () => { setActive({ r, c: col }); onCell(cell); } : undefined}
                onFocus={showRowLabel ? () => showRowLabel(r) : undefined}
            >
                {cell.text}
                {/* an empty cell is still a stop of the arrow keys: a screen reader hears why it is empty */}
                {isValue && cell.text === "" ? <span className="pk-sr pk-no-copy">{cell.hasRows ? labels.emptyValue : labels.emptyCell}</span> : null}
            </td>
        );
    };

    const columns = grid.columnCount;
    return (
        <div className="pk-table-wrap" ref={wrap} onScroll={virtual ? onScroll : undefined} onBlur={virtual ? onBlur : undefined} data-testid="pivot-table">
            {onSort ? (
                <span className="pk-sr" role="status" data-testid="sort-status">
                    {sortNote}
                </span>
            ) : null}
            {/* --pk-row-cols: the row label columns share the cap (styles.css); fitLabels sets the rest */}
            <table ref={table} className={`pk-table${virtual ? " pk-virtual" : ""}${grid.columnCount === grid.rowHeaderColumns ? " pk-labels-only" : ""}`} style={/** @type {any} */ ({ "--pk-row-cols": grid.rowHeaderColumns })} onKeyDown={onKeyDown} aria-rowcount={grid.rows.length} aria-label={labels.tableName} aria-describedby={hintId}>
                <thead>
                    {grid.rows.slice(0, grid.headerRows).map((row, r) => (
                        <tr key={r}>{row.map((cell, c) => (cell ? headerCell(cell, r, c) : null))}</tr>
                    ))}
                </thead>
                <tbody>
                    {win.padTop > 0 ? (
                        <tr className="pk-spacer" aria-hidden="true" style={{ height: win.padTop }}>
                            <td colSpan={columns} />
                        </tr>
                    ) : null}
                    {rows.map(({ index, cells }) => (
                        <tr key={index} data-r={index} aria-rowindex={grid.headerRows + index + 1} className={totalClass(grid.bodyRows[index]?.total).trim() || undefined}>
                            {cells.map((c) => bodyCell(c, index))}
                        </tr>
                    ))}
                    {win.padBottom > 0 ? (
                        <tr className="pk-spacer" aria-hidden="true" style={{ height: win.padBottom }}>
                            <td colSpan={columns} />
                        </tr>
                    ) : null}
                </tbody>
            </table>
        </div>
    );
}
