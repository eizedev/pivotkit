/*
 * Filters, one table entry per type: how normalize() reads it from a view and how the pivot applies
 * it. A new filter type is one entry here (see CONTRIBUTING.md, "Adding a view feature").
 *
 * - Item filters (include, exclude, label) decide per dictionary code and run first, on the rows.
 * - Value filters (top N, value conditions) aggregate a measure per group and keep or drop whole
 *   groups, so totals show the visible items only, as in Excel. A filter on a field of an axis groups
 *   by the axis fields down to it ("top 3 products" keeps three products within each region above
 *   it); a field off the axes is grouped on its own. They run outer levels first, each on the rows
 *   the previous one left.
 *
 * Top N keeps exactly N groups per parent. Ties are broken by the order of first appearance in the
 * data, so a tie at the cut keeps the group seen first (Excel may keep all tied items).
 */

import { labelOf } from "./labels.js";
import { toWallMs } from "./time.js";
import { finite, get } from "./util.js";

export const LABEL_OPS = Object.freeze(["equals", "notEquals", "contains", "notContains", "beginsWith", "endsWith"]);
export const VALUE_OPS = Object.freeze(["=", "!=", ">", ">=", "<", "<=", "between", "notBetween"]);

const oneOf = (value, allowed) => (typeof value === "string" && allowed.includes(value) ? value : null);

function matchLabel(op, label, value) {
    const l = label.toLocaleLowerCase();
    const v = value.toLocaleLowerCase();
    switch (op) {
        case "equals":
            return l === v;
        case "notEquals":
            return l !== v;
        case "contains":
            return l.includes(v);
        case "notContains":
            return !l.includes(v);
        case "beginsWith":
            return l.startsWith(v);
        case "endsWith":
            return l.endsWith(v);
        default:
            return true;
    }
}

function matchValue(filter, v) {
    if (typeof v !== "number" || Number.isNaN(v)) {
        return false;
    }
    const a = filter.value;
    const lo = Math.min(a, filter.value2 ?? a);
    const hi = Math.max(a, filter.value2 ?? a);
    switch (filter.op) {
        case "=":
            return v === a;
        case "!=":
            return v !== a;
        case ">":
            return v > a;
        case ">=":
            return v >= a;
        case "<":
            return v < a;
        case "<=":
            return v <= a;
        case "between":
            return v >= lo && v <= hi;
        case "notBetween":
            return v < lo || v > hi;
        default:
            return true;
    }
}

/** A dimension value from a view (filter item, collapsed path), converted to the column's type. */
export function itemFor(type, value) {
    if (value === null) {
        return null;
    }
    switch (type) {
        case "number": {
            const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
            return Number.isFinite(n) ? n : undefined;
        }
        case "date": {
            // filter items name dates as written in the data, or as wall-clock ms; an offset is read as UTC
            const n = typeof value === "number" ? value : typeof value === "string" ? toWallMs(value, (t) => t) : NaN;
            return Number.isFinite(n) ? n : undefined;
        }
        case "boolean":
            return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : undefined;
        default:
            return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                ? String(value).slice(0, 10_000)
                : undefined;
    }
}

// ---- normalizers: (raw entry, spec so far, field, path, ctx, view) -> spec or undefined ----

function normalizeItems(flt, spec, f, path, ctx) {
    const items = get(flt, "items");
    if (!Array.isArray(items)) {
        return ctx.issue(path, "needs a list of items");
    }
    if (items.length > ctx.limits.items) {
        ctx.issue(`${path}.items`, `more than ${ctx.limits.items} items`);
    }
    spec.items = [];
    for (const item of items.slice(0, ctx.limits.items)) {
        const converted = itemFor(f.type, item);
        if (converted === undefined) {
            ctx.issue(`${path}.items`, `item ${JSON.stringify(item)} does not fit the ${f.type} field`);
        } else {
            spec.items.push(converted);
        }
    }
    return spec;
}

function normalizeLabel(flt, spec, _f, path, ctx) {
    const op = oneOf(get(flt, "op"), LABEL_OPS);
    const value = get(flt, "value");
    if (!op) {
        return ctx.issue(path, `unknown label operator ${JSON.stringify(get(flt, "op"))}`);
    }
    if (typeof value !== "string" || value.length > 1000) {
        return ctx.issue(path, "needs a text value");
    }
    return Object.assign(spec, { op, value });
}

/** The measure a value filter ranks or compares: `by`, default the view's first value. */
function measureOf(flt, path, ctx, view) {
    const byIn = get(flt, "by");
    const by = byIn === undefined ? ctx.defaultRef(view) : ctx.valueRef(byIn, `${path}.by`);
    if (by && ctx.resultType(by) !== "number") {
        ctx.issue(`${path}.by`, `${by.agg} gives no number to filter by`);
        return null;
    }
    return by;
}

function normalizeTop(flt, spec, _f, path, ctx, view) {
    const by = measureOf(flt, path, ctx, view);
    if (!by) {
        return undefined;
    }
    const count = finite(get(flt, "count"));
    if (count === null || count < 1 || count > ctx.limits.topCount || !Number.isInteger(count)) {
        return ctx.issue(path, "needs a whole count of 1 or more");
    }
    const bottom = get(flt, "bottom");
    return Object.assign(spec, { by, count, bottom: typeof bottom === "boolean" ? bottom : false });
}

