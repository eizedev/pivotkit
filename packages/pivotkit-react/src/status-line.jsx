/*
 * The status line under the result: the rows the result covers, the dates the data spans, the data
 * shown (a loaded file's, import-host.jsx) and, while the table is virtual, the whole label of the
 * row in use.
 */

import React from "react";
import { fieldLabel } from "pivotkit-core";
import { fill, rowCount } from "./labels.js";

/**
 * @param {{ result: any, ranges: { field: string, text: string }[], labels: any, locale: string, rowLabel: string | null,
 *   source: React.ReactNode }} props  ranges: the date context's; rowLabel: shown while the table is;
 *   source: the import UI's line, or null
 */
export function StatusLine({ result, ranges, labels, locale, rowLabel, source }) {
    return (
        <div className="pk-status">
            <span className="pk-row-count" data-testid="row-count">
                {result ? rowCount(result.rows.length, result.encoded.length, labels, locale) : ""}
            </span>
            {ranges.map(({ field, text }) => <span key={field} data-testid="date-range" title={fill(labels.dateRangeTitle, { field: fieldLabel(field, labels.core) })}>{ranges.length > 1 ? fill(labels.dateRangeField, { field: fieldLabel(field, labels.core), range: text }) : fill(labels.dateRangeData, { range: text })}</span>)}
            {source}
            {rowLabel ? (
                <span className="pk-row-label" data-testid="row-label">
                    {fill(labels.rowLabel, { label: rowLabel })}
                </span>
            ) : null}
        </div>
    );
}
