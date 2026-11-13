// Compiled by `npm run test:types` against the generated declarations, through the package's exports.
import { main, versions } from "pivotkit-cli";

export async function runIt(): Promise<number> {
    const code: number = await main(["--version"], { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd() });
    return code + Object.keys(versions()).length;
}
