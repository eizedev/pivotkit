/*
 * The steps the result's controls take on the view: the tabs Table and Chart with their settings
 * (view-tabs.jsx), a group of the table expanded or collapsed, Expand all and Collapse all (offered
 * when they change something, and said when done), and Swap of the zones.
 */

import { plural } from "./labels.js";
import { setChart, setChartDisplay, setCollapsed, setDisplay, setTotal, swapAxes, toggleCollapsed } from "./view-ops.js";

/**
 * @param {{ view: import("pivotkit-core").View, commit: import("./use-steps.js").Commit, announce: (text: string) => void,
 *   labels: any, locale: string, result: any, outer: string[][], folding: { open: number } }} report  outer, folding:
 *   use-pivot-result.js's
 */
export function resultSteps({ view, commit, announce, labels, locale, result, outer, folding }) {
    return {
        onSwap: () => commit(swapAxes(view), { step: "swap" }),
        onToggle: (axis, path) => commit(toggleCollapsed(view, axis, path), { step: "collapse" }),
        // the tabs' props (view-tabs.jsx)
        tabs: {
            onDisplay: (d) => commit(setDisplay(view, d), { step: "display", display: d }),
            onChart: (p) => commit(setChart(view, p), { step: "chart", type: p }),
            onChartDisplay: (patch) => commit(setChartDisplay(view, patch), { step: "chartDisplay" }),
            onTotal: (key, on) => commit(setTotal(view, key, on), { step: "totals" }),
            // `texts`: the Options menu's labels, with the menus' texts that say what was done
            onExpand: (texts) => {
                const count = view.collapsed.rows.length;
                commit(setCollapsed(view, "rows", null), { step: "collapse" });
                announce(plural(texts.groupsExpanded, count, { lang: labels.lang, locale }));
            },
            onCollapse: (texts) => {
                if (!result) {
                    return;
                }
                commit(setCollapsed(view, "rows", outer), { step: "collapse" });
                announce(plural(texts.groupsCollapsed, folding.open, { lang: labels.lang, locale }));
            },
            folding
        }
    };
}
