// The example files (scripts/examples.js): the committed view files, source notes and examples.json are what the
// script builds from the playground's presets with toViewFile, so a change of the view file format or
// of a preset turns this red until `node scripts/examples.js` writes them again; and each example's
// data, read as the CLI reads --data, renders its views as the playground's rows do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encode } from "pivotkit-core";
import { readFile } from "pivotkit-core/import";
import { render } from "pivotkit-report";
import { buildExamples } from "../scripts/examples.js";

const SHIPPED = new URL("../packages/pivotkit-cli/examples/", import.meta.url);
const built = await buildExamples();

test("the committed view files, the source notes and examples.json are what scripts/examples.js builds", () => {
    // every file but the data (build output)
    const committed = [...built.files.keys()].filter((name) => !name.endsWith(".csv"));
    assert.ok(committed.filter((name) => name.endsWith(".pivotkit.json")).length >= 3);
    for (const name of committed) {
        assert.equal(readFileSync(new URL(name, SHIPPED), "utf8"), built.files.get(name), `${name}: run node scripts/examples.js`);
    }
    assert.equal(readFileSync(new URL("examples.json", SHIPPED), "utf8"), built.manifest, "examples.json: run node scripts/examples.js");
});

test("every example's data, read back as the CLI reads it, renders each of its views without a finding", async () => {
    const { examples } = JSON.parse(built.manifest);
    for (const example of examples) {
        const table = await readFile(new File([built.files.get(example.data)], example.data));
        const data = encode(table);
        for (const view of example.files.filter((f) => f.endsWith(".pivotkit.json"))) {
            const result = await render(built.files.get(view), data, { format: "csv", strict: true });
            assert.deepEqual(result.issues, [], view);
            assert.ok(result.summary.rows > 0, view);
        }
    }
});
