// The four zones as shelves (#581): each zone's title, its "i" and "+ Add" at its left, its chips
// flowing beside them; the shelves sit side by side while they fit and take a line of their own when
// they need it; the dashed drop outlines show only while something is dragged. "+ Add" opens "Add to
// Rows" (or the zone's name): every field with its type, a search, a badge for a field placed
// elsewhere, a pick that would change nothing disabled with its reason, Values taking a field again,
// Filters asking for the field's filter first. After a pick the focus is on the new chip and the zones'
// status line says what happened. Real pointer and keyboard input, the sales data.
import { chips, drag, expect, test } from "./fixtures.js";

/** The data-testid of the element in focus (inside the report, shadow roots included). */
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.className);

async function open(page, { width = 1440, height = 900, url = "?data=sales&lang=en" } = {}) {
    await page.setViewportSize({ width, height });
    await page.goto(url);
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const fold = page.getByTestId("layout-summary");
    if ((await fold.getAttribute("aria-expanded")) !== "true") {
        await fold.click();
    }
    await expect(page.locator(".pk-zone")).toHaveCount(4);
}

/** The add menu of a zone, opened by a click on its "+ Add". */
async function addMenu(page, zone) {
    await page.getByTestId(`add-field-${zone}`).click();
    const menu = page.locator(".pk-add-menu");
    await expect(menu).toBeVisible();
    return menu;
}

/** Each zone's box, rounded. */
const boxes = (page) =>
    page.locator(".pk-zones").evaluate((el) =>
        Object.fromEntries(
            [...el.querySelectorAll("[data-zone]")].map((z) => {
                const r = z.getBoundingClientRect();
                return [z.getAttribute("data-zone"), { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }];
            })
        )
    );

