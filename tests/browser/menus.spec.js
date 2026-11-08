// What the menus say and do: a filter in words with "Remove filter", the clear × of text fields,
// "Filter…" for a field not placed yet, the sentence on filtering in the Values menu, Expand and
// Collapse all only when they change something, the grip of a field, sort, top N and value conditions by a
// chosen value. Every test fails without its feature.
import { decodeViewLink, encodeViewLink } from "pivotkit-core/link";
import { chips, expect, tableRows, test, toolbar } from "./fixtures.js";

/** Filters a field of the Filters zone or an axis to one value through its popover. */
async function onlyValue(page, value) {
    const popover = page.locator(".pk-filter-popover");
    const row = popover.locator(".pk-value", { hasText: value }).first();
    // "Only" shows on hover
    await row.hover();
    await row.locator(".pk-only").click();
    await page.getByTestId("filter-apply").click();
}

test.describe("filters say what they keep", () => {
    test("the chip menu shows the filter in words with Remove, above the two ways to filter; the popover has it on top", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Region").click();
        // nothing set: the two ways to filter, as equals
        await expect(page.getByTestId("open-filter")).toHaveText("Choose values…");
        await expect(page.getByTestId("value-filter-open")).toHaveText("Value condition…");
        await expect(page.getByTestId("filter-state")).toHaveCount(0);
        await expect(page.getByTestId("remove-filter")).toHaveCount(0);
        await page.getByTestId("open-filter").click();
        await expect(page.getByTestId("filter-remove")).toHaveCount(0);
        await onlyValue(page, "West");
        await page.getByTestId("chip-menu-Region").click();
        // set: what it keeps first, in the accent colour, with Remove; the two ways stay below it
        await expect(page.getByTestId("filter-state").locator(".pk-state-text")).toHaveText(/^Filter: 1 of \d+$/);
        // the setting reads as text, Remove as a control (the accent of links)
        const [text, link] = await page.getByTestId("filter-state").evaluate((el) => [getComputedStyle(el.querySelector(".pk-state-text")).color, getComputedStyle(el.querySelector(".pk-link")).color]);
        expect(text).not.toBe(link);
        await expect(page.getByTestId("open-filter")).toHaveText("Choose values…");
        await page.getByTestId("remove-filter").click();
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text')).toHaveCount(0);
        // and from the filter itself
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("open-filter").click();
        await onlyValue(page, "West");
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("open-filter").click();
        await page.getByTestId("filter-remove").click();
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("filter-state")).toHaveCount(0);
    });

    test("the × of the text condition removes it at once, and Undo brings it back", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Country").click();
        await page.getByTestId("open-filter").click();
        await page.locator(".pk-condition select").selectOption("contains");
        await page.getByTestId("filter-condition-text").fill("an");
        await page.getByTestId("filter-apply").click();
        await page.getByTestId("chip-menu-Country").click();
        await expect(page.getByTestId("filter-state").locator(".pk-state-text")).toHaveText("Filter: contains “an”");
        await page.getByTestId("open-filter").click();
        const before = (await tableRows(page)).length;
        await page.locator(".pk-condition .pk-clear-x").click();
        // applied at once, the popover stays open with the focus in the field
        await expect.poll(async () => (await tableRows(page)).length).toBeGreaterThan(before);
        await expect(page.getByTestId("filter-condition-text")).toBeFocused();
        await expect(page.locator(".pk-filter-popover")).toBeVisible();
        await page.keyboard.press("Escape");
        await page.getByTestId("undo").click();
        await page.getByTestId("chip-menu-Country").click();
        await expect(page.getByTestId("filter-state").locator(".pk-state-text")).toHaveText("Filter: contains “an”");
    });
});

