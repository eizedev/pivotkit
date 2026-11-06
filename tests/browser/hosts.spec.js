// pivotkit-react as hosts load it: its own dist file with React from the page (import map), the
// React version of the CI job, a host that renders again all the time, and a shadow root.
import { chips, drag, expect, test } from "./fixtures.js";

const wanted = process.env.PIVOTKIT_REACT === "19" ? /^19\./ : /^18\./;

test("the playground runs on the React of this job", async ({ page }) => {
    await page.goto("?data=sales");
    await expect(page.locator(".pk-root")).toBeVisible();
    expect(await page.evaluate(() => window.__pivotkitReact)).toMatch(wanted);
});

test.describe("a host page that provides React", () => {
    test("pivotkit-react loads as its own file on the page's React, and every package comes from the import map", async ({ page }) => {
        const loaded = [];
        page.on("request", (r) => loaded.push(new URL(r.url()).pathname));
        await page.goto("pages/host.html");
        await expect(page.locator(".pk-root")).toBeVisible();
        expect(await page.evaluate(() => window.__pivotkitReact)).toMatch(wanted);
        for (const file of ["pivotkit-react.js", "vendor/react.js", "vendor/react-dom-client.js", "vendor/dnd-kit-core.js", "vendor/pivotkit-core.js"]) {
            expect(loaded.some((p) => p.endsWith(`/pages/${file}`)), file).toBe(true);
        }
        await page.getByTestId("show-chart").click();
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
    });

    test("controlled and rendered again every 200 ms: undo keeps its steps, the rows are encoded once", async ({ page }) => {
        await page.goto("pages/host.html");
        await expect(page.locator(".pk-root")).toBeVisible();
        await page.getByRole("button", { name: "Remove Country" }).click();
        await page.getByRole("button", { name: "Remove Category" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        // several renders of the host with a new array each time
        const before = Number(await page.getByTestId("host-renders").textContent());
        await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(before + 4);
        await page.locator(".pk-status").click();
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(() => chips(page, "cols")).toEqual(["Category"]);
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        await expect(page.locator(".pk-toasts")).toContainText("Undone: Country removed");
        await page.keyboard.press("ControlOrMeta+Shift+z");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        const encodes = await page.evaluate(() => performance.getEntriesByName("pivotkit:encode").length);
        expect(encodes).toBe(1);
    });
});

test("a host that renders again does not move the focus inside an open popover", async ({ page }) => {
    await page.goto("pages/host.html");
    await page.getByTestId("chip-menu-Region").click();
    await page.getByTestId("open-filter").click();
    await expect(page.locator(".pk-filter-popover input[type=search]")).toBeFocused();
    const second = page.locator(".pk-filter-popover .pk-value input").nth(1);
    await second.focus();
    const before = Number(await page.getByTestId("host-renders").textContent());
    await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(before + 4);
    await expect(second).toBeFocused();
});

test.describe("inside a shadow root", () => {
    test("styles, theme from the shadow host, popovers, focus and the drill-down work", async ({ page }) => {
        await page.goto("pages/shadow.html");
        const root = page.locator(".pk-root");
        await expect(root).toBeVisible();
        expect(await root.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("solid");
        await page.evaluate(() => document.getElementById("shadow-host").setAttribute("data-theme", "dark"));
        await expect(root).toHaveAttribute("data-pk-theme", "dark");
        // an element inside the shadow root, above the report, is nearer and observed too
        await page.evaluate(() => document.getElementById("shadow-host").shadowRoot.querySelector("div").setAttribute("data-theme", "light"));
        await expect(root).toHaveAttribute("data-pk-theme", "light");
        await page.evaluate(() => document.getElementById("shadow-host").shadowRoot.querySelector("div").removeAttribute("data-theme"));
        await expect(root).toHaveAttribute("data-pk-theme", "dark");
        // a popover: focus inside the shadow root, closes on a click outside, the focus goes back
        await page.getByTestId("export").click();
        await expect(page.getByTestId("export-xlsx")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await expect(page.getByTestId("export")).toBeFocused();
        await page.getByTestId("options").click();
        await expect(page.locator(".pk-popover")).toHaveCount(1);
        await page.locator('[data-testid="pivot-table"] tbody').click({ position: { x: 5, y: 5 } });
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        // a click inside the popover keeps it open (composed path, not the shadow host)
        await page.getByTestId("options").click();
        await page.getByText("Row subtotals").click();
        await expect(page.locator(".pk-popover")).toHaveCount(1);
        await page.keyboard.press("Escape");
        // the drill-down takes the focus and gives it back
        const cell = page.locator('[data-testid="pivot-table"] td.pk-clickable').first();
        await cell.click();
        await expect(page.getByTestId("drill-panel").getByRole("button", { name: "Close" })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(cell).toBeFocused();
        // drag and drop
        await drag(page, page.locator('.pk-field[data-field="Channel"]'), page.locator('[data-zone="filters"]'));
        await expect.poll(() => chips(page, "filters")).toEqual(["Channel"]);
    });
});
