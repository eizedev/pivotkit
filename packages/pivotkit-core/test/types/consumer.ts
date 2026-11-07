// Compiled by `npm run test:types` against the generated declarations, through the package's own
// exports map: the published types must describe the public API as a TypeScript user sees it.
import { computePivot, encode, fieldDefaultsFromSchema, fieldLabel, normalize, PivotkitError, toEChartsOption, toGrid, type Grid, type PivotResult, type SchemaFieldDefaults, type View } from "pivotkit-core";
import { toCsv, toXlsx } from "pivotkit-core/export";

const data = encode([{ Region: "North", Units: 3 }], { timeZone: "UTC", inferNumbers: true });
const { view, issues }: { view: View; issues: Array<{ path: string; message: string }> } = normalize({ rows: ["Region"] }, data);
const result: PivotResult = computePivot(data, view, { locale: "de-DE", limits: { cells: 1000 } });
const grid: Grid = toGrid(result, { labels: { grandTotal: "Summe" } });
const bytes: Uint8Array = toXlsx(grid, { sheetName: "Pivot" });
const csv: string = toCsv(grid, { separator: ";" });
const option: object = toEChartsOption(result, { chart: { type: "bar" }, theme: { colors: ["#123456"] } });
const code: string = new PivotkitError("LIMIT_EXCEEDED", "x").code;
const { defaults, issues: schemaIssues }: { defaults: Record<string, SchemaFieldDefaults>; issues: Array<{ path: string; message: string }> } = fieldDefaultsFromSchema({ openapi: "3.1.0", components: { schemas: { Row: { properties: { Units: { title: "Units sold" } } } } } }, { schema: "Row" });
const shown: string = fieldLabel("Units", { fields: { Units: defaults.Units?.label ?? "Units" } });
export const all = [issues.length, bytes.length, csv.length, option, code, grid.locale, shown, schemaIssues.length];
