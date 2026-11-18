// The four zones in an even grid (#605): below 640 px of the report's main area one column, from there
// a 2×2 grid with equal halves at every width (Filters and Columns on top, Rows and Values below),
// never three areas and one below them. The switch follows the report's width, not the window's. A
// chip added to a zone moves no cell, so the drop targets stay where they are. Each zone has a light
// frame at rest. Real layout measurements in the playground with the sales data.
import { expect, test } from "./fixtures.js";

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
    test("a light frame at rest from --pk-zone-border, the --pk-border colour by default; a host's colour takes effect", async ({ page }) => {
        await open(page, { width: 1440 });
        const frame = () => page.locator('[data-zone="filters"]').evaluate((el) => ({ style: getComputedStyle(el).borderTopStyle, color: getComputedStyle(el).borderTopColor, border: getComputedStyle(el).getPropertyValue("--pk-border").trim() }));
        const rest = await frame();
        expect(rest.style).toBe("solid");
        expect(rest.border).toBe("#dde1e7");
        expect(rest.color).toBe("rgb(221, 225, 231)");
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
