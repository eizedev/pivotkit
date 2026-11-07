// Field descriptions and display names (fieldDefaults label, description, href): shown where the field
// is, reachable by mouse, keyboard and touch, in the exports; and a report without them exactly as
// before. Every test here fails without its feature.
import { readFile } from "node:fs/promises";
import { chips, expect, test } from "./fixtures.js";

test.describe("without descriptions", () => {
    test("a report without labels or descriptions has no i, no extra text, the names as they are", async ({ page }) => {
        await page.goto("?data=sales");
        await expect(page.locator(".pk-root")).toBeVisible();
        // no "i" of a field anywhere (the zones' own "i" explains the zones, not a field)
        await expect(page.locator(".pk-info:not(.pk-zone-info)")).toHaveCount(0);
        await expect(page.locator(".pk-field-desc")).toHaveCount(0);
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        expect(await chips(page, "values")).toEqual(["Sum of Revenue"]);
        // no description: the field name keeps its plain accessible description, the headers no tooltip
        expect(await page.locator(".pk-field-name[aria-describedby]").count()).toBe(0);
        expect(await page.locator(".pk-table th[title], .pk-table th[aria-description]").count()).toBe(0);
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.locator(".pk-chip-menu .pk-menu-desc")).toHaveCount(0);
        // the field list rows are as high as before: one line each
        const heights = await page.locator(".pk-field").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
        expect(heights).toHaveLength(1);
    });
});

test.describe("descriptions of the real data", () => {
    test("the i shows the description on hover and focus, a click opens it with its link; Escape closes", async ({ page }) => {
        await page.goto("?data=countries&preset=0");
        const info = page.locator('.pk-field[data-field="Population"] .pk-info');
        await expect(info).toHaveAccessibleName("About Population");
        const box = await info.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
        await info.hover();
        const pop = page.locator(".pk-info-pop");
        await expect(pop).toContainText("midyear estimates");
        await expect(info).toHaveAccessibleDescription(/midyear estimates/);
        // the pointer moves from the i onto the description: it stays, and its link can be clicked
        const link0 = pop.locator("a");
        const lb = await link0.boundingBox();
        await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2, { steps: 8 });
        await page.waitForTimeout(400);
        await expect(link0).toBeVisible();
        await page.mouse.move(5, 5);
        await expect(pop).toHaveCount(0);
        // keyboard: focus shows it, Enter opens it as a dialog with the link, Escape back to the i
        await info.focus();
        await expect(pop).toBeVisible();
        await page.keyboard.press("Enter");
        const link = page.locator(".pk-info-pop a");
        await expect(link).toHaveText("Learn more");
        await expect(link).toHaveAttribute("href", "https://data.worldbank.org/indicator/SP.POP.TOTL");
        await expect(link).toHaveAttribute("rel", /noopener/);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(pop).toHaveCount(0);
        await expect(info).toBeFocused();
        // the field's own button carries the description for screen readers
        const name = page.locator('.pk-field[data-field="Population"] .pk-field-name');
        const described = await name.getAttribute("aria-describedby");
        await expect(page.locator(`[id="${described}"]`)).toContainText("de facto definition");
    });

    test("a tap opens the description", async ({ browser }) => {
        const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.goto("?data=countries&preset=0");
        await page.getByTestId("show-fields").tap();
        await page.locator('.pk-field[data-field="GDP (US$)"] .pk-info').tap();
        await expect(page.locator(".pk-info-pop")).toContainText("current prices");
        await expect(page.locator(".pk-info-pop a")).toBeVisible();
        await context.close();
    });

    test("chips, their menus, the table headers and the drill-down carry the description", async ({ page }) => {
        await page.goto("?data=countries&preset=0");
        await expect(page.locator('.pk-chip[data-chip="Sum of Population"] .pk-info')).toBeVisible();
        await page.getByTestId("chip-menu-Sum of Population").click();
        await expect(page.locator(".pk-chip-menu .pk-menu-desc")).toContainText("Population, total");
        await page.keyboard.press("Escape");
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.locator(".pk-chip-menu .pk-menu-desc")).toContainText("The World Bank's region");
        await page.keyboard.press("Escape");
        const header = page.locator(".pk-table th", { hasText: "Sum of Population" });
        await expect(header).toHaveAttribute("aria-description", /midyear estimates/);
        await page.locator(".pk-td.pk-clickable").first().click();
        const drill = page.getByTestId("drill-panel");
        await expect(drill.locator("th", { hasText: "Population" })).toHaveAttribute("aria-description", /midyear/);
        await expect(drill.locator("th", { hasText: "Country" })).not.toHaveAttribute("aria-description", /./);
    });

    test("the field search finds a field by its description", async ({ page }) => {
        await page.goto("?data=countries&preset=0");
        await page.getByPlaceholder("Search fields").fill("megatonnes");
        await expect(page.locator(".pk-field")).toHaveCount(1);
        await expect(page.locator(".pk-field")).toHaveAttribute("data-field", "CO2 (Mt)");
    });
});

test.describe("display names and descriptions from an OpenAPI document (web component)", () => {
    test("labels everywhere the name shows; the view keeps the field names; the CSV has the labels", async ({ page }) => {
        await page.goto("pages/element-fields.html");
        const a = page.locator("#a");
        await expect(a.locator('.pk-chip[data-chip="Sales region"]')).toBeVisible();
        await expect(a.locator('.pk-chip[data-chip="Sum of Net revenue"]')).toBeVisible();
        await expect(a.locator('.pk-field[data-field="Region"] .pk-field-name')).toHaveText("Sales region");
        await expect(a.locator('.pk-field[data-field="Units"] .pk-info')).toHaveCount(1);
        await expect(a.locator('.pk-field[data-field="Channel"] .pk-info')).toHaveCount(0);
        await expect(a.locator(".pk-table thead")).toContainText("Sales region");
        await expect(a.locator(".pk-table thead")).not.toContainText(/\bRegion\b/);
        // a change: the view the page gets names the fields, never the labels
        const view = page.evaluate(() => new Promise((resolve) => document.querySelector("#a").addEventListener("pivot-view-change", (e) => resolve(e.detail.view), { once: true })));
        await a.getByRole("button", { name: "Remove Country" }).click();
        expect((await view).rows).toEqual(["Region"]);
        await a.getByTestId("export").click();
        const [csv] = await Promise.all([page.waitForEvent("download"), a.getByTestId("export-csv").click()]);
        const text = (await readFile(await csv.path(), "utf8")).replace(/^\uFEFF/, "");
        expect(text.split(/\r?\n/).slice(0, 3).join("\n")).toContain("Sales region");
        expect(text).toContain("Sum of Net revenue");
        // the search finds it by its label
        await a.getByPlaceholder("Search fields").fill("net rev");
        await expect(a.locator(".pk-field")).toHaveCount(1);
    });
});
