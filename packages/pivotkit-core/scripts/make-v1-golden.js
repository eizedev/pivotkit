// Records v1-golden.json: the rows every view of V1_CASES keeps and the link text of every
// LINK_CASES entry. Run once with the pivotkit-core that wrote view format version 1 (0.4.0):
//   node scripts/make-v1-golden.js
// It lives outside test/ so that `node --test` does not run it.
// The file is a record of that version's results; never run this with a later version, which would
// make the golden test compare a version with itself.
import { writeFileSync } from "node:fs";
import { computePivot, encode, VIEW_VERSION } from "../src/index.js";
import { encodeViewLink } from "../src/link.js";
import { DATA_SETS, LINK_CASES, NOW, V1_CASES } from "../test/v1-corpus.js";

if (VIEW_VERSION !== 1) {
    throw new Error("v1-golden.json is recorded with view format version 1 only");
}
const encoded = Object.fromEntries(Object.entries(DATA_SETS).map(([name, rows]) => [name, encode(rows)]));
const rows = {};
for (const c of V1_CASES) {
    const result = computePivot(encoded[c.data], c.view, { now: NOW });
    if (result.issues.length) {
        throw new Error(`${c.name}: ${JSON.stringify(result.issues)}`);
    }
    rows[c.name] = Array.from(result.rows).sort((a, b) => a - b);
}
const links = Object.fromEntries(LINK_CASES.map((c) => [c.name, encodeViewLink(c.envelope)]));
// one line per case, so a change in the file reads as the cases it touches
const lines = (obj) => Object.entries(obj).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
writeFileSync(new URL("../test/v1-golden.json", import.meta.url), `{\n  "now": ${JSON.stringify(NOW)},\n  "rows": {\n${lines(rows)}\n  },\n  "links": {\n${lines(links)}\n  }\n}\n`);
console.log(`${V1_CASES.length} cases, ${LINK_CASES.length} links`);
