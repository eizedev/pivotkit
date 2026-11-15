// The HTML report's colours as a reader sees them: made-up sales with a colour scale, data bars and a
// chart, and a measure of the drawn page (report-theme.spec.js, report-templates.spec.js): every text
// of the page against what is drawn behind it, WCAG 2.2's contrast, a data bar blended over its cell.

const REGIONS = ["North", "South", "East", "West", "Central"];
const PRODUCTS = ["Hardware", "Services", "Software"];
/** Made-up sales: every region and product, the units growing so the scale has a low and a high end. */
export const ROWS = REGIONS.flatMap((region, r) => PRODUCTS.map((product, p) => ({ Region: region, Product: product, Units: 10 + r * 30 + p * 7, Price: 5 + ((r * 3 + p) % 7) })));

export const VIEWS = {
    scale: { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum", conditional: { type: "colorScale" } }] },
    bars: { rows: ["Region", "Product"], values: [{ field: "Units", agg: "sum", conditional: { type: "dataBar" } }, { field: "Price", agg: "average" }] },
    chart: { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }], chart: { type: "bar" }, display: "chart" }
};

/**
 * Runs in the page: every element with text of its own (outside the chart's image), its contrast on
 * what is behind it; the scale's cells by value with their distance from the surface; the page's
 * surface, text and colour scheme. sRGB colours as the page computes them ("rgb()", "rgba()",
 * "color(srgb ...)").
 */
export const measure = () => {
    const parse = (c) => {
        const n = c.match(/[\d.]+/g).map(Number);
        return c.startsWith("color(") ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n[3] ?? 1 } : { r: n[0], g: n[1], b: n[2], a: n[3] ?? 1 };
    };
    const lum = ({ r, g, b }) => [r, g, b].map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
    };
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a) });
    const backgroundOf = (el) => {
        for (let e = el; e; e = e.parentElement) {
            const bg = parse(getComputedStyle(e).backgroundColor);
            if (bg.a > 0) return bg;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
    };
    const texts = [];
    const own = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    for (const el of document.body.querySelectorAll("*")) {
        if (!own(el) || el.closest("svg, figure") || el.getClientRects().length === 0) continue;
        const style = getComputedStyle(el);
        const fg = parse(style.color);
        const bg = backgroundOf(el);
        texts.push({ text: el.textContent.trim(), on: "background", ratio: ratio(fg, bg) });
        const bar = el.classList.contains("pk-has-bar") ? style.backgroundImage.match(/(?:rgba?|color)\([^)]*\)/)?.[0] : null;
        if (bar) texts.push({ text: el.textContent.trim(), on: "bar", ratio: ratio(fg, over(parse(bar), bg)) });
    }
    const surface = backgroundOf(document.body);
    // the scale's cells by their value, with how far each is from the surface
    const scale = [...document.querySelectorAll(".pk-has-scale")].map((el) => ({ value: Number(el.textContent.replace(/[^\d.]/g, "")), distance: ratio(backgroundOf(el), surface) })).sort((a, b) => a.value - b.value);
    return { texts, scale, body: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color, colorScheme: getComputedStyle(document.documentElement).colorScheme };
};

/** A hex token as the page computes it. */
export const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
