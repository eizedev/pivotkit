/*
 * The host's chartOptions: a plain JSON object merged over the ECharts option the report builds, for
 * what the menus do not offer (a font size, a grid margin, the axis names). It comes from a
 * developer, often as JSON from a server (PowerShell Universal), so it is checked like data: only
 * plain objects, arrays, strings, finite numbers, booleans and null pass; functions, class instances,
 * symbols, prototype keys and anything too deep or too large are dropped and named in `problems`.
 *
 * Some ECharts options are markup or addresses, not data (ECharts 6.1.0): a string `formatter` of a
 * tooltip and the tooltip's `content` are written with innerHTML (TooltipHTMLContent.js) and would
 * replace the report's tooltip of DOM nodes, which a strict Content-Security-Policy allows; `link`,
 * `sublink` and their targets open a window (util/format.js windowOpen, title/install.js);
 * `extraCssText`, `className`, `appendTo`, `appendToBody` and `renderMode` change the tooltip's
 * element and where it lives; `image` keys and "image://" symbols load an address; `rich` text styles
 * are left out with them, as a string `formatter` anywhere (its "{a|...}" refers to them). They are
 * dropped wherever they are and named, so nothing in chartOptions is markup, an address or run.
 */

/** Keys dropped at any depth: markup, addresses, the tooltip's element (see above). */
const UNSAFE_KEYS = new Set(["rich", "link", "sublink", "target", "subtarget", "linkTarget", "image", "extraCssText", "className", "appendTo", "appendToBody", "renderMode"]);
/** Keys whose string value is a template or markup: dropped when they hold a string. */
const TEMPLATE_KEYS = new Set(["formatter", "content"]);

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
        if (typeof v === "string" && /^\s*image:\/\//i.test(v)) {
            problems.push(`${path}: an image address, not allowed`);
            return undefined;
        }
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
                if (UNSAFE_KEYS.has(key)) {
                    problems.push(`${path}.${key}: markup, an address or the tooltip's element, not allowed`);
                    continue;
                }
                if (TEMPLATE_KEYS.has(key) && typeof v[key] === "string") {
                    problems.push(`${path}.${key}: a text template (written as markup), not allowed`);
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