function normalizeValue(flt, spec, _f, path, ctx, view) {
    const by = measureOf(flt, path, ctx, view);
    if (!by) {
        return undefined;
    }
    const op = oneOf(get(flt, "op"), VALUE_OPS);
    const value = finite(get(flt, "value"));
    if (!op || value === null) {
        return ctx.issue(path, "needs an operator and a number");
    }
    Object.assign(spec, { by, op, value });
    if (op === "between" || op === "notBetween") {
        const value2 = finite(get(flt, "value2"));
        if (value2 === null) {
            return ctx.issue(path, `${op} needs value2`);
        }
        spec.value2 = value2;
    }
    return spec;
}

// ---- appliers ----

/** Item filters: allowed[code + 1] per dictionary code (index 0 is blank). */
function allowedItems(include) {
    return (column, f) => {
        const index = new Map(column.dict.map((v, code) => [v, code]));
        const listed = new Uint8Array(column.dict.length + 1);
        for (const item of f.items) {
            const code = item === null ? -1 : index.get(item);
            if (code !== undefined) {
                listed[code + 1] = 1;
            }
        }
        return include ? listed : listed.map((x) => 1 - x);
    };
}

function allowedLabels(column, f, locale) {
    const allowed = new Uint8Array(column.dict.length + 1);
    for (let code = -1; code < column.dict.length; code++) {
        const label = labelOf(column, code === -1 ? null : column.dict[code], locale);
        allowed[code + 1] = matchLabel(f.op, label, f.value) ? 1 : 0;
    }
    return allowed;
}

/** Value filters: keep[group] from the aggregated values and the group paths. */
function keepMatching(f, values) {
    return Uint8Array.from(values, (v) => (matchValue(f, v) ? 1 : 0));
}

function keepTop(f, values, paths) {
    const keep = new Uint8Array(paths.length);
    // within each parent group: the count largest (or smallest) values; blanks never count
    const byParent = new Map();
    paths.forEach((p, g) => {
        const parent = p.slice(0, -1).join(",");
        if (!byParent.has(parent)) {
            byParent.set(parent, []);
        }
        byParent.get(parent).push(g);
    });
    for (const groups of byParent.values()) {
        groups
            .filter((g) => typeof values[g] === "number")
            .sort((a, b) => (f.bottom ? values[a] - values[b] : values[b] - values[a]) || a - b)
            .slice(0, f.count)
            .forEach((g) => {
                keep[g] = 1;
            });
    }
    return keep;
}

/**
 * @typedef {object} FilterDef
 * @property {"items" | "values"} stage
 * @property {Function} normalize
 * @property {Function} [allowed]  item filters
 * @property {Function} [keep]     value filters
 */

/** @type {Readonly<Record<string, FilterDef>>} */
export const FILTERS = Object.freeze({
    include: { stage: "items", normalize: normalizeItems, allowed: allowedItems(true) },
    exclude: { stage: "items", normalize: normalizeItems, allowed: allowedItems(false) },
    label: { stage: "items", normalize: normalizeLabel, allowed: allowedLabels },
    top: { stage: "values", normalize: normalizeTop, keep: keepTop },
    value: { stage: "values", normalize: normalizeValue, keep: keepMatching }
});

export const FILTER_TYPES = Object.freeze(Object.keys(FILTERS));

function filterRows(rows, keep) {
    let n = 0;
    const out = new Int32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        if (keep(rows[i], i)) {
            out[n++] = rows[i];
        }
    }
    return out.slice(0, n);
}

/**
 * Applies the view's filters to the source rows.
 * @param {import("./pivot.js").PivotContext} ctx
 * @param {Int32Array} rows
 * @returns {Int32Array}
 */
export function applyFilters(ctx, rows) {
    const { view, columnOf, locale } = ctx;
    for (const f of view.filters) {
        const def = FILTERS[f.type];
        const column = columnOf(f.field);
        if (def.stage !== "items" || !column) {
            continue;
        }
        const allowed = def.allowed(column, f, locale);
        const codes = column.codes;
        rows = filterRows(rows, (r) => allowed[codes[r] + 1] === 1);
    }
    const levelOf = (name) => {
        const r = view.rows.indexOf(name);
        if (r !== -1) {
            return { fields: view.rows.slice(0, r + 1), order: r };
        }
        const c = view.cols.indexOf(name);
        if (c !== -1) {
            return { fields: view.cols.slice(0, c + 1), order: 100 + c };
        }
        return { fields: [name], order: 200 };
    };
    const valueFilters = view.filters
        .filter((f) => FILTERS[f.type].stage === "values")
        .map((f, i) => ({ f, i, ...levelOf(f.field) }))
        .sort((a, b) => a.order - b.order || a.i - b.i);
    for (const { f, fields } of valueFilters) {
        const columns = fields.map(columnOf);
        if (columns.includes(null)) {
            continue;
        }
        const { groupOf, paths } = ctx.groupBy(columns, rows);
        const values = ctx.aggregateGroups(f.by, rows, groupOf, paths.length);
        const keep = FILTERS[f.type].keep(f, values, paths);
        rows = filterRows(rows, (_r, i) => keep[groupOf[i]] === 1);
    }
    return rows;
}