test.describe("+ Add in each zone", () => {
    test("its name says the zone, it sits right after the title and the i, and its menu is titled and searched by the field list's search", async ({ page }) => {
        await open(page);
        const add = page.getByTestId("add-field-rows");
        await expect(add).toHaveAccessibleName("Add a field to Rows");
        await expect(add).toHaveAttribute("title", "Add a field to Rows");
        await expect(add).toHaveText(/Add/);
        await expect(add).toHaveAttribute("aria-haspopup", /menu|dialog/);
        // right after the zone's i, --pk-add-gap apart, on the same line as the title
        const place = await page.locator('[data-zone="rows"]').evaluate((zone) => {
            const r = (q) => zone.querySelector(q).getBoundingClientRect();
            const gap = parseFloat(getComputedStyle(zone).getPropertyValue("--pk-add-gap"));
            return { gap, between: r('[data-testid="add-field-rows"]').left - r('[data-testid="zone-info-rows"]').right, titleMid: r(".pk-zone-title").top + r(".pk-zone-title").height / 2, addMid: r('[data-testid="add-field-rows"]').top + r('[data-testid="add-field-rows"]').height / 2 };
        });
        expect(place.gap).toBe(12);
        expect(Math.abs(place.between - place.gap)).toBeLessThanOrEqual(1);
        expect(Math.abs(place.titleMid - place.addMid)).toBeLessThanOrEqual(2);
        const menu = await addMenu(page, "rows");
        await expect(menu.getByTestId("menu-head")).toHaveText("Add to Rows");
        // every field of the data, each with its type
        await expect(menu.locator('[role="menuitem"]')).toHaveCount(9);
        await expect(menu.getByTestId("add-pick-Month")).toHaveClass(/pk-add-type-date/);
        // the focus starts in the search; the field list's search finds by name
        await expect(menu.getByTestId("menu-search")).toBeFocused();
        await page.keyboard.type("prod");
        await expect(menu.locator('[role="menuitem"]')).toHaveCount(1);
        await page.keyboard.press("ArrowDown");
        await expect(menu.getByTestId("add-pick-Product")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(menu).toBeHidden();
        expect(await chips(page, "rows")).toEqual(["Region", "Country", "Product"]);
        // the focus on the new chip, and the status line says it
        await expect(page.getByTestId("chip-menu-Product")).toBeFocused();
        await expect(page.getByTestId("zones-status")).toHaveText("Product added to Rows");
    });

    test("a field placed elsewhere shows its zone and moves; a pick that changes nothing is disabled with its reason", async ({ page }) => {
        await open(page);
        const menu = await addMenu(page, "rows");
        // Category is in Columns: its badge says so, and a screen reader hears that it moves
        const category = menu.getByTestId("add-pick-Category");
        await expect(category.locator(".pk-tag")).toHaveText("Columns");
        await expect(category).toHaveAccessibleDescription(/Moves it from Columns/);
        // and the line under its name says it too
        await expect(menu.getByTestId("add-pick-Category-note")).toHaveText("Moves it from Columns.");
        await expect(menu.getByTestId("add-pick-Category-note")).toBeVisible();
        // Region is in Rows: disabled, with its reason, and a click changes nothing
        const region = menu.getByTestId("add-pick-Region");
        await expect(region).toHaveAttribute("aria-disabled", "true");
        await expect(menu.getByTestId("add-pick-Region-reason")).toHaveText("Already in Rows.");
        // a real click on it (Playwright waits for an aria-disabled element to be enabled otherwise)
        await region.click({ force: true });
        await expect(menu).toBeVisible();
        expect(await chips(page, "rows")).toEqual(["Region", "Country"]);
        await category.click();
        expect(await chips(page, "rows")).toEqual(["Region", "Country", "Category"]);
        expect(await chips(page, "cols")).toEqual([]);
        await expect(page.getByTestId("chip-menu-Category")).toBeFocused();
        await expect(page.getByTestId("zones-status")).toHaveText("Category moved from Columns to Rows");
    });

    test("Values takes a field again as a second value; the new chip gets the focus", async ({ page }) => {
        await open(page);
        const menu = await addMenu(page, "values");
        const revenue = menu.getByTestId("add-pick-Revenue");
        await expect(revenue).not.toHaveAttribute("aria-disabled", "true");
        await expect(revenue).toHaveAccessibleDescription(/Adds a second value of it/);
        await expect(menu.getByTestId("add-pick-Revenue-note")).toHaveText("Adds a second value of it.");
        await revenue.click();
        // told apart: the second is numbered, on its chip and in the table's header
        expect(await chips(page, "values")).toEqual(["Sum of Revenue", "Sum of Revenue (2)"]);
        await expect(page.locator('[data-testid="pivot-table"] thead')).toContainText("Sum of Revenue (2)");
        // the second one, not the first
        const second = page.locator('[data-zone="values"] .pk-chip').nth(1).locator(".pk-chip-label");
        await expect(second).toBeFocused();
        await expect(page.getByTestId("zones-status")).toHaveText("Sum of Revenue (2) added to Values");
    });

    test("Filters asks for the field's filter first: Back returns to the list, Apply places the field with its choice", async ({ page }) => {
        await open(page);
        const menu = await addMenu(page, "filters");
        await menu.getByTestId("add-pick-Channel").click();
        // the filter of the field, as a level of the menu: nothing placed yet
        await expect(menu.getByTestId("level-title")).toContainText("Channel");
        expect(await chips(page, "filters")).toEqual([]);
        await menu.getByTestId("level-back").click();
        await expect(menu.getByTestId("add-pick-Channel")).toBeFocused();
        await menu.getByTestId("add-pick-Channel").click();
        // one value off, then Apply
        const first = menu.locator(".pk-values input[type=checkbox]").first();
        await first.click();
        await menu.getByTestId("filter-apply").click();
        await expect(menu).toBeHidden();
        expect(await chips(page, "filters")).toEqual(["Channel"]);
        await expect(page.locator('[data-zone="filters"] .pk-chip')).toContainText(/of/);
        await expect(page.getByTestId("chip-menu-Channel")).toBeFocused();
        await expect(page.getByTestId("zones-status")).toHaveText("Channel added to Filters");
    });

    test("a date lands as its grouping: Month in Columns by month is not 'already in Rows', and a pick moves that grouping", async ({ page }) => {
        await open(page);
        // Month into Columns: placed by its span ("Month (Year and month)" or similar)
        await (await addMenu(page, "cols")).getByTestId("add-pick-Month").click();
        const [grouping] = (await chips(page, "cols")).filter((c) => c.startsWith("Month"));
        expect(grouping).toBeTruthy();
        const menu = await addMenu(page, "rows");
        const month = menu.getByTestId("add-pick-Month");
        await expect(month).not.toHaveAttribute("aria-disabled", "true");
        await expect(month).toHaveAccessibleDescription(/Moves it from Columns/);
        await month.click();
        expect(await chips(page, "rows")).toContain(grouping);
        expect(await chips(page, "cols")).not.toContain(grouping);
        // and now it is in Rows: disabled there
        const again = await addMenu(page, "rows");
        await expect(again.getByTestId("add-pick-Month")).toHaveAttribute("aria-disabled", "true");
    });

    test("the keys: fold, i, Swap, then per zone its i, + Add, its chips", async ({ page, browserName }) => {
        // Safari's Tab skips buttons unless the user turns that on
        test.skip(browserName === "webkit", "WebKit's Tab skips buttons by default");
        await open(page);
        await page.getByTestId("layout-summary").focus();
        const order = [];
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press("Tab");
            order.push(await focused(page));
        }
        // the zone Filters is empty; Columns has one chip after its + Add: its grip, its menu, its x;
        // then the next zone's i
        expect(order.slice(0, 6)).toEqual(["zones-info", "swap", "zone-info-filters", "add-field-filters", "zone-info-cols", "add-field-cols"]);
        expect(order[6]).toContain("pk-handle");
        expect(order.slice(7, 8)).toEqual(["chip-menu-Category"]);
        expect(order[8]).toContain("pk-chip-x");
        expect(order[9]).toBe("zone-info-rows");
        // Escape closes the menu and the focus goes back to + Add
        await page.getByTestId("add-field-rows").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator(".pk-add-menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-add-menu")).toBeHidden();
        await expect(page.getByTestId("add-field-rows")).toBeFocused();
    });

    test("German: its name and text", async ({ page }) => {
        await open(page, { url: "?data=sales&lang=de" });
        await expect(page.getByTestId("add-field-rows")).toHaveAccessibleName("Ein Feld zu Zeilen hinzufügen");
        const menu = await addMenu(page, "rows");
        await expect(menu.getByTestId("menu-head")).toHaveText("Zu Zeilen hinzufügen");
        await expect(menu.getByTestId("add-pick-Region-reason")).toHaveText("Bereits in Zeilen.");
    });

    test("a finger: + Add has a 44 px target", async ({ browser }) => {
        const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.goto("?data=sales&lang=en");
        await page.locator('[data-testid="pivot-table"]').waitFor();
        const fold = page.getByTestId("layout-summary");
        if ((await fold.getAttribute("aria-expanded")) !== "true") {
            await fold.tap();
        }
        const box = await page.getByTestId("add-field-values").boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        await page.getByTestId("add-field-values").tap();
        await expect(page.locator(".pk-add-menu")).toBeVisible();
        await context.close();
    });
});

