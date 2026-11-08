import { test } from "node:test";
import assert from "node:assert/strict";
import { toViewFile } from "pivotkit-core";
import { templateEntries, viewsName } from "../src/templates.js";
import { VIEW_STORE_LIMITS, changedViews, storeViews, storedViews } from "../src/view-store.js";
import { MENU_LABELS } from "../src/menu-labels.js";

const VIEW = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] };
const tooMuch = (kind, max) => `${kind} ${max}`;

test("the Views menu's entries: the host's by scope (deletable means the user's own by default, with a warning once), then the store's", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const file = toViewFile(VIEW, { name: "From a file" });
    const entries = templateEntries(
        [
            { name: "Preset", view: VIEW },
            { name: "Mine", view: VIEW, deletable: true },
            { name: "Team", view: VIEW, scope: "shared", deletable: true },
            { name: "Kept", view: VIEW, scope: "user" },
            { file },
            { name: "Renamed", file: JSON.stringify(file) },
            // left out: no name, no view, a file that is no view, not an object
            { view: VIEW },
            { name: "No view" },
            { name: "Broken file", file: "{not json" },
            null,
            "text"
        ],
        [{ name: "Stored", view: VIEW, at: 3 }],
        true
    );
    assert.deepEqual(
        entries.map((t) => [t.name, t.scope, t.deletable, t.at]),
        [
            ["Preset", "shared", false, undefined],
            ["Mine", "user", true, undefined],
            ["Team", "shared", true, undefined],
            ["Kept", "user", false, undefined],
            ["From a file", "shared", false, undefined],
            ["Renamed", "shared", false, undefined],
            ["Stored", "user", true, 3]
        ]
    );
    assert.deepEqual(entries[4].view, VIEW);
    // a deletable entry without a scope: said once in the console
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[0]), /without a scope/);
    // without the host's delete, its entries cannot be deleted; the store's still can
    const noDelete = templateEntries([{ name: "Mine", view: VIEW, deletable: true }], [{ name: "Stored", view: VIEW, at: 0 }], false);
    assert.deepEqual(
        noDelete.map((t) => [t.scope, t.deletable]),
        [
            ["user", false],
            ["user", true]
        ]
    );
    assert.deepEqual(templateEntries(undefined, [], true), []);
});

test("every name is plain text: control, bidi and zero-width characters go, at most 120 characters; an empty one is left out", () => {
    const entries = templateEntries(
        [
            { name: "Sales\u202e by\u200b region\u0000", view: VIEW, scope: "shared" },
            { name: "x".repeat(500), view: VIEW, scope: "shared" },
            { name: "\u200b\u202e", view: VIEW, scope: "shared" }
        ],
        [{ name: "Stored\u2066 view", view: VIEW, at: 0 }],
        true
    );
    assert.deepEqual(
        entries.map((e) => e.name.length <= 120),
        [true, true, true]
    );
    assert.equal(entries[0].name, "Sales by region");
    assert.equal(entries[2].name, "Stored view");
    assert.equal(entries.length, 3);
});

test("the browser store: one item per storageKey, views saved per data, a save of the same name replaces it", () => {
    assert.equal(viewsName("sales"), "pivotkit:views:sales");
    assert.equal(viewsName(undefined), "pivotkit:views");
    let text = changedViews(null, { name: "A", view: VIEW, sourceId: "sales" }, tooMuch);
    text = changedViews(text, { name: "B", view: VIEW, sourceId: "tickets" }, tooMuch);
    text = changedViews(text, { name: "C", view: VIEW }, tooMuch);
    // stored as view files that name their data
    const stored = JSON.parse(String(text));
    assert.equal(stored[0].format, "pivotkit-view");
    assert.deepEqual(stored[0].source, { id: "sales" });
    // a report shows the views of its data and those made for no named data
    assert.deepEqual(
        storedViews(text, "sales").map((t) => [t.name, t.at]),
        [
            ["A", 0],
            ["C", 2]
        ]
    );
    assert.deepEqual(
        storedViews(text, undefined).map((t) => t.name),
        ["A", "B", "C"]
    );
    // the same name for the same data replaces; for other data it is another view
    text = changedViews(text, { name: "A", view: { rows: ["Product"] }, sourceId: "sales" }, tooMuch);
    text = changedViews(text, { name: "A", view: VIEW, sourceId: "tickets" }, tooMuch);
    assert.deepEqual(
        storedViews(text, "sales").map((t) => [t.name, t.view.rows]),
        [
            ["C", ["Region"]],
            ["A", ["Product"]]
        ]
    );
    // a delete by the place in the store, whatever the data shown
    const at = storedViews(text, "sales").find((t) => t.name === "A")?.at;
    text = changedViews(text, { remove: at, removeName: "A" }, tooMuch);
    assert.deepEqual(
        storedViews(text, "sales").map((t) => t.name),
        ["C"]
    );
    assert.equal(storedViews(text, "tickets").length, 3);
    // a place that holds another view by now (another tab changed the store): an error, nothing deleted
    assert.throws(() => changedViews(text, { remove: 0, removeName: "Not there" }, tooMuch), { message: "changed 0" });
    assert.throws(() => changedViews(text, { remove: 99, removeName: "A" }, tooMuch), { message: "changed 0" });
    // the last one gone: nothing left to keep
    assert.equal(changedViews(changedViews(null, { name: "X", view: VIEW }, tooMuch), { remove: 0, removeName: "X" }, tooMuch), null);
});

