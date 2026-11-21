// The words of filtering in plain language (#595, #177): the condition on the names in a field's
// filter says what it does, the count of the values says when nothing is filtered yet, and the buttons
// that add a rule follow one pattern, "Filter by …", in English and German.
import { encodeViewLink } from "pivotkit-core/link";
import { chipMenu, expect, openRules, test } from "./fixtures.js";

/** A grouping of a date in Rows: its Filter level offers all three kinds of rule. */
const YEAR = "Released by year";
const byYear = { derived: [{ name: YEAR, field: "Released", by: "year" }], rows: [YEAR], values: [{ agg: "count" }] };

for (const [lang, t] of [
    ["en", { legend: "Only names that…", none: "(any name)", all: "All 3 selected · nothing filtered yet", some: "2 selected", total: "Filter by total", name: "Filter by name", item: `Filter by ${YEAR}` }],
    ["de", { legend: "Nur Namen, die …", none: "(jeder Name)", all: "Alle 3 ausgewählt · noch nichts gefiltert", some: "2 ausgewählt", total: "Nach Wert filtern", name: "Nach Name filtern", item: `Nach ${YEAR} filtern` }]
]) {
    test(`${lang}: a field's filter says when it keeps every value, and its condition on the names in plain words`, async ({ page }) => {
        await page.goto(`?data=sales&lang=${lang}`);
        await page.getByTestId("field-menu-Channel").click();
        await page.getByTestId("field-filter-Channel").click();
        const form = page.locator(".pk-filter");
        await expect(form.locator(".pk-condition legend")).toHaveText(t.legend);
        await expect(form.locator(".pk-condition select option").first()).toHaveText(t.none);
        // every value ticked, no condition: nothing is filtered yet
        await expect(form.getByTestId("filter-selected")).toHaveText(t.all);
        await form.locator(".pk-values input[type=checkbox]").first().uncheck();
        await expect(form.getByTestId("filter-selected")).toHaveText(t.some);
        await form.locator(".pk-values input[type=checkbox]").first().check();
        await expect(form.getByTestId("filter-selected")).toHaveText(t.all);
        // a condition on the names filters: the count says only how many are ticked
        await form.locator(".pk-condition select").selectOption("contains");
        await expect(form.getByTestId("filter-selected")).toHaveText(t.all.replace(/^(All|Alle) (\d+).*$/, (_m, _w, n) => (lang === "de" ? `${n} ausgewählt` : `${n} selected`)));
    });

    test(`${lang}: the buttons that add a rule read "Filter by …"`, async ({ page }) => {
        await page.goto(`?data=endoflife&empty&lang=${lang}#pivot-playground=${encodeViewLink(byYear)}`);
        await chipMenu(page, YEAR, "filter");
        const menu = page.locator(".pk-chip-menu");
        await openRules(menu);
        await expect(menu.getByTestId("rule-add-item")).toHaveText(t.item);
        await expect(menu.getByTestId("rule-add-total")).toHaveText(t.total);
        // a text field: the rule on its names
        await page.goto(`?data=sales&lang=${lang}`);
        await chipMenu(page, "Region", "filter");
        await openRules(menu);
        await expect(menu.getByTestId("rule-add-name")).toHaveText(t.name);
        await expect(menu.getByTestId("rule-add-total")).toHaveText(t.total);
    });
}