/** A web component with the given data, limits and start view, its zones open; returns its locator. */
async function element(page, { data, limits, view }) {
    await page.goto("pages/element-leaks.html");
    await page.waitForFunction(() => customElements.get("pivot-report"));
    await page.evaluate(([rows, max, start]) => {
        const el = document.createElement("pivot-report");
        el.data = rows;
        if (max) el.limits = max;
        if (start) el.defaultView = start;
        el.setAttribute("zones", "open");
        document.body.append(el);
    }, [data, limits ?? null, view ?? null]);
    const report = page.locator("pivot-report");
    await expect(report.locator(".pk-zone")).toHaveCount(4);
    return report;
}

test.describe("an empty report on a phone", () => {
    test("starts with its zones open, so + Add is there; they stay open as fields come in", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("?data=sales&lang=en&empty");
        await expect(page.getByTestId("empty-state")).toBeVisible();
        await expect(page.getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByTestId("add-field-rows")).toBeVisible();
        // its steps name + Add
        await expect(page.getByTestId("empty-state")).toContainText("Click + Add next to Rows");
        await expect(page.locator('[data-zone="rows"] .pk-zone-hint')).toHaveText("Add or drop a field to group rows");
        await page.getByTestId("add-field-rows").click();
        await page.locator(".pk-add-menu").getByTestId("add-pick-Region").click();
        await expect(page.getByTestId("chip-menu-Region")).toBeFocused();
        await expect(page.getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "true");
    });

    test("a host's zones start state still wins", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("pages/element-leaks.html");
        await page.waitForFunction(() => customElements.get("pivot-report"));
        await page.evaluate(() => {
            const el = document.createElement("pivot-report");
            el.data = [{ Team: "A", Hours: 2 }];
            el.setAttribute("zones", "folded");
            document.body.append(el);
        });
        await expect(page.locator("pivot-report").getByTestId("layout-summary")).toHaveAttribute("aria-expanded", "false");
    });
});

