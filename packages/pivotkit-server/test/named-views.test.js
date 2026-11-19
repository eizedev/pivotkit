// Named views (sources.<id>.views, sources.<id>.viewsDir): an operator publishes views per source,
// in the configuration or as view files in a folder. list_sources and describe_source name them;
// render_view, create_link and draft_schedule take one by name. A view file the browser downloads is
// dropped into the folder as it is. A caller never learns of a view that needs a field hidden from
// it, and a link or draft never carries values of a field the caller may not see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encode, toViewFile, viewFileName, viewFileText } from "pivotkit-core";
import { readViewLink } from "pivotkit-core/link";
import { ConfigError, checkConfig, createContext, present, validateOptions } from "pivotkit-server";
import { OTHER_TOKEN, TOKEN, call, factsOf, restServer, workspace } from "./helpers.js";

/** The view a person saved in the browser: a full view file, made for data the browser called "orders". */
const BROWSER_VIEW = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };
const BROWSER_FILE = viewFileText(
    toViewFile(BROWSER_VIEW, {
        name: "Sales by region",
        description: "Every region's sales, summed.",
        source: { id: "orders", name: "orders.csv" },
        data: encode([{ Region: "North", Sales: 1 }]),
        createdAt: "2026-11-01T08:00:00Z",
        generator: { name: "pivotkit-react", version: "0.8.1" }
    })
);

/** The operator's views of the sales data: two in the configuration, one file named there, the browser's file in the folder. */
const VIEWS = {
    "top-customers": { name: "Top customers", view: { rows: ["Customer"], values: [{ field: "Sales", agg: "sum" }] } },
    alice: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }], filters: [{ field: "Customer", type: "in", items: ["Alice Example"] }] },
    "by-product": "views-extra/by-product.json"
};

/** Customer at summary for everyone, hidden for the "restricted" profile; files allowed (results: true). */
function namedServerOptions(dir, extra = {}) {
    return {
        sources: { sales: { file: "data/sales.csv", link: "https://reports.example.com/sales", policy: { default: "show", fields: { Customer: "summary" }, results: true }, views: VIEWS, viewsDir: "data/views", ...extra } },
        policy: { profiles: { restricted: { fields: { Customer: "hide" } } } },
        auth: { mode: "token", tokens: [{ name: "plain", env: "T1" }, { name: "restricted", env: "T2", profile: "restricted" }] },
        output: { dir: "out" },
        baseDir: dir
    };
}

/** A workspace with the sales data, the browser's view file in data/views and one more view file. */
function namedWorkspace() {
    const dir = workspace();
    mkdirSync(join(dir, "data", "views"));
    writeFileSync(join(dir, "data", "views", viewFileName("Sales by region").replace("sales-by-region", "by-region")), BROWSER_FILE);
    mkdirSync(join(dir, "views-extra"));
    writeFileSync(join(dir, "views-extra", "by-product.json"), JSON.stringify({ rows: ["Product"], values: [{ agg: "count" }] }));
    return dir;
}

async function namedServer() {
    const dir = namedWorkspace();
    const server = await restServer(namedServerOptions(dir), { env: { T1: TOKEN, T2: OTHER_TOKEN } });
    return { server, dir };
}

const SCHEDULE = { formats: ["xlsx"], every: { unit: "week", weekday: "mon", at: "07:00" }, recipients: ["Sales team"] };

