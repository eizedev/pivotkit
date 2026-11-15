// When the data is from (dataAsOf) in the files a report makes: the html report's details ("Data as
// of", in the report's locale and time zone with the zone named) and the {{dataAsOf}} placeholder of a
// print template, the xlsx document property; nothing of it without dataAsOf, and only pivotkit's own
// form of the time is taken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { readFile } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";
import { render } from "pivotkit-report";
import { FIXED, SALES } from "./fixtures.js";

const VIEW = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
const AS_OF = "2026-11-15T08:00:00Z";

test("html: the default template's details name when the data is from, after the source", async () => {
    const r = await render(VIEW, SALES, { format: "html", ...FIXED, source: "sales.csv", dataAsOf: AS_OF });
    assert.match(r.text, /<dt>Source<\/dt><dd>sales\.csv<\/dd><dt>Data as of<\/dt><dd>Nov 15, 2026, 8:00 AM UTC<\/dd><dt>Rows<\/dt>/);
    // the report's locale and time zone, the zone named
    const de = await render(VIEW, SALES, { format: "html", ...FIXED, locale: "de-DE", timeZone: "Europe/Berlin", dataAsOf: AS_OF });
    assert.match(de.text, /<dt>Datenstand<\/dt><dd>15\. Nov\. 2026, 09:00 MEZ<\/dd>/);
    // without dataAsOf the details have no such line and no empty element
    const none = await render(VIEW, SALES, { format: "html", ...FIXED });
    assert.doesNotMatch(none.text, /Data as of/);
    assert.doesNotMatch(none.text, /<dd><\/dd>/);
});

test("html: a print template's {{dataAsOf}} placeholder, empty without one", async () => {
    const template = "<!doctype html><html><head><title>{{title}}</title></head><body><footer><p title=\"{{dataAsOf}}\">Data as of {{dataAsOf}}</p></footer>{{table}}</body></html>";
    const r = await render(VIEW, SALES, { format: "html", ...FIXED, template, dataAsOf: AS_OF });
    assert.match(r.text, /<p title="Nov 15, 2026, 8:00 AM UTC">Data as of Nov 15, 2026, 8:00 AM UTC<\/p>/);
    const none = await render(VIEW, SALES, { format: "html", ...FIXED, template });
    assert.match(none.text, /<p title="">Data as of <\/p>/);
});

test("xlsx: the workbook carries dataAsOf as the document property DataAsOf", async () => {
    const r = await render(VIEW, SALES, { format: "xlsx", ...FIXED, dataAsOf: AS_OF });
    assert.match(strFromU8(unzipSync(r.body)["docProps/custom.xml"]), /name="DataAsOf"><vt:filetime>2026-11-15T08:00:00Z<\/vt:filetime>/);
    // pivotkit-xlsx reads the workbook with its property as it reads one without
    const table = await readFile(new File([r.body], "report.xlsx"), { plugins: [xlsxReader] });
    const plain = await readFile(new File([(await render(VIEW, SALES, { format: "xlsx", ...FIXED })).body], "report.xlsx"), { plugins: [xlsxReader] });
    assert.ok(table.data.flat().map(String).includes("Grand Total"));
    assert.deepEqual(table.data, plain.data);
    assert.equal(unzipSync((await render(VIEW, SALES, { format: "xlsx", ...FIXED })).body)["docProps/custom.xml"], undefined);
});

test("dataAsOf: only a time that exists, in UTC to the second; csv, json and svg leave it to the result", async () => {
    for (const bad of ["2026-02-30T25:00:00Z", "2026-02-30T08:00:00Z", "2026-11-15T25:00:00Z", "2026-11-15T08:00:00.000Z", "2026-11-15 08:00", "<b>soon</b>", 1763193600000]) {
        await assert.rejects(render(VIEW, SALES, { format: "html", ...FIXED, dataAsOf: /** @type {any} */ (bad) }), { code: "INVALID_OPTION" }, String(bad));
    }
    for (const format of ["csv", "json"]) {
        const r = await render(VIEW, SALES, { format, ...FIXED, dataAsOf: AS_OF });
        assert.doesNotMatch(r.text ?? "", /2026-11-15/, format);
    }
});
