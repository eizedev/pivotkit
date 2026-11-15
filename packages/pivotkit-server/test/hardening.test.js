// The fixes of the 0.7.0 pre-release review (an operator's walkthrough and a security and privacy
// review): each test fails on the code before its fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConfig } from "pivotkit-server";
import { call, factsOf, restServer, workspace } from "./helpers.js";

// --- F2: columns the file gives no header never take a "show" default --------------------------------

/**
 * Staff with a hidden salary in the last column; the third row's name holds an unquoted comma, so its
 * salary lands in a sixth column the header does not name ("Column 6").
 */
const STAFF_CSV = ["Name,Team,Office,Grade,Salary", "Ann,a,Berlin,3,51234", "Bob,b,Hamburg,4,62345", "Carl,Jr,c,Munich,5,73456"].join("\n") + "\n";
const STAFF_POLICY = Object.freeze({ default: "show", fields: { Salary: "hide" } });

test("F2: a column a long row adds is hidden under default show; its values reach neither describe nor a render", async () => {
    const dir = workspace({ "staff.csv": STAFF_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: STAFF_POLICY } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.equal(described.status, 200);
        const text = JSON.stringify(described.data);
        assert.doesNotMatch(text, /Column 6/, "the column without a header is not described");
        assert.doesNotMatch(text, /73456/, "no salary of the shifted row");
        const all = await call(`${server.api}/views/render`, { body: { source: "staff", view: { rows: ["Name"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(all.data), /73456/);
        const asked = await call(`${server.api}/views/render`, { body: { source: "staff", view: { rows: ["Column 6"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(asked.data), /73456/, "asking for it by its name gives nothing of it");
    } finally {
        await server.close();
    }
});

test("F2: an operator's own rule for such a column still holds", async () => {
    const dir = workspace({ "staff.csv": STAFF_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "summary", fields: { "Column 6": "show" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.match(JSON.stringify(described.data), /Column 6/);
    } finally {
        await server.close();
    }
});

test("F2: check-config prints such a column as hidden and warns of a default show with hidden fields (a deny list)", async () => {
    const dir = workspace({ "staff.csv": STAFF_CSV });
    const text = factsOf((await checkConfig({ sources: { staff: { file: "data/staff.csv", policy: STAFF_POLICY } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(text, /^ {6}Column 6: hide \(the file gives this column no header\)$/m);
    assert.match(text, /^WARNING \(Sources\): sources\.staff\.policy: "show" by default with hidden fields is a deny list/m);
    // a default that is not show, or show without a hidden field: no such warning
    const closed = factsOf((await checkConfig({ sources: { staff: { file: "data/staff.csv", policy: { default: "summary", fields: { Salary: "hide" } } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(closed, /deny list/);
    const open = factsOf((await checkConfig({ sources: { staff: { file: "data/staff.csv", policy: { default: "show" } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(open, /deny list/);
});
