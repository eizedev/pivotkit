// The data of the chart tests, shared with the browser's chart specs (tests/browser/chart/report.js).

/**
 * Revenue per region and category. East sells no hardware: a series without a value at a category.
 * Stacked, North is 60 (20 + 10 + 30), South 45, East 52.
 */
export const REVENUE = Object.freeze([
    { Region: "North", Category: "Hardware", Revenue: 20 },
    { Region: "North", Category: "Services", Revenue: 10 },
    { Region: "North", Category: "Software", Revenue: 30 },
    { Region: "South", Category: "Hardware", Revenue: 15 },
    { Region: "South", Category: "Services", Revenue: 5 },
    { Region: "South", Category: "Software", Revenue: 25 },
    { Region: "East", Category: "Services", Revenue: 12 },
    { Region: "East", Category: "Software", Revenue: 40 }
]);

/**
 * Revenue per month and product. A climbs by 10 a month (10, 20, 30, 40: average 25), B stays near 5
 * (5, 5, 7, 3: average 5, trend from 5.6 to 4.4). Stacked, the months are 15, 25, 37, 43: average 30,
 * trend from 15.6 to 44.4.
 */
export const MONTHLY = Object.freeze([
    { Date: "2026-01-15", Region: "North", Product: "A", Revenue: 10 },
    { Date: "2026-01-15", Region: "South", Product: "B", Revenue: 5 },
    { Date: "2026-02-15", Region: "North", Product: "A", Revenue: 20 },
    { Date: "2026-02-15", Region: "South", Product: "B", Revenue: 5 },
    { Date: "2026-03-15", Region: "South", Product: "A", Revenue: 30 },
    { Date: "2026-03-15", Region: "North", Product: "B", Revenue: 7 },
    { Date: "2026-04-15", Region: "South", Product: "A", Revenue: 40 },
    { Date: "2026-04-15", Region: "North", Product: "B", Revenue: 3 }
]);

/** The month of MONTHLY's date, as a derived field. */
export const MONTH = Object.freeze({ name: "Month", field: "Date", by: "yearMonth" });