test.describe("clearing text fields", () => {
    test("a value's name: × gives the default name back at once, as one undo step", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        // Name is open: a field alone folds no more
        await expect(page.getByTestId("section-name")).toHaveCount(0);
        await page.getByTestId("value-name").fill("Money");
        await page.getByTestId("value-name").press("Enter");
        await expect.poll(() => chips(page, "values")).toEqual(["Money"]);
        await page.getByTestId("chip-menu-Money").click();
        await expect(page.getByTestId("value-name")).toHaveValue("Money");
        await page.locator(".pk-chip-menu .pk-clear-x").click();
        await expect.poll(() => chips(page, "values")).toEqual(["Sum of Revenue"]);
        await expect(page.getByTestId("value-name")).toHaveValue("");
        await expect(page.getByTestId("value-name")).toHaveAttribute("placeholder", "Sum of Revenue");
        await expect(page.getByTestId("value-name")).toBeFocused();
        await page.keyboard.press("Escape");
        await page.getByTestId("undo").click();
        await expect.poll(() => chips(page, "values")).toEqual(["Money"]);
    });

    test("the field search: ×, and Escape, empty it and keep the focus there", async ({ page }) => {
        await page.goto("?data=sales");
        const search = page.getByTestId("field-search");
        await search.fill("rev");
        await expect(page.locator(".pk-field")).toHaveCount(1);
        await page.locator(".pk-panel .pk-clear-x").click();
        await expect(search).toHaveValue("");
        await expect(search).toBeFocused();
        await expect(page.locator(".pk-field")).not.toHaveCount(1);
        await search.fill("rev");
        await search.press("Escape");
        await expect(search).toHaveValue("");
        await expect(search).toBeFocused();
        // no text: no ×
        await expect(page.locator(".pk-panel .pk-clear-x")).toHaveCount(0);
    });

    test("Escape in a menu's field empties it first; the next Escape closes the menu", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "views");
        const name = page.getByTestId("saved-view-name");
        await name.fill("Mine");
        await name.press("Escape");
        await expect(name).toHaveValue("");
        await expect(name).toBeVisible();
        await name.press("Escape");
        await expect(name).toHaveCount(0);
    });
});

test.describe("a field that is not placed", () => {
    test("Filter… in the field list filters it at once; it lands in Filters and keeps the filter on Rows", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("field-menu-Product").click();
        await page.getByTestId("field-filter-Product").click();
        await expect(page.locator(".pk-filter-popover")).toBeVisible();
        // Cancel changes nothing
        await page.locator(".pk-filter-popover").getByRole("button", { name: "Cancel" }).click();
        expect(await chips(page, "filters")).toEqual([]);
        await page.getByTestId("field-menu-Product").click();
        await page.getByTestId("field-filter-Product").click();
        const first = await page.locator(".pk-filter-popover .pk-value-label").first().textContent();
        await onlyValue(page, first);
        await expect.poll(() => chips(page, "filters")).toEqual(["Product"]);
        await expect(page.locator('[data-zone="filters"] .pk-badge-text')).toHaveText(/^1 of \d+$/);
        // moved to Rows, it keeps the filter: one product row per region
        await page.getByRole("button", { name: /^Product, filtered/ }).click();
        await page.locator(".pk-filter-popover").getByRole("button", { name: "Cancel" }).click();
        await page.getByTestId("field-menu-Product").click();
        await expect(page.getByTestId("field-filter-Product")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await page.locator('.pk-field[data-field="Product"] .pk-field-name').click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country", "Product"]);
        await page.getByTestId("chip-menu-Product").click();
        await expect(page.getByTestId("filter-state").locator(".pk-state-text")).toHaveText(/^Filter: 1 of \d+$/);
    });

    test("the grip says it is dragged, and a click on it opens the field's menu", async ({ page }) => {
        await page.goto("?data=sales");
        const grip = page.locator('.pk-field[data-field="Product"] .pk-handle');
        await expect(grip).toHaveAttribute("title", "Drag into a zone");
        await grip.click();
        await expect(page.getByRole("menuitem", { name: "Add to Columns" })).toBeVisible();
        await expect(page.getByTestId("field-filter-Product")).toBeVisible();
    });
});