test("list_sources and describe_source name the views a caller may use: the configuration's in its order, then the folder's by name", async () => {
    const { server } = await namedServer();
    try {
        const listed = await call(`${server.api}/sources`, { token: TOKEN });
        assert.equal(listed.status, 200);
        const sales = listed.data.sources.find((s) => s.id === "sales");
        assert.deepEqual(sales.views, [
            { name: "top-customers", title: "Top customers" },
            { name: "alice", title: "alice" },
            { name: "by-product", title: "by-product" },
            { name: "by-region", title: "Sales by region", description: "Every region's sales, summed." }
        ]);
        const described = await call(`${server.api}/sources/describe`, { token: TOKEN, body: { source: "sales" } });
        assert.equal(described.status, 200);
        assert.deepEqual(described.data.views, sales.views);
        // a profile that hides Customer never learns of the views that use it
        const restricted = (await call(`${server.api}/sources`, { token: OTHER_TOKEN })).data.sources.find((s) => s.id === "sales");
        assert.deepEqual(
            restricted.views.map((v) => v.name),
            ["by-product", "by-region"]
        );
        assert.doesNotMatch(JSON.stringify(restricted), /Customer|customers|alice/i);
        const restrictedDescribed = await call(`${server.api}/sources/describe`, { token: OTHER_TOKEN, body: { source: "sales" } });
        assert.deepEqual(restrictedDescribed.data.views, restricted.views);
    } finally {
        await server.close();
    }
});

test("render_view, create_link and draft_schedule take a view by its name; the browser's file works as it was dropped in", async () => {
    const { server, dir } = await namedServer();
    try {
        const rendered = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "by-region", format: "csv" } });
        assert.equal(rendered.status, 200, JSON.stringify(rendered.data));
        assert.equal(rendered.data.ok, true);
        assert.deepEqual(rendered.data.uses, ["Region", "Sales"]);
        const csv = readFileSync(join(dir, "out", rendered.data.output.name), "utf8");
        assert.match(csv, /North[,;]15/);
        // the file route too
        const file = await call(`${server.api}/views/render/file`, { token: TOKEN, body: { source: "sales", view: "by-product", format: "csv" } });
        assert.equal(file.status, 200);
        assert.match(new TextDecoder().decode(file.data), /^\uFEFF?Product/);

        const link = await call(`${server.api}/views/link`, { token: TOKEN, body: { source: "sales", view: "by-region" } });
        assert.equal(link.status, 200, JSON.stringify(link.data));
        const back = readViewLink(new URL(link.data.url).hash, null);
        // the link names this server's source and the view's title, whatever the browser's file said
        assert.deepEqual([back.name, back.src, back.view.rows], ["Sales by region", { id: "sales" }, ["Region"]]);

        const draft = await call(`${server.api}/schedules/draft`, { token: TOKEN, body: { source: "sales", view: "by-region", name: "Weekly sales", ...SCHEDULE } });
        assert.equal(draft.status, 200, JSON.stringify(draft.data));
        assert.deepEqual(draft.data.draft.view.view.rows, ["Region"]);
        assert.equal(draft.data.draft.view.source.id, "sales");
    } finally {
        await server.close();
    }
});

test("a view that needs a hidden field answers as a view that does not exist; one that filters on values the caller may not see gets no link or draft", async () => {
    const { server } = await namedServer();
    try {
        const unknown = await call(`${server.api}/views/render`, { token: OTHER_TOKEN, body: { source: "sales", view: "top-customer", format: "csv" } });
        const hidden = await call(`${server.api}/views/render`, { token: OTHER_TOKEN, body: { source: "sales", view: "top-customers", format: "csv" } });
        assert.equal(hidden.status, 400);
        assert.equal(hidden.data.code, "INVALID_INPUT");
        // the same words as for a name that was never there, and no suggestion that leads to it
        assert.equal(hidden.data.detail.replace("top-customers", "X"), unknown.data.detail.replace("top-customer", "X"));
        assert.doesNotMatch(`${hidden.data.detail} ${unknown.data.detail}`, /did you mean "top-customers"/);

        // Customer is at summary for the plain token: the report is made as a file, as for any view
        const report = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "alice", format: "xlsx" } });
        assert.equal(report.status, 200, JSON.stringify(report.data));
        // a link or a draft would carry the filter's items to the caller: refused, without them
        const link = await call(`${server.api}/views/link`, { token: TOKEN, body: { source: "sales", view: "alice" } });
        const draft = await call(`${server.api}/schedules/draft`, { token: TOKEN, body: { source: "sales", view: "alice", name: "Alice", ...SCHEDULE } });
        for (const refused of [link, draft]) {
            assert.equal(refused.status, 403, JSON.stringify(refused.data));
            assert.equal(refused.data.code, "NOT_ALLOWED");
            assert.doesNotMatch(JSON.stringify(refused.data), /Alice Example/);
        }
    } finally {
        await server.close();
    }
});