test.describe("+ Add at the edges", () => {
    test("a zone at its limit: every pick that would add to it is off, with the zone's limit as its reason", async ({ page }) => {
        const report = await element(page, {
            data: [{ Team: "A", Owner: "x", Site: "s", Hours: 2 }, { Team: "B", Owner: "y", Site: "t", Hours: 3 }],
            limits: { axisFields: 2 },
            view: { rows: ["Team", "Owner"], values: [{ field: "Hours", agg: "sum" }] }
        });
        await report.getByTestId("add-field-rows").click();
        const menu = report.locator(".pk-add-menu");
        const site = menu.getByTestId("add-pick-Site");
        await expect(site).toHaveAttribute("aria-disabled", "true");
        await expect(menu.getByTestId("add-pick-Site-reason")).toHaveText("Rows holds at most 2 fields. Remove one first.");
        await site.click({ force: true });
        await expect(menu).toBeVisible();
        expect(await report.locator('[data-zone="rows"] .pk-chip').evaluateAll((els) => els.map((e) => e.getAttribute("data-chip")))).toEqual(["Team", "Owner"]);
        // Columns has room: the same field can go there
        await page.keyboard.press("Escape");
        await report.getByTestId("add-field-cols").click();
        await expect(report.locator(".pk-add-menu").getByTestId("add-pick-Site")).not.toHaveAttribute("aria-disabled", "true");
    });

    test("two names that differ only in case are one field: the menu lists it once", async ({ page }) => {
        const report = await element(page, { data: [{ Name: "a", name: "b", Hours: 1 }, { Name: "c", Hours: 2 }] });
        await report.getByTestId("add-field-rows").click();
        const menu = report.locator(".pk-add-menu");
        await expect(menu.locator('[role="menuitem"]')).toHaveCount(2);
        await expect(menu.getByTestId("add-pick-Name")).toHaveCount(1);
        await menu.getByTestId("add-pick-Name").click();
        await expect(report.getByTestId("chip-menu-Name")).toBeFocused();
    });

    test("data without columns: the menu says so", async ({ page }) => {
        const report = await element(page, { data: [] });
        await report.getByTestId("add-field-rows").click();
        const menu = report.locator(".pk-add-menu");
        await expect(menu.locator('[role="menuitem"]')).toHaveCount(0);
        await expect(menu.getByTestId("add-empty")).toHaveText("The data has no columns.");
    });
});

