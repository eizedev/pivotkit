/*
 * The chart as SVG: pivotkit-core's ECharts option with the report's marks (pivotkit-core/chart, the
 * same look as on the screen) drawn by ECharts' server-side SVG renderer (`init(null, null, { renderer:
 * "svg", ssr: true })` and `renderToSVGString()`, ECharts 5.3 and later), then checked and cleaned by
 * cleanSvg: the text of a chart comes from the data, and an SVG opened on its own can run script, so
 * nothing is trusted to the renderer's escaping alone.
 */

import { PivotkitError, chartPlan, chartThemeFrom, computePivot, swapAxes, toEChartsOption, toSeries } from "pivotkit-core";
import { decorateOption } from "pivotkit-core/chart";

/** Presentation attributes a `style` attribute's declarations become (other declarations are dropped). */
const PRESENTATION = new Set(["fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "opacity", "font-size", "font-family", "font-weight", "font-style", "text-anchor", "dominant-baseline", "paint-order", "visibility"]);
/** Elements an ECharts SVG may hold. */
const ELEMENTS = new Set(["svg", "g", "rect", "path", "text", "tspan", "circle", "ellipse", "line", "polyline", "polygon", "defs", "clipPath", "linearGradient", "radialGradient", "stop", "pattern", "image", "title", "desc"]);

/** Control characters XML does not allow (an SVG with one is not shown at all): left out. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Whether XML 1.0 allows a character (Char): a numeric reference to any other makes the SVG unreadable. */
const xmlChar = (code) => code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xd7ff && code !== 0x7f) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);

