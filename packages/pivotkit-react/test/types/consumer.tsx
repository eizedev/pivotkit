// Compiled by `npm run test:types` against the generated declarations, through the package's own
// exports map: the published types must describe the component as a TypeScript user sees it.
import React from "react";
import { LABELS, PivotReport, type CellClick, type PivotReportProps, type Template } from "pivotkit-react";
import type { View } from "pivotkit-core";

const templates: Template[] = [{ name: "By region", view: { rows: ["Region"] } }];
const onCell = (c: CellClick): number => c.count + c.rows.length + c.row.length;
const props: PivotReportProps = { data: [{ Region: "North", Units: 3 }], templates, theme: "dark", locale: "de-DE", height: 480, limits: { cells: 10_000 } };
const de: string = LABELS.de.zones.rows;

export const element = (
    <PivotReport {...props} onCellClick={onCell} onViewChange={(v: View) => v.rows.length} onSaveTemplate={(name: string, v: View) => [name, v]} labels={{ zones: { rows: de } }} />
);
