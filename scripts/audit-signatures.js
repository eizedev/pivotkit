// npm audit signatures, tried again when npm cannot read the registry's answer (FETCH_ERROR): the
// registry sometimes answers an attestation request with text that is no JSON. Any other failure,
// a signature that does not verify above all, fails at once, so the check is as strict as one run.
// PIVOTKIT_AUDIT_PAUSE_MS shortens the pause between tries (tests/audit-signatures.test.js).
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// the registry answers so while it throttles a runner: a longer pause each time (20, 40, 60, 80 s)
const TRIES = 5;
const PAUSE_MS = Number(process.env.PIVOTKIT_AUDIT_PAUSE_MS) || 20_000;

for (let attempt = 1; ; attempt++) {
    const run = spawnSync("npm", ["audit", "signatures"], { encoding: "utf8", shell: process.platform === "win32" });
    if (run.error) console.error(`npm audit signatures could not start: ${run.error.message}`);
    process.stdout.write(run.stdout ?? "");
    process.stderr.write(run.stderr ?? "");
    const unread = /\bFETCH_ERROR\b/.test(`${run.stdout}${run.stderr}`);
    if (run.status === 0 || !unread || attempt === TRIES) {
        process.exit(run.status ?? 1);
    }
    console.error(`npm audit signatures: the registry's answer could not be read (try ${attempt} of ${TRIES}); trying again in ${(PAUSE_MS * attempt) / 1000} s`);
    await sleep(PAUSE_MS * attempt);
}
