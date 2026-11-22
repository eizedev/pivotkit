// The lock around a refresh: one run at a time spends a rotated refresh token, a stale lock is taken
// over once, and a run that waits too long says why.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, tempDir } from "../helpers.js";
import { accountOf, credentialStore, storeMeans, takeOver } from "../../src/credential-store.js";
import { ACCESS, CLIENT, envOf, fakeIssuer } from "./fake-issuer.js";

/** The lock's settings for a test, set back afterwards. */
async function withLock(settings, work) {
    const before = { lockWaitMs: storeMeans.lockWaitMs, lockStaleMs: storeMeans.lockStaleMs, lockBeatMs: storeMeans.lockBeatMs, lockPollMs: storeMeans.lockPollMs };
    Object.assign(storeMeans, { lockPollMs: 5, ...settings });
    try {
        return await work();
    } finally {
        Object.assign(storeMeans, before);
    }
}

/** A promise and the function that ends it. */
function gate() {
    let open;
    const done = new Promise((resolve) => (open = resolve));
    return { done, open };
}

test("two token runs at once: the lock lets one refresh at a time, so neither spends the other's rotated token", async () => {
    const fake = await fakeIssuer();
    const dir = tempDir();
    try {
        assert.equal((await run(["login", "--url", fake.url, "--client-id", CLIENT, "--store", "file"], { env: envOf(dir) })).code, 0);
        const [a, b] = await Promise.all([run(["token"], { env: envOf(dir) }), run(["token"], { env: envOf(dir) })]);
        assert.deepEqual([a.code, b.code], [0, 0], `${a.stderr}${b.stderr}`);
        assert.deepEqual(new Set([a.stdout, b.stdout]), new Set([`${ACCESS[1]}\n`, `${ACCESS[2]}\n`]));
        assert.deepEqual(readdirSync(join(dir, "pivotkit", "locks")), [], "the lock is gone");
    } finally {
        await fake.close();
    }
});