// a column the file gives no header is hidden from everyone (policy.js UNNAMED_WHY): the reader names it
// "Column N", and a view that uses it is not listed and answers as one that does not exist, though
// the listing is decided without the data (#645)
test("a view that uses a column without a header is not listed and answers as a view that does not exist", async () => {
    const dir = workspace({ "sales.csv": "Region,,Sales\nNorth,HIDDENMARK,10\nSouth,HIDDENMARK,20\n" });
    const views = { "by-region": { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }, "by-blank": { rows: ["Column 2"], values: [{ field: "Sales", agg: "sum" }] }, "by-blank-again": { rows: ["column 2 (2)"] } };
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show" }, views } }, output: { dir: "out" }, auth: { mode: "token", tokens: [{ name: "plain", env: "T1" }] }, baseDir: dir }, { env: { T1: TOKEN } });
    try {
        const listed = await call(`${server.api}/sources`, { token: TOKEN });
        assert.deepEqual(listed.data.sources[0].views.map((v) => v.name), ["by-region"]);
        const unknown = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "no-such", format: "csv" } });
        const blank = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "by-blank", format: "csv" } });
        assert.equal(blank.status, 400, JSON.stringify(blank.data));
        assert.equal(blank.data.detail.replace("by-blank", "X"), unknown.data.detail.replace("no-such", "X"));
    } finally {
        await server.close();
    }
});

test("a name that is no view says which ones there are; validate_view and describe_view take the view itself", async () => {
    const { server } = await namedServer();
    try {
        const typo = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "by-regoin" } });
        assert.equal(typo.status, 400);
        assert.match(typo.data.detail, /^no view "by-regoin" for the source sales; did you mean "by-region"\? GET \/sources lists the views$/);
        for (const route of ["validate", "describe"]) {
            const named = await call(`${server.api}/views/${route}`, { token: TOKEN, body: { source: "sales", view: "by-region" } });
            assert.equal(named.status, 400, route);
            assert.match(named.data.detail, /a view by name works in render_view, create_link and draft_schedule/, route);
        }
        // a text that is neither JSON nor a name says what a name is
        const spaced = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "by region" } });
        assert.equal(spaced.status, 400);
        assert.match(spaced.data.detail, /^view is neither a view's JSON nor a view's name: a name has letters, digits, - and _/);
        // a view as JSON text is still read as a view, not as a name
        const text = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: JSON.stringify(BROWSER_VIEW), format: "csv" } });
        assert.equal(text.status, 200, JSON.stringify(text.data));
    } finally {
        await server.close();
    }
});

test("a view file dropped into the folder while the server runs is there on the next call, as a print template is read on every request", async () => {
    const { server, dir } = await namedServer();
    try {
        writeFileSync(join(dir, "data", "views", "by-quarter.pivotkit.json"), viewFileText(toViewFile({ rows: ["Region"], cols: ["Q"], values: [{ field: "Sales", agg: "sum" }] }, { name: "By quarter" })));
        const listed = (await call(`${server.api}/sources`, { token: TOKEN })).data.sources.find((s) => s.id === "sales");
        assert.ok(listed.views.some((v) => v.name === "by-quarter" && v.title === "By quarter"), JSON.stringify(listed.views));
        const rendered = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "by-quarter", format: "csv" } });
        assert.equal(rendered.status, 200, JSON.stringify(rendered.data));
        // a file dropped in that is no view: left out, and the log says why, once
        writeFileSync(join(dir, "data", "views", "late.pivotkit.json"), "{ half");
        for (let i = 0; i < 2; i++) {
            const again = (await call(`${server.api}/sources`, { token: TOKEN })).data.sources.find((s) => s.id === "sales");
            assert.ok(!again.views.some((v) => v.name === "late"));
        }
        const warned = server.log.filter((l) => String(l.msg ?? l.message ?? "").includes("late.pivotkit.json: not a view"));
        assert.equal(warned.length, 1, JSON.stringify(server.log.slice(-3)));
    } finally {
        await server.close();
    }
});

