// Made-up sales rows shared by the tests. Region "West" has no product B; one row has a blank region.
export const SALES = [
    { Region: "North", Product: "A", Units: 3, Price: 10, Date: "2026-01-05", Rep: "Ann" },
    { Region: "North", Product: "A", Units: 5, Price: 12, Date: "2026-01-20", Rep: "Bob" },
    { Region: "North", Product: "B", Units: 2, Price: 20, Date: "2026-02-03", Rep: "Ann" },
    { Region: "South", Product: "A", Units: 7, Price: 10, Date: "2026-02-14", Rep: "Cid" },
    { Region: "South", Product: "B", Units: 1, Price: 25, Date: "2026-03-01", Rep: "Cid" },
    { Region: "South", Product: "B", Units: null, Price: 30, Date: "2026-03-09", Rep: "Dee" },
    { Region: "West", Product: "A", Units: 4, Price: 11, Date: "2026-04-30", Rep: "Eve" },
    { Region: null, Product: "A", Units: 6, Price: 9, Date: "2025-12-31", Rep: "Ann" }
];

/** Body rows of a grid as [label..., text...] arrays, for compact assertions. */
export function texts(grid) {
    return grid.rows.map((row) => row.map((c) => (c ? c.text : null)));
}

/** The body row whose first label cell is `label`. */
export function bodyRow(grid, label, column = 0) {
    return grid.rows.slice(grid.headerRows).find((row) => row[column] && row[column].text === label);
}
