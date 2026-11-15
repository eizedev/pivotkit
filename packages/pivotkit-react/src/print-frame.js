/*
 * Printing the HTML report from the page: the report goes into a hidden <iframe> in the report's root
 * (in a shadow root too), and the browser's print dialog prints that frame; "Save as PDF" is the
 * dialog's. The frame is sandboxed without scripts (only `allow-same-origin`, so this module fills it,
 * and `allow-modals`, so it may print), and it is built as DOM, never as markup with inline styles: the
 * stylesheet goes in through the CSSOM (adoptedStyleSheets), the chart as inline SVG with presentation
 * attributes. So a page with a strict Content-Security-Policy, whose policy the frame inherits, prints
 * it as it is.
 *
 * print() runs in the click: Safari asks "This webpage is trying to print" before a print it does not
 * take as the person's. So the Export menu makes an empty frame ready when it opens
 * (preparePrintFrame: loaded and laid out, at 1 px), and the click fills it and prints at once, with
 * no wait for a load or an animation frame (which a hidden page never gets either). Only a click
 * before the frame has loaded waits for it.
 *
 * The frame stays until the dialog is closed (afterprint) or the next print. WebKit runs no event
 * listener in a frame without scripts, not even the page's own: there the page's afterprint removes
 * it, and if that does not come either, the next print does. A ready frame no print took goes with
 * the menu (releasePrintFrame).
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
 * @typedef {{ frame: HTMLIFrameElement, loaded: Promise<boolean>, isLoaded: boolean }} PrintSlot
 *   `loaded`: the frame's own document loaded and the frame shown (false: blocked or too slow);
 *   `isLoaded`: it has
 */

/** The frame made ready for the next print, per report root; a print takes it out. */
const ready = new WeakMap();

/**
 * A new frame in `container`, loading an empty document of its own.
 * @param {HTMLElement} container
 * @returns {PrintSlot}
 */
function newSlot(container) {
    const doc = container.ownerDocument;
    const frame = doc.createElement("iframe");
    frame.className = FRAME_CLASS;
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    // not laid out while it loads: a layout of the page would otherwise lay out the frame's document
    // before it has loaded (Firefox warns of it); shown, at 1 px, once it has
    frame.hidden = true;
    /** @type {PrintSlot} */
    const slot = { frame, isLoaded: false, loaded: Promise.resolve(false) };
    // the frame's own document: a browser may first load about:blank (Firefox), which srcdoc replaces
    slot.loaded = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), PRINT_LOAD_TIMEOUT);
        const done = () => {
            if (frame.contentDocument?.URL === "about:srcdoc" && frame.contentDocument.readyState === "complete") {
                clearTimeout(timer);
                frame.removeEventListener("load", done);
                frame.hidden = false;
                slot.isLoaded = true;
                resolve(true);
            }
        };
        frame.addEventListener("load", done);
    });
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><title></title></head><body></body></html>';
    container.append(frame);
    return slot;
}

/**
 * Makes an empty frame ready in `container` for the next print, unless one is (the Export menu, when
 * it opens).
 * @param {HTMLElement} container  the report's root
 */
export function preparePrintFrame(container) {
    if (!ready.get(container)?.frame.isConnected) {
        ready.set(container, newSlot(container));
    }
}

/**
 * Removes the ready frame no print took (the Export menu, when it closes).
 * @param {HTMLElement} container
 */
export function releasePrintFrame(container) {
    const slot = ready.get(container);
    if (slot) {
        ready.delete(container);
        removeFrame(slot.frame);
    }
}

/**
 * Takes the frame for a print, in the click before anything is awaited (so the menu, closing, leaves
 * it): the ready one, or a new one when none is. Every other print frame in `container` goes.
 * @param {HTMLElement} container  the report's root
 * @returns {PrintSlot}
 */
export function takePrintFrame(container) {
    const kept = ready.get(container);
    const slot = kept?.frame.isConnected ? kept : newSlot(container);
    ready.delete(container);
    for (const old of container.querySelectorAll(`iframe.${FRAME_CLASS}`)) {
        if (old !== slot.frame) {
            removeFrame(/** @type {HTMLIFrameElement} */ (old));
        }
    }
    return slot;
}

/**
 * Removes a frame takePrintFrame gave that will not print (the host took the report, or it failed).
 * @param {PrintSlot} slot
 */
export const dropPrintFrame = (slot) => removeFrame(slot.frame);

/**
 * Prints the report's HTML from a frame takePrintFrame gave: at once when the frame has loaded (in
 * the click), else once it has.
 * @param {string} html  pivotkit-report's HTML (format "html", chartEmbed "inline")
 * @param {PrintSlot} slot
 * @returns {Promise<boolean>}  false when the frame could not be used (blocked by the page)
 */
export function printHtml(html, slot) {
    // no await when the frame is there: print() in the click
    if (slot.isLoaded) {
        return Promise.resolve(fillAndPrint(html, slot.frame));
    }
    return slot.loaded.then((ok) => {
        if (!ok) {
            removeFrame(slot.frame);
        }
        return ok && fillAndPrint(html, slot.frame);
    });
}

/**
 * Fills a loaded frame with the report and prints it.
 * @param {string} html
 * @param {HTMLIFrameElement} frame
 * @returns {boolean}  false when the frame could not be used
 */
function fillAndPrint(html, frame) {
    const win = frame.contentWindow;
    const fdoc = frame.contentDocument;
    if (!frame.isConnected) {
        // the report went (or the next print took over) while the frame loaded
        return true;
    }
    if (!win || !fdoc || !fdoc.body) {
        removeFrame(frame);
        return false;
    }
    const parts = printParts(html, new /** @type {any} */ (frame.ownerDocument.defaultView).DOMParser());
    frame.title = parts.title;
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
    // the frame's content laid out now, before the dialog takes the document
    void fdoc.documentElement.getBoundingClientRect();
    const view = frame.ownerDocument.defaultView;
    const ended = new AbortController();
    listeners.set(frame, ended);
    const after = () => setTimeout(() => removeFrame(frame), 0);
    win.addEventListener("afterprint", after, { once: true, signal: ended.signal });
    view?.addEventListener("afterprint", after, { once: true, signal: ended.signal });
    win.print();
    return true;
}