test("a view by name works only for the operator's sources, not for a file path or data sent along", async () => {
    const dir = namedWorkspace();
    // a file of its own: a path to the source's own file is that source
    writeFileSync(join(dir, "data", "other.csv"), readFileSync(join(dir, "data", "sales.csv")));
    const options = { ...namedServerOptions(dir), auth: undefined, files: { allowDirs: ["data"] } };
    const context = await createContext(options);
    try {
        const caller = { scopes: null, client: "test" };
        await assert.rejects(present(context, "render_view", { source: "file:other.csv", view: "by-region", format: "csv" }, caller), (e) => e.code === "INVALID_INPUT" && /a view by name needs a source of the operator's/.test(e.message));
        const data = { columns: ["Region", "Sales"], rows: [["North", 1], ["South", 2]], rowCount: 2 };
        await assert.rejects(present(context, "render_view", { source: "inline:", data, view: "by-region", format: "csv" }, caller), (e) => e.code === "INVALID_INPUT" && /a view by name needs a source of the operator's/.test(e.message));
        const done = await present(context, "render_view", { source: "sales", view: "by-region", format: "csv" }, caller);
        assert.equal(done.result.ok, true);
    } finally {
        await context.close();
    }
});

test("check-config lists each source's views and the fields each needs; a broken view stops the start, a missing one is a warning", async () => {
    const dir = namedWorkspace();
    const ok = await checkConfig(namedServerOptions(dir), { http: false, env: { T1: TOKEN, T2: OTHER_TOKEN } });
    const text = factsOf(ok.text);
    assert.match(text, /^Named views \(4\):\n {2}sales:$/m);
    assert.match(text, /^ {4}top-customers \(in the configuration\): needs Customer, Sales$/m);
    assert.match(text, /^ {4}by-product \(views-extra\/by-product\.json\): needs Product$/m);
    assert.match(text, /^ {4}by-region \(data\/views\/by-region\.pivotkit\.json\): needs Region, Sales$/m);
    assert.doesNotMatch(text, /PROBLEM: sources\.sales\.view/);

    // a file in the folder that is no view: the server does not start
    writeFileSync(join(dir, "data", "views", "notes.json"), "{ not json");
    const broken = await checkConfig(namedServerOptions(dir), { http: false, env: { T1: TOKEN, T2: OTHER_TOKEN } });
    assert.match(factsOf(broken.text), /^PROBLEM: sources\.sales\.viewsDir: notes\.json: not a view \(not valid JSON\) -> the server does not start$/m);
    await assert.rejects(createContext(namedServerOptions(dir), { env: { T1: TOKEN, T2: OTHER_TOKEN } }), (e) => e instanceof ConfigError && e.message === "sources.sales.viewsDir: notes.json: not a view (not valid JSON)");

    // a file the configuration names that is not there: the server starts and says so
    const missing = namedWorkspace();
    const options = namedServerOptions(missing, { views: { ...VIEWS, gone: "views-extra/gone.json" } });
    const said = [];
    const started = await createContext(options, { env: { T1: TOKEN, T2: OTHER_TOKEN }, stderr: { write: (t) => said.push(String(t)) } });
    await started.close();
    assert.ok(said.some((t) => t.includes("sources.sales.views.gone: views-extra/gone.json: not found")), said.join(""));

    // a view whose shape is wrong whatever the data (rows is no list): no view, the start stops
    const shape = namedWorkspace();
    writeFileSync(join(shape, "data", "views", "broken.json"), JSON.stringify({ rows: "Region" }));
    await assert.rejects(createContext(namedServerOptions(shape), { env: { T1: TOKEN, T2: OTHER_TOKEN } }), (e) => e instanceof ConfigError && /^sources\.sales\.viewsDir: broken\.json: not a view \(rows: /.test(e.message));
    // a view that names a field the file does not have: a warning that names the view and the field
    const typo = namedWorkspace();
    const lacking = await checkConfig(namedServerOptions(typo, { views: { ...VIEWS, typo: { rows: ["Regoin"] } } }), { http: false, env: { T1: TOKEN, T2: OTHER_TOKEN } });
    assert.match(factsOf(lacking.text), /^WARNING \(Named views\): sources\.sales: the view typo needs Regoin, which the data does not have; render_view answers with errors for it$/m);
});

test("the options: a view name is letters, digits, - and _; an entry is a file or a view; the folder is a path", () => {
    const base = (views) => ({ sources: { sales: { file: "sales.csv", views } } });
    assert.throws(() => validateOptions(base({ "by region": "a.json" })), (e) => e instanceof ConfigError && /sources\.sales\.views: "by region" is no view name/.test(e.message));
    assert.throws(() => validateOptions(base({ ok: 5 })), (e) => e instanceof ConfigError && /sources\.sales\.views: ok: must be a view file's path or a view/.test(e.message));
    assert.throws(() => validateOptions(base({ ok: { format: "pivotkit-view", formatVersion: 9, view: {} } })), (e) => e instanceof ConfigError && /sources\.sales\.views: ok: not a view/.test(e.message));
    assert.throws(() => validateOptions({ sources: { sales: { file: "sales.csv", viewsDir: 3 } } }), ConfigError);
    validateOptions(base({ "by-region_2": "a.json", inline: { rows: ["Region"] } }));
});

test("a link or draft of a named view: values of a field at values may go, a chart's series colours at summary may not", async () => {
    const dir = namedWorkspace();
    const views = {
        alice: VIEWS.alice,
        colours: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }], display: "chart", chart: { type: "bar", colors: [{ name: "North", color: "#ff0000" }] } }
    };
    const options = (policy) => ({ ...namedServerOptions(dir), sources: { sales: { file: "data/sales.csv", link: "https://reports.example.com/sales", policy, views } } });
    for (const [policy, alice, colours] of [
        [{ default: "show", fields: { Customer: "values" } }, 200, 200],
        [{ default: "show", fields: { Region: "summary" } }, 200, 403],
        [{ default: "show", fields: { Customer: "summary" } }, 403, 200]
    ]) {
        const server = await restServer(options(policy), { env: { T1: TOKEN, T2: OTHER_TOKEN } });
        try {
            const a = await call(`${server.api}/views/link`, { token: TOKEN, body: { source: "sales", view: "alice" } });
            assert.equal(a.status, alice, `alice under ${JSON.stringify(policy)}: ${JSON.stringify(a.data)}`);
            const c = await call(`${server.api}/views/link`, { token: TOKEN, body: { source: "sales", view: "colours" } });
            assert.equal(c.status, colours, `colours under ${JSON.stringify(policy)}: ${JSON.stringify(c.data)}`);
            if (colours === 403) {
                assert.doesNotMatch(JSON.stringify(c.data), /#ff0000/);
            }
        } finally {
            await server.close();
        }
    }
});

test("a request for one view reads that view only; more than 100 views in the folder start the server and leave the rest out", async () => {
    const { server, dir } = await namedServer();
    try {
        // a sibling that turned broken does not keep a good view from rendering
        writeFileSync(join(dir, "views-extra", "by-product.json"), "{ broken");
        const rendered = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "by-region", format: "csv" } });
        assert.equal(rendered.status, 200, JSON.stringify(rendered.data));
    } finally {
        await server.close();
    }
    const many = workspace();
    mkdirSync(join(many, "views"));
    for (let i = 0; i < 101; i++) {
        writeFileSync(join(many, "views", `v${String(i).padStart(3, "0")}.json`), JSON.stringify({ rows: ["Region"] }));
    }
    const said = [];
    const context = await createContext({ sources: { sales: { file: "data/sales.csv", viewsDir: "views" } }, baseDir: many }, { stderr: { write: (t) => said.push(String(t)) } });
    try {
        assert.ok(said.some((t) => t.includes("sources.sales.viewsDir: 1 more view files left out: at most 100 views per source")), said.join(""));
        const listed = await present(context, "list_sources", {}, { scopes: null, client: "test" });
        assert.equal(listed.result.sources[0].views.length, 100);
    } finally {
        await context.close();
    }
});

