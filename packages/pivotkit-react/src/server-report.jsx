/*
 * A report with a `server`, once server-module.js loaded (PivotReport.jsx ServerGate): its rows come
 * from the server (use-server-rows.js) and take the place of `data`. The report's body is passed in,
 * so this chunk imports nothing of the first load's report.
 */

import React from "react";
import { useServerRows } from "./use-server-rows.js";

/**
 * @param {{ outer: import("./index.js").PivotReportProps, Body: (props: { outer: import("./index.js").PivotReportProps, live: import("./use-server-rows.js").LiveRows }) => any, told?: boolean }} props
 *   told: "loading" went to onServerState already, while this code loaded
 */
export function ServerReport({ outer, Body, told = false }) {
    const live = useServerRows(outer, told);
    return <Body outer={outer} live={live} />;
}
