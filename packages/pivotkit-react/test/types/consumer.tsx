// Compiled by `npm run test:types` against the generated declarations, through the package's own
// exports map: the published types must describe the component as a TypeScript user sees it.
import React from "react";
import { PivotReport, type CellClick, type DataLoad, type ExportFile, type FieldDefaults, type PartialLabels, type PivotReportProps, type Template, type ViewInput } from "pivotkit-react";
import { LABELS } from "pivotkit-react/labels";
import type { View } from "pivotkit-core";

const templates: Template[] = [{ name: "By region", view: { rows: ["Region"] } }, { file: '{"format":"pivotkit-view","formatVersion":1,"name":"From a file","view":{}}', scope: "shared" }, { name: "Mine", view: {}, scope: "user", deletable: true }];
const publish = (name: string, view: ViewInput): Promise<string> => Promise.resolve(`${name}:${view.rows?.length ?? 0}`);
const store: PivotReportProps = { templates, templateStore: "browser", storageKey: "sales", canPublish: true, onPublishTemplate: publish, onSaveTemplate: (name, view, where) => [name, view.rows, where.scope], onDeleteTemplate: (name, where) => where.scope === "shared" && name };
const onCell = (c: CellClick): number => c.count + c.rows.length + c.row.length;
const props: PivotReportProps = { data: [{ Region: "North", Units: 3 }], templates, theme: "dark", locale: "de-DE", height: 480, limits: { cells: 10_000 }, importLimits: { rows: 1_000 } };
const de: string = LABELS.de.zones.rows;
const menuText: string = LABELS.en.cancel;
const start: ViewInput = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
const defaults: Record<string, FieldDefaults> = { Units: { agg: "average", format: "number:1" } };
const partial: PartialLabels = { zones: { rows: de }, undo: "Zurück" };
// @ts-expect-error a label is text, not a number
const wrong: PartialLabels = { undo: 5 };
const deleteLater = async (name: string): Promise<void> => void name;
const keepCsv = (f: ExportFile): boolean => f.kind !== "csv" || f.blob.size < 0 || f.fileName === "";
// loading data: a reader plugin, columnar data, the host told (and refusing a large file)
const jsonl = { apiVersion: 1 as const, kind: "reader" as const, name: "jsonl", label: "JSON Lines", accept: [".jsonl"], load: async () => ({ read: async (): Promise<never> => { throw new Error("not in this test"); } }) };
const onLoad = (d: DataLoad): boolean => !(d.cause === "load" && (d.file?.size ?? 0) > 50e6) && d.columns.every((c) => c.name.length > 0);
const columnar: PivotReportProps["data"] = { columns: ["Region", "Units"], types: ["string", "number"], data: [["North"], [3]] };

export const elements = [
    <PivotReport key="s" data={[]} {...store} />,
    <PivotReport key="a" {...props} onCellClick={onCell} onViewChange={(v: View) => v.rows.length} onSaveTemplate={(name: string, v: View) => [name, v]} labels={partial} />,
    <PivotReport key="b" data={[]} dataKey="v1" defaultView={start} fieldDefaults={defaults} onDeleteTemplate={deleteLater} onExport={keepCsv} />,
    <PivotReport key="c" view={start} onViewChange={() => undefined} labels={wrong} />,
    <PivotReport key="i" data={columnar} allowImport plugins={[jsonl]} onDataLoad={onLoad} importWorker={() => new Worker(new URL("pivotkit-react/import-worker", import.meta.url), { type: "module" })} />,
    <PivotReport key="d" data={[]} tips={["top", "cells"]} storageKey="sales" dismissedTips={["values"]} onTipDismiss={(c) => c.dismissed.length + (c.id ?? "").length} fieldDefaults={{ Units: { label: "Units sold", description: "How many.", href: "https://example.org", type: "number" } }} />
];
