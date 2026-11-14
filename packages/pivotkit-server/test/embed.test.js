// pivotkit-server in a host's own server: createContext and createRestHandler called with Request
// objects as a framework hands them over, a code source, and the token variable the docs name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "pivotkit-server";
import { createRestHandler } from "pivotkit-server/rest";
import { OTHER_TOKEN, TOKEN } from "./helpers.js";

const ROWS = [{ Region: "North", Sales: 10 }, { Region: "South", Sales: 20 }];

async function embedded(options, env = {}) {
    const lines = [];
    const context = await createContext({ log: "info", ...options }, { stderr: { write: (t) => lines.push(...String(t).trim().split("\n").map((l) => JSON.parse(l))) } });
    const rest = await createRestHandler(context, { env, loopback: true });
    return { context, rest, lines };
}

test("the one static token is $PIVOTKIT_TOKEN; a Request built in code (no Host header) is answered", async () => {
    const { context, rest } = await embedded({ sources: { sales: { load: async () => ROWS } }, auth: { mode: "token" } }, { PIVOTKIT_TOKEN: TOKEN });
    try {
        const res = await rest.fetch(new Request("http://127.0.0.1:3333/api/v1/sources", { headers: { authorization: `Bearer ${TOKEN}` } }));
        assert.equal(res.status, 200);
        assert.deepEqual((await res.json()).sources.map((s) => s.id), ["sales"]);
        const other = await rest.fetch(new Request("http://evil.example/api/v1/sources", { headers: { authorization: `Bearer ${TOKEN}` } }));
        assert.equal(other.status, 403, "the URL's host stands for the missing header, and is checked");
    } finally {
        await context.close();
    }
});

test("without the client's address, refused tokens do not lock everyone out", async () => {
    const { context, rest, lines } = await embedded({ sources: { sales: { load: async () => ROWS } }, auth: { mode: "token" }, rest: { rateLimit: { failedAuthPerMinute: 2 } } }, { PIVOTKIT_TOKEN: TOKEN });
    try {
        for (let i = 0; i < 5; i++) {
            assert.equal((await rest.fetch(new Request("http://localhost/api/v1/sources", { headers: { authorization: `Bearer ${OTHER_TOKEN}` } }))).status, 401);
        }
        assert.equal((await rest.fetch(new Request("http://localhost/api/v1/sources", { headers: { authorization: `Bearer ${TOKEN}` } }))).status, 200);
        assert.equal(lines.filter((l) => l.event === "warning" && /client's address/.test(l.message)).length, 1, "said once");
        // with an address, the count holds for that address only
        for (let i = 0; i < 2; i++) {
            await rest.fetch(new Request("http://localhost/api/v1/sources", { headers: { authorization: `Bearer ${OTHER_TOKEN}` } }), { address: "192.0.2.1" });
        }
        assert.equal((await rest.fetch(new Request("http://localhost/api/v1/sources", { headers: { authorization: `Bearer ${OTHER_TOKEN}` } }), { address: "192.0.2.1" })).status, 429);
        assert.equal((await rest.fetch(new Request("http://localhost/api/v1/sources", { headers: { authorization: `Bearer ${TOKEN}` } }), { address: "192.0.2.1" })).status, 200);
        assert.equal((await rest.fetch(new Request("http://localhost/api/v1/sources", { headers: { authorization: `Bearer ${TOKEN}` } }), { address: "192.0.2.2" })).status, 200);
    } finally {
        await context.close();
    }
});

test("a code source whose load() throws: 500 with a fixed text, and the host's error in the log", async () => {
    const { context, rest, lines } = await embedded({
        sources: {
            broken: {
                load: async () => {
                    throw new TypeError("database down");
                }
            }
        }
    });
    try {
        const res = await rest.fetch(new Request("http://localhost/api/v1/sources/broken"));
        assert.equal(res.status, 500);
        assert.equal((await res.json()).detail, "internal error");
        const error = lines.find((l) => l.event === "error");
        assert.ok(error, JSON.stringify(lines));
        assert.equal(error.error, "TypeError", "the class at the default level, the message only with --log debug");
    } finally {
        await context.close();
    }
});
