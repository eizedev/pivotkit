// Compiled by `npm run test:types` against the generated declarations, through the package's exports.
import { CliError, readSafe, readTable } from "pivotkit-node/files";
import { REST_BASE, isLoopback } from "pivotkit-node/rest";

export async function readIt(path: string): Promise<number> {
    const bytes: Uint8Array = await readSafe(path, { cwd: process.cwd(), allow: [], maxBytes: 1024 });
    const { notes } = await readTable(bytes, path);
    const error = new CliError("io", "NOT_FOUND", `${REST_BASE}: not found`);
    return notes.length + (isLoopback("localhost") ? 1 : 0) + error.code.length;
}
