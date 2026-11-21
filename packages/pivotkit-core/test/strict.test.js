// computePivot with `strict` (#563): a view with an error issue throws INVALID_VIEW with the issues,
// instead of pivoting what is left of it; warnings do not throw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PivotkitError, computePivot, encode } from "pivotkit-core";

const data = encode([
    { Region: "East", Revenue: 3 },
    { Region: "West", Revenue: 4 }
]);

test("a filter on an unknown field: without strict all rows count; with strict it throws INVALID_VIEW", () => {
    const view = { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }], filters: [{ field: "Regoin", type: "in", items: ["East"] }] };
    const loose = computePivot(data, view);
    assert.equal(loose.rows.length, 2);
    assert.equal(loose.issues[0].code, "unknownField");
    assert.throws(
        () => computePivot(data, view, { strict: true }),
        (e) => e instanceof PivotkitError && e.code === "INVALID_VIEW" && e.details.issues.length === 1 && e.details.issues[0].code === "unknownField" && /filters\[0\]: unknown field "Regoin"/.test(e.message)
    );
});

test("strict with only warnings, or a clean view, pivots as usual; strict must be a boolean", () => {
    const clean = computePivot(data, { rows: ["Region"], values: [{ field: "Revenue", agg: "sum" }] }, { strict: true });
    assert.equal(clean.issues.length, 0);
    // a filter on items the data does not have is a warning
    const warned = computePivot(data, { rows: ["Region"], filters: [{ field: "Region", type: "in", items: ["east"] }] }, { strict: true });
    assert.ok(warned.issues.every((i) => i.severity === "warning"));
    assert.throws(() => computePivot(data, {}, { strict: "yes" }), (e) => e instanceof PivotkitError && e.code === "INVALID_OPTION");
});
