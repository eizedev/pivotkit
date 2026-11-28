import { test } from "node:test";
import assert from "node:assert/strict";
import { dateRuleValue } from "../src/menu-ops.js";
test("the date-rule reader keeps expanded years editable and canonicalizes HTML large years", () => {
    for (const text of ["+010000-02-29", "-000001-01-01", "0000-01-01", "2024-02-29"]) assert.equal(dateRuleValue(text), text);
    assert.equal(dateRuleValue("10000-02-29"), "+010000-02-29");
    for (const text of ["-000000-01-01", "2025-02-29", "+999999-01-01", "", "+01000-01-01"]) assert.equal(dateRuleValue(text), null);
});
