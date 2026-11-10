// Compiled by `npm run test:types` against the generated declarations, through the package's exports.
import { readFile, type ImportTable, type ReaderPlugin, type SheetInfo } from "pivotkit-core/import";
import xlsxReader, { xlsxReader as named } from "pivotkit-xlsx";
import { read, sheets } from "pivotkit-xlsx/reader";

const plugin: ReaderPlugin = xlsxReader;
export async function load(file: File): Promise<number> {
    const list: SheetInfo[] = await sheets(file);
    const first: ImportTable = await read(file, { sheet: list[0]?.name ?? 0, limits: { unpackedBytes: 1e8 } });
    const viaCore: ImportTable = await readFile(file, { plugins: [plugin, named] });
    return first.rowCount + viaCore.columns.length;
}
