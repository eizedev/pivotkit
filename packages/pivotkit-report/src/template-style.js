/*
 * The design a print template sets for itself: the --pk-* tokens and the font its own <style>
 * elements give the report as a whole, computed as a browser computes them for `.pk-report`, so the
 * chart, an image drawn without a browser that no stylesheet of the page reaches, is drawn in the
 * template's colours. The template's CSS stays the one place of its design. Loaded by render() only
 * for a template of the host's (a page that renders with the default one never loads it).
 *
 * The page is modelled at the three elements whose values reach the whole report, each inheriting
 * from the one before: `:root`, `body` and `.pk-report`. Light only: the chart is drawn in the light
 * colours, and paper is light.
 *
 * - A rule counts when its selector list names one of them (`:root`, also as `html`, and `body` in
 *   any case), outside @media, @supports and every other at-rule but @layer (whose rules stand below
 *   all others, as do `html`'s below :root's), in a <style> without a `type` other than text/css and
 *   without a `media` other than "all". A selector list the browser would refuse is not detected.
 * - On each element the declarations apply in the document's order, `!important` ones after the
 *   others, with the report's own rules where {{style}} stands: its tokens on :root (the defaults and
 *   the host's `tokens`), its font on body. So a :root rule before {{style}} counts only for the
 *   custom properties the report does not set; a template without {{style}} has no report rules.
 * - var() takes the value its element computes (its own declarations, else inherited), else its
 *   fallback; a custom property in a cycle is invalid, its fallbacks ignored, as CSS defines it;
 *   `inherit`, `unset` and `revert` inherit, `initial` is no value. font-family (also from the `font`
 *   shorthand) resolves its var() the same way; light-dark() gives its light colour.
 *
 * The values come out resolved and checked (tokens.js cleanTokens); a value that does not resolve or
 * is not safe keeps the default.
 */

/**
 * tokens.js's parts this module works with, passed in by render(): imported here, tokens.js would
 * become a chunk of its own in a bundle that splits this module off (pivotkit-element), loaded with
 * every report.
 * @typedef {{ base: Readonly<Record<string, string>>, font: string, maxLength: number, clean: (tokens: Record<string, string>) => Record<string, string> }} TokenKit
 */

/** The elements whose values reach the whole report, each the parent of the next. */
const LEVELS = Object.freeze([":root", "body", ".pk-report"]);
/** The selectors of a level as written, matched in any case for :root and body. */
const levelOf = (/** @type {string} */ selector) => {
    const s = selector.trim().replace(/\s+/g, " ");
    return s === ".pk-report" ? 2 : s.toLowerCase() === "html" ? 0 : LEVELS.indexOf(s.toLowerCase());
};
/**
 * Where a rule stands in its element's order, before the document's order: a rule of an @layer below
 * every other, then `html` (the root, less specific than :root), then the rest.
 */
const LAYERED = 0;
const HTML = 1;
const PLAIN = 2;

/** A resolved value longer than this is dropped (a chain of var()s could grow it without bound). */
const RESOLVED_LENGTH = 1000;
/** var()s that follow each other deeper than this are no value (and the work stays off the stack's limit). */
const MAX_DEPTH = 64;

/** Elements whose content is not markup: a "<style" in them is no style element. */
const SKIPPED = "script|template|textarea|title|xmp|noscript|noembed|noframes|iframe";
/**
 * A comment (`<!-->` and `<!--->` end at once), an element to skip, or a <style> element with its
 * attributes and its CSS. Every part that could miss its end stops at the text's end instead, so an
 * unclosed tag is read once, never searched again from each start (no quadratic time).
 */
const ELEMENT = new RegExp(`<!--(?:-?>|[\\s\\S]*?(?:-->|$))|<(${SKIPPED})\\b[^>]*(?:>|$)[\\s\\S]*?(?:</\\1\\s*>|$)|<style\\b([^>]*)(?:>|$)([\\s\\S]*?)(?:</style\\s*>|$)`, "gi");

/** The index after a string that starts at `i` (its quote), or the text's end. */
function endOfString(text, i) {
    const quote = text[i];
    for (let j = i + 1; j < text.length; j++) {
        if (text[j] === "\\") {
            j++;
        } else if (text[j] === quote || text[j] === "\n") {
            return j + 1;
        }
    }
    return text.length;
}

/** CSS without its comments; a "/*" inside a string is text. */
function withoutComments(css) {
    let out = "";
    for (let i = 0; i < css.length; ) {
        if (css[i] === '"' || css[i] === "'") {
            const end = endOfString(css, i);
            out += css.slice(i, end);
            i = end;
        } else if (css.startsWith("/*", i)) {
            const end = css.indexOf("*/", i + 2);
            out += " ";
            i = end === -1 ? css.length : end + 2;
        } else {
            out += css[i++];
        }
    }
    return out;
}

