/*
 * The rows behind a cell of the table or a point of the chart: the host hears of the click
 * (`onCellClick`, with the rows), and with `drillDown` the drill-down panel shows them (drill-panel.jsx,
 * loaded with the menus). A click on a point opens its menu at the point first (#53), a double click
 * its rows at once.
 */

import { useCallback, useState } from "react";
import { DRILL_LIMIT, drillRows } from "./drill.js";

/**
 * @param {import("./index.js").PivotReportProps} props
 * @param {{ result: any, imported: object | null, swapped: boolean, defaultsOf: (field: string) => any, nameOf: (field: string) => string,
 *   infoOf: (field: string) => any, noteDrilled: () => void }} report  swapped: the chart shows rows and columns the
 *   other way round (its plan); noteDrilled: tells the tips a cell was drilled into
 */
export function useDrill(props, { result, imported, swapped, defaultsOf, nameOf, infoOf, noteDrilled }) {
    const { data, encoded: encodedProp, onCellClick, drillDown = true, drillDownLimit = DRILL_LIMIT } = props;
    const [drill, setDrill] = useState(/** @type {import("./drill-table.js").DrillSource | null} */ (null));
    // the menu of a clicked point of the chart: where it opens, and the point
    const [point, setPoint] = useState(/** @type {{ anchor: HTMLElement, home?: HTMLElement | null, point: any } | null} */ (null));
    const openCell = useCallback(
        /** @param {any} cell */
        ({ rowPath = [], colPath = [], value, valueIndex, text }) => {
            if (!result) {
                return;
            }
            noteDrilled();
            // the host's own row objects, unless the rows are rebuilt from the columns (encoded, columnar, a file's)
            const { count, rows, indices } = drillRows(result, { rowPath, colPath, data: encodedProp || imported || !Array.isArray(data) ? null : data, limit: drillDownLimit });
            onCellClick?.({ row: rowPath, col: colPath, value, valueIndex, text, count, rows });
            if (drillDown) {
                // the values as the table shows them; a host's format for a field (fieldDefaults) applies
                const formatOf = (name) => {
                    const d = defaultsOf(name);
                    return d ? (d.drillFormat ?? d.format) : undefined;
                };
                // the panel's table is drill-table.js's, with the menus: here only what it is made of
                setDrill({ result, rowPath, colPath, count, indices, formatOf, nameOf, infoOf });
            }
        },
        [result, encodedProp, imported, data, drillDownLimit, onCellClick, drillDown, defaultsOf, nameOf, infoOf, noteDrilled]
    );
    /** A point's rows, as a table cell's. @param {any} p */
    const openPoint = (p) => openCell({ rowPath: p.rowPath, colPath: p.colPath, value: p.value, valueIndex: p.valueIndex, text: String(p.value ?? "") });
    /** A point of the chart clicked (chart.jsx onPoint). @param {any} p */
    const onChartPoint = (p) => {
        // a chart with rows and columns swapped names the view's paths the other way round
        const target = { ...p, rowPath: swapped ? p.colPath : p.rowPath, colPath: swapped ? p.rowPath : p.colPath, anchor: undefined, home: undefined };
        // a double click: its rows at once; a click: its menu at the point (#53)
        if (p.direct) {
            setPoint(null);
            openPoint(target);
        } else if (p.anchor) {
            setPoint({ anchor: p.anchor, home: p.home, point: target });
        }
    };
    return {
        drill,
        closeDrill: () => setDrill(null),
        point,
        closePoint: () => setPoint(null),
        // the point menu offers the rows when there is something to show them
        pointRows: drillDown || Boolean(onCellClick),
        openCell,
        openPoint,
        onChartPoint
    };
}
