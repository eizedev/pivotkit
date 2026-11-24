// WCAG 2.2 contrast as the page draws it, for every spec that measures one: a colour the page resolves,
// colours laid over each other, relative luminance and the ratio of two colours. The maths run in the
// page, where the colours are: installContrast(page) puts them at window.__pkContrast, and a function
// the spec evaluates there reads them from it.

/**
 * Runs in the page and returns the helpers. Self-contained: it is sent to the page as its source.
 * A colour is [r, g, b, a]: 0-255 and an alpha from 0 to 1.
 */
function contrastKit() {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    /** Any CSS colour the page knows (rgb(), color(srgb), oklab() of a color-mix), drawn on a canvas and read back. */
    const parse = (css) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0, 0, 0, 0)";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return a === 0 ? [0, 0, 0, 0] : [r, g, b, a / 255];
    };
    /** `top` laid over the opaque `below`. */
    const over = (top, below) => [0, 1, 2].map((i) => top[i] * top[3] + below[i] * (1 - top[3])).concat(1);
    /** Relative luminance (WCAG 2.2). */
    const lum = (c) => {
        const [r, g, b] = c.slice(0, 3).map((v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    /** The contrast ratio of two opaque colours, 1 to 21. */
    const ratio = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (hi + 0.05) / (lo + 0.05);
    };
    /** What is drawn behind an element: the backgrounds of it and its ancestors laid over each other up to the first opaque one, over white. */
    const behind = (el) => {
        const layers = [];
        for (let n = el; n; n = n.parentElement) {
            const bg = parse(getComputedStyle(n).backgroundColor);
            if (bg[3] > 0) layers.push(bg);
            if (bg[3] === 1) break;
        }
        let colour = [255, 255, 255, 1];
        for (const layer of layers.reverse()) colour = over(layer, colour);
        return colour;
    };
    return { parse, over, lum, ratio, behind };
}

/**
 * Puts the helpers at window.__pkContrast for the page as it is now (a navigation drops them): call it
 * before the evaluate that reads them. Evaluated as a script, so a page's Content-Security-Policy does
 * not refuse it.
 * @param {import("@playwright/test").Page} page
 */
export const installContrast = (page) => page.evaluate(`window.__pkContrast = (${contrastKit})()`);
