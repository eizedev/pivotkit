// The opt-in JSX types (pivotkit-element/jsx) as a React 19 user writes the element.
import React from "react";
import type {} from "pivotkit-element/jsx";
import type { PivotView } from "pivotkit-element";

const start: PivotView = { rows: ["Region"] };
export const report = (
    <pivot-report
        data={[{ Region: "North" }]}
        defaultView={start}
        theme="dark"
        height="100%"
        lang="de-DE"
        onpivot-view-change={(e) => e.detail.view.rows}
        onpivot-export={(e) => e.detail.blob.size}
    />
);
// @ts-expect-error a theme is light, dark or auto
export const wrong = <pivot-report theme="blue" />;
// @ts-expect-error the event detail has no such field
export const badEvent = <pivot-report onpivot-cell-click={(e) => e.detail.nothing} />;