test("the same words twice: the status line says them each time", async ({ page }) => {
    await open(page);
    // every text the status line shows, as it changes
    await page.getByTestId("zones-status").evaluate((el) => {
        window.__said = [];
        new MutationObserver(() => el.textContent && window.__said.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
    });
    // Units into Values, removed, and into Values again: the same words both times
    await (await addMenu(page, "values")).getByTestId("add-pick-Units").click();
    await expect.poll(() => page.evaluate(() => window.__said.length)).toBe(1);
    await page.getByRole("button", { name: "Remove Sum of Units" }).click();
    await (await addMenu(page, "values")).getByTestId("add-pick-Units").click();
    await expect.poll(() => page.evaluate(() => window.__said.length)).toBe(2);
    expect(await page.evaluate(() => window.__said)).toEqual(["Sum of Units added to Values", "Sum of Units added to Values"]);
});

test("an i closed while the pointer rests on it stays closed until the pointer leaves it", async ({ page }) => {
    await open(page);
    const info = page.getByTestId("zone-info-values");
    const pop = page.locator(".pk-info-pop");
    const box = await info.boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // Escape on the description shown on hover
    await page.mouse.move(at.x, at.y);
    await expect(pop).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    await page.mouse.move(at.x + 1, at.y + 1);
    await page.mouse.move(at.x - 1, at.y);
    await page.waitForTimeout(300);
    await expect(pop).toHaveCount(0);
    // a second click closes the opened one; a move on the i does not show it again
    await page.mouse.click(at.x, at.y);
    await expect(pop).toBeVisible();
    await page.mouse.click(at.x, at.y);
    await expect(pop).toHaveCount(0);
    await page.mouse.move(at.x + 1, at.y);
    await page.waitForTimeout(300);
    await expect(pop).toHaveCount(0);
    // the pointer away and back: it shows again
    await page.mouse.move(at.x, at.y + 200);
    await page.mouse.move(at.x, at.y);
    await expect(pop).toBeVisible();
});

test("an i opened and closed by the keyboard, the mouse elsewhere: a hover still shows it", async ({ page }) => {
    await open(page);
    const info = page.getByTestId("zone-info-values");
    const pop = page.locator(".pk-info-pop");
    await page.mouse.move(5, 5);
    await info.focus();
    await page.keyboard.press("Enter");
    await expect(info).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(info).toHaveAttribute("aria-expanded", "false");
    await info.blur();
    await expect(pop).toHaveCount(0);
    await info.hover();
    await expect(pop).toBeVisible();
});

test.describe("shelves", () => {
    test("wide, typical: Filters and Columns share a line, so do Rows and Values; at rest a light frame, no dashed outline", async ({ page }) => {
        await open(page);
        const b = await boxes(page);
        expect(b.filters.y).toBe(b.cols.y);
        expect(b.rows.y).toBe(b.values.y);
        expect(b.rows.y).toBeGreaterThan(b.filters.y);
        // one line each: a shelf is as high as a chip and its padding, not a box of two lines
        expect(b.rows.h).toBeLessThan(56);
        // the title, its i and + Add at the left, the chips beside them on the same line
        const side = await page.locator('[data-zone="rows"]').evaluate((zone) => {
            const head = zone.querySelector(".pk-zone-head").getBoundingClientRect();
            const chip = zone.querySelector(".pk-chip").getBoundingClientRect();
            return { headRight: head.right, chipLeft: chip.left, headMid: head.top + head.height / 2, chipMid: chip.top + chip.height / 2 };
        });
        expect(side.chipLeft).toBeGreaterThanOrEqual(side.headRight);
        expect(Math.abs(side.headMid - side.chipMid)).toBeLessThanOrEqual(2);
        // at rest: a light solid frame (--pk-zone-border), no dashed outline; a drag only changes its
        // style and colour, so nothing moves (#605)
        const rest = await page.locator('[data-zone="filters"]').evaluate((el) => ({ style: getComputedStyle(el).borderTopStyle, color: getComputedStyle(el).borderTopColor, width: getComputedStyle(el).borderTopWidth }));
        expect(rest).toEqual({ style: "solid", color: "rgb(221, 225, 231)", width: "1.5px" });
        // an empty shelf still says what it is for
        await expect(page.locator('[data-zone="filters"] .pk-zone-hint')).toBeVisible();
        // the section's hint mentions Add
        await page.getByTestId("zones-info").hover();
        await expect(page.locator(".pk-info-pop")).toContainText("or use Add in each one");
    });

    test("wide, many fields: a full shelf keeps its half of the grid and its chips wrap inside it", async ({ page }) => {
        await open(page);
        for (const field of ["Product", "Channel", "Category", "Month"]) {
            await (await addMenu(page, "rows")).getByTestId(`add-pick-${field}`).click();
        }
        for (const field of ["Units", "Discount"]) {
            await (await addMenu(page, "values")).getByTestId(`add-pick-${field}`).click();
        }
        const b = await boxes(page);
        // Rows keeps its cell: as wide as Values beside it, on the same line (#605)
        expect(Math.abs(b.rows.w - b.values.w)).toBeLessThanOrEqual(1);
        expect(b.values.y).toBe(b.rows.y);
        expect(b.values.x).toBeGreaterThan(b.rows.right);
        // and its chips wrap: more than one line of chips, none outside the shelf
        const tops = await page.locator('[data-zone="rows"] .pk-chip').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
        expect(tops.length).toBeGreaterThan(1);
        const right = await page.locator('[data-zone="rows"] .pk-chip').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().right)));
        expect(right).toBeLessThanOrEqual(b.rows.right);
    });

    test("a phone: the title row stays above the chips, the title and i at its left, + Add at its right end; a chip keeps the shelf's width", async ({ page }) => {
        await open(page, { width: 390, height: 844 });
        const z = await page.locator('[data-zone="rows"]').evaluate((zone) => {
            const r = (q) => zone.querySelector(q).getBoundingClientRect();
            const head = r(".pk-zone-head");
            const title = r(".pk-zone-title");
            const add = r('[data-testid="add-field-rows"]');
            const info = r('[data-testid="zone-info-rows"]');
            return { headBottom: head.bottom, chipTop: r(".pk-chip").top, headLeft: head.left, headRight: head.right, titleLeft: title.left, addLeft: add.left, addRight: add.right, infoRight: info.right, gap: parseFloat(getComputedStyle(zone).getPropertyValue("--pk-add-gap")), titleMid: title.top + title.height / 2, addMid: add.top + add.height / 2 };
        });
        expect(z.chipTop).toBeGreaterThanOrEqual(z.headBottom - 1);
        // the title at the row's start, + Add at its end, on the same line, with room between
        expect(Math.abs(z.titleLeft - z.headLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(z.addRight - z.headRight)).toBeLessThanOrEqual(1);
        expect(z.addLeft - z.infoRight).toBeGreaterThan(z.gap);
        expect(Math.abs(z.titleMid - z.addMid)).toBeLessThanOrEqual(2);
        const b = await boxes(page);
        // one shelf per line
        expect(new Set(Object.values(b).map((x) => x.y)).size).toBe(4);
        // a field name stays whole
        await expect(page.getByTestId("chip-menu-Country").locator(".pk-chip-name")).toHaveJSProperty("scrollWidth", await page.getByTestId("chip-menu-Country").locator(".pk-chip-name").evaluate((el) => el.clientWidth));
    });
});

