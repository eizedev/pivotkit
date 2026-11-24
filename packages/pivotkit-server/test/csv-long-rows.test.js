// CSV rows longer than their header, and the columns such rows add: a value shifted by an unquoted
// separator inside an earlier value lands under another column, so where a source keeps a field
// back such a row is left out (#479), and a column the header does not name is hidden under a
// "show" default. Nothing of a shifted row reaches describe or a render; check-config says so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, factsOf, restServer, workspace } from "./helpers.js";
import { checkConfig } from "pivotkit-server";

/**
 * Staff with a hidden salary in the last column; the third row's name holds an unquoted comma, so its
 * salary lands in a sixth column the header does not name ("Column 6").
 */
const STAFF_CSV = ["Name,Team,Office,Grade,Salary", "Ann,a,Berlin,3,51234", "Bob,b,Hamburg,4,62345", "Carl,Jr,c,Munich,5,73456"].join("\n") + "\n";
const STAFF_POLICY = Object.freeze({ default: "show", fields: { Salary: "hide" } });

test("a column without a header: a column a long row adds is hidden under default show; its values reach neither describe nor a render", async () => {
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

test("a column without a header: an operator's own rule for such a column still holds", async () => {
    const dir = workspace({ "staff.csv": STAFF_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "summary", fields: { "Column 6": "show" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.match(JSON.stringify(described.data), /Column 6/);
    } finally {
        await server.close();
    }
});

test("a column without a header: check-config prints such a column as hidden and warns of a default show with hidden fields (a deny list)", async () => {
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

/** Two hidden salaries; the third row's name holds an unquoted comma, so 73457 shifts into Office. */
const SHIFTED_CSV = ["Name,Team,Salary,Salary,Office,Grade", "Ann,a,51234,51235,Berlin,3", "Bob,b,62345,62346,Hamburg,4", "Carl,Jr,c,73456,73457,Munich,5"].join("\n") + "\n";

test("#479: a row longer than its header is left out of a source that hides a field, with a read note; nothing of it reaches describe or a render", async () => {
    const dir = workspace({ "staff.csv": SHIFTED_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "show", fields: { Salary: "hide", "Salary (2)": "hide" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.equal(described.status, 200);
        const text = JSON.stringify(described.data);
        assert.doesNotMatch(text, /7345[67]|Carl|Munich/, "nothing of the shifted row");
        assert.equal(described.data.rows, 2);
        assert.ok(described.data.notes.some((n) => n.code === "ROWS_DROPPED" && /1 row/.test(n.message)), JSON.stringify(described.data.notes));
        const office = await call(`${server.api}/views/render`, { body: { source: "staff", view: { rows: ["Office"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(office.data), /7345[67]/);
    } finally {
        await server.close();
    }
});

test("#479: a source that hides nothing keeps such a row (its extra values in a hidden Column N), as before", async () => {
    const dir = workspace({ "staff.csv": SHIFTED_CSV });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "show" } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.equal(described.data.rows, 3);
        assert.ok(!described.data.notes.some((n) => n.code === "ROWS_DROPPED"));
    } finally {
        await server.close();
    }
});

test("#479: a hidden column in the middle: the shifted salary never shows under the next column", async () => {
    const dir = workspace({ "staff.csv": "Name,Salary,Team,Office\nAnn,51234,a,Berlin\nCarl, Jr,73456,c,Munich\n" });
    const server = await restServer({ sources: { staff: { file: "data/staff.csv", policy: { default: "show", fields: { Salary: "hide" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "staff" } });
        assert.doesNotMatch(JSON.stringify(described.data), /73456/);
        const team = await call(`${server.api}/views/render`, { body: { source: "staff", view: { rows: ["Team"], values: [{ agg: "count" }] }, format: "json" } });
        assert.doesNotMatch(JSON.stringify(team.data), /73456/);
    } finally {
        await server.close();
    }
});

test("#479: the ROWS_DROPPED note stays when a hidden column is called name (notes are cleaned by code, not by a word in their text)", async () => {
    const dir = workspace({ "people.csv": "Name,Team,Office\nAnn,a,Berlin\nCarl,Jr,c,Munich\n" });
    const server = await restServer({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { Name: "hide" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        assert.ok(described.data.notes.some((n) => n.code === "ROWS_DROPPED"), JSON.stringify(described.data.notes));
        assert.ok(described.data.notes.some((n) => n.code === "COLUMNS_ADDED"), JSON.stringify(described.data.notes));
    } finally {
        await server.close();
    }
});

test("#479: a row longer than its header only by an empty last cell is left out too: its values are shifted all the same", async () => {
    const dir = workspace({ "people.csv": "name,ssn,city\nann,11,Berlin\nbob,12,3,\n" });
    const server = await restServer({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { ssn: "hide" } } } }, baseDir: dir });
    try {
        const city = await call(`${server.api}/views/render`, { body: { source: "people", view: { rows: ["city"], values: [{ agg: "count" }] }, format: "json" } });
        // the request's random id may hold a 3 (#721): only the parts that can carry data are read
        const answer = JSON.stringify({ ...city.data, requestId: undefined });
        assert.doesNotMatch(answer, /"3"|\b3\b(?=[^0-9])/, answer);
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        assert.equal(described.data.rows, 1);
    } finally {
        await server.close();
    }
});

test("#479: a summary field shifted into a shown column is left out as a hidden one is", async () => {
    const dir = workspace({ "people.csv": "name,salary,city\nann,51234,Berlin\nbob,62,345,Munich\n" });
    const server = await restServer({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { salary: "summary" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        assert.doesNotMatch(JSON.stringify(described.data), /345/);
        assert.equal(described.data.rows, 1);
    } finally {
        await server.close();
    }
});

test("#479: check-config says how many rows are longer than the header and who does not get them", async () => {
    const dir = workspace({ "people.csv": "name,ssn,city\nann,11,Berlin\ndan,14,Bonn\neve,15,Kiel\nbob,12,3,\ncid,13,4,x\n" });
    const text = factsOf((await checkConfig({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { ssn: "hide" } } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.match(text, /^WARNING \(Sources\): sources\.people: 2 rows have more values than the header \(a separator inside a value\); they are left out for callers who do not see every field as show$/m);
});

test("#479: a file whose every line ends with a separator the header lacks keeps all its rows; a row wider than the others is still left out", async () => {
    const dir = workspace({ "trailing.csv": "name,ssn,city\nann,11,Berlin,\ncid,13,Hamburg,\n", "wider.csv": "name,ssn,city,\nann,11,Berlin,\nbob,12,3,Munich,\ncid,13,Hamburg,\n" });
    const server = await restServer({ sources: { trailing: { file: "data/trailing.csv", policy: { fields: { name: "show", city: "show" } } }, wider: { file: "data/wider.csv", policy: { fields: { name: "show", city: "show" } } } }, baseDir: dir });
    try {
        const trailing = await call(`${server.api}/sources/describe`, { body: { source: "trailing" } });
        assert.equal(trailing.data.rows, 2, "a trailing separator on every line is no shift");
        assert.ok(!trailing.data.notes.some((n) => n.code === "ROWS_DROPPED"));
        const wider = await call(`${server.api}/sources/describe`, { body: { source: "wider" } });
        assert.equal(wider.data.rows, 0, "rows of different widths: every row wider than the named header goes (which one shifted cannot be told)");
        assert.doesNotMatch(JSON.stringify(wider.data), /Munich|"3"/);
    } finally {
        await server.close();
    }
});

/** describe and a render by city of `people.csv` under ssn hidden: the text a caller gets. */
async function cityAnswers(csv) {
    const dir = workspace({ "people.csv": csv });
    const server = await restServer({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { ssn: "hide" } } } }, baseDir: dir });
    try {
        const described = await call(`${server.api}/sources/describe`, { body: { source: "people" } });
        const city = await call(`${server.api}/views/render`, { body: { source: "people", view: { rows: ["city"], values: [{ agg: "count" }] }, format: "json" } });
        return { rows: described.data.rows, text: JSON.stringify(described.data) + JSON.stringify(city.data) };
    } finally {
        await server.close();
    }
}

test("#479: most rows shifted, each with an empty last cell, among a row of the header's width: no SSN shows", async () => {
    const got = await cityAnswers("name,ssn,city\nSm,ith,111-SECRET,\nJo,hn,222-SECRET,\nann,33,Berlin\n");
    assert.doesNotMatch(got.text, /SECRET/);
    assert.equal(got.rows, 1);
});

test("#479: a header with a trailing separator counts by its named width: a shifted row that leaves the file uneven is caught", async () => {
    const got = await cityAnswers("name,ssn,city,\nann,11,Berlin,\nSm,ith,999-SECRET,x\n");
    assert.doesNotMatch(got.text, /SECRET/);
});

test("#479: a uniform export that ends every line with a separator (the header too, or not) keeps all its rows", async () => {
    assert.equal((await cityAnswers("name,ssn,city\nann,11,Berlin,\ncid,13,Hamburg,\n")).rows, 2);
    assert.equal((await cityAnswers("name,ssn,city,\nann,11,Berlin,\ncid,13,Hamburg,\n")).rows, 2);
});

test("#479: check-config names the CSV limit for a source with a field below show, and no long-row warning where every field is show", async () => {
    const dir = workspace({ "people.csv": "name,ssn,city\nann,11,Berlin\nbob,12,3,x\n" });
    const closed = factsOf((await checkConfig({ sources: { people: { file: "data/people.csv", policy: { default: "show", fields: { ssn: "hide" } } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.equal(closed.match(/a value kept back is safe in CSV only when values that hold the separator are quoted/g)?.length, 1, closed);
    const open = factsOf((await checkConfig({ sources: { people: { file: "data/people.csv", policy: { default: "show" } } }, baseDir: dir }, { http: false, env: {} })).text);
    assert.doesNotMatch(open, /more values than the header|safe in CSV only/);
});
