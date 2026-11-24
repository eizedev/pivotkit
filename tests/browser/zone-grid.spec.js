// The four zones in an even grid (#605): below 640 px of the report's main area one column, from there
// a 2×2 grid with equal halves at every width (Filters and Columns on top, Rows and Values below),
// never three areas and one below them. The switch follows the report's width, not the window's. A
// chip added to a zone moves no cell, so the drop targets stay where they are. Each zone has a light
// frame at rest. Real layout measurements in the playground with the sales data.
import { LIGHT_TOKENS } from "pivotkit-report";
import { chips, expect, pinFont, test } from "./fixtures.js";
import { rgb } from "./report-contrast.js";

async function open(page, { width, height = 900, lang = "en" }) {
    await page.setViewportSize({ width, height });
    await page.goto(`?data=sales&lang=${lang}`);
    await page.locator('[data-testid="pivot-table"]').waitFor();
    const fold = page.getByTestId("layout-summary");
    if ((await fold.getAttribute("aria-expanded")) !== "true") {
        await fold.click();
    }
    await expect(page.locator(".pk-zone")).toHaveCount(4);
}

/** Each zone's box in px, unrounded, and the zones' content box. */
const cells = (page) =>
    page.locator(".pk-zones").evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const zones = Object.fromEntries(
            [...el.querySelectorAll("[data-zone]")].map((z) => {
                const b = z.getBoundingClientRect();
                return [z.getAttribute("data-zone"), { x: b.left, y: b.top, w: b.width, h: b.height, right: b.right }];
            })
        );
        return { zones, inner: r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) };
    });

/** The 2×2 grid: Filters and Columns on top, Rows and Values below, four equal halves. */
function expectGrid({ zones: z, inner }) {
    const gap = z.cols.x - z.filters.right;
    expect(Math.abs(z.filters.y - z.cols.y)).toBeLessThan(0.5);
    expect(Math.abs(z.rows.y - z.values.y)).toBeLessThan(0.5);
    expect(z.rows.y).toBeGreaterThan(z.filters.y);
    expect(Math.abs(z.filters.x - z.rows.x)).toBeLessThan(0.5);
    expect(Math.abs(z.cols.x - z.values.x)).toBeLessThan(0.5);
    expect(z.cols.x).toBeGreaterThan(z.filters.right - 0.5);
    for (const zone of ["cols", "rows", "values"]) {
        expect(Math.abs(z[zone].w - z.filters.w), zone).toBeLessThan(0.5);
    }
    // the two halves fill the row
    expect(Math.abs(2 * z.filters.w + gap - inner)).toBeLessThan(1);
}

test.describe("the zones' grid follows the report's width", () => {
    test("640: one column, every zone the full width, one below the other in the order Filters, Columns, Rows, Values", async ({ page }) => {
        await open(page, { width: 640, height: 900 });
        const { zones: z, inner } = await cells(page);
        const order = ["filters", "cols", "rows", "values"];
        for (const [i, zone] of order.entries()) {
            expect(Math.abs(z[zone].x - z.filters.x), zone).toBeLessThan(0.5);
            expect(Math.abs(z[zone].w - inner), zone).toBeLessThan(1);
            if (i > 0) {
                expect(z[zone].y, zone).toBeGreaterThan(z[order[i - 1]].y);
            }
        }
    });

    for (const [width, height] of [
        [1024, 768],
        [1440, 900],
        [1920, 1080],
        [2560, 1440]
    ]) {
        test(`${width}: a 2×2 grid of four equal cells`, async ({ page }) => {
            await open(page, { width, height });
            expectGrid(await cells(page));
        });
    }

    test("a wide window with a narrow report: one column, as the report's width says", async ({ page }) => {
        await open(page, { width: 1440, height: 900 });
        expectGrid(await cells(page));
        await page.addStyleTag({ content: ".pk-root { width: 600px !important; }" });
        await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", "narrow");
        // a narrow report folds its zones at this height: open them again
        const fold = page.getByTestId("layout-summary");
        await expect(fold).toHaveAttribute("aria-expanded", "false");
        await fold.click();
        await expect
            .poll(async () => {
                const { zones: z } = await cells(page);
                return new Set(Object.values(z).map((b) => Math.round(b.y))).size;
            })
            .toBe(4);
    });
});

test("1440: the field list folded to its rail widens the halves, so Rows with two fields fits in one line", async ({ page }) => {
    await open(page, { width: 1440, height: 900 });
    await pinFont(page);
    const before = await cells(page);
    expect(before.zones.rows.h).toBeGreaterThan(56);
    await page.getByTestId("collapse-fields").click();
    await expect(page.getByTestId("field-rail")).toBeVisible();
    await expect.poll(async () => Math.round((await cells(page)).zones.rows.h)).toBeLessThan(56);
    const after = await cells(page);
    expectGrid(after);
    expect(after.zones.rows.w).toBeGreaterThan(before.zones.rows.w + 100);
    expect(Math.abs(after.zones.rows.h - after.zones.filters.h)).toBeLessThan(0.5);
});

