// A rule on the name typed as a user types it (issue #159): "begins with" narrows the table; the text
// selected and deleted takes the rule off (the table, the chip and the summary show every item again,
// the row stays for a new text); a space typed at the end keeps the items that begin with the words.
// The expected rows are computed here from the snapshot of the real data set "nobel" (Country).
import { readFileSync } from "node:fs";
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, openRules, tableRows, test } from "./fixtures.js";
import { unpack } from "../../examples/playground/data/sources.js";

const nobel = unpack(JSON.parse(readFileSync(new URL("../../examples/playground/data/nobel.json", import.meta.url), "utf8")));
const n = (x) => x.toLocaleString("en-US");
const countries = new Map();
for (const r of nobel) if (r.Country) countries.set(r.Country, (countries.get(r.Country) ?? 0) + 1);
/** The countries (with their counts as the table writes them) whose name passes `keep`, sorted. */
const shown = (keep) => [...countries].filter(([c]) => keep(c.toLowerCase())).map(([c, k]) => [c, n(k)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
/** The table's rows without the grand total and the blank item, as [label, count], sorted. */
const bodyRows = async (page) => (await tableRows(page)).filter((r) => r[0] !== "Grand Total" && r[0] !== "(blank)").map((r) => [r[0], r[1]]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const badge = (page) => page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"] [data-testid="rule-badge"]');
const all = shown(() => true);
/** The values of the controls a locator finds, in order. */
const values = (controls) => controls.evaluateAll((list) => list.map((c) => c.value));

test.beforeAll(() => {
    // the data has to exercise the rule: more than one country begins with "south ", and some begin with neither
    expect(shown((c) => c.startsWith("south ")).length).toBeGreaterThan(1);
    expect(shown((c) => c.startsWith("czech")).length).toBeGreaterThan(0);
    expect(shown((c) => c.startsWith("s") && c.endsWith("a")).length).toBeGreaterThan(0);
    expect(shown((c) => c.startsWith("b") && c.endsWith("m")).length).toBeGreaterThan(0);
});

/** The playground on nobel by Country, the Filter level of Country open with a new "begins with" rule. */
async function beginsWith(page) {
    await page.goto(`?data=nobel&empty&lang=en#pivot-playground=${encodeViewLink({ rows: ["Country"], values: [{ agg: "count" }] })}`);
    await expect(page.locator('[data-testid="pivot-table"]')).toBeVisible();
    await expect.poll(() => bodyRows(page)).toEqual(all);
    await chipMenu(page, "Country", "filter");
    const menu = page.locator(".pk-chip-menu");
    await openRules(menu);
    await menu.getByTestId("rule-add-name").click();
    await menu.getByTestId("filter-condition-op").selectOption({ label: "begins with" });
    return menu;
}

test.describe("a rule on the name, typed (#159)", () => {
    test("select all and delete the text: the rule goes, every item shows again, the row waits for a new text", async ({ page }) => {
        const menu = await beginsWith(page);
        const text = menu.getByTestId("filter-condition-text");
        await text.click();
        await page.keyboard.type("czech");
        const czech = shown((c) => c.startsWith("czech"));
        await expect.poll(() => bodyRows(page)).toEqual(czech);
        await expect(badge(page)).toHaveText("begins with “czech”");
        await expect(menu.getByTestId("rule-result")).toHaveText(`Keeps ${czech.length} of ${countries.size + 1} items`);
        // what a user does to empty a field: select all, then Delete
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Delete");
        await expect(text).toHaveValue("");
        // the field looks empty, so nothing narrows the table any more
        await expect.poll(() => bodyRows(page)).toEqual(all);
        await expect(badge(page)).toHaveCount(0);
        await expect(menu.getByTestId("filter-summary-head")).toHaveText(`All ${countries.size + 1} items shown`);
        // the row stays with its comparison and the focus, as a rule not yet complete
        await expect(menu.getByTestId("rule")).toHaveCount(1);
        await expect(menu.getByTestId("rule-result")).toHaveText("Applies once it is complete.");
        await expect(menu.getByTestId("filter-condition-op")).toHaveValue("beginsWith");
        await expect(text).toBeFocused();
        // a new text applies again in the same row
        await page.keyboard.type("new");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => c.startsWith("new")));
        await expect(badge(page)).toHaveText("begins with “new”");
        // the field's × empties it the same way
        await menu.getByTestId("filter-condition-text").locator("xpath=..").getByRole("button").click();
        await expect(text).toHaveValue("");
        await expect.poll(() => bodyRows(page)).toEqual(all);
        await expect(badge(page)).toHaveCount(0);
        // closing the menu with the field empty leaves no rule behind
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-chip-menu")).toHaveCount(0);
        await expect(badge(page)).toHaveCount(0);
        await expect.poll(() => bodyRows(page)).toEqual(all);
    });

    test("the first of two rules emptied: only the second applies, Undo gives the text back, a new text keeps the first row's place", async ({ page }) => {
        const menu = await beginsWith(page);
        await menu.getByTestId("filter-condition-op").selectOption({ label: "does not begin with" });
        const texts = menu.getByTestId("filter-condition-text");
        await texts.click();
        await page.keyboard.type("south");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => !c.startsWith("south")));
        await menu.getByTestId("rule-add-name").click();
        await menu.getByTestId("filter-condition-op").last().selectOption({ label: "does not end with" });
        await texts.last().click();
        await page.keyboard.type("land");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => !c.startsWith("south") && !c.endsWith("land")));
        // the first one emptied by select all and Backspace
        await texts.first().click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Backspace");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => !c.endsWith("land")));
        await expect(badge(page)).toHaveText("does not end with “land”");
        await expect(menu.getByTestId("rule")).toHaveCount(2);
        await expect(menu.getByTestId("rule-result").first()).toHaveText("Applies once it is complete.");
        await expect.poll(() => values(texts)).toEqual(["", "land"]);
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "true");
        // Undo: the rule is back, with its text in its row
        await menu.getByTestId("section-rules").focus();
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => !c.startsWith("south") && !c.endsWith("land")));
        await expect.poll(() => values(texts)).toEqual(["south", "land"]);
        // emptied again and a new text typed: it applies from the first row, the rows keep their order
        await texts.first().click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Delete");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => !c.endsWith("land")));
        await page.keyboard.type("c");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => !c.startsWith("c") && !c.endsWith("land")));
        await expect.poll(() => values(texts)).toEqual(["c", "land"]);
        await expect.poll(() => values(menu.getByTestId("filter-condition-op"))).toEqual(["notBeginsWith", "notEndsWith"]);
        await expect(texts.first()).toBeFocused();
    });

    test("emptied and typed again keeps Also keep items without a value; spaces only take the rule off; the row's × folds the rules", async ({ page }) => {
        const menu = await beginsWith(page);
        const text = menu.getByTestId("filter-condition-text");
        const blankRow = async () => (await tableRows(page)).some((r) => r[0] === "(blank)");
        await text.click();
        await page.keyboard.type("czech");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => c.startsWith("czech")));
        await menu.getByTestId("rules-blanks").click();
        await expect.poll(blankRow).toBe(true);
        await text.click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Delete");
        await expect.poll(() => bodyRows(page)).toEqual(all);
        await page.keyboard.type("czech");
        // the rule comes back as it was: with its blank items
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => c.startsWith("czech")));
        await expect.poll(blankRow).toBe(true);
        await expect(menu.getByTestId("rules-blanks")).toBeChecked();
        // a text of spaces only is no text: every item shows, no rule on the chip
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("   ");
        await expect.poll(() => bodyRows(page)).toEqual(all);
        await expect(badge(page)).toHaveCount(0);
        await expect(menu.getByTestId("rule-result")).toHaveText("Applies once it is complete.");
        // the row's ×: no rule is left, so the rules fold and Pick items opens, as after the last rule's ×
        await menu.getByTestId("rule-remove").click();
        await expect(menu.getByTestId("rule")).toHaveCount(0);
        await expect(menu.getByTestId("section-rules")).toHaveAttribute("aria-expanded", "false");
        await expect(menu.getByTestId("section-picks")).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByTestId("section-rules")).toBeFocused();
    });

    test("two rules emptied one after the other: both rows stay in their places and apply again", async ({ page }) => {
        const menu = await beginsWith(page);
        const texts = menu.getByTestId("filter-condition-text");
        await texts.click();
        await page.keyboard.type("s");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => c.startsWith("s")));
        await menu.getByTestId("rule-add-name").click();
        await menu.getByTestId("filter-condition-op").last().selectOption({ label: "ends with" });
        await texts.last().click();
        await page.keyboard.type("a");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => c.startsWith("s") && c.endsWith("a")));
        for (const at of [1, 0]) {
            await texts.nth(at).click();
            await page.keyboard.press("ControlOrMeta+a");
            await page.keyboard.press("Delete");
        }
        await expect.poll(() => bodyRows(page)).toEqual(all);
        await expect(menu.getByTestId("rule")).toHaveCount(2);
        await expect(menu.getByTestId("rule-result")).toHaveText(["Applies once it is complete.", "Applies once it is complete."]);
        await expect(texts.first()).toBeFocused();
        await page.keyboard.type("b");
        await texts.last().click();
        await page.keyboard.type("m");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => c.startsWith("b") && c.endsWith("m")));
        await expect.poll(() => values(menu.getByTestId("filter-condition-op"))).toEqual(["beginsWith", "endsWith"]);
        await expect.poll(() => values(texts)).toEqual(["b", "m"]);
    });

    // passes without the fix as well (#167 folds the ends of the text); it guards the case the owner asked about
    test("a space typed at the end: the items that begin with the words stay, none is lost", async ({ page }) => {
        const menu = await beginsWith(page);
        await menu.getByTestId("filter-condition-text").click();
        await page.keyboard.type("south ");
        const south = shown((c) => c.startsWith("south "));
        await expect.poll(() => bodyRows(page)).toEqual(south);
        await expect(menu.getByTestId("rule-result")).toHaveText(`Keeps ${south.length} of ${countries.size + 1} items`);
        // the next word narrows further
        await page.keyboard.type("k");
        await expect.poll(() => bodyRows(page)).toEqual(shown((c) => c.startsWith("south k")));
        await expect(menu.getByTestId("filter-condition-text")).toHaveValue("south k");
    });
});