test.describe("menus explain themselves", () => {
    test("the Values menu says where filtering happens, behind its i", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        // a head row of its own: the value's name and its i
        await expect(page.locator(".pk-chip-menu").getByTestId("menu-head")).toHaveText("Sum of Revenue");
        const info = page.locator(".pk-chip-menu").getByTestId("menu-info");
        await expect(info).toHaveAccessibleName("About Sum of Revenue");
        await expect(info).toHaveAccessibleDescription(/move a field to Filters/);
        await info.click();
        await expect(page.locator(".pk-info-pop")).toContainText("move a field to Filters");
        // without a description and with the explanations off, no head and no i
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await toolbar(page, "options");
        await page.getByTestId("show-explanations").focus();
        await page.getByTestId("show-explanations").press("Space");
        await expect(page.getByTestId("show-explanations")).not.toBeChecked();
        await page.keyboard.press("Escape");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        await expect(page.getByTestId("agg-sum")).toBeVisible();
        await expect(page.locator(".pk-chip-menu").getByTestId("menu-head")).toHaveCount(0);
    });

    test("Expand all and Collapse all: enabled only when they change something, with why not, and a status", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "options");
        await expect(page.getByTestId("expand-all")).toBeDisabled();
        await expect(page.getByTestId("expand-all")).toContainText("Nothing is collapsed.");
        await page.getByTestId("collapse-all").click();
        await expect(page.locator(".pk-toasts")).toContainText(/\d+ groups collapsed/);
        await toolbar(page, "options");
        await expect(page.getByTestId("collapse-all")).toBeDisabled();
        await expect(page.getByTestId("collapse-all")).toContainText("Every group is collapsed already.");
        await page.getByTestId("expand-all").click();
        await expect(page.locator(".pk-toasts")).toContainText(/\d+ groups expanded/);
        // one field in Rows: nothing to collapse
        await page.getByRole("button", { name: "Remove Country" }).click();
        await toolbar(page, "options");
        await expect(page.getByTestId("collapse-all")).toContainText("Needs two or more fields in Rows.");
    });
});

