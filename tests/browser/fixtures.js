// Shared setup: every test fails when the page logs an error or a warning, or throws.
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
    page: async ({ page }, use) => {
        const problems = [];
        page.on("console", (m) => {
            if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
        });
        page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
        await use(page);
        expect(problems, "console errors and warnings").toEqual([]);
    }
});

export { expect };

/** The chip texts of a zone, in order. */
export async function chips(page, zone) {
    return page.locator(`[data-zone="${zone}"] .pk-chip`).evaluateAll((els) => els.map((e) => e.getAttribute("data-chip")));
}

/** A mouse drag from one element to another with intermediate moves, as dnd-kit needs them. */
export async function drag(page, from, to, { toPosition } = {}) {
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    const start = { x: a.x + Math.min(40, a.width / 2), y: a.y + a.height / 2 };
    const end = toPosition ? { x: b.x + toPosition.x, y: b.y + toPosition.y } : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 16 });
    await page.mouse.move(end.x + 1, end.y + 1, { steps: 2 });
    await page.mouse.up();
    // dnd-kit swallows clicks for 50 ms after a drag ends (so a drop is no click); a person is slower
    await page.waitForTimeout(100);
}

/**
 * Body rows of the pivot table as arrays of the cell texts on screen: without the visually hidden text
 * of an empty cell ("No rows"), which only a screen reader reads.
 */
export async function tableRows(page) {
    return page.locator('[data-testid="pivot-table"] tbody tr[data-r]').evaluateAll((trs) =>
        trs.map((tr) =>
            [...tr.children].map((c) => [...c.childNodes].filter((n) => !(n instanceof Element && n.classList.contains("pk-sr"))).map((n) => n.textContent).join("").trim())
        )
    );
}

/**
 * Clicks a toolbar action: its own button, or its entry in "More" when the report is too narrow for
 * all buttons. `testId` is the button's ("redo", "reset", "options", "views", "chart-type").
 */
export async function toolbar(page, testId) {
    const own = page.getByTestId(testId);
    if (await own.count()) {
        await own.click();
        return;
    }
    await page.getByTestId("more").click();
    await page.getByTestId(`more-${testId}`).click();
}

/**
 * Opens the report's zones when they are folded, once the report has settled: it folds or opens them
 * while it measures itself after the first renders, so the layout is read twice, apart, before.
 */
export async function openZones(page) {
    const root = page.locator(".pk-root").first();
    let last = "";
    await expect
        .poll(async () => {
            const now = String(await root.getAttribute("data-pk-layout"));
            const same = now === last;
            last = now;
            return same;
        }, { intervals: [250, 250, 250, 500] })
        .toBe(true);
    if (last === "compact") await page.getByTestId("layout-summary").click();
    await expect(page.locator(".pk-zone").first()).toBeVisible();
}
