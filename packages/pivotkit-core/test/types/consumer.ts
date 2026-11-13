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

// relative date ranges: today from options.now, the range as ISO days or null; "before" has no start
const range: { from: string | null; to: string } | null = relativeDateRange("year", 5, { now: new Date(), timeZone: "UTC" });
const before: { from: string | null; to: string } | null = relativeDateRange("week", 2, { direction: "before", calendar: false, weekStart: 7, anchor: "2025-06-30" });
void before;
const today: PivotResult = computePivot(encode([{ d: "2026-01-01" }]), { filters: [{ field: "d", type: "relative", unit: "year", count: 1 }] }, { now: "2026-11-09" });
// anchored at the data's latest date instead of today
const anchored: { from: string | null; to: string } | null = relativeDateRange("month", 12, { anchor: "latest", latest: "2025-12-31", timeZone: "UTC" });
const latest: PivotResult = computePivot(encode([{ d: "2026-01-01" }]), { filters: [{ field: "d", type: "relative", unit: "year", count: 1, anchor: "latest" }] });
void range;
void today;
void anchored;
void latest;

// loading a file: the built-in readers and a reader plugin; the table is encode's columnar input
import { BUILT_IN_READERS, readFile, retype, validatePlugin, type ImportTable, type ReaderPlugin } from "pivotkit-core/import";
import { type ColumnarData } from "pivotkit-core";
const plugin: ReaderPlugin = validatePlugin({ apiVersion: 1, kind: "reader", name: "demo", label: "Demo", accept: [".demo"], load: async () => ({ read: async () => ({}) }) });
export async function load(file: File): Promise<number> {
    const table: ImportTable = await readFile(file, { plugins: [plugin, ...BUILT_IN_READERS], limits: { fileBytes: 1_000_000 }, signal: new AbortController().signal, onProgress: (p) => void p.phase, types: { Zip: "string" } });
    const again: ImportTable = retype(table, ["string", "number"]);
    const columnar: ColumnarData = { columns: again.columns, types: again.types, data: again.data };
    return encode(columnar).length + encode(table).length + table.notes.filter((n) => n.code === "TEXT_CUT").length;
}

// a link of a page's fragment, with its data source; views checked with severities and hints
import { readViewLink } from "pivotkit-core/link";
import { outsideLimits, validate, foldText } from "pivotkit-core";
const link = readViewLink("#pivot-sales=1.abc", "sales", { allowParams: ["year"] });
const srcId: string | undefined = link.src?.id;
const year: string | undefined = link.src?.params?.year;
const checked = validate(link.view ?? {}, encode([{ a: 1 }]), { limits: outsideLimits({ rows: 10 }) });
const warned: boolean = checked.warnings.some((w) => w.severity === "warning" && w.params?.suggestion !== undefined);
const folded: string = foldText(" A\u00A0b ", { case: "insensitive", whitespace: "collapse" });
void srcId;
void year;
void warned;
void folded;
