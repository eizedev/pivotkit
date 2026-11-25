// Compiled by `npm run test:types` against the generated declarations, through the package's own
// exports map: the published types must describe the public API as a TypeScript user sees it.
import {
    computePivot, dateUnitFor, describeSource, encode, fieldDefaultsFromSchema, fieldLabel, foldText, GROUPING_NAMES, groupingName, isDateMs, isIdentifierName, LIMITS,
    MAX_DATE_MS, normalize, outsideLimits, PivotkitError, relativeDateRange, renameFields, suggestLayout, toEChartsOption, toGrid, validate, viewFromLayout,
    type ColumnarData, type EncodeIssue, type Grid, type LayoutView, type PivotResult, type SchemaFieldDefaults, type View
} from "pivotkit-core";
import { rowsToCsv, rowsToXlsx, toCsv, toJson, toTsv, toXlsx } from "pivotkit-core/export";
import { parseTemplates, templatesFromSchema, TEMPLATE_LIMITS, TEMPLATES_EXTENSION } from "pivotkit-core/templates";
import { BUILT_IN_READERS, createTable, readFile, retype, sourceIdOf, validatePlugin, type ImportTable, type PluginTable, type ReaderModule, type ReaderPlugin } from "pivotkit-core/import";
import { readViewLink } from "pivotkit-core/link";

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
// encode()'s own issues: a column name in two spellings, the row 0-based where there is one
const caseIssues: EncodeIssue[] = encode([{ Team: "A" }, { team: "B" }]).issues;
const caseCode: "columnCase" | "columnCaseValue" | "columnCaseLeftOut" | undefined = caseIssues[0]?.code;
const caseRow: number | undefined = caseIssues[0]?.params.row;
const pasted: string = toTsv(grid) + toTsv([["a", "b"]]) + toJson(grid, { space: 0 });
export const all = [firstName, read.issues.length, fromSchema.templates.length, TEMPLATE_LIMITS.count, issues.length, bytes.length, csv.length, rowsCsv.length, rowsBytes.length, pasted.length, option, code, grid.locale, shown, schemaIssues.length, caseCode, caseRow];

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
// the Date limit: a number a Date holds, narrowed by the guard
const edge: unknown = MAX_DATE_MS;
const edgeMs: number = isDateMs(edge) ? edge : 0;
void edgeMs;
void anchored;
void latest;

// loading a file: the built-in readers and a reader plugin; the table is encode's columnar input
// a reader's table builder: its options are typed
const builder = createTable({ file: "a.csv", limits: LIMITS, locale: "en-US", hints: { decimal: "," } });
builder.row(["a"]);
const builtTable: ImportTable = builder.finish();
void builtTable;
// @ts-expect-error a table needs the file's name and the limits
createTable({ locale: "en-US" });
// a reader built by hand returns columns, types, data and notes; readFile fills in the rest
const handBuilt: PluginTable = { columns: ["a"], types: ["string"], data: [["x"]], notes: [] };
const handReader: ReaderModule = { read: async () => handBuilt };
void handReader;
const plugin: ReaderPlugin = validatePlugin({ apiVersion: 1, kind: "reader", name: "demo", label: "Demo", accept: [".demo"], load: async () => ({ read: async () => ({}) }) });
export async function load(file: File): Promise<number> {
    const table: ImportTable = await readFile(file, { plugins: [plugin, ...BUILT_IN_READERS], limits: { fileBytes: 1_000_000 }, signal: new AbortController().signal, onProgress: (p) => void p.phase, types: { Zip: "string" } });
    const again: ImportTable = retype(table, ["string", "number"]);
    // the decimal mark of number columns, by name or by position
    const comma: ImportTable = retype(table, {}, { decimal: { Sales: "," } });
    const byPosition: ImportTable = retype(table, ["number"], { decimal: [","] });
    void comma;
    void byPosition;
    const columnar: ColumnarData = { columns: again.columns, types: again.types, data: again.data };
    return encode(columnar).length + encode(table).length + table.notes.filter((n) => n.code === "TEXT_CUT").length;
}

// a link of a page's fragment, with its data source; views checked with severities and hints
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

// a view from a layout and the data's field description; a file's source id
const described = describeSource(encode([{ Region: "North", Units: 3 }]));
const suggestion = suggestLayout(described, { locale: "de-DE" });
const pickCodes: string[] = suggestion.picks.map((p) => p.code);
const built = viewFromLayout({ ...suggestion.layout, values: [{ field: "Units", agg: "average" }], groups: [{ field: "When", by: "yearMonth" }], map: { Units: "Stück" } }, described, { locale: "en-US" });
const draftName: string = built.name;
const noteCodes: string[] = built.notes.map((n) => n.code);
const renamed: string[] = renameFields(built.view, { Region: "Area" }).unused;
const unit: string | null = dateUnitFor(0, 86_400_000 * 90);
const grouped: string = groupingName("Date", "yearMonth", { locale: "de-DE" }) + GROUPING_NAMES.en.name;
const identifier: boolean = isIdentifierName("Order No");
const sourceId: Promise<string> = sourceIdOf("sales.csv", ["Region", "Units"]);
void normalize(built.view, data);
// the view of a layout is raw: its parts typed, the whole a View once normalized
const layoutView: LayoutView = built.view;
const layoutRows: string[] = layoutView.rows;
// @ts-expect-error a layout view's rows are names
built.view.rows.push(5);
const normalizedLayout: View = normalize(layoutView, data).view;
void layoutRows;
void normalizedLayout;
void pickCodes;
void draftName;
void noteCodes;
void renamed;
void unit;
void grouped;
void identifier;
void sourceId;
