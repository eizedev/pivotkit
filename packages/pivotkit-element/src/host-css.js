/*
 * The stylesheet of the shadow root, made from pivotkit-react's styles.css at build time (build.js).
 *
 * pivotkit-react sets its --pk-* tokens on .pk-root. Inside the element that would hide a token the
 * host sets on <pivot-report>: a value set on .pk-root itself beats an inherited one. So the token
 * rules move to :host (light) and :host([data-pk-theme="dark"]) (the element mirrors the report's
 * theme to that attribute). Rules from the page outside the shadow root win over :host rules, so a
 * host that sets `pivot-report { --pk-accent: ... }` themes the report, and .pk-root inherits it.
 * Every token, also --pk-font, is declared on :host, so a --pk-* set higher up the page (on body, say)
 * does not reach the report; only the element's own value does.
 */

/** The token selectors of pivotkit-react's styles.css (as written or as esbuild prints them) and what they become. */
/** @type {Array<[RegExp, string]>} */
const TOKEN_SELECTORS = [
    [/:where\(\.pk-root\[data-pk-theme=(["']?)dark\1\]\)/g, ':host([data-pk-theme="dark"])'],
    [/:where\(\.pk-root\)/g, ":host"]
];

/** Rules of the element itself, before the report's. */
const HOST_RULES = `:host {
    display: block;
    /* unset: the report inherits the page's font through the element */
    --pk-font: initial;
}
:host([hidden]) {
    display: none;
}
`;

/**
 * @param {string} css  pivotkit-react's styles.css
 * @returns {string}
 */
export function hostStyles(css) {
    let out = css;
    for (const [from, to] of TOKEN_SELECTORS) {
        if (!from.test(out)) {
            throw new Error(`pivotkit-element: ${from} is not in pivotkit-react's styles.css; the token rules changed, update host-css.js`);
        }
        from.lastIndex = 0;
        out = out.replace(from, to);
    }
    return HOST_RULES + out;
}