/** The index of the "}" that closes the block opened at `i`, or the text's end. */
function endOfBlock(text, i) {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
        const c = text[j];
        if (c === '"' || c === "'") {
            j = endOfString(text, j) - 1;
        } else if (c === "{") {
            depth++;
        } else if (c === "}" && --depth === 0) {
            return j;
        }
    }
    return text.length;
}

/**
 * The qualified rules at a CSS text's top level with their selector and block, and those inside an
 * @layer block (marked `layered`); other at-rules (their block too) and stray text are left out.
 * @param {string} css  without comments
 * @param {boolean} [layered]
 * @returns {Array<{ selector: string, block: string, layered: boolean }>}
 */
function topRules(css, layered = false) {
    const rules = [];
    let start = 0;
    // the first character of the text since `start` that is not a space: "@" starts an at-rule
    let first = "";
    for (let i = 0; i < css.length; ) {
        const c = css[i];
        if (!first && !/\s/.test(c)) {
            first = c;
        }
        if (c === '"' || c === "'") {
            i = endOfString(css, i);
        } else if (c === "}" || (c === ";" && first === "@")) {
            // an at-rule without a block (@import, @charset) or a stray "}"; a ";" elsewhere is part of
            // the next rule's selector, which makes it one the browser refuses
            start = ++i;
            first = "";
        } else if (c === "{") {
            const end = endOfBlock(css, i);
            const prelude = css.slice(start, i).trim();
            if (!prelude.startsWith("@") && !prelude.includes(";")) {
                rules.push({ selector: prelude, block: css.slice(i + 1, end), layered });
            } else if (/^@layer\b/i.test(prelude)) {
                rules.push(...topRules(css.slice(i + 1, end), true));
            }
            start = i = end + 1;
            first = "";
        } else {
            i++;
        }
    }
    return rules;
}

/**
 * A block's declarations, nested rules left out: [name, value, important]. Split at ";" outside
 * strings, parentheses and nested blocks.
 * @param {string} block
 * @returns {Array<[string, string, boolean]>}
 */
function declarationsOf(block) {
    const parts = [];
    let part = "";
    let parens = 0;
    for (let i = 0; i < block.length; i++) {
        const c = block[i];
        if (c === '"' || c === "'") {
            const end = endOfString(block, i);
            part += block.slice(i, end);
            i = end - 1;
        } else if (c === "{") {
            // a nested rule (CSS nesting): its selector is in `part`, the rule is dropped
            i = endOfBlock(block, i);
            part = "";
        } else if (c === "(" || c === ")") {
            parens = Math.max(0, parens + (c === "(" ? 1 : -1));
            part += c;
        } else if (c === ";" && parens === 0) {
            parts.push(part);
            part = "";
        } else {
            part += c;
        }
    }
    parts.push(part);
    /** @type {Array<[string, string, boolean]>} */
    const out = [];
    for (const d of parts) {
        const m = /^\s*(--[\w-]+|[a-zA-Z-]+)\s*:([\s\S]*)$/.exec(d);
        if (!m) {
            continue;
        }
        const name = m[1].startsWith("--") ? m[1] : m[1].toLowerCase();
        const important = /!\s*important\s*$/i.test(m[2]);
        const value = m[2].replace(/!\s*important\s*$/i, "").trim();
        if (name.startsWith("--")) {
            out.push([name, value, important]);
        } else if (name === "font-family") {
            out.push([name, value, important]);
        } else if (name === "font") {
            const family = familyOfFont(value);
            if (family) {
                out.push(["font-family", family, important]);
            }
        }
    }
    return out;
}

/** The family of a `font` shorthand: what follows its size (and line height); null for a system font. */
function familyOfFont(value) {
    return /(?:^|\s)(?:[\d.]+(?:px|pt|pc|em|rem|ex|ch|%|vw|vh|cm|mm|in|q)|calc\([^)]*\)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)(?:\s*\/\s*\S+)?\s+(\S[\s\S]*)$/i.exec(value)?.[1]?.trim() ?? null;
}