test("a chip removed by a click: the shelf that slides under the resting pointer opens no description", async ({ page }) => {
    // the playground's test window: Rows and Values share a line; with flowing shelves Values moved left
    // without Country, its "i" under the pointer that pressed Country's x. The grid keeps Values in place
    // (#605); the test stays for a layout where a shelf moves (a phone, a host's --pk-shelf-min).
    await open(page, { width: 1280, height: 1000 });
    await page.getByRole("button", { name: "Remove Country" }).click();
    expect(await chips(page, "rows")).toEqual(["Region"]);
    await page.waitForTimeout(800);
    await expect(page.locator(".pk-info-pop")).toHaveCount(0);
    // a move over an "i" still shows its description
    await page.getByTestId("zone-info-values").hover();
    await expect(page.locator(".pk-info-pop")).toBeVisible();
});

test.describe("drag and drop on shelves", () => {
    test("1440: the outlines show while a field from the list is dragged; it lands on an empty shelf; a chip moves to another shelf", async ({ page }) => {
        await open(page);
        const from = page.locator('[data-field="Channel"] .pk-handle');
        const to = page.locator('[data-zone="filters"]');
        const a = await from.boundingBox();
        const b = await to.boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(a.x + 20, a.y + 20, { steps: 4 });
        await page.mouse.move(b.x + b.width - 40, b.y + b.height / 2, { steps: 16 });
        // every shelf shows its dashed outline while the drag lasts (polled: the colour comes in with a
        // transition, and a slow engine reads its first frame)
        const during = () => page.locator("[data-zone]").evaluateAll((els) => els.map((el) => ({ style: getComputedStyle(el).borderTopStyle, color: getComputedStyle(el).borderTopColor })));
        await expect.poll(async () => (await during()).every((s) => s.color !== "rgba(0, 0, 0, 0)")).toBe(true);
        expect((await during()).some((s) => s.style === "dashed")).toBe(true);
        await expect(to).toHaveClass(/pk-over/);
        await page.mouse.move(b.x + b.width - 39, b.y + b.height / 2, { steps: 2 });
        await page.mouse.up();
        await page.waitForTimeout(100);
        expect(await chips(page, "filters")).toEqual(["Channel"]);
        // a chip from Columns onto Rows
        await drag(page, page.locator('[data-zone="cols"] .pk-chip[data-chip="Category"]'), page.locator('[data-zone="rows"]'), { toPosition: { x: (await page.locator('[data-zone="rows"]').boundingBox()).width - 30, y: 15 } });
        expect(await chips(page, "rows")).toEqual(["Region", "Country", "Category"]);
        expect(await chips(page, "cols")).toEqual([]);
    });

    test("1440: a field dragged while the section is folded opens it and lands on the shelf under the pointer", async ({ page }) => {
        await open(page);
        await page.getByTestId("layout-summary").click();
        await expect(page.locator(".pk-zone")).toHaveCount(0);
        const from = page.locator('[data-field="Product"] .pk-handle');
        const a = await from.boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(a.x + 20, a.y + 20, { steps: 4 });
        // the section opens on the drag's start; the shelves are measured where they are now
        await expect(page.locator(".pk-zone")).toHaveCount(4);
        const b = await page.locator('[data-zone="values"]').boundingBox();
        await page.mouse.move(b.x + b.width - 30, b.y + b.height / 2, { steps: 16 });
        await page.mouse.move(b.x + b.width - 29, b.y + b.height / 2, { steps: 2 });
        await expect(page.locator('[data-zone="values"]')).toHaveClass(/pk-over/);
        await page.mouse.up();
        await page.waitForTimeout(100);
        // the section folds again after the drop; opened, it shows the new value
        await page.getByTestId("layout-summary").click();
        expect(await chips(page, "values")).toEqual(["Sum of Revenue", "Count of Product"]);
    });

    test("390: a field dragged from the drawer lands on a shelf", async ({ page }) => {
        await open(page, { width: 390, height: 844 });
        await page.getByTestId("show-fields").click();
        // the drawer slides in: the field is measured where it comes to rest
        await page.waitForTimeout(400);
        const from = await page.locator('.pk-field[data-field="Channel"] .pk-handle').boundingBox();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + 20, from.y + 20, { steps: 6 });
        // the drawer closes on the drag's start and slides away (a person's hand is slower than this)
        await page.waitForTimeout(400);
        const to = await page.locator('[data-zone="filters"]').boundingBox();
        await page.mouse.move(to.x + to.width - 30, to.y + to.height - 12, { steps: 16 });
        await page.mouse.move(to.x + to.width - 29, to.y + to.height - 12, { steps: 2 });
        await expect(page.locator('[data-zone="filters"]')).toHaveClass(/pk-over/);
        await page.mouse.up();
        await page.waitForTimeout(100);
        expect(await chips(page, "filters")).toEqual(["Channel"]);
    });

    test("390: a chip moves from Rows to the empty Filters shelf with the pointer", async ({ page }) => {
        await open(page, { width: 390, height: 844 });
        const target = page.locator('[data-zone="filters"]');
        const box = await target.boundingBox();
        await drag(page, page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"]'), target, { toPosition: { x: box.width - 30, y: box.height - 12 } });
        expect(await chips(page, "filters")).toEqual(["Country"]);
        expect(await chips(page, "rows")).toEqual(["Region"]);
    });
});