test.describe("sort, top N and value conditions by a chosen value", () => {
    /** Region in Rows, Units and Revenue in Values; the body rows without the grand total, as [region, units, revenue]. */
    async function twoValues(page) {
        await page.goto("?data=sales&empty");
        for (const field of ["Region", "Units", "Revenue"]) {
            await page.locator(`.pk-field[data-field="${field}"] .pk-field-name`).click();
        }
        await expect.poll(() => chips(page, "values")).toEqual(["Sum of Units", "Sum of Revenue"]);
    }
    const number = (text) => Number(text.replace(/[^\d.-]/g, ""));
    async function regionRows(page) {
        return (await tableRows(page)).filter((r) => r[0] !== "Grand Total").map((r) => [r[0], number(r[1]), number(r[2])]);
    }

    test("the sort menu offers every value; Top N ranks by the value chosen", async ({ page }) => {
        await twoValues(page);
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("sort-value-desc-0")).toHaveText("Largest Sum of Units first");
        await expect(page.getByTestId("sort-value-desc-1")).toHaveText("Largest Sum of Revenue first");
        await expect(page.getByTestId("sort-value-asc-1")).toHaveText("Smallest Sum of Revenue first");
        await page.getByTestId("sort-value-asc-1").click();
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName("Region, sorted Smallest Sum of Revenue first");
        const rows = await regionRows(page);
        const revenues = rows.map((r) => r[2]);
        expect(revenues).toEqual([...revenues].sort((a, b) => a - b));
        // the menu marks the value it sorts by
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("sort-value-asc-1")).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByTestId("sort-value-asc-0")).toHaveAttribute("aria-pressed", "false");
        // bottom 1 by revenue keeps the region with the least revenue
        await page.getByTestId("top-open").click();
        await expect(page.getByTestId("top-by")).toHaveValue("0");
        await page.getByRole("button", { name: "Bottom", exact: true }).click();
        await page.getByTestId("top-count").fill("1");
        await page.getByTestId("top-by").selectOption({ label: "Sum of Revenue" });
        await page.getByRole("button", { name: "Apply" }).first().click();
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0])).toEqual([rows[0][0]]);
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("top-state").locator(".pk-state-text")).toHaveText("Bottom 1 by Sum of Revenue");
        await page.getByTestId("top-change").click();
        await expect(page.getByTestId("top-by")).toHaveValue("1");
    });

    test("a value condition: set in the chip menu, shown on the chip, edited and cleared", async ({ page }) => {
        await twoValues(page);
        const rows = await regionRows(page);
        const least = [...rows].sort((a, b) => a[2] - b[2])[0];
        const limit = Math.floor(least[2]) + 1;
        const shown = limit.toLocaleString("en-US");
        await page.getByTestId("chip-menu-Region").click();
        await page.getByText("Value condition…").click();
        await page.getByTestId("value-filter-by").selectOption({ label: "Sum of Revenue" });
        await expect(page.getByTestId("value-filter-op")).toHaveValue(">");
        // Apply without a number, or with text that is none, says what is missing
        await page.getByTestId("value-filter-apply").click();
        await expect(page.getByTestId("value-filter-number-problem")).toHaveText("Enter a number, such as 1,234.5.");
        await expect(page.getByTestId("value-filter-number")).toHaveAttribute("aria-invalid", "true");
        await page.getByTestId("value-filter-number").fill("1000,5");
        await expect(page.getByTestId("value-filter-number-problem")).toHaveText("Enter a number, such as 1,234.5.");
        await expect(page.getByTestId("value-filter-number")).toHaveAttribute("aria-describedby", /.+/);
        await page.getByTestId("value-filter-number").fill(String(limit));
        await expect(page.getByTestId("value-filter-number-problem")).toHaveCount(0);
        await page.getByTestId("value-filter-apply").click();
        const badge = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] [data-testid="condition-badge"]');
        await expect(badge).toHaveText(`Sum of Revenue > ${shown}`);
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0]).sort()).toEqual(rows.map((r) => r[0]).filter((r) => r !== least[0]).sort());
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName(`Region, Sum of Revenue > ${shown}`);
        // the menu says it in a line of its own with Change and Remove; Change opens the form with it
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("value-filter-state").locator(".pk-state-text")).toHaveText(`Sum of Revenue > ${shown}`);
        await expect(page.getByTestId("filter-state")).toHaveCount(0);
        await page.getByTestId("value-filter-change").click();
        await expect(page.getByTestId("value-filter-number")).toHaveValue(String(limit));
        await page.getByTestId("value-filter-op").selectOption("<");
        await page.getByTestId("value-filter-apply").click();
        await expect.poll(async () => (await regionRows(page)).map((r) => r[0])).toEqual([least[0]]);
        await expect(badge).toHaveText(`Sum of Revenue < ${shown}`);
        // between takes two numbers
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("value-filter-change").click();
        await page.getByTestId("value-filter-op").selectOption("between");
        await page.getByTestId("value-filter-apply").click();
        await expect(page.getByTestId("value-filter-number2-problem")).toBeVisible();
        await page.getByTestId("value-filter-number2").fill("0");
        await page.getByTestId("value-filter-apply").click();
        // the smaller number first, as the engine compares
        await expect(badge).toHaveText(`Sum of Revenue between 0 and ${shown}`);
        // Cancel closes the form without a change, the focus back on its line
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("value-filter-change").click();
        await expect(page.getByTestId("value-filter-by")).toBeFocused();
        await page.getByTestId("value-filter-cancel").click();
        await expect(page.getByTestId("value-filter-change")).toBeFocused();
        await expect(badge).toHaveText(`Sum of Revenue between 0 and ${shown}`);
        // with values chosen too: the two have a line each, and each Remove takes only its own
        await page.keyboard.press("Escape");
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("open-filter").click();
        await onlyValue(page, least[0]);
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByTestId("filter-state").locator(".pk-state-text")).toHaveText(/^Filter: 1 of \d+$/);
        await page.getByTestId("value-filter-remove").click();
        await expect(badge).toHaveCount(0);
        await expect(page.getByTestId("chip-menu-Region")).toBeFocused();
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text')).toHaveText(/^1 of \d+$/);
        await page.getByTestId("undo").click();
        await expect(badge).toHaveText(`Sum of Revenue between 0 and ${shown}`);
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("remove-filter").click();
        await expect(badge).toHaveText(`Sum of Revenue between 0 and ${shown}`);
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text:not([data-testid])')).toHaveCount(0);
        // folded, the Filters title says it without "Filter:"
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("section-filters").click();
        await expect(page.getByTestId("section-state-filters")).toHaveText(`● Sum of Revenue between 0 and ${shown}`);
        await page.getByTestId("section-filters").click();
    });

    test("the menus follow a change of the language at runtime", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByText("Value condition…")).toBeVisible();
        await page.keyboard.press("Escape");
        await page.getByTestId("pg-lang").selectOption("de");
        await expect(page.locator(".pk-root")).toHaveAttribute("lang", "de");
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.getByText("Wertbedingung…")).toBeVisible();
        await expect(page.getByText("Value condition…")).toHaveCount(0);
    });

    test("the value condition in German", async ({ page }) => {
        await page.goto("?data=sales&empty&lang=de");
        for (const field of ["Region", "Revenue"]) {
            await page.locator(`.pk-field[data-field="${field}"] .pk-field-name`).click();
        }
        await page.getByTestId("chip-menu-Region").click();
        await page.getByText("Wertbedingung…").click();
        await page.getByTestId("value-filter-op").selectOption({ label: "größer oder gleich" });
        // typed as Germans write it, key by key
        await page.getByTestId("value-filter-number").pressSequentially("1.000,5");
        await page.getByTestId("value-filter-apply").click();
        const badge = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] [data-testid="condition-badge"]');
        await expect(badge).toHaveText("Summe von Revenue ≥ 1.000,5");
        // the form shows it back in German; a plain point number reads too, an English grouping does not
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("value-filter-change").click();
        await expect(page.getByTestId("value-filter-number")).toHaveValue("1000,5");
        await page.getByTestId("value-filter-number").fill("1,000.5");
        await expect(page.getByTestId("value-filter-number-problem")).toHaveText("Eine Zahl eingeben, etwa 1.234,5.");
        await page.getByTestId("value-filter-number").fill("2500.25");
        await page.getByTestId("value-filter-apply").click();
        await expect(badge).toHaveText("Summe von Revenue ≥ 2.500,25");
        // Top N says what a count must be
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("top-open").click();
        await page.getByTestId("top-count").fill("0");
        await expect(page.getByTestId("top-count-problem")).toHaveText("Eine ganze Zahl ab 1 eingeben.");
    });

    test("editing the value condition keeps a second one, and a measure no longer shown stays chosen", async ({ page }) => {
        const view = {
            rows: ["Region"],
            values: [{ field: "Units", agg: "sum" }],
            filters: [
                { field: "Region", type: "value", op: ">", value: 1, by: { field: "Revenue", agg: "sum" } },
                { field: "Region", type: "value", op: "<", value: 1e12, by: { field: "Units", agg: "sum" } }
            ]
        };
        await page.goto(`?data=sales&empty#pivot-playground=${encodeViewLink(view)}`);
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("value-filter-change").click();
        // Revenue is no value of the view any more: it is still the chosen measure
        await expect(page.getByTestId("value-filter-by")).toHaveValue("1");
        await expect(page.getByTestId("value-filter-by").locator("option:checked")).toHaveText("Sum of Revenue");
        await page.getByTestId("value-filter-number").fill("2");
        await page.getByTestId("value-filter-apply").click();
        // the playground writes the view into its address on every change
        const conditions = async () => {
            const text = new URL(page.url()).hash.match(/pivot-playground=([^&]+)/)?.[1] ?? "";
            // the link carries a view file's link profile: the view is inside it
            const shown = /** @type {any} */ (decodeViewLink(text).view)?.view;
            return (shown?.filters ?? []).filter((f) => f.type === "value").map((f) => [f.by.field, f.op, f.value]);
        };
        await expect.poll(conditions).toEqual([["Revenue", ">", 2], ["Units", "<", 1e12]]);
    });
});