test("the lock: a slow holder keeps the next run waiting, its heartbeat keeps the lock fresh, and a run that waits too long says why", async () => {
    await withLock({ lockBeatMs: 10, lockStaleMs: 60, lockWaitMs: 5000 }, async () => {
        const store = credentialStore(envOf(tempDir()));
        const resource = "https://reports.example/api/v1";
        const events = [];
        const holding = gate();
        const first = store.locked(resource, async () => {
            events.push("first in");
            // longer than lockStaleMs: only the heartbeat keeps the lock from counting as stale
            await new Promise((resolve) => setTimeout(resolve, 200));
            await holding.done;
            events.push("first out");
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        const second = store.locked(resource, async () => void events.push("second in"));
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.deepEqual(events, ["first in"], "the second run waits while the first holds the lock");
        holding.open();
        await Promise.all([first, second]);
        assert.deepEqual(events, ["first in", "first out", "second in"]);
    });
    await withLock({ lockBeatMs: 10, lockStaleMs: 60_000, lockWaitMs: 50 }, async () => {
        const store = credentialStore(envOf(tempDir()));
        const holding = gate();
        const first = store.locked("https://reports.example/api/v1", () => holding.done);
        await new Promise((resolve) => setTimeout(resolve, 10));
        await assert.rejects(store.locked("https://reports.example/api/v1", async () => undefined), (e) => e.code === "LOCKED" && /it may wait for a keychain unlock dialog/.test(e.message));
        holding.open();
        await first;
    });
});

test("the lock: two runs that find a stale lock at once take it over one after the other; the owner removes only its own lock", async () => {
    await withLock({ lockBeatMs: 1000, lockStaleMs: 1000, lockWaitMs: 5000 }, async () => {
        const dir = tempDir();
        const store = credentialStore(envOf(dir));
        const resource = "https://reports.example/api/v1";
        const locks = join(dir, "pivotkit", "locks");
        mkdirSync(locks, { recursive: true, mode: 0o700 });
        const path = join(locks, `${accountOf(resource)}.lock`);
        writeFileSync(path, "a crashed run's id");
        utimesSync(path, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
        let inside = 0;
        let most = 0;
        const run1 = async () => {
            inside++;
            most = Math.max(most, inside);
            await new Promise((resolve) => setTimeout(resolve, 50));
            inside--;
        };
        await Promise.all([store.locked(resource, run1), store.locked(resource, run1), store.locked(resource, run1)]);
        assert.equal(most, 1, "never two inside at once");
        assert.deepEqual(readdirSync(locks), [], "no lock and no renamed copy left");
        // a lock replaced by another run's while the work ran stays where it is
        await store.locked(resource, async () => writeFileSync(path, "another run's id"));
        assert.equal(readFileSync(path, "utf8"), "another run's id");
    });
});

// #717: three runs read a stale lock's age at once. The first takes it over and works; the second,
// late, must not move the first one's fresh lock even for a moment, or the third gets in beside it
test("the lock's takeover: a late run leaves a lock made since alone, never letting a third run in; one takeover at a time", async () => {
    await withLock({ lockStaleMs: 1000 }, async () => {
        const dir = tempDir();
        const path = join(dir, "server.lock");
        // a lock another run made since this run read the old one's age: the late takeover finds it fresh
        writeFileSync(path, "run A");
        const { open } = await import("node:fs/promises");
        let late = true;
        const taking = takeOver(path).finally(() => {
            late = false;
        });
        // a third run tries O_EXCL the whole time: it must never find the path free
        let thirdIn = false;
        while (late) {
            const third = await open(path, "wx").catch(() => null);
            if (third) {
                thirdIn = true;
                await third.close();
                break;
            }
        }
        await taking;
        assert.equal(thirdIn, false, "a third run got in while the late takeover ran");
        assert.equal(readFileSync(path, "utf8"), "run A", "the fresh lock stays");
        assert.deepEqual(readdirSync(dir), ["server.lock"], "no takeover lock or copy left");

        // a stale lock while another run takes over: left to that run
        const old = new Date(1_000_000_000_000);
        utimesSync(path, old, old);
        writeFileSync(`${path}.takeover`, "");
        await takeOver(path);
        assert.ok(existsSync(path), "another run's takeover goes on");
        // that run's takeover lock, when it crashed, is removed; the next try takes the stale lock over
        utimesSync(`${path}.takeover`, old, old);
        await takeOver(path);
        assert.ok(!existsSync(`${path}.takeover`), "a crashed takeover's lock is removed");
        assert.ok(existsSync(path));
        await takeOver(path);
        assert.deepEqual(readdirSync(dir), [], "the stale lock is taken over");

        // runs that take over at once: exactly one removes the stale lock
        writeFileSync(path, "a crashed run's id");
        utimesSync(path, old, old);
        const taken = await Promise.all([1, 2, 3, 4, 5].map(() => takeOver(path)));
        assert.equal(taken.filter(Boolean).length, 1, JSON.stringify(taken));
        assert.deepEqual(readdirSync(dir), []);
    });
});

test("the lock while a takeover runs: a waiting run neither spins nor enters, and gives up after lockWaitMs", async () => {
    await withLock({ lockStaleMs: 1000, lockWaitMs: 300, lockPollMs: 20 }, async () => {
        const dir = tempDir();
        const store = credentialStore(envOf(dir));
        const resource = "https://reports.example/api/v1";
        const locks = join(dir, "pivotkit", "locks");
        mkdirSync(locks, { recursive: true, mode: 0o700 });
        const path = join(locks, `${accountOf(resource)}.lock`);
        // a stale lock and another run's live takeover: this run waits for it, as for any lock
        writeFileSync(path, "a crashed run's id");
        utimesSync(path, new Date(1_000_000_000_000), new Date(1_000_000_000_000));
        writeFileSync(`${path}.takeover`, "");
        let ran = false;
        await assert.rejects(
            store.locked(resource, async () => {
                ran = true;
            }),
            (e) => e.code === "LOCKED"
        );
        assert.equal(ran, false);
        // no lock: a run that makes its own while the takeover lock is there backs off until it goes
        unlinkSync(path);
        let guardGone = false;
        setTimeout(() => {
            unlinkSync(`${path}.takeover`);
            guardGone = true;
        }, 100);
        let enteredAfterGuard = null;
        await store.locked(resource, async () => {
            enteredAfterGuard = guardGone;
        });
        assert.equal(enteredAfterGuard, true, "the run entered only once the takeover lock was gone");
        assert.deepEqual(readdirSync(locks), []);
    });
});
