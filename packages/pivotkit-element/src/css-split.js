/*
 * The shadow root's stylesheet in two parts, at build time (build.js): the rules the first render can
 * need, and the rules only the menus' panels match, which load with the menus (src/styles.js puts them
 * back in their place). A rule goes to the menus when each of its selectors names a class that the
 * menus' code writes and the first load's code does not. Anything else stays first: an at-rule, a rule
 * on an element or a token, a class the code builds from parts. So a rule the first render needs never
 * waits for the menus; one that could wait may stay first, which costs bytes, not looks.
 *
 * The parts keep their order: rule runs of the first load and of the menus alternate, and the menus'
 * runs go back between the first load's ones, so the cascade is the same as in one sheet.
 */

/**
 * The top-level rules of a stylesheet, in order, as their text: a rule with its block, an at-rule with
 * its block, or a statement that ends in ";". Joined they are the stylesheet again, to the last space.
 * @param {string} css
 * @returns {string[]}
 */
export function topRules(css) {
    const rules = [];
    let start = 0;
    let depth = 0;
    let quote = "";
    for (let i = 0; i < css.length; i++) {
        const c = css[i];
        if (quote) {
            if (c === "\\") {
                i++;
            } else if (c === quote) {
                quote = "";
            }
        } else if (c === '"' || c === "'") {
            quote = c;
        } else if (c === "/" && css[i + 1] === "*") {
            const end = css.indexOf("*/", i + 2);
            i = end < 0 ? css.length : end + 1;
        } else if (c === "{") {
            depth++;
        } else if (c === "}") {
            depth--;
            if (depth === 0) {
                rules.push(css.slice(start, i + 1));
                start = i + 1;
            }
        } else if (c === ";" && depth === 0) {
            rules.push(css.slice(start, i + 1));
            start = i + 1;
        }
    }
    const rest = css.slice(start);
    if (rest.trim() || rules.length === 0) {
        rules.push(rest);
    } else {
        rules[rules.length - 1] += rest;
    }
    if (depth !== 0) {
        throw new Error("pivotkit-element: the stylesheet's braces do not match");
    }
    return rules.filter((rule) => rule !== "");
}

/** The class names a piece of code writes: "pk-chip", "pk-chip pk-over", ` pk-over`, `pk-card${…}`. */
const CLASS_WORD = /(?<![\w-])pk-[\w-]+/g;
/** The start of a class name built from parts: `pk-chip-${zone}` gives "pk-chip-". */
const CLASS_PREFIX = /(?<![\w-])(pk-[\w-]*)\$\{/g;

/**
 * Which classes a text of code names: whole names, and the prefixes of names it builds. The bare
 * prefix "pk-" is left out: it builds the table's header cells from their kind (pk-corner,
 * pk-colHeader, pk-rowHeader), which only the table writes, and a form's id prefix, no class.
 * @param {string} code
 * @returns {{ names: Set<string>, prefixes: string[] }}
 */
export function classesIn(code) {
    const prefixes = new Set([...code.matchAll(CLASS_PREFIX)].map((m) => m[1]).filter((p) => p !== "pk-"));
    return { names: new Set(code.match(CLASS_WORD) ?? []), prefixes: [...prefixes] };
}

/**
 * Whether a rule matches only inside the menus' panels: not an at-rule, and each selector names a
 * class only the menus write.
 * @param {string} rule
 * @param {{ names: Set<string>, prefixes: string[] }} first  the first load's classes
 * @param {{ names: Set<string>, prefixes: string[] }} menus  the menus' classes
 */
function menusOnly(rule, first, menus) {
    if (rule.trimStart().startsWith("@")) {
        return false;
    }
    const selector = rule.slice(0, rule.indexOf("{"));
    /** @param {{ names: Set<string>, prefixes: string[] }} code @param {string} name */
    const writes = (code, name) => code.names.has(name) || code.prefixes.some((p) => name.startsWith(p));
    /** @param {string} name */
    const onlyMenus = (name) => writes(menus, name) && !writes(first, name);
    return selector.split(",").every((part) => (part.match(/\.(pk-[\w-]+)/g) ?? []).some((c) => onlyMenus(c.slice(1))));
}

/**
 * The stylesheet in runs that alternate: first[0], menus[0], first[1], menus[1] … first[n]. Joined in
 * that order (joinStyles) they are the stylesheet again.
 * @param {string} css  minified
 * @param {string} firstCode  the code of the first load
 * @param {string} menusCode  the code only the menus load
 * @returns {{ first: string[], menus: string[] }}  first has one run more than menus
 */
export function splitStyles(css, firstCode, menusCode) {
    const first = classesIn(firstCode);
    const menus = classesIn(menusCode);
    const out = { first: [""], menus: /** @type {string[]} */ ([]) };
    let inMenus = false;
    for (const rule of topRules(css)) {
        const now = menusOnly(rule, first, menus);
        if (now !== inMenus) {
            if (now) {
                out.menus.push("");
            } else {
                out.first.push("");
            }
            inMenus = now;
        }
        const runs = now ? out.menus : out.first;
        runs[runs.length - 1] += rule;
    }
    if (inMenus) {
        out.first.push("");
    }
    return out;
}

/**
 * The stylesheet from its runs: the first load's alone while the menus' are not here (null), else
 * both in their order.
 * @param {readonly string[]} first
 * @param {readonly string[] | null} menus
 */
export function joinStyles(first, menus) {
    return menus ? first.map((run, i) => run + (menus[i] ?? "")).join("") : first.join("");
}
