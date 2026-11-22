// How login polls the token endpoint (RFC 8628 3.5): the issuer's interval, slow_down, an expired code,
// and the failures on the way that are asked again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tempDir } from "../helpers.js";
import { signInMeans } from "../../src/sign-in.js";
import { ACCESS, CLIENT, REFRESH, fakeIssuer, inProcess, withWaits } from "./fake-issuer.js";

test("polling waits the issuer's interval, five seconds more after slow_down (RFC 8628 3.5), and gives up when the code expires", async () => {
    const sleep = signInMeans.sleep;
    const waits = [];
    signInMeans.sleep = async (ms) => void waits.push(ms);
    try {
        const slow = await fakeIssuer({ slowDown: true });
        try {
            const r = await inProcess(["login", "--url", slow.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            assert.equal(slow.state.polls, 3);
            assert.deepEqual(waits, [1000, 6000, 6000]);
        } finally {
            await slow.close();
        }
        waits.length = 0;
        const pending = await fakeIssuer({ pending: true, expiresIn: 3 });
        try {
            const r = await inProcess(["login", "--url", pending.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.match(r.stderr, /the code expired before the sign-in finished; run pivotkit login again/);
            assert.deepEqual(waits, [1000, 1000, 1000]);
            assert.equal(pending.state.polls, 3);
        } finally {
            await pending.close();
        }
    } finally {
        signInMeans.sleep = sleep;
    }
});

test("a second slow_down adds five seconds more; an issuer's interval over 60 s is kept, not cut", async () => {
    await withWaits(async (waits) => {
        const twice = await fakeIssuer({ slowDown: 2 });
        try {
            assert.equal((await inProcess(["login", "--url", twice.url, "--client-id", CLIENT, "--store", "file"], tempDir())).code, 0);
            assert.deepEqual(waits, [1000, 6000, 11000, 11000]);
        } finally {
            await twice.close();
        }
        waits.length = 0;
        const long = await fakeIssuer({ interval: 90, slowDown: 1 });
        try {
            assert.equal((await inProcess(["login", "--url", long.url, "--client-id", CLIENT, "--store", "file"], tempDir())).code, 0);
            assert.deepEqual(waits, [90_000, 90_000, 90_000], "RFC 8628 3.5: never shorter than the issuer asks");
        } finally {
            await long.close();
        }
    });
});

test("a poll that fails on the way (a 503 page, a dropped connection, no JSON) is asked again; three in a row end the sign-in, an OAuth error at once", async () => {
    await withWaits(async () => {
        const flaky = await fakeIssuer({
            hook: ({ req, res, state }) => {
                if (req.url !== "/token") {
                    return false;
                }
                state.polls++;
                if (state.polls === 1) {
                    res.writeHead(503, { "content-type": "text/html" });
                    res.end("<html>busy</html>");
                    return true;
                }
                if (state.polls === 2) {
                    res.socket.destroy();
                    return true;
                }
                if (state.polls === 3) {
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end("{not json");
                    return true;
                }
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ access_token: ACCESS[0], token_type: "Bearer", refresh_token: REFRESH[0] }));
                return true;
            }
        });
        try {
            const r = await inProcess(["login", "--url", flaky.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            assert.equal(flaky.state.polls, 4);
        } finally {
            await flaky.close();
        }
        const down = await fakeIssuer({
            hook: ({ req, res, state }) => {
                if (req.url !== "/token") {
                    return false;
                }
                state.polls++;
                res.writeHead(500, { "content-type": "application/json" });
                res.end(JSON.stringify({ error: "server_error" }));
                return true;
            }
        });
        try {
            const r = await inProcess(["login", "--url", down.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 2);
            assert.equal(down.state.polls, 4, "the first try and three more");
        } finally {
            await down.close();
        }
        const denied = await fakeIssuer({ deny: true });
        try {
            assert.equal((await inProcess(["login", "--url", denied.url, "--client-id", CLIENT, "--store", "file"], tempDir())).code, 2);
            assert.equal(denied.state.polls, 1, "an OAuth error is not asked again");
        } finally {
            await denied.close();
        }
    });
});

test("a 429 while polling is asked again like a 5xx; an interval over five minutes is cut, with a note", async () => {
    await withWaits(async (waits) => {
        const busy = await fakeIssuer({
            hook: ({ req, res, state }) => {
                if (req.url !== "/token") {
                    return false;
                }
                state.polls++;
                res.writeHead(state.polls === 1 ? 429 : 200, { "content-type": "application/json" });
                res.end(JSON.stringify(state.polls === 1 ? { error: "too_many_requests" } : { access_token: ACCESS[0], token_type: "Bearer", refresh_token: REFRESH[0] }));
                return true;
            }
        });
        try {
            const r = await inProcess(["login", "--url", busy.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            assert.equal(busy.state.polls, 2);
        } finally {
            await busy.close();
        }
        waits.length = 0;
        const slow = await fakeIssuer({ interval: 3600, expiresIn: 1800 });
        try {
            const r = await inProcess(["login", "--url", slow.url, "--client-id", CLIENT, "--store", "file"], tempDir());
            assert.equal(r.code, 0, r.stderr);
            assert.match(r.stderr, /note: the issuer asks to wait 3600 s between checks; pivotkit checks every 300 s/);
            assert.deepEqual(waits, [300_000, 300_000]);
        } finally {
            await slow.close();
        }
    });
});