test.describe("the cells stay where they are", () => {
    for (const [width, height] of [
        [1024, 768],
        [1440, 900],
        [1920, 1080],
        [2560, 1440]
    ]) {
        test(`${width}: chips added to Rows and Values move no cell and widen none; the chips stay inside their cell`, async ({ page }) => {
            await open(page, { width, height });
            const before = (await cells(page)).zones;
            const add = async (zone, field) => {
                const placed = page.locator(`[data-zone="${zone}"] .pk-chip`);
                const count = await placed.count();
                await page.getByTestId(`add-field-${zone}`).click();
                await page.locator(".pk-add-menu").getByTestId(`add-pick-${field}`).click();
                await expect(placed).toHaveCount(count + 1);
                const now = await cells(page);
                for (const [name, b] of Object.entries(now.zones)) {
                    expect(Math.abs(b.x - before[name].x), `${name} after ${field}`).toBeLessThan(0.5);
                    expect(Math.abs(b.w - before[name].w), `${name} after ${field}`).toBeLessThan(0.5);
                }
                expectGrid(now);
            };
            for (const field of ["Product", "Channel", "Category", "Month"]) {
                await add("rows", field);
            }
            for (const field of ["Units", "Discount"]) {
                await add("values", field);
            }
            for (const zone of ["rows", "values"]) {
                const box = (await cells(page)).zones[zone];
                const right = await page.locator(`[data-zone="${zone}"] .pk-chip`).evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().right)));
                expect(right, zone).toBeLessThanOrEqual(box.right + 0.5);
            }
        });
    }
});

test.describe("each zone's frame and hint", () => {
    test("a frame at rest from --pk-zone-border, the --pk-border-strong colour by default; a host's colour takes effect", async ({ page }) => {
        await open(page, { width: 1440 });
        const frame = () => page.locator('[data-zone="filters"]').evaluate((el) => ({ style: getComputedStyle(el).borderTopStyle, color: getComputedStyle(el).borderTopColor, border: getComputedStyle(el).getPropertyValue("--pk-border-strong").trim() }));
        const rest = await frame();
        expect(rest.style).toBe("solid");
        // the light theme's value, as pivotkit-report keeps it (its tokens test compares it with styles.css)
        expect(rest.border).toBe(LIGHT_TOKENS["--pk-border-strong"]);
        expect(rest.color).toBe(rgb(LIGHT_TOKENS["--pk-border-strong"]));
        await page.addStyleTag({ content: ".pk-root { --pk-zone-border: rgb(200, 30, 40); }" });
        // the frame's colour has a transition
        await expect.poll(async () => (await frame()).color).toBe("rgb(200, 30, 40)");
    });

    test("Filters says in a few words what it is for, in English and German; an empty zone is one line", async ({ page }) => {
        await open(page, { width: 1440 });
        await expect(page.locator('[data-zone="filters"] .pk-zone-hint')).toHaveText("Add or drop a field to filter");
        const { zones: z } = await cells(page);
        expect(Math.abs(z.filters.h - z.cols.h)).toBeLessThan(0.5);
        expect(z.filters.h).toBeLessThan(56);
        await open(page, { width: 1440, lang: "de" });
        await expect(page.locator('[data-zone="filters"] .pk-zone-hint')).toHaveText("Ein Feld hinzufügen oder hierher ziehen, um zu filtern");
    });
});

test("1280: a chip moved by the keyboard in a Rows of two lines starts over its own place", async ({ page }) => {
    await open(page, { width: 1280, height: 1000 });
    await pinFont(page);
    const { zones: z } = await cells(page);
    // Region on the first line, Country on the second: the zone's centre lies near Region's
    expect(z.rows.h).toBeGreaterThan(56);
    const live = page.locator('[id^="DndLiveRegion"]');
    const region = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-handle');
    await region.focus();
    await page.keyboard.press("Space");
    await expect(live).toHaveText("Region is over Rows, position 1 of 2.");
    await page.keyboard.press("Escape");
    await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
    // picked up and put down at once: it stays where it was
    await region.focus();
    await page.keyboard.press("Space");
    await expect(live).toHaveText("Region is over Rows, position 1 of 2.");
    await page.keyboard.press("Space");
    await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
    // the first arrow key goes to the next place from its own
    await region.focus();
    await page.keyboard.press("Space");
    await expect(live).toHaveText("Region is over Rows, position 1 of 2.");
    // dnd-kit listens for the arrow keys from the next task on
    await page.waitForTimeout(100);
    await page.keyboard.press("ArrowRight");
    await expect(live).toHaveText("Region is over Rows, position 2 of 2.");
    await page.keyboard.press("Space");
    await expect.poll(() => chips(page, "rows")).toEqual(["Country", "Region"]);
});

test("1440: the skeleton's places of the zones take the same 2×2 grid", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // the host holds its data back for a moment: the skeleton shows meanwhile
    await page.goto("pages/host.html?loading");
    const places = page.locator(".pk-skel-zone");
    await expect(places).toHaveCount(4);
    const b = await places.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; }));
    expect(Math.abs(b[0].y - b[1].y)).toBeLessThan(0.5);
    expect(Math.abs(b[2].y - b[3].y)).toBeLessThan(0.5);
    expect(b[2].y).toBeGreaterThan(b[0].y);
    expect(Math.abs(b[0].x - b[2].x)).toBeLessThan(0.5);
    expect(Math.abs(b[1].x - b[3].x)).toBeLessThan(0.5);
    for (const place of b) expect(Math.abs(place.w - b[0].w)).toBeLessThan(0.5);
});
