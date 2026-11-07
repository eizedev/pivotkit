// Compiled by `npm run test:types` against the generated declarations, through the package's own
// exports map: the published types must describe the component as a TypeScript user sees it.
import React from "react";
import { LABELS, PivotReport, type CellClick, type ExportFile, type FieldDefaults, type PartialLabels, type PivotReportProps, type Template, type ViewInput } from "pivotkit-react";
import type { View } from "pivotkit-core";

const templates: Template[] = [{ name: "By region", view: { rows: ["Region"] } }];
const onCell = (c: CellClick): number => c.count + c.rows.length + c.row.length;
const props: PivotReportProps = { data: [{ Region: "North", Units: 3 }], templates, theme: "dark", locale: "de-DE", height: 480, limits: { cells: 10_000 } };
const de: string = LABELS.de.zones.rows;
const start: ViewInput = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
const defaults: Record<string, FieldDefaults> = { Units: { agg: "average", format: "number:1" } };
const partial: PartialLabels = { zones: { rows: de }, undo: "Zurück" };
// @ts-expect-error a label is text, not a number
const wrong: PartialLabels = { undo: 5 };
const deleteLater = async (name: string): Promise<void> => void name;
const keepCsv = (f: ExportFile): boolean => f.kind !== "csv" || f.blob.size < 0 || f.fileName === "";

export const elements = [
    <PivotReport key="a" {...props} onCellClick={onCell} onViewChange={(v: View) => v.rows.length} onSaveTemplate={(name: string, v: View) => [name, v]} labels={partial} />,
    <PivotReport key="b" data={[]} dataKey="v1" defaultView={start} fieldDefaults={defaults} onDeleteTemplate={deleteLater} onExport={keepCsv} />,
    <PivotReport key="c" view={start} onViewChange={() => undefined} labels={wrong} />,
    <PivotReport key="d" data={[]} tips={["top", "cells"]} storageKey="sales" dismissedTips={["values"]} onTipDismiss={(c) => c.dismissed.length + (c.id ?? "").length} fieldDefaults={{ Units: { label: "Units sold", description: "How many.", href: "https://example.org", type: "number" } }} />
];