// smaller follow-ups (#646): a browser download with a name that is no view name is skipped with a
// warning, not a stop; a file name with ":" is said whole; the descriptions one source lists are capped
test("a file whose name is no view name is skipped with a warning; the server starts", async () => {
    const dir = namedWorkspace();
    writeFileSync(join(dir, "data", "views", "My view (1).json"), JSON.stringify({ rows: ["Region"] }));
    const checked = await checkConfig(namedServerOptions(dir), { http: false, env: { T1: TOKEN, T2: OTHER_TOKEN } });
    assert.match(factsOf(checked.text), /^WARNING \(Named views\): sources\.sales\.viewsDir: My view \(1\)\.json: its name is no view name: letters, digits, - and _ before \.pivotkit\.json or \.json; the file is skipped$/m);
    assert.doesNotMatch(checked.text, /does not start/);
    const said = [];
    const context = await createContext(namedServerOptions(dir), { env: { T1: TOKEN, T2: OTHER_TOKEN }, stderr: { write: (t) => said.push(String(t)) } });
    try {
        assert.ok(said.some((t) => t.includes("My view (1).json: its name is no view name")), said.join(""));
    } finally {
        await context.close();
    }
});

test("a view file whose name holds \":\" is named whole in a problem", { skip: process.platform === "win32" && "Windows file names cannot hold \":\"" }, async () => {
    const dir = namedWorkspace();
    writeFileSync(join(dir, "views-extra", "big:one.json"), " ".repeat(300_000));
    const checked = await checkConfig(namedServerOptions(dir, { views: { ...VIEWS, big: "views-extra/big:one.json" } }), { http: false, env: { T1: TOKEN, T2: OTHER_TOKEN } });
    assert.match(factsOf(checked.text), /^PROBLEM: sources\.sales\.views\.big: views-extra\/big:one\.json: 300,000 bytes exceed the limit of 262,144 \(limits\.view\) -> the server does not start$/m);
});

