// The source id of a loaded file (source-id.js, pivotkit-core/import): what the browser's report and
// the CLI name a file's views by.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SHOWN_MAX, shownName, sourceIdOf } from "pivotkit-core/import";
import { sha256Bytes, sha256Hex } from "../src/source-id.js";

test("SHA-256 of its own gives Node's digest, at every padding boundary and for text outside ASCII", async () => {
    for (const text of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(119), "Größe\u0000Straße 😀", "x".repeat(5000)]) {
        const want = createHash("sha256").update(text, "utf8").digest("hex");
        assert.equal(Buffer.from(sha256Bytes(new TextEncoder().encode(text))).toString("hex"), want, `${text.length} characters`);
        assert.equal(await sha256Hex(text, { subtle: null }), want, "without crypto.subtle");
        assert.equal(await sha256Hex(text), want, "with crypto.subtle");
    }
});

test("a file's source id is its name and 16 hex digits of the SHA-256 of its name and columns, as the PowerShell Universal demo builds it", async () => {
    const columns = ["Id", "Team", "Opened"];
    const want = `tickets.csv#${createHash("sha256").update(["tickets.csv", ...columns].join("\u0000"), "utf8").digest("hex").slice(0, 16)}`;
    assert.equal(await sourceIdOf("tickets.csv", columns), want);
    assert.equal(await sourceIdOf("tickets.csv", columns, { subtle: null }), want);
    // other or reordered columns are other data; the same file again is the same
    assert.notEqual(await sourceIdOf("tickets.csv", ["Team", "Id", "Opened"]), want);
    assert.equal(await sourceIdOf("tickets.csv", [...columns]), want);
    // the worked example of docs/reference/import.md ("How a loaded file is named")
    assert.equal(await sourceIdOf("tickets.csv", ["Id", "Team", "Opened", "Hours", "Zip"]), "tickets.csv#e51bd4bc21e98ee8");
    assert.equal(await sourceIdOf("tickets.csv", ["Team", "Id", "Opened", "Hours", "Zip"], { subtle: null }), "tickets.csv#d11fe64346f1d906");
    // a long name is cut for people, the hash still covers all of it
    const long = `${"a".repeat(130)}.csv`;
    const other = `${"a".repeat(130)}x.csv`;
    const id = await sourceIdOf(long, columns);
    assert.equal(id.split("#")[0], `${"a".repeat(SHOWN_MAX - 3)}...`);
    assert.notEqual(id, await sourceIdOf(other, columns));
    // never cut inside a character outside the BMP
    const emoji = `${"a".repeat(SHOWN_MAX - 4)}😀😀😀`;
    assert.equal(shownName(emoji), `${"a".repeat(SHOWN_MAX - 4)}...`);
    assert.equal(shownName("short.csv"), "short.csv");
});

