/*
 * Printing the HTML report from the page: the report goes into a hidden <iframe> in the report's root
 * (in a shadow root too), and the browser's print dialog prints that frame; "Save as PDF" is the
 * dialog's. The frame is sandboxed without scripts (only `allow-same-origin`, so this module fills it,
 * and `allow-modals`, so it may print), and it is built as DOM, never as markup with inline styles: the
 * stylesheet goes in through the CSSOM (adoptedStyleSheets), the chart as inline SVG with presentation
 * attributes. So a page with a strict Content-Security-Policy, whose policy the frame inherits, prints
 * it as it is. The frame stays until the dialog is closed (afterprint) or the next print. WebKit runs
 * no event listener in a frame without scripts, not even the page's own: there the page's afterprint
 * removes it, and if that does not come either, the next print does.
 */

const FRAME_CLASS = "pk-print-frame";

/** Each frame's listeners, ended with the frame. */
const listeners = new WeakMap();

/** Removes a print frame and its listeners. */
function removeFrame(frame) {
    listeners.get(frame)?.abort();
    frame.remove();
}
/** How long the frame may take to load before printing is given up as blocked (ms). */
export const PRINT_LOAD_TIMEOUT = 5_000;

/**
 * The parts of a report's HTML for the frame: its stylesheet, language, title and body nodes. The
 * stylesheet is cut out of the text before it is parsed (a <style> parsed on a page with a strict
 * policy is reported as a violation, also in a document of DOMParser); meta elements and scripts are
 * left out (the frame is filled as DOM).
 * @param {string} html
 * @param {DOMParser} parser
 */
export function printParts(html, parser) {
    const styles = [];
    const text = html.replace(/<style>([\s\S]*?)<\/style>/g, (_, css) => (styles.push(css), ""));
    const parsed = parser.parseFromString(text, "text/html");
    for (const node of parsed.querySelectorAll("style, script, meta, link, base")) {
        node.remove();
    }
    return { css: styles.join("\n"), lang: parsed.documentElement.getAttribute("lang") ?? "", dir: parsed.documentElement.getAttribute("dir") ?? "", title: parsed.title, body: parsed.body };
}

/**
 * Prints the report's HTML from a hidden frame in `container`.
 * @param {string} html  pivotkit-report's HTML (format "html", chartEmbed "inline")
 * @param {HTMLElement} container  the report's root
 * @returns {Promise<boolean>}  false when the frame could not be used (blocked by the page)
 */
export async function printHtml(html, container) {
    const doc = container.ownerDocument;
    const view = doc.defaultView;
    if (!view) {
        return false;
    }
    for (const old of container.querySelectorAll(`iframe.${FRAME_CLASS}`)) {
        removeFrame(/** @type {HTMLIFrameElement} */ (old));
    }
    const parts = printParts(html, new view.DOMParser());
    const frame = doc.createElement("iframe");
    frame.className = FRAME_CLASS;
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.title = parts.title;
    // not laid out while it loads: a layout of the page would otherwise lay out the frame's document
    // before it has loaded (Firefox warns of it); shown, at 1 px, once it is filled
    frame.hidden = true;
    // the frame's own document: a browser may first load about:blank (Firefox), which srcdoc replaces
    const loaded = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), PRINT_LOAD_TIMEOUT);
        const done = () => {
            if (frame.contentDocument?.URL === "about:srcdoc" && frame.contentDocument.readyState === "complete") {
                clearTimeout(timer);
                frame.removeEventListener("load", done);
                resolve(true);
            }
        };
        frame.addEventListener("load", done);
    });
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><title></title></head><body></body></html>';
    container.append(frame);
    const win = (await loaded) ? frame.contentWindow : null;
    const fdoc = frame.contentDocument;
    if (!win || !fdoc || !fdoc.body) {
        frame.remove();
        return false;
    }
    fdoc.documentElement.lang = parts.lang;
    fdoc.documentElement.dir = parts.dir;
    fdoc.title = parts.title;
    const FrameSheet = /** @type {any} */ (win).CSSStyleSheet;
    if (typeof FrameSheet === "function" && "adoptedStyleSheets" in fdoc) {
        const sheet = new FrameSheet();
        sheet.replaceSync(parts.css);
        fdoc.adoptedStyleSheets = [sheet];
    } else {
        // a browser without constructable stylesheets: a <style> element (a strict policy blocks it)
        const style = fdoc.createElement("style");
        style.textContent = parts.css;
        fdoc.head.append(style);
    }
    fdoc.body.replaceChildren(...[...parts.body.childNodes].map((node) => fdoc.importNode(node, true)));
    frame.hidden = false;
    // the frame lays out its content in the page's next frame, not forced by print() at once
    await new Promise((resolve) => view.requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (!frame.isConnected) {
        return true;
    }
    const ended = new AbortController();
    listeners.set(frame, ended);
    const after = () => setTimeout(() => removeFrame(frame), 0);
    win.addEventListener("afterprint", after, { once: true, signal: ended.signal });
    view.addEventListener("afterprint", after, { once: true, signal: ended.signal });
    win.print();
    return true;
}
