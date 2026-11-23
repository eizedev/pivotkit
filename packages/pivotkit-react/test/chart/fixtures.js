// The pivot of the chart tests of reference lines (#48): pivotkit-core's MONTHLY, revenue per month and
// product, A 10, 20, 30, 40 (average 25, trend 10 to 40), B 5, 5, 7, 3 (average 5, trend 5.6 to 4.4).
import { computePivot, encode } from "pivotkit-core";
import { MONTH, MONTHLY } from "../../../pivotkit-core/test/chart/fixtures.js";

export { MONTH, MONTHLY };

/** The pivot of MONTHLY: months in Rows, products in Columns, the sum of revenue, with a chart's settings. */
export const linePivot = (chart, locale = "en-US") => computePivot(encode(MONTHLY), { derived: [MONTH], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale }, chart });