test("the browser store reads what is stored as user input: broken or foreign text gives no views", () => {
    for (const raw of [null, "", "{not json", "{}", '"text"', JSON.stringify([{ view: VIEW }, 5, null])]) {
        assert.deepEqual(storedViews(raw, "sales"), [], String(raw));
    }
    // a foreign entry is dropped on the next write, the good ones stay
    const text = changedViews(JSON.stringify([{ nope: true }, { name: "Good", view: VIEW }]), { name: "New", view: VIEW }, tooMuch);
    assert.deepEqual(
        storedViews(text, undefined).map((t) => t.name),
        ["Good", "New"]
    );
});

test("the browser store is capped: views and characters, with the reason in the labels' words", () => {
    let text = null;
    for (let i = 0; i < VIEW_STORE_LIMITS.count; i++) {
        text = changedViews(text, { name: `V${i}`, view: VIEW }, tooMuch);
    }
    assert.throws(() => changedViews(text, { name: "One more", view: VIEW }, tooMuch), { message: `count ${VIEW_STORE_LIMITS.count}` });
    const big = { rows: ["Region"], filters: [{ field: "Region", type: "include", items: ["x".repeat(VIEW_STORE_LIMITS.text)] }] };
    assert.throws(() => changedViews(null, { name: "Big", view: big }, tooMuch), { message: `text ${VIEW_STORE_LIMITS.text}` });
    const { de } = MENU_LABELS;
    assert.throws(() => storeViews(text, { name: "One more", view: VIEW }, de, "de-DE", () => true), { message: "dieser Browser behält höchstens 100 Ansichten" });
    assert.throws(() => storeViews(null, { name: "Big", view: big }, de, "de-DE", () => true), { message: "die Ansichten bräuchten mehr als 500.000 Zeichen" });
});

test("a store over the caps (older caps, changed by hand) can always shrink; only a save is capped", () => {
    // 130 views, more than VIEW_STORE_LIMITS.count
    const many = JSON.stringify(Array.from({ length: 130 }, (_, i) => toViewFile(VIEW, { name: `V${i}` }, { link: true })));
    assert.equal(storedViews(many, undefined).length, 130);
    let text = many;
    for (let i = 0; i < 40; i++) {
        text = changedViews(text, { remove: 0, removeName: `V${i}` }, tooMuch);
    }
    assert.equal(storedViews(text, undefined).length, 90);
    // a save into a store over the cap says so and keeps nothing
    assert.throws(() => changedViews(many, { name: "New", view: VIEW }, tooMuch), { message: `count ${VIEW_STORE_LIMITS.count}` });
});

test("a stored text longer than the cap is not parsed: no views, one warning, and the next save replaces it", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const huge = JSON.stringify([{ name: "Big", view: { rows: ["x".repeat(VIEW_STORE_LIMITS.text)] } }]);
    assert.deepEqual(storedViews(huge, undefined), []);
    assert.deepEqual(storedViews(huge, undefined), []);
    assert.equal(warn.mock.callCount(), 1);
    const text = changedViews(huge, { name: "Fresh", view: VIEW }, tooMuch);
    assert.deepEqual(
        storedViews(text, undefined).map((v) => v.name),
        ["Fresh"]
    );
});

test("the browser store: a write the browser refuses says so; a kept one hands over the text", () => {
    const { en } = MENU_LABELS;
    assert.throws(() => storeViews(null, { name: "A", view: VIEW }, en, "en-US", () => false), { message: en.storeRefused });
    let kept;
    storeViews(null, { name: "A", view: VIEW }, en, "en-US", (text) => {
        kept = text;
        return true;
    });
    assert.deepEqual(
        storedViews(kept, undefined).map((t) => t.name),
        ["A"]
    );
});
