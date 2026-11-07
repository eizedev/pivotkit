/*
 * The host's chartOptions: a plain JSON object merged over the ECharts option the report builds, for
 * what the menus do not offer (a font size, a grid margin, the axis names). It comes from a
 * developer, often as JSON from a server (PowerShell Universal), so it is checked like data: only
 * plain objects, arrays, strings, finite numbers, booleans and null pass; functions, class instances,
 * symbols, prototype keys and anything too deep or too large are dropped and named in `problems`.
 * Nothing in it is ever run.
 */

/** How deep the object may nest, and how many entries it may have in all. */
export const CHART_OPTIONS_CAPS = Object.freeze({ depth: 12, entries: 2000 });

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * The JSON part of the host's chartOptions and what was dropped (as "path: why").
 * @param {unknown} value
 * @returns {{ options: Record<string, unknown> | null, problems: string[] }}
 */
export function cleanChartOptions(value) {
    if (value === undefined || value === null) {
        return { options: null, problems: [] };
    }
    if (!isPlain(value)) {
        return { options: null, problems: ["chartOptions: not a plain object"] };
    }
    const problems = [];
    let entries = 0;
    const clean = (v, path, depth) => {
        if (v === null || typeof v === "string" || typeof v === "boolean") {
            return v;
        }
        if (typeof v === "number") {
            if (Number.isFinite(v)) {
                return v;
            }
            problems.push(`${path}: not a finite number`);
            return undefined;
        }
        if (Array.isArray(v) || isPlain(v)) {
            if (depth >= CHART_OPTIONS_CAPS.depth) {
                problems.push(`${path}: nested deeper than ${CHART_OPTIONS_CAPS.depth} levels`);
                return undefined;
            }
            if (Array.isArray(v)) {
                const out = [];
                for (let i = 0; i < v.length; i++) {
                    if (++entries > CHART_OPTIONS_CAPS.entries) {
                        problems.push(`${path}: more than ${CHART_OPTIONS_CAPS.entries} entries in all`);
                        break;
                    }
                    const c = clean(v[i], `${path}[${i}]`, depth + 1);
                    out.push(c === undefined ? null : c);
                }
                return out;
            }
            const out = {};
            for (const key of Object.keys(v)) {
                if (FORBIDDEN.has(key)) {
                    problems.push(`${path}.${key}: not allowed`);
                    continue;
                }
                if (++entries > CHART_OPTIONS_CAPS.entries) {
                    problems.push(`${path}: more than ${CHART_OPTIONS_CAPS.entries} entries in all`);
                    break;
                }
                const c = clean(v[key], `${path}.${key}`, depth + 1);
                if (c !== undefined) {
                    out[key] = c;
                }
            }
            return out;
        }
        problems.push(`${path}: ${typeof v === "function" ? "a function" : typeof v === "object" ? "not plain JSON" : `a ${typeof v}`}, not allowed`);
        return undefined;
    };
    return { options: /** @type {Record<string, unknown>} */ (clean(value, "chartOptions", 0)), problems };
}

/**
 * The option with `over` merged into it, neither changed: objects are merged key by key; a list
 * (series, xAxis) is merged entry by entry, and an object given for a list is merged into every
 * entry of it ({ series: { barMaxWidth: 24 } } sets every series); anything else replaces.
 * @param {unknown} base
 * @param {unknown} over
 * @returns {any}
 */
export function mergeChartOptions(base, over) {
    if (over === undefined) {
        return base;
    }
    if (Array.isArray(base)) {
        if (Array.isArray(over)) {
            const length = Math.max(base.length, over.length);
            return Array.from({ length }, (_, i) => (i < over.length ? mergeChartOptions(base[i], over[i]) : base[i]));
        }
        if (isPlain(over)) {
            return base.map((entry) => mergeChartOptions(entry, over));
        }
        return over;
    }
    if (isPlain(base) && isPlain(over)) {
        const b = /** @type {Record<string, unknown>} */ (base);
        const o = /** @type {Record<string, unknown>} */ (over);
        const out = { ...b };
        for (const key of Object.keys(o)) {
            out[key] = mergeChartOptions(b[key], o[key]);
        }
        return out;
    }
    return over;
}
