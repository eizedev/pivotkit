// The sheet of a workbook a view was made on (issue #252): a view file or link that names its sheet
// (source.params.sheet) is rendered and validated on that sheet when --sheet is not given; --sheet
// overrides it; a sheet the workbook does not have, named by the view or by --sheet, is an error that
// names the sheets there are; describe lists a workbook's sheets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { toViewFile } from "pivotkit-core";
import { encodeViewLink } from "pivotkit-core/link";
import { SHEET_BOOKS } from "../../pivotkit-xlsx/test/make-xlsx.js";
import { run, tempDir } from "./helpers.js";

/** A view file as pivotkit-react writes it for a workbook's sheet. */
const viewOn = (sheet, view, name = "On a sheet") => toViewFile(view, { name, source: { id: "book.xlsx#0123456789abcdef", name: "book.xlsx", ...(sheet ? { params: { sheet } } : {}) } });
const BY_PRODUCT = { rows: ["Product"], values: [{ field: "Revenue", agg: "sum" }] };
const BY_REGION = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };

/** A directory with quarters.xlsx, months.xlsx and the view files. */
function books() {
    const dir = tempDir();
    writeFileSync(join(dir, "quarters.xlsx"), SHEET_BOOKS.quarters());
    writeFileSync(join(dir, "months.xlsx"), SHEET_BOOKS.months());
    writeFileSync(join(dir, "q3.pivotkit.json"), JSON.stringify(viewOn("Q3", BY_PRODUCT)));
    writeFileSync(join(dir, "q4.pivotkit.json"), JSON.stringify(viewOn("Q4", BY_PRODUCT)));
    writeFileSync(join(dir, "mar.pivotkit.json"), JSON.stringify(viewOn("Mar", BY_REGION)));
    writeFileSync(join(dir, "nosheet.pivotkit.json"), JSON.stringify(viewOn(null, BY_REGION)));
    return dir;
}

