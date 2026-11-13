// Shared setup: every test fails when the page logs an error or a warning, or throws.
import { test as base, expect } from "@playwright/test";

/**
 * Playwright's trace recording (trace: "retain-on-failure") injects its snapshot script into every
 * frame; Chromium refuses it in the report's print frame, which is sandboxed without scripts, and logs
 * this. The page itself runs no script there: without tracing the message is not logged (checked with
 * --trace off and with a plain browser), so it is the harness's, not the report's.
 */
export const TRACE_IN_PRINT_FRAME = /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/;

export const test = base.extend({
    page: async ({ page }, use) => {
        const problems = [];
        page.on("console", (m) => {
            if ((m.type() === "error" || m.type() === "warning") && !TRACE_IN_PRINT_FRAME.test(m.text())) problems.push(`${m.type()}: ${m.text()}`);
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

/** The actions of Start over's menu ("reset", "new-report"): entries of their own in "More". */
export const START_OVER = ["reset", "new-report"];

/**
 * Clicks a toolbar action: its own button, or its entry in "More" when the report is too narrow for
 * all buttons. `testId` is the button's ("redo", "options", "views", "chart-type"), or an action of
 * Start over ("reset", "new-report": its menu, then the action). A menu that is open already (Views
 * stays open after a save) stays open: a click on its button would close it.
 */
export async function toolbar(page, testId) {
    // the report has its data (a real data set loads as a chunk of its own) and its toolbar has settled
    await page.locator('[data-testid="pivot-table"], [data-testid="pivot-chart"], [data-testid="empty-state"]').first().waitFor();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const button = START_OVER.includes(testId) ? "start-over" : testId;
    const own = page.getByTestId(button);
    if (await own.count()) {
        if ((await own.getAttribute("aria-expanded")) !== "true") await own.click();
        if (button !== testId) await page.getByTestId(testId).click();
    } else {
        await page.getByTestId("more").click();
        await page.getByTestId(`more-${testId}`).click();
    }
    // a menu takes the focus a frame after it opens (from More once its panel is there): wait for it,
    // so a test that moves the focus inside does not lose it to that
    if (!["redo", "layout", ...START_OVER].includes(testId)) {
        await expect.poll(() => page.evaluate(() => {
            const deep = (root) => (root.activeElement?.shadowRoot ? deep(root.activeElement.shadowRoot) : root.activeElement);
            return Boolean(deep(document)?.closest(".pk-popover"));
        })).toBe(true);
    }
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

/**
 * Opens Start over's menu of a report (its button, or "More" when the toolbar has no room for it) and
 * returns an action there ("reset", "new-report"); `scope` is the page or one report of several.
 */
export async function startOver(scope, action) {
    const own = scope.getByTestId("start-over");
    if (await own.count()) {
        if ((await own.getAttribute("aria-expanded")) !== "true") await own.click();
        return scope.getByTestId(action);
    }
    await scope.getByTestId("more").click();
    return scope.getByTestId(`more-${action}`);
}

/** Opens the Save as level of an open Views menu ("Save as…", or "Save current view…"). */
export async function openSaveAs(scope) {
    await scope.getByTestId("save-as").click();
    await expect(scope.getByTestId("saved-view-name")).toBeVisible();
}

/**
 * Opens a topic's level in an open menu in levels: its row on the first level ("filter", "top",
 * "format", ...), then waits for the level.
 */
export async function openLevel(scope, topic) {
    await scope.getByTestId(`topic-${topic}`).click();
    await expect(scope.getByTestId(`level-${topic}`)).toBeVisible();
}

/** Opens the menu of a chip (by its text) and, with a topic, that topic's level. */
export async function chipMenu(page, chip, topic) {
    await page.getByTestId(`chip-menu-${chip}`).click();
    await expect(page.locator(".pk-chip-menu .pk-levels")).toBeVisible();
    if (topic) await openLevel(page.locator(".pk-chip-menu"), topic);
}

/** Opens the Rules section of an open Filter level (folded while the field has no rule). */
export async function openRules(scope) {
    const rules = scope.getByTestId("section-rules");
    if ((await rules.getAttribute("aria-expanded")) !== "true") await rules.click();
}

/**
 * Picks an item of a rule in the Filter level: from the searchable list of a long grouping (a button
 * that opens a search and a list; the first match is taken), or from the native select of a short one.
 */
export async function pickItem(page, scope, testId, label) {
    const value = scope.getByTestId(testId);
    if ((await value.evaluate((el) => el.tagName)) === "SELECT") {
        await value.selectOption({ label });
        return;
    }
    await value.click();
    await page.getByTestId("picker-search").fill(label);
    await expect(page.getByTestId("picker-option").first()).toHaveText(new RegExp(`^${label}`));
    await page.getByTestId("picker-search").press("Enter");
}

/**
 * Call after page.goto. The print frame's window.print replaced by a stub that keeps what it would print in window.__printed:
 * its markup, its stylesheets (adopted, never a <style>), its language and the frame's sandbox.
 */
export async function capturePrint(page) {
    // installed in the page after it loaded, not as an init script: Playwright runs init scripts in
    // every frame, and the sandboxed print frame (no scripts) would log that it blocked one
    await page.evaluate(() => {
        const w = /** @type {any} */ (window);
        const own = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
        Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
            configurable: true,
            get() {
                const win = own.get.call(this);
                if (win && this.classList.contains("pk-print-frame")) {
                    win.print = () => {
                        const d = this.contentDocument;
                        w.__printed = {
                            body: d.body.innerHTML,
                            title: d.title,
                            lang: d.documentElement.lang,
                            sheets: d.adoptedStyleSheets.length,
                            css: [...d.adoptedStyleSheets].flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join("\n"),
                            styleElements: d.querySelectorAll("style, script, meta[http-equiv]").length,
                            sandbox: this.getAttribute("sandbox"),
                            grand: (() => {
                                const cell = [...d.querySelectorAll("th")].find((th) => th.textContent === "Grand Total");
                                return cell ? getComputedStyle(cell).fontWeight : null;
                            })()
                        };
                    };
                }
                return win;
            }
        });
    });
}
