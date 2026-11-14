// A directory link inside an allowed directory that leads out of it: a junction (a reparse point) on
// Windows, a symbolic link elsewhere (Node makes a symbolic link to a directory when the type
// "junction" is given on another system). Creating a junction needs no administrator rights, so CI's
// Windows job runs these. pivotkit-cli/files must follow it to its real path and refuse what lies
// outside, and never write through it or replace it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSafe, writeNew, writeSafe } from "pivotkit-cli/files";
import { SALES_CSV, tempDir } from "./helpers.js";

/** An allowed directory with a junction "out" to a directory beside it that holds secret.csv. */
function junctionToOutside() {
    const root = tempDir();
    const allowed = join(root, "allowed");
    const outside = join(root, "outside");
    mkdirSync(allowed);
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.csv"), SALES_CSV);
    writeFileSync(join(allowed, "data.csv"), SALES_CSV);
    symlinkSync(outside, join(allowed, "out"), "junction");
    return { allowed, outside };
}

const refused = (code) => (e) => e?.code === code;

test("a junction out of the allowed directory: a file behind it is not read", async () => {
    const { allowed } = junctionToOutside();
    const options = { cwd: allowed, allow: [allowed], maxBytes: 1_000_000 };
    assert.equal(new TextDecoder().decode(await readSafe("data.csv", options)), SALES_CSV);
    await assert.rejects(readSafe("out/secret.csv", options), refused("OUTSIDE_ALLOWED_DIR"));
    await assert.rejects(readSafe(join(allowed, "out", "secret.csv"), options), refused("OUTSIDE_ALLOWED_DIR"));
});

test("a junction out of the allowed directory: nothing is written through it", async () => {
    const { allowed, outside } = junctionToOutside();
    const options = { cwd: allowed, allow: [allowed] };
    await assert.rejects(writeSafe("out/report.csv", new TextEncoder().encode("x"), options), refused("OUTSIDE_ALLOWED_DIR"));
    await assert.rejects(writeSafe("out/secret.csv", new TextEncoder().encode("x"), options), refused("OUTSIDE_ALLOWED_DIR"));
    assert.deepEqual(readdirSync(outside), ["secret.csv"]);
    assert.equal(readFileSync(join(outside, "secret.csv"), "utf8"), SALES_CSV);
});

test("a junction at the target is refused, never replaced, with or without allowed directories", async () => {
    const { allowed, outside } = junctionToOutside();
    for (const allow of [[allowed], []]) {
        await assert.rejects(writeSafe("out", new TextEncoder().encode("x"), { cwd: allowed, allow }), refused("NOT_REGULAR_FILE"));
        await assert.rejects(writeSafe("out", new TextEncoder().encode("x"), { cwd: allowed, allow, exclusive: true }), refused("EXISTS"));
    }
    assert.deepEqual(readdirSync(outside), ["secret.csv"]);
    // the junction is still a link to the directory: its file is reached through it
    assert.equal(readFileSync(join(allowed, "out", "secret.csv"), "utf8"), SALES_CSV);
    assert.equal(await writeNew(allowed, "out", "csv", new TextEncoder().encode("y")), "out.csv");
});

test("an allowed directory given as a junction is its real directory", async () => {
    const { allowed, outside } = junctionToOutside();
    const { allowedDirs } = await import("pivotkit-cli/files");
    const allow = await allowedDirs(["out"], allowed);
    assert.deepEqual(allow, [outside]);
    assert.equal(new TextDecoder().decode(await readSafe("out/secret.csv", { cwd: allowed, allow, maxBytes: 1_000_000 })), SALES_CSV);
    await assert.rejects(readSafe("data.csv", { cwd: allowed, allow, maxBytes: 1_000_000 }), refused("OUTSIDE_ALLOWED_DIR"));
});
