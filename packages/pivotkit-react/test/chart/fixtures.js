// Data for the chart tests of reference lines (#48): revenue per month and product, A 10, 20, 30, 40
// (average 25, trend 10 to 40), B 5, 5, 7, 3 (average 5, trend 5.6 to 4.4), a target of 35.
import { computePivot, encode } from "pivotkit-core";

export const LINE_ROWS = [10, 20, 30, 40].flatMap((a, i) => [
    { Date: `2026-0${i + 1}-15`, Product: "A", Revenue: a },
    { Date: `2026-0${i + 1}-15`, Product: "B", Revenue: [5, 5, 7, 3][i] }
]);

/** The pivot of LINE_ROWS: months in Rows, products in Columns, the sum of revenue, with a chart's settings. */
export const linePivot = (chart, locale = "en-US") => computePivot(encode(LINE_ROWS), { derived: [{ name: "Month", field: "Date", by: "yearMonth" }], rows: ["Month"], cols: ["Product"], values: [{ field: "Revenue", agg: "sum" }], formatting: { locale }, chart });
