import { test } from "node:test";
import assert from "node:assert/strict";
import { dateFromInput } from "../src/menu-ops.js";
const dateRuleValue = (text) => dateFromInput(text, { signed: true });
test("the date-rule reader keeps expanded years editable and canonicalizes HTML large years", () => {
    for (const text of ["+010000-02-29", "-000001-01-01", "0000-01-01", "2024-02-29"]) assert.equal(dateRuleValue(text), text);
    assert.equal(dateRuleValue("10000-02-29"), "+010000-02-29");
    for (const text of ["-000000-01-01", "2025-02-29", "+999999-01-01", "", "+01000-01-01"]) assert.equal(dateRuleValue(text), null);
});

test("native date controls retain their positive unsigned input contract", () => {
    for (const text of ["0000-01-01", "-000001-01-01", "+010000-01-01", "+000001-01-01"]) assert.equal(dateFromInput(text), null);
    assert.equal(dateFromInput("10000-02-29"), "+010000-02-29");
    assert.equal(dateRuleValue("+000001-01-01"), "0001-01-01");
});