test.describe("long menus and explanations", () => {
    test("sections fold, the frequent ones open; the choice is remembered with the tips", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        // Summarize by and Show as open; Number format folded, its options hidden
        await expect(page.getByTestId("section-summarize")).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByTestId("section-showAs")).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByTestId("section-format")).toHaveAttribute("aria-expanded", "false");
        await expect(page.getByTestId("format-currency")).toBeHidden();
        await page.getByTestId("section-format").click();
        await expect(page.getByTestId("format-currency")).toBeVisible();
        // the rarely used formats sit behind "More formats"
        await expect(page.getByTestId("format-bytes")).toBeHidden();
        await page.keyboard.press("Escape");
        // remembered (the playground's storageKey): open again after a reload
        await page.reload();
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        await expect(page.getByTestId("section-format")).toHaveAttribute("aria-expanded", "true");
    });

    test("a folded section says what it holds, marks a setting that is not the default, and reads as a control", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        const highlight = page.getByTestId("section-highlight");
        // folded: its state at its end, muted; the default has no mark
        await expect(page.getByTestId("section-state-highlight")).toHaveText("None");
        await expect(highlight).toHaveAccessibleName("Highlight, None");
        await expect(page.locator('[data-section="highlight"] .pk-section-mark')).toHaveCount(0);
        // the start view's format (currency:EUR) reads as its name, marked: it is not Automatic
        await expect(page.getByTestId("section-state-format")).toHaveText("● Currency");
        // the dot is said in words: "changed"
        await expect(page.getByTestId("section-format")).toHaveAccessibleName("Number format, Currency, changed");
        await expect(page.locator('[data-section="format"] .pk-section-mark')).toHaveCount(1);
        // the title in the text's colour, not muted like the state
        const colours = await highlight.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.querySelector(".pk-section-state")).color]);
        expect(colours[0]).not.toBe(colours[1]);
        // a setting that is not the default: named, with a mark
        await highlight.click();
        await page.getByTestId("cond-dataBar").click();
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        await page.getByTestId("section-highlight").click();
        await expect(page.getByTestId("section-state-highlight")).toContainText("Data bars");
        await expect(page.locator('[data-section="highlight"] .pk-section-mark')).toHaveCount(1);
        // open: no state in the title (the options say it)
        await page.getByTestId("section-highlight").click();
        await expect(page.getByTestId("section-state-highlight")).toHaveCount(0);
    });

    test("Reset menu sections brings every section back to its start; the folding survives a reload", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "options");
        await expect(page.getByTestId("reset-sections")).toBeDisabled();
        await page.getByTestId("section-totals").click();
        await expect(page.getByTestId("section-totals")).toHaveAttribute("aria-expanded", "false");
        await expect(page.getByTestId("reset-sections")).toBeEnabled();
        await page.keyboard.press("Escape");
        await page.reload();
        await toolbar(page, "options");
        await expect(page.getByTestId("section-totals")).toHaveAttribute("aria-expanded", "false");
        await page.getByTestId("reset-sections").click();
        await expect(page.getByTestId("section-totals")).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByTestId("reset-sections")).toBeDisabled();
        // the entry turned off: the focus is on the Help title, and the status says what happened
        await expect(page.getByTestId("section-help")).toBeFocused();
        await expect(page.getByTestId("reset-sections-status")).toHaveText("Menu sections reset");
    });

    test("Options → Rows, the value's Name and its Filters fold no more; Share and the chart's display start folded", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("chip-menu-Sum of Revenue").click();
        await expect(page.getByTestId("value-name")).toBeVisible();
        await expect(page.getByTestId("section-valueFilters")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await toolbar(page, "options");
        await expect(page.getByTestId("section-folding")).toHaveCount(0);
        await expect(page.getByTestId("expand-all")).toBeVisible();
        await page.keyboard.press("Escape");
        await toolbar(page, "views");
        await expect(page.getByTestId("section-share")).toHaveAttribute("aria-expanded", "false");
        await page.keyboard.press("Escape");
        await toolbar(page, "chart-type");
        await expect(page.getByTestId("section-chartDisplay")).toHaveAttribute("aria-expanded", "false");
        await expect(page.getByTestId("section-state-chartDisplay")).toHaveText("Automatic");
    });

    test("the wheel over a menu never scrolls the table or the page behind it", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 520 });
        await page.goto("?data=countries&height=1200");
        await toolbar(page, "options");
        const menu = page.locator(".pk-popover");
        await expect(menu).toBeVisible();
        const before = await page.evaluate(() => window.scrollY);
        const box = await menu.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        // far past the end of the menu's own scroll
        for (let i = 0; i < 6; i++) {
            await page.mouse.wheel(0, 600);
        }
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.scrollY)).toBe(before);
        await expect(menu).toBeVisible();
    });

    test("an i explains a setting; Show explanations hides them all; a switch that changes nothing says why", async ({ page }) => {
        await page.goto("?data=tickets");
        await toolbar(page, "options");
        // one row field, one column field: subtotals would change nothing
        await expect(page.getByTestId("total-rowSubtotals")).toBeDisabled();
        await expect(page.getByTestId("total-rowSubtotals-reason")).toHaveText("Needs two or more fields in Rows.");
        await expect(page.getByTestId("total-colSubtotals-reason")).toHaveText("Needs two or more fields in Columns.");
        await expect(page.getByTestId("total-grandTotalRow")).toBeEnabled();
        await expect(page.getByTestId("total-grandTotalRow-reason")).toHaveCount(0);
        // the i: a description on focus, named after its setting
        const info = page.getByTestId("setting-info-rowSubtotals");
        await expect(info).toHaveAccessibleName("About Row subtotals");
        await info.focus();
        await expect(page.locator(".pk-info-pop")).toContainText("a total row under each group");
        // Show explanations off: no i anywhere, the reason stays (it is state)
        const show = page.getByTestId("show-explanations");
        await show.focus();
        await show.press("Space");
        await expect(page.locator('[data-testid^="setting-info-"]')).toHaveCount(0);
        await expect(page.getByTestId("total-rowSubtotals-reason")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await page.getByTestId("export").click();
        await expect(page.getByTestId("setting-info-exportXlsx")).toHaveCount(0);
        await page.keyboard.press("Escape");
        // back on: the export formats explain themselves with an i, one line each
        await toolbar(page, "options");
        // the menu has taken the focus (from More it opens a frame later), so it does not take it back
        await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".pk-popover")))).toBe(true);
        await page.getByTestId("show-explanations").focus();
        await page.getByTestId("show-explanations").press("Space");
        await expect(page.getByTestId("show-explanations")).toBeChecked();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await page.getByTestId("export").click();
        await expect(page.getByTestId("setting-info-exportCsv")).toBeVisible();
        await expect(page.getByTestId("export-csv")).toHaveText("CSV file (.csv)");
        // the image needs the chart: disabled, with the reason
        await expect(page.getByTestId("export-png")).toBeDisabled();
        await expect(page.getByTestId("export-png")).toContainText("Switch to Chart first.");
    });
});
