/*
 * The design a print template sets for itself: the custom properties (--pk-* tokens and any others
 * they refer to) and the font that its own <style> elements set for the report as a whole, so the
 * chart, an image drawn without a browser that no stylesheet of the page reaches, is drawn in the
 * template's colours. The template's CSS stays the one place for its design.
 *
 * Read as the page applies them, light only (the chart is drawn in the light colours, and paper is
 * light):
 *
 * - rules on `:root`, `body` or `.pk-report` (a selector list may hold others), outside @media,
 *   @supports and every other at-rule, and outside a <style> with a `media` other than "all";
 * - a rule on `:root` counts after {{style}} only, where it overrides the report's tokens (before it,
 *   the report's :root rule wins); `body` and `.pk-report` are below :root, so they count anywhere;
 *   the font counts on `.pk-report`, and on `body` after {{style}} (whose body rule sets the font);
 * - `.pk-report` over `body` over `:root`, and a later rule over an earlier one, as inheritance and
 *   the cascade order them; `!important` is dropped.
 *
 * Values are returned as written: tokens.js resolves their var() and checks them (cleanTokens).
 */

/** The selectors whose values reach the whole report, in the order they override each other. */
const LEVELS = Object.freeze([":root", "body", ".pk-report"]);

/** Elements whose content is not markup: a "<style" in them is no style element. */
const SKIPPED = "script|template|textarea|title|xmp|noscript|noembed|noframes|iframe";
/** A comment, an element to skip, or a <style> element with its attributes and its CSS. */
const ELEMENT = new RegExp(`<!--[\\s\\S]*?(?:-->|$)|<(${SKIPPED})\\b[^>]*>[\\s\\S]*?(?:</\\1\\s*>|$)|<style\\b([^>]*)>([\\s\\S]*?)(?:</style\\s*>|$)`, "gi");

/**
 * The parts of a CSS text at its top level: qualified rules with their selector and block; at-rules
 * (their block too) and stray text are left out. Strings and comments are skipped as CSS reads them.
 * @param {string} css
 * @returns {Array<{ selector: string, block: string }>}
 */
function topRules(css) {
    const rules = [];
    const text = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");
    let start = 0;
    let i = 0;
    while (i < text.length) {
        const c = text[i];
        if (c === '"' || c === "'") {
            i = endOfString(text, i);
            continue;
        }
        if (c === ";") {
            // an at-rule without a block (@import, @charset) or stray text
            start = ++i;
            continue;
        }
        if (c === "{") {
            const end = endOfBlock(text, i);
            const prelude = text.slice(start, i).trim();
            if (!prelude.startsWith("@")) {
                rules.push({ selector: prelude, block: text.slice(i + 1, end) });
            }
            start = i = end + 1;
            continue;
        }
        i++;
    }
    return rules;
}

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
 * A block's declarations as [name, value], nested rules left out. Split at ";" outside strings,
 * parentheses and nested blocks.
 * @param {string} block
 * @returns {Array<[string, string]>}
 */
function declarations(block) {
    const out = [];
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
        } else if (c === "(") {
            parens++;
            part += c;
        } else if (c === ")") {
            parens = Math.max(0, parens - 1);
            part += c;
        } else if (c === ";" && parens === 0) {
            out.push(part);
            part = "";
        } else {
            part += c;
        }
    }
    out.push(part);
    return out
        .map((d) => /^\s*(--[\w-]+|[a-zA-Z-]+)\s*:([\s\S]*)$/.exec(d))
        .filter((m) => m !== null)
        .map((m) => [m[1].startsWith("--") ? m[1] : m[1].toLowerCase(), m[2].replace(/!\s*important\s*$/i, "").trim()]);
}

/** A font list with its names in double quotes, as cleanTokens accepts them ('Inter' becomes "Inter"). */
const doubleQuoted = (value) => value.replace(/'([^'"\\]*)'/g, '"$1"');

/**
 * The custom properties and the font a template's own CSS sets for the whole report, light only
 * (see the top of this module), as written; the later and more specific override the others.
 * @param {import("./template.js").Template} template  from parseTemplate()
 * @returns {Record<string, string>}  custom properties by name, and "font-family"
 */
export function templateTokens(template) {
    // the template as one text, its placeholders empty, and where its last {{style}} stands: a :root
    // rule overrides the report's only after it (a template without {{style}} has none to override)
    let text = "";
    let styleAt = -1;
    for (const part of template.parts) {
        if (typeof part === "string") {
            text += part;
        } else if (part.name === "style") {
            styleAt = text.length;
        }
    }
    /** @type {Array<{ level: number, after: boolean, decls: Array<[string, string]> }>} */
    const found = [];
    for (const m of text.matchAll(ELEMENT)) {
        const media = m[2] === undefined ? null : /\bmedia\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[2]);
        if (m[3] === undefined || (media && (media[1] ?? media[2] ?? media[3]).trim().toLowerCase() !== "all")) {
            continue;
        }
        const after = /** @type {number} */ (m.index) >= styleAt;
        for (const rule of topRules(m[3])) {
            const selectors = rule.selector.split(",").map((s) => s.trim().replace(/\s+/g, " "));
            const decls = declarations(rule.block);
            // each selector of the list that names the report counts as a rule of its own
            LEVELS.forEach((selector, level) => {
                if (selectors.includes(selector)) {
                    found.push({ level, after, decls });
                }
            });
        }
    }
    /** @type {Record<string, string>} */
    const out = {};
    // a stable sort: by level, and in the order of the document within one
    for (const { level, after, decls } of found.sort((a, b) => a.level - b.level)) {
        for (const [name, value] of decls) {
            if (name.startsWith("--") ? level > 0 || after : name === "font-family" && (level === 2 || (level === 1 && after))) {
                out[name] = name === "font-family" ? doubleQuoted(value) : value;
            }
        }
    }
    return out;
}
