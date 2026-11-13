// Golden files of CSV, JSON and HTML with "now", locale and time zone fixed: the same bytes on every
// run and on every machine (a child process with another TZ and LANG writes them too). After a change
// that is meant to change them: PIVOTKIT_UPDATE_GOLDEN=1 npm test -w pivotkit-report, and review the
// diff. The SVG is checked by its structure (svg.test.js), the XLSX by reading it back (#163).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "pivotkit-report";
import { FIXED, GOLDEN_VIEW, SALES } from "./fixtures.js";

const goldenOf = (name) => new URL(`golden/${name}`, import.meta.url);
const update = process.env.PIVOTKIT_UPDATE_GOLDEN === "1";

for (const format of ["csv", "json", "html"]) {
    test(`golden ${format}: the bytes of a fixed view, data, now, locale and time zone`, async () => {
        const r = await render({ format: "pivotkit-view", formatVersion: 2, name: "Units by region", view: GOLDEN_VIEW }, SALES, { format, source: "sales.csv", ...FIXED, locale: "de-DE", timeZone: "Europe/Berlin" });
        const file = goldenOf(`report.${format}`);
        if (update) {
            writeFileSync(file, r.body);
        }
        assert.equal(r.text, new TextDecoder().decode(readFileSync(file)), `${format} differs from test/golden/report.${format}`);
    });
}

test("the machine's time zone and language do not change a report", () => {
    const script = `import { render } from "pivotkit-report"; import { SALES, FIXED, GOLDEN_VIEW } from ${JSON.stringify(fileURLToPath(new URL("fixtures.js", import.meta.url)))};
const r = await render({ format: "pivotkit-view", formatVersion: 2, name: "Units by region", view: GOLDEN_VIEW }, SALES, { format: "html", source: "sales.csv", ...FIXED, locale: "de-DE", timeZone: "Europe/Berlin" });
process.stdout.write(r.text);`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: "Pacific/Auckland", LANG: "ja_JP.UTF-8" }, timeout: 60_000, cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" });
    assert.equal(out, readFileSync(goldenOf("report.html"), "utf8"));
});
