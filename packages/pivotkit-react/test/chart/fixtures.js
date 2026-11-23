// What the chart tests share: the pivot of the reference lines' tests (#48) and a document for the
// tooltip's nodes. The data is pivotkit-core's test/chart/fixtures.js, which these tests read from
// that package's test folder: MONTHLY, revenue per month and product, A 10, 20, 30, 40 (average 25,
// trend 10 to 40), B 5, 5, 7, 3 (average 5, trend 5.6 to 4.4).
import { computePivot, encode } from "pivotkit-core";
import { MONTH, MONTHLY } from "../../../pivotkit-core/test/chart/fixtures.js";

export { MONTH, MONTHLY };

/** The pivot of MONTHLY: months in Rows, products in Columns, the sum of revenue, with a chart's settings. */
export const linePivot = (chart, locale = "en-US") => computePivot(encode(MONTHLY), { derived: [MONTH], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale }, chart });

/** A document with just what the tooltip's formatter uses: nodes with a style, a text and children. */
export function fakeDocument() {
    const node = () => ({ style: {}, textContent: "", children: [], append(...c) { this.children.push(...c); } });
    return /** @type {any} */ ({ createElement: () => node() });
}
