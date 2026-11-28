/*
 * The chart draws again when the --pk-* tokens it was drawn with change without a theme switch (#1000):
 * a host's stylesheet that loads after the first draw, or a <style> it adds or writes into later (a
 * CSS-in-JS theme). Each draw notes the tokens it read and their values (tokenSignature); a
 * stylesheet's load and a stylesheet removed compare them again. A <style> fires `load` too, when it
 * is added and whenever its text changes, in Chromium, Firefox and WebKit alike. Loads with ECharts (echarts.js): only a drawn
 * chart needs it.
 */

/**
 * The values of `names` on `root`, with its font size (a token in em follows it), as one text: two
 * draws with the same text read the same tokens.
 * @param {HTMLElement} root
 * @param {Iterable<string>} names
 */
function tokenSignature(root, names) {
    const style = getComputedStyle(root);
    return [...names, "font-size"].map((name) => `${name}:${style.getPropertyValue(name).trim()}`).join(";");
}

/** A node that brings a stylesheet: a <style>, or a <link> whose rel names "stylesheet" (in any case, among other words). */
const isSheet = (/** @type {Node | null} */ node) => node?.nodeName === "STYLE" || (node?.nodeName === "LINK" && /(^|\s)stylesheet(\s|$)/i.test(/** @type {HTMLLinkElement} */ (node).rel));

/** Whether a change removed a stylesheet: that fires no `load`. */
function sheetRemoved(/** @type {MutationRecord} */ record) {
    for (let i = 0; i < record.removedNodes.length; i++) if (isSheet(record.removedNodes[i])) return true;
    return false;
}

/**
 * Watches the stylesheets of the chart's document and of every shadow root above it (a `load` does not
 * leave a shadow root): on a stylesheet's load (a <link>'s, a <style> added or its text changed) or a
 * stylesheet removed, the tokens the last draw read are compared with their values now, and
 * `onChange` runs when one differs. A stylesheet can be anywhere in the document, so the removals are
 * watched in all of it.
 * Not seen: a rule inserted into a sheet that is already there (insertRule, adoptedStyleSheets) and a
 * class or style attribute changed on an element above the report; the next draw reads those.
 * @param {HTMLElement} el  the chart's element
 * @param {() => void} onChange  draws the chart again
 * @returns {{ drawn: (root: HTMLElement, names: Iterable<string>) => void, dispose: () => void }}
 *   drawn: a draw read `names` on `root`
 */
export function tokenWatcher(el, onChange) {
    /** @type {{ root: HTMLElement, names: string[], signature: string } | null} */
    let last = null;
    const check = () => {
        if (last && last.root.isConnected && tokenSignature(last.root, last.names) !== last.signature) {
            last = null;
            onChange();
        }
    };
    const onLoad = (/** @type {Event} */ e) => {
        if (e.target && isSheet(/** @type {Node} */ (e.target))) check();
    };
    const mo =
        typeof MutationObserver === "function"
            ? new MutationObserver((records) => {
                  if (records.some(sheetRemoved)) check();
              })
            : null;
    /** @type {Array<Document | ShadowRoot>} */
    const roots = [];
    let top = el.getRootNode();
    while (top.nodeType === 11) {
        roots.push(/** @type {ShadowRoot} */ (top));
        top = /** @type {ShadowRoot} */ (top).host.getRootNode();
    }
    if (top.nodeType === 9) roots.push(/** @type {Document} */ (top));
    for (const root of roots) {
        root.addEventListener("load", onLoad, true);
        // a document's sheets are in its head, or anywhere in its body
        mo?.observe(root.nodeType === 9 ? /** @type {Document} */ (root).documentElement : root, { childList: true, subtree: true });
    }
    return {
        drawn: (root, names) => {
            const list = [...names];
            last = { root, names: list, signature: tokenSignature(root, list) };
        },
        dispose: () => {
            mo?.disconnect();
            for (const root of roots) root.removeEventListener("load", onLoad, true);
        }
    };
}