const decode = (text) => text.replace(/&(quot|#39|apos|lt|gt|amp);/g, (_, e) => ({ quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">", amp: "&" })[e]);
const encode = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** @param {string} reason */
const unsafe = (reason) => new PivotkitError("INVALID_ARGUMENT", `the chart's SVG was refused: ${reason}`, { reason });

/**
 * Checks an SVG string and makes it safe to open and to show under a strict Content-Security-Policy:
 * only the elements an ECharts chart draws, no event handler attribute, no link but to a fragment or
 * a data: image, no text that is not escaped; every `style` attribute becomes presentation attributes
 * (a policy without 'unsafe-inline' blocks style attributes, not those) and a <style> element (ECharts'
 * hover states) and characters XML does not allow, also as numeric references, are left out. Throws INVALID_ARGUMENT
 * (`details.reason`) for anything else.
 * @param {string} svg
 * @returns {string}
 */
export function cleanSvg(svg) {
    const out = [];
    const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/y;
    const attribute = /\s+([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    let i = svg.startsWith("<?xml") ? svg.indexOf("?>") + 2 : 0;
    let depth = 0;
    while (i < svg.length) {
        const lt = svg.indexOf("<", i);
        const text = svg.slice(i, lt === -1 ? svg.length : lt);
        if (/[<>]/.test(text) || /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) {
            throw unsafe("text that is not escaped");
        }
        out.push(text.replace(CONTROL, "").replace(/&#(x[0-9a-fA-F]+|\d+);/g, (entity, number) => (xmlChar(number[0] === "x" ? parseInt(number.slice(1), 16) : Number(number)) ? entity : "")));
        if (lt === -1) {
            break;
        }
        // ECharts writes the hover states of its marks as a <style> of CSS classes: a static image has
        // no hover, and an SVG shown under a strict Content-Security-Policy may hold no <style>
        if (/^<style[\s>]/i.test(svg.slice(lt, lt + 7))) {
            const end = svg.search(/<\/style\s*>/i);
            if (end === -1 || end < lt) {
                throw unsafe("a <style> element that is not closed");
            }
            i = svg.indexOf(">", end) + 1;
            continue;
        }
        if (svg.startsWith("<!--", lt)) {
            const end = svg.indexOf("-->", lt);
            i = end === -1 ? svg.length : end + 3;
            continue;
        }
        tag.lastIndex = lt;
        const m = tag.exec(svg);
        if (!m) {
            throw unsafe("markup that is not a plain element");
        }
        const [, closing, name, attrs, selfClosing] = m;
        if (!ELEMENTS.has(name)) {
            throw unsafe(`the element <${name}>`);
        }
        let written = `<${closing}${name}`;
        const presentation = new Map();
        for (const [, attrName, double, single] of attrs.matchAll(attribute)) {
            const value = decode(double ?? single ?? "").replace(CONTROL, "");
            const lower = attrName.toLowerCase();
            if (lower.startsWith("on")) {
                throw unsafe(`the event attribute ${attrName}`);
            }
            if ((lower === "href" || lower === "xlink:href" || lower === "src") && !(/^#[\w-]+$/.test(value) || /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]*$/.test(value))) {
                throw unsafe(`a link in ${attrName}`);
            }
            if (lower === "style") {
                for (const declaration of value.split(";")) {
                    const colon = declaration.indexOf(":");
                    const prop = declaration.slice(0, colon).trim().toLowerCase();
                    const v = declaration.slice(colon + 1).trim();
                    if (colon > 0 && PRESENTATION.has(prop) && !/url\s*\(|expression\s*\(/i.test(v)) {
                        presentation.set(prop, v);
                    }
                }
                continue;
            }
            if (/url\s*\(\s*['"]?\s*(?!#)/i.test(value)) {
                throw unsafe(`an address in ${attrName}`);
            }
            written += ` ${attrName}="${encode(value)}"`;
        }
        for (const [prop, v] of presentation) {
            if (!new RegExp(`\\s${prop}=`).test(written)) {
                written += ` ${prop}="${encode(v)}"`;
            }
        }
        written += `${selfClosing}>`;
        out.push(written);
        if (name === "svg") {
            depth += closing ? -1 : selfClosing ? 0 : 1;
        }
        i = tag.lastIndex;
    }
    if (depth !== 0) {
        throw unsafe("an <svg> element that is not closed");
    }
    return out.join("");
}

/**
 * The chart of a pivot as SVG, as pivotkit-react draws it: chartPlan's type (the view's, or what
 * "auto" picks; rows and columns swapped for the chart where it says so), the theme's colours from
 * `style`, the axis labels laid out for the size, at most `maxCategories` categories.
 * @param {import("pivotkit-core").PivotResult} result
 * @param {{ echarts: { init: Function }, style: { getPropertyValue(name: string): string }, width: number, height: number,
 *   locale: string, labels?: object, limits?: object, now?: any, maxCategories: number }} options
 * @returns {{ svg: string, categories: number, of: number }}
 */
export function chartSvg(result, { echarts, style, width, height, locale, labels, limits, now, maxCategories }) {
    const view = result.view;
    const plan = chartPlan(view, result.encoded);
    const drawn = plan.swap ? computePivot(result.encoded, swapAxes(view), { locale, limits, ...(now !== undefined ? { now } : {}) }) : result;
    const series = toSeries(drawn, { labels, limits, maxCategories });
    const option = toEChartsOption(drawn, { theme: chartThemeFrom(style), locale, labels, limits, maxCategories, series, chart: plan.chart });
    const decorated = decorateOption(option, style, { width, height, categoryNames: series.categories, axisLabels: view.chart.axisLabels });
    const surface = style.getPropertyValue("--pk-surface").trim() || "#ffffff";
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
    let svg;
    try {
        // axisEvery is the report's own note, not ECharts'
        const { axisEvery, ...option2 } = decorated;
        void axisEvery;
        chart.setOption({ ...option2, backgroundColor: surface, animation: false });
        svg = chart.renderToSVGString();
    } finally {
        chart.dispose();
    }
    return { svg: cleanSvg(svg), categories: series.categories.length, of: series.categoryCount };
}
