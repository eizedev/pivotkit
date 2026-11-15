// When the data is from (dataAsOf) in a workbook: the custom document property DataAsOf, a date, in
// docProps/custom.xml with its content type and its package relationship, checked with an XML parser
// and read back by a reader that is not ours; nothing of it without dataAsOf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { readSheet } from "read-excel-file/node";
import { computePivot, encode, toGrid } from "../src/index.js";
import { isDataAsOf, toXlsx } from "../src/export.js";
import { SALES } from "./fixtures.js";

const grid = toGrid(computePivot(encode(SALES), { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] }));
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const list = (value) => (Array.isArray(value) ? value : [value]);

test("toXlsx: dataAsOf is the custom document property DataAsOf, a date the package declares", async () => {
    const bytes = toXlsx(grid, { sheetName: "Sales", dataAsOf: "2026-11-15T08:00:00Z" });
    const parts = unzipSync(bytes);
    for (const name of ["[Content_Types].xml", "_rels/.rels", "docProps/custom.xml"]) {
        assert.equal(XMLValidator.validate(strFromU8(parts[name])), true, name);
    }
    const custom = parser.parse(strFromU8(parts["docProps/custom.xml"])).Properties;
    assert.equal(custom.xmlns, "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties");
    assert.deepEqual(list(custom.property).map((p) => [p.name, p.pid, p.fmtid, p["vt:filetime"]]), [["DataAsOf", "2", "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}", "2026-11-15T08:00:00Z"]]);
    const types = list(parser.parse(strFromU8(parts["[Content_Types].xml"])).Types.Override);
    assert.ok(types.some((o) => o.PartName === "/docProps/custom.xml" && o.ContentType === "application/vnd.openxmlformats-officedocument.custom-properties+xml"));
    const rels = list(parser.parse(strFromU8(parts["_rels/.rels"])).Relationships.Relationship);
    assert.deepEqual(rels.map((r) => [r.Id, r.Target]), [["rId1", "xl/workbook.xml"], ["rId2", "docProps/custom.xml"]]);
    assert.equal(rels[1].Type, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties");
    // the sheet reads as before
    const rows = await readSheet(Buffer.from(bytes));
    assert.deepEqual(rows.at(-1), ["Grand Total", SALES.reduce((sum, r) => sum + r.Units, 0)]);
});

test("toXlsx: without dataAsOf no document property part; another form of it is refused", () => {
    const parts = unzipSync(toXlsx(grid));
    assert.equal(parts["docProps/custom.xml"], undefined);
    assert.doesNotMatch(strFromU8(parts["[Content_Types].xml"]), /custom-properties/);
    assert.doesNotMatch(strFromU8(parts["_rels/.rels"]), /custom-properties/);
    for (const bad of ["2026-02-30T25:00:00Z", "2026-02-30T08:00:00Z", "2026-11-15T24:00:00Z", "2026-11-15", "2026-11-15T08:00:00.000Z", "2026-11-15T08:00:00+01:00", "<x/>2026-11-15T08:00:00Z", 1763193600000]) {
        assert.throws(() => toXlsx(grid, { dataAsOf: /** @type {any} */ (bad) }), { code: "INVALID_ARGUMENT" }, String(bad));
        assert.equal(isDataAsOf(bad), false, String(bad));
    }
    assert.equal(isDataAsOf("2024-02-29T23:59:59Z"), true);
});
