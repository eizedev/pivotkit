// Compiled by `npm run test:types` against the generated declarations, through the package's own
// exports map: the published types must describe the public API as a TypeScript user sees it.
import { computePivot, encode, fieldDefaultsFromSchema, fieldLabel, normalize, PivotkitError, relativeDateRange, toEChartsOption, toGrid, type Grid, type PivotResult, type SchemaFieldDefaults, type View } from "pivotkit-core";
import { rowsToCsv, rowsToXlsx, toCsv, toJson, toTsv, toXlsx } from "pivotkit-core/export";
import { parseTemplates, templatesFromSchema, TEMPLATE_LIMITS, TEMPLATES_EXTENSION } from "pivotkit-core/templates";

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
const read = parseTemplates([{ name: "By region", view: { rows: ["Region"] } }]);
const firstName: string | undefined = read.templates[0]?.name;
const fromSchema = templatesFromSchema({ [TEMPLATES_EXTENSION]: [] }, {});
const rowsCsv: string = rowsToCsv(data, [0], { columns: ["Units"], formats: { Units: "integer" }, labels: { fields: { Units: "Units sold" } } });
const rowsBytes: Uint8Array = rowsToXlsx(data, new Int32Array([0]), { sheetName: "Rows", locale: "de-DE" });
const pasted: string = toTsv(grid) + toTsv([["a", "b"]]) + toJson(grid, { space: 0 });
export const all = [firstName, read.issues.length, fromSchema.templates.length, TEMPLATE_LIMITS.count, issues.length, bytes.length, csv.length, rowsCsv.length, rowsBytes.length, pasted.length, option, code, grid.locale, shown, schemaIssues.length];

// relative date ranges: today from options.now, the range as ISO days or null
const range: { from: string; to: string } | null = relativeDateRange("year", 5, { now: new Date(), timeZone: "UTC" });
const today: PivotResult = computePivot(encode([{ d: "2026-01-01" }]), { filters: [{ field: "d", type: "relative", unit: "year", count: 1 }] }, { now: "2026-11-09" });
// anchored at the data's latest date instead of today
const anchored: { from: string; to: string } | null = relativeDateRange("month", 12, { anchor: "latest", latest: "2025-12-31", timeZone: "UTC" });
const latest: PivotResult = computePivot(encode([{ d: "2026-01-01" }]), { filters: [{ field: "d", type: "relative", unit: "year", count: 1, anchor: "latest" }] });
void range;
void today;
void anchored;
void latest;
