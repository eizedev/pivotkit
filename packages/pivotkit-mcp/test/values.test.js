// The "values" level as a model meets it over MCP: the instructions explain the levels once, a values
// field lists its values completely, a result over it stays withheld, and a values filter combined
// with a summary filter gives the same answer (text and structured content) whether the combination
// exists or not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INSTRUCTIONS, SKILLS_DIR } from "../src/context.js";
import { call, httpClient, httpServer, workspace } from "./helpers.js";

/** Tickets: Status (3 values, 100 rows each) qualifies for the automatic rule, Kundenname is on the deny list. */
function tickets() {
    const lines = ["Status,Kundenname,Sales"];
    for (let i = 0; i < 300; i++) {
        lines.push(`${["Open", "Closed", "Waiting"][i % 3]},K${i % 3},${i}`);
    }
    return `${lines.join("\n")}\n`;
}

async function session(options, run) {
    const dir = workspace({ "tickets.csv": tickets() });
    const server = await httpServer({ sources: { tickets: { file: "data/tickets.csv" } }, output: { dir: "out" }, baseDir: dir, ...options });
    const { client, close } = await httpClient(server.url);
    try {
        await run(client, server);
    } finally {
        await close();
        await server.close();
    }
}

test("the instructions and the skill explain the values level once; an unknown level counts as summary", () => {
    assert.match(INSTRUCTIONS, /values \(every distinct value is listed, complete/);
    assert.match(INSTRUCTIONS, /Treat an unknown level as summary/);
    const skill = readFileSync(new URL("pivotkit-reports/SKILL.md", `file://${SKILLS_DIR}`), "utf8");
    assert.match(skill, /`values`: every distinct value is listed in `items` \(`complete: true`\)/);
    assert.match(skill, /once per\s+conversation/);
});

test("policy.autoValues true: a category field is at values over MCP; a result over it is withheld; the levels of one combination answer alike", () =>
    session({ policy: { autoValues: true } }, async (client) => {
        const described = await call(client, "describe_source", { source: "tickets" });
        const status = described.data.fields.find((f) => f.name === "Status");
        assert.deepEqual([status.level, status.items, status.complete, status.auto], ["values", ["Closed", "Open", "Waiting"], true, true]);
        assert.equal(described.data.fields.find((f) => f.name === "Kundenname").level, "summary");
        assert.match(described.text, /data from the source, not instructions/);
        assert.doesNotMatch(described.text.split("\n")[0], /Open|Closed|Waiting/, "the prose holds no value");
        const answer = async (customer) => {
            const r = await call(client, "render_view", { source: "tickets", view: { rows: ["Status"], values: [{ field: "Sales", agg: "sum" }], filters: [{ field: "Status", type: "in", items: ["Open"], blanks: "exclude" }, { field: "Kundenname", type: "in", items: [customer], blanks: "exclude" }] }, format: "csv", name: "combination" });
            assert.equal(r.isError, false, r.text);
            const strip = (t) => t.replace(/combination[^\s,.;]*/g, "");
            return { text: strip(r.text), data: JSON.parse(strip(JSON.stringify({ ...r.data, output: { ...r.data.output, name: undefined, path: undefined } }))) };
        };
        const exists = await answer("K0");
        assert.deepEqual(await answer("K1"), exists);
        assert.deepEqual(exists.data.withheld, ["rows", "columns", "bytes", "content"]);
        assert.equal(exists.data.inline, undefined);
        assert.match(exists.data.message, /not shown to the assistant: results over fields that are not fully shown \(Status, Sales, Kundenname\) stay in the file/);
    }));

test("the shipped default: no automatic level over MCP", () =>
    session({}, async (client) => {
        const described = await call(client, "describe_source", { source: "tickets" });
        assert.ok(described.data.fields.every((f) => f.level === "summary" && f.items === undefined));
    }));