test("render reads the sheet the view names: Q3's products, not the first sheet's unknown fields", async () => {
    const dir = books();
    const r = await run(["render", "q3.pivotkit.json", "--data", "quarters.xlsx", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Alpha,35/);
    assert.match(r.stdout, /Beta,70/);
    assert.match(r.stdout, /Grand Total,105/);
    const json = await run(["render", "q3.pivotkit.json", "--data", "quarters.xlsx", "-o", "out.csv", "--json"], { cwd: dir });
    assert.equal(json.code, 0, json.stdout);
    const out = JSON.parse(json.stdout);
    assert.equal(out.sheet, "Q3");
    assert.ok(out.findings.some((f) => f.code === "viewSheet" && f.severity === "info" && /Q3/.test(f.message)), JSON.stringify(out.findings));
});

test("sheets with the same columns: the view's sheet decides the values; --sheet overrides it", async () => {
    const dir = books();
    const mar = await run(["render", "mar.pivotkit.json", "--data", "months.xlsx", "-f", "csv"], { cwd: dir });
    assert.equal(mar.code, 0, mar.stderr);
    assert.match(mar.stdout, /East,300/);
    assert.match(mar.stdout, /Grand Total,400/);
    const feb = await run(["render", "mar.pivotkit.json", "--data", "months.xlsx", "--sheet", "Feb", "-f", "csv"], { cwd: dir });
    assert.equal(feb.code, 0, feb.stderr);
    assert.match(feb.stdout, /Grand Total,30/);
    assert.doesNotMatch(feb.stdout, /East/);
});

test("a view without a sheet reads the first visible sheet, as before", async () => {
    const dir = books();
    const r = await run(["render", "nosheet.pivotkit.json", "--data", "months.xlsx", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Grand Total,3/);
});

test("a sheet the workbook does not have: named by the view or by --sheet, an error that lists the sheets", async () => {
    const dir = books();
    const fromView = await run(["render", "q4.pivotkit.json", "--data", "quarters.xlsx", "-f", "csv"], { cwd: dir });
    assert.equal(fromView.code, 2);
    assert.match(fromView.stderr, /no sheet "Q4"/);
    assert.match(fromView.stderr, /source\.params\.sheet/);
    assert.match(fromView.stderr, /"Q1", "Q2", "Q3"/);
    const fromOption = await run(["render", "q3.pivotkit.json", "--data", "quarters.xlsx", "--sheet", "Q9", "-f", "csv", "-o", "x.csv", "--json"], { cwd: dir });
    assert.equal(fromOption.code, 2);
    const error = JSON.parse(fromOption.stdout).error;
    assert.equal(error.kind, "io");
    assert.equal(error.code, "NO_SHEET");
    assert.match(error.message, /no sheet "Q9"/);
    assert.match(error.message, /"Q1", "Q2", "Q3"/);
});

test("validate and describe of a view use the view's sheet too", async () => {
    const dir = books();
    const valid = await run(["validate", "q3.pivotkit.json", "--data", "quarters.xlsx"], { cwd: dir });
    assert.equal(valid.code, 0, valid.stderr);
    const described = await run(["describe", "q3.pivotkit.json", "--data", "quarters.xlsx"], { cwd: dir });
    assert.equal(described.code, 0, described.stderr);
    assert.match(described.stdout, /Product/);
});

test("a link names the sheet as the view file does", async () => {
    const dir = books();
    const link = `https://example.test/report#pivot=${encodeViewLink(toViewFile(BY_PRODUCT, { name: "Q3", source: { id: "quarters.xlsx#0123456789abcdef", params: { sheet: "Q3" } } }, { link: true }))}`;
    const r = await run(["render", "--link", link, "--data", "quarters.xlsx", "-f", "csv"], { cwd: dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Grand Total,105/);
});

test("describe lists a workbook's sheets and says which one it read", async () => {
    const dir = books();
    const text = await run(["describe", "quarters.xlsx"], { cwd: dir });
    assert.equal(text.code, 0, text.stderr);
    assert.match(text.stdout, /sheets: "Q1" \(read\), "Q2", "Q3"/);
    const q2 = await run(["describe", "quarters.xlsx", "--sheet", "Q2", "--json"], { cwd: dir });
    assert.equal(q2.code, 0, q2.stdout);
    const out = JSON.parse(q2.stdout);
    assert.equal(out.sheet, "Q2");
    assert.deepEqual(out.sheets, [{ name: "Q1", index: 0, visible: true }, { name: "Q2", index: 1, visible: true }, { name: "Q3", index: 2, visible: true }]);
    assert.deepEqual(out.description.fields.map((f) => f.name), ["Team", "Hours"]);
});

test("data that is no workbook: the view's sheet is not used, and --json says so", async () => {
    const dir = books();
    writeFileSync(join(dir, "q3.csv"), "Product,Revenue\nAlpha,1\n");
    const r = await run(["render", "q3.pivotkit.json", "--data", "q3.csv", "-o", "out.csv", "--json"], { cwd: dir });
    assert.equal(r.code, 0, r.stdout);
    const out = JSON.parse(r.stdout);
    assert.equal(out.sheet, null);
    assert.ok(out.findings.some((f) => f.code === "viewSheet" && f.severity === "info" && /no workbook/.test(f.message)));
});

test("an empty --sheet counts as not given: the view's sheet is read; describe of a CSV gives sheet null", async () => {
    const dir = books();
    const r = await run(["render", "q3.pivotkit.json", "--data", "quarters.xlsx", "--sheet", "", "-o", "out.csv", "--json"], { cwd: dir });
    assert.equal(r.code, 0, r.stdout);
    assert.equal(JSON.parse(r.stdout).sheet, "Q3");
    writeFileSync(join(dir, "d.csv"), "A,B\nx,1\n");
    const csv = JSON.parse((await run(["describe", "d.csv", "--json"], { cwd: dir })).stdout);
    assert.equal(csv.sheet, null);
    assert.equal(csv.sheets, undefined);
});
