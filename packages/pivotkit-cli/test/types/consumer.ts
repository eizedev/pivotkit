// Compiled by `npm run test:types` against the generated declarations, through the package's exports.
import { main, versions } from "pivotkit-cli";
import { readSafe, writeSafe, allowedDirs, isInside } from "pivotkit-cli/safe-files";

export async function runIt(): Promise<number> {
    const allow: string[] = await allowedDirs(["."], process.cwd());
    const bytes: Uint8Array = await readSafe("view.json", { cwd: process.cwd(), allow, maxBytes: 1_000_000 });
    const written: string = await writeSafe("out.csv", bytes, { cwd: process.cwd(), allow });
    const code: number = await main(["--version"], { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd() });
    return code + written.length + (isInside("/a/b", "/a") ? 1 : 0) + Object.keys(versions()).length;
}