/** A font list with its names in double quotes, as cleanTokens accepts them ('Inter' becomes "Inter"). */
const doubleQuoted = (value) => value.replace(/'([^'"\\]*)'/g, '"$1"');

/** The var() calls of a value: their name, fallback (or null) and place. */
function varsOf(value) {
    const calls = [];
    for (let at = value.search(/\bvar\(/i); at !== -1; ) {
        const open = at + 4;
        let depth = 1;
        let j = open;
        while (j < value.length && depth > 0) {
            depth += value[j] === "(" ? 1 : value[j] === ")" ? -1 : 0;
            j++;
        }
        if (depth > 0) {
            return null;
        }
        const args = value.slice(open, j - 1);
        const comma = args.indexOf(",");
        calls.push({ name: (comma === -1 ? args : args.slice(0, comma)).trim(), fallback: comma === -1 ? null : args.slice(comma + 1).trim(), start: at, end: j });
        const next = value.slice(j).search(/\bvar\(/i);
        at = next === -1 ? -1 : j + next;
    }
    return calls;
}

/**
 * The computed values of one element: its declared values over its parent's computed ones, var()
 * resolved against its own (cycles invalid), CSS-wide keywords as CSS reads them.
 * @param {Map<string, string>} declared  the element's winning declarations
 * @param {Map<string, string | null>} parent  the parent's computed values (null: no value)
 * @returns {Map<string, string | null>}
 */
function computeLevel(declared, parent) {
    /** @type {Map<string, string | null>} */
    const computed = new Map(parent);
    const custom = [...declared.keys()].filter((name) => name.startsWith("--"));
    // the custom properties in a cycle, with the references of their fallbacks counted (CSS)
    const refs = new Map(custom.map((name) => [name, allNames(/** @type {string} */ (declared.get(name)))]));
    const state = new Map();
    const cyclic = new Set();
    const visit = (/** @type {string} */ name, /** @type {string[]} */ stack) => {
        state.set(name, 1);
        stack.push(name);
        if (stack.length > MAX_DEPTH) {
            stack.forEach((n) => cyclic.add(n));
            stack.pop();
            state.set(name, 2);
            return;
        }
        for (const ref of refs.get(name) ?? []) {
            if (!refs.has(ref)) {
                continue;
            }
            if (state.get(ref) === 1) {
                stack.slice(stack.indexOf(ref)).forEach((n) => cyclic.add(n));
            } else if (!state.has(ref)) {
                visit(ref, stack);
            }
        }
        stack.pop();
        state.set(name, 2);
    };
    for (const name of custom) {
        if (!state.has(name)) {
            visit(name, []);
        }
    }
    const done = new Set();
    let depth = 0;
    /** @param {string} name  @returns {string | null} */
    const valueOf = (name) => {
        if (!declared.has(name) || done.has(name)) {
            return computed.get(name) ?? null;
        }
        if (depth > MAX_DEPTH) {
            return null;
        }
        done.add(name);
        const raw = /** @type {string} */ (declared.get(name));
        const keyword = raw.toLowerCase();
        /** @type {string | null} */
        let value;
        if (keyword === "inherit" || keyword === "unset" || keyword === "revert" || keyword === "revert-layer") {
            value = parent.get(name) ?? null;
        } else if (keyword === "initial" || (name.startsWith("--") && cyclic.has(name))) {
            value = null;
        } else {
            depth++;
            value = substitute(raw);
            depth--;
            // a font whose var() does not resolve is invalid at computed-value time: it inherits
            if (value === null && !name.startsWith("--")) {
                value = parent.get(name) ?? null;
            }
        }
        computed.set(name, value);
        return value;
    };
    /** @param {string} value  @returns {string | null} */
    const substitute = (value) => {
        const calls = varsOf(value);
        if (calls === null) {
            return null;
        }
        let out = "";
        let last = 0;
        for (const call of calls) {
            out += value.slice(last, call.start);
            const found = /^--[\w-]+$/.test(call.name) ? valueOf(call.name) : null;
            const replaced = found ?? (call.fallback === null ? null : substitute(call.fallback));
            if (replaced === null || out.length + replaced.length > RESOLVED_LENGTH) {
                return null;
            }
            out += replaced;
            last = call.end;
        }
        out += value.slice(last);
        return out.length <= RESOLVED_LENGTH ? out : null;
    };
    for (const name of declared.keys()) {
        valueOf(name);
    }
    return computed;
}

/** Every name a value's var()s refer to, in fallbacks too. */
function allNames(value) {
    return [...value.matchAll(/\bvar\(\s*(--[\w-]+)/gi)].map((m) => m[1]);
}

/**
 * A value with every light-dark(light, dark) replaced by its light colour: the chart and the cells'
 * colours are drawn light, and ECharts reads no light-dark(). A call that is not closed is kept as it
 * is (cleanTokens checks it).
 * @param {string} value
 */
function lightOf(value) {
    let out = value;
    for (let at = out.search(/\blight-dark\(/i); at !== -1; at = out.search(/\blight-dark\(/i)) {
        const open = at + "light-dark(".length;
        let depth = 1;
        let comma = -1;
        let j = open;
        for (; j < out.length && depth > 0; j++) {
            depth += out[j] === "(" ? 1 : out[j] === ")" ? -1 : 0;
            if (out[j] === "," && depth === 1 && comma === -1) {
                comma = j;
            }
        }
        if (depth > 0 || comma === -1) {
            return value;
        }
        out = out.slice(0, at) + out.slice(open, comma).trim() + out.slice(j);
    }
    return out;
}

/**
 * The light values a report with this template draws its chart and its cells' colours with: the
 * defaults, the host's `tokens`, the template's own CSS, as the page computes them for `.pk-report`
 * (see the top of this module).
 * @param {import("./template.js").Template} template  from parseTemplate()
 * @param {Record<string, string>} tokens  the host's
 * @param {TokenKit} kit  tokens.js's BASE_TOKENS, REPORT_FONT, TOKEN_LENGTH and cleanTokens
 * @returns {Record<string, string>}
 */
export function templateTheme(template, tokens, { base: BASE_TOKENS, font: REPORT_FONT, maxLength: TOKEN_LENGTH, clean: cleanTokens }) {
    // the template as one text, its placeholders empty, and where its last {{style}} stands
    let text = "";
    let styleAt = -1;
    for (const part of template.parts) {
        if (typeof part === "string") {
            text += part;
        } else if (part.name === "style") {
            styleAt = text.length;
        }
    }
    /** @type {Array<{ level: number, rank: number, at: number, decls: Array<[string, string, boolean]> }>} */
    const rules = [];
    for (const m of text.matchAll(ELEMENT)) {
        if (m[3] === undefined) {
            continue;
        }
        const attribute = (/** @type {string} */ name) => {
            const a = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(m[2] ?? "");
            return a ? (a[1] ?? a[2] ?? a[3]).trim().toLowerCase() : null;
        };
        const media = attribute("media");
        const type = attribute("type");
        if ((media !== null && media !== "" && media !== "all") || (type !== null && type !== "" && type !== "text/css")) {
            continue;
        }
        for (const rule of topRules(withoutComments(m[3]))) {
            const decls = declarationsOf(rule.block).filter(([, value]) => value.length <= TOKEN_LENGTH);
            const selectors = rule.selector.split(",");
            const levels = new Set(selectors.map(levelOf).filter((level) => level !== -1));
            for (const level of levels) {
                const html = level === 0 && !selectors.some((sel) => sel.trim().toLowerCase() === ":root");
                rules.push({ level, rank: rule.layered ? LAYERED : html ? HTML : PLAIN, at: /** @type {number} */ (m.index), decls });
            }
        }
    }
    const host = cleanTokens(tokens);
    // the report's own rules where {{style}} stands: its tokens on :root, its font on body
    /** @type {Array<Array<[string, string, boolean]>>} */
    const report = [Object.entries({ ...BASE_TOKENS, ...host }).filter(([name]) => name.startsWith("--")).map(([n, v]) => [n, v, false]), [["font-family", host["font-family"] ?? REPORT_FONT, false]], []];
    /** @type {Map<string, string | null>} */
    let computed = new Map();
    for (let level = 0; level < LEVELS.length; level++) {
        // the declarations in the order they apply: before {{style}}, the report's, after it; then the !important ones
        // (layered rules and html below the rest, whatever their place: they are below the report's too)
        const own = rules.filter((r) => r.level === level);
        const low = [LAYERED, HTML].flatMap((rank) => own.filter((r) => r.rank === rank).flatMap((r) => r.decls));
        const plain = own.filter((r) => r.rank === PLAIN);
        const ordered = [...low, ...plain.filter((r) => r.at < styleAt).flatMap((r) => r.decls), ...(styleAt === -1 ? [] : report[level]), ...plain.filter((r) => r.at >= styleAt).flatMap((r) => r.decls)];
        /** @type {Map<string, string>} */
        const declared = new Map();
        for (const important of [false, true]) {
            for (const [name, value, flag] of ordered) {
                if (flag === important) {
                    declared.set(name, value);
                }
            }
        }
        if (level === 0 && styleAt === -1) {
            // no report rules on the page: the defaults stand under the template's own
            for (const [name, value] of Object.entries({ ...BASE_TOKENS, ...host })) {
                if (name.startsWith("--") && !declared.has(name)) {
                    declared.set(name, value);
                }
            }
        }
        computed = computeLevel(declared, computed);
    }
    /** @type {Record<string, string>} */
    const values = {};
    for (const [name, value] of computed) {
        if (value !== null && (name.startsWith("--pk-") || name === "font-family")) {
            values[name] = name === "font-family" ? doubleQuoted(value) : lightOf(value);
        }
    }
    return { ...BASE_TOKENS, ...cleanTokens(values) };
}
