// npm audit signatures, tried again when the registry's answer cannot be read (FETCH_ERROR). The
// registry at times answers a GitHub runner's attestation request with the text "OK"
// instead of JSON, which fails the step without a word about the packages. A signature that does
// not verify fails every try, so the check stays as strict as one run of npm audit signatures.
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const TRIES = 3;
const PAUSE_MS = 20_000;

for (let attempt = 1; ; attempt++) {
    const run = spawnSync("npm", ["audit", "signatures"], { encoding: "utf8", shell: process.platform === "win32" });
    process.stdout.write(run.stdout ?? "");
    process.stderr.write(run.stderr ?? "");
    const unread = /\bFETCH_ERROR\b/.test(`${run.stdout}${run.stderr}`);
    if (run.status === 0 || !unread || attempt === TRIES) {
        process.exit(run.status ?? 1);
    }
    console.error(`npm audit signatures: the registry's answer could not be read (try ${attempt} of ${TRIES}); trying again in ${PAUSE_MS / 1000} s`);
    await sleep(PAUSE_MS);
}
