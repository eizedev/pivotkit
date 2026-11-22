/*
 * What the report keeps of its drawn chart (chart.jsx): the ECharts instance, for the exports and the
 * chart's colours in its menu, whether it is drawn (Export offers the chart image then), and which
 * reference lines it can draw, with the view they are of, so the menu never shows another view's.
 * A legend entry hidden or shown is kept in the view and said to a screen reader.
 */

import { useRef, useState } from "react";
import { fill } from "./labels.js";
import { hiddenAfter, setChartDisplay } from "./view-ops.js";

/**
 * @param {{ view: import("pivotkit-core").View, labels: any, commit: import("./use-steps.js").Commit,
 *   announce: (text: string) => void }} report
 */
export function useChartState({ view, labels, commit, announce }) {
    const chartRef = useRef(null);
    const [ready, setReady] = useState(false);
    // which reference lines the drawn chart can draw, with its numbers' reasons (chart.jsx onLines), and the view they are of
    const [lines, setLines] = useState(/** @type {any} */ (null));
    return {
        chartRef,
        ready,
        lineChecks: lines?.view === view ? lines.checks : null,
        /** chart.jsx's callbacks. */
        events: {
            onLegend: ({ name, shown }) => {
                commit(setChartDisplay(view, { hidden: hiddenAfter(view.chart.hidden, name, shown) }), { step: "chartDisplay" });
                announce(fill(shown ? labels.chartShown : labels.chartHidden, { name }));
            },
            onInstance: (c) => {
                chartRef.current = c;
                setReady(Boolean(c));
            },
            onLines: (checks) => setLines(checks && { checks, view })
        }
    };
}