test("list_sources gives at most 10,000 characters of view descriptions per source; later views keep their name and title", async () => {
    const dir = workspace();
    const views = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`v${String(i).padStart(2, "0")}`, { format: "pivotkit-view", formatVersion: 2, name: `View ${i}`, description: "d".repeat(500), view: { rows: ["Region"] } }]));
    const context = await createContext({ sources: { sales: { file: "data/sales.csv", views } }, baseDir: dir });
    try {
        const listed = (await present(context, "list_sources", {}, { scopes: null, client: "test" })).result.sources[0].views;
        assert.equal(listed.length, 30);
        assert.equal(listed.filter((v) => v.description).length, 20);
        assert.deepEqual(listed.at(-1), { name: "v29", title: "View 29" });
    } finally {
        await context.close();
    }
});

// the hint of a name that does not exist: the nearest of the views the caller may know of. A nearer
// view that uses a hidden field must not take its place, or a missing hint would tell it is there
test("a name that does not exist suggests the nearest view the caller may know of, also past a nearer hidden one", async () => {
    const dir = workspace();
    const views = { "by-regiom": { rows: ["Customer"] }, "by-region": { rows: ["Region"] } };
    const server = await restServer({ sources: { sales: { file: "data/sales.csv", policy: { default: "show", fields: { Customer: "hide" } }, views } }, output: { dir: "out" }, auth: { mode: "token", tokens: [{ name: "plain", env: "T1" }] }, baseDir: dir }, { env: { T1: TOKEN } });
    try {
        const typo = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: "by-regixx", format: "csv" } });
        assert.equal(typo.status, 400);
        assert.match(typo.data.detail, /did you mean "by-region"\?/);
        assert.doesNotMatch(typo.data.detail, /by-regiom/);
    } finally {
        await server.close();
    }
});
