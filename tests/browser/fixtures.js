// Shared setup: every test fails when the page logs an error or a warning, or throws.
import { test as base, expect } from "@playwright/test";
import { toViewFile } from "pivotkit-core";
import { encodeViewLink } from "pivotkit-core/link";
import { LABELS, fill } from "../../packages/pivotkit-react/src/labels.js";
import { en as menuEn } from "../../packages/pivotkit-react/src/menu-labels.js";

/**
 * Playwright's trace recording (trace: "retain-on-failure") injects its snapshot script into every
 * frame; Chromium refuses it in the report's print frame, which is sandboxed without scripts, and logs
 * this. The page itself runs no script there: without tracing the message is not logged (checked with
 * --trace off and with a plain browser), so it is the harness's, not the report's. Every spec ignores
 * it, not only the print specs: the Export menu makes the print frame ready whenever it opens
 * (print-frame.js), so every spec that opens the menu would log it. Errors of the page itself still
 * fail every test.
 */
const TRACE_IN_PRINT_FRAME = /^Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/;

/**
 * Playwright's Firefox driver (Juggler) logs this from its own script when it opens a page in a mobile
 * context (isMobile): the file is chrome://juggler, not the page. Every spec ignores it.
 */
const JUGGLER_FORCED_LAYOUT = /^\[JavaScript Warning: "Layout was forced before the page was fully loaded\. If stylesheets are not yet loaded this may cause a flash of unstyled content\." \{file: "chrome:\/\/juggler\/content\/content\/main\.js" line: \d+\}\]$/;

/**
 * Collects what a page logs as an error or a warning, and what it throws, except the harness's
 * TRACE_IN_PRINT_FRAME and JUGGLER_FORCED_LAYOUT and the messages of `ignore` (each a whole message). A test expects the list
 * empty at its end. The `page` fixture does this for every test; a page of a context of its own calls it.
 * @param {import("@playwright/test").Page} page
 * @param {{ ignore?: RegExp[] }} [options]
 * @returns {string[]}
 */
export function watchConsole(page, { ignore = [] } = {}) {
    const problems = [];
    page.on("console", (m) => {
        if ((m.type() === "error" || m.type() === "warning") && ![TRACE_IN_PRINT_FRAME, JUGGLER_FORCED_LAYOUT, ...ignore].some((re) => re.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    return problems;
}

export const test = base.extend({
    /** Console messages a spec expects from the harness, not the page (none by default): each one a whole message. */
    ignoreConsole: [[], { option: true }],
    page: async ({ page, ignoreConsole }, use) => {
        const problems = watchConsole(page, { ignore: ignoreConsole });
        await use(page);
        expect(problems, "console errors and warnings").toEqual([]);
    }
});

export { expect };

/** The day the playground's data snapshots were fetched (tests/snapshot-day.js). */
export { SNAPSHOT_DAY } from "../snapshot-day.js";

/** An object whose unknown key throws, at every level: a mistyped key fails at once, by its name. */
const strict = (object, path = "TEXTS") =>
    new Proxy(object, {
        get(target, key) {
            if (typeof key !== "string") return target[key];
            if (!Object.hasOwn(target, key)) throw new Error(`${path} has no text ${key}`);
            const value = target[key];
            return value && typeof value === "object" ? strict(value, `${path}.${key}`) : value;
        }
    });

/**
 * The report's English texts, the first load's and the menus', by key: a test that expects the text a
 * key gives, not a copy of its words, breaks on no change of wording. `textOf` fills its values. New
 * tests use them; most specs still spell the words out (tests/AGENTS.md).
 * The browser tests run the report in English; that every language has every key is
 * pivotkit-react's labels.test.js and menu-texts.test.js.
 */
export const TEXTS = strict({ ...LABELS.en, ...menuEn });
export const textOf = (key, values = {}) => fill(TEXTS[key], values);

/** The chip texts of a zone, in order. */
export async function chips(page, zone) {
    return page.locator(`[data-zone="${zone}"] .pk-chip`).evaluateAll((els) => els.map((e) => e.getAttribute("data-chip")));
}

/** What the drag's live regions say now. */
const liveTexts = (page) => page.locator('[id^="DndLiveRegion-"]').allTextContents();

/**
 * Waits until a drag's target shows that it takes the drop, as a person waits for it before the
 * release: dnd-kit drops on the target of its last render, and a busy WebKit can take the release
 * before it has drawn the last moves, so the drop lands nowhere (#416). A zone (or a chip in it) is
 * named by the drag's live region; the field list marks itself. Any other target throws: a new kind
 * of target needs a wait of its own.
 * A chip moved inside its own zone is named with that zone from the start, so there the wait shows
 * little.
 * A release beside the zone's chips (at its end) waits for the zone's own mark: the live region names
 * the zone as soon as the pointer passes over one of its chips, so a release then put the field
 * before that chip instead of at the end.
 * @param {string[]} before the live regions' texts before the drag
 * @param {{ x: number, y: number }} end where the pointer is released
 */
async function dropShown(page, to, before, end) {
    const target = await to.evaluate((el, at) => {
        if (el.matches(".pk-panel")) {
            return { panel: true };
        }
        const zone = el.closest("[data-zone]");
        const onChip = [...(zone?.querySelectorAll(".pk-chip") ?? [])].some((chip) => {
            const r = chip.getBoundingClientRect();
            return at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom;
        });
        return { zone: zone?.getAttribute("aria-label") ?? null, id: zone?.getAttribute("data-zone"), onChip };
    }, end);
    if (target.panel) {
        await expect(to, "the field list shows it takes the chip").toHaveClass(/\bpk-over\b/);
    } else if (target.zone && !target.onChip) {
        await expect(page.locator(`[data-zone="${target.id}"]`), `${target.zone} shows it takes the drop at its end`).toHaveClass(/\bpk-over\b/);
    } else if (target.zone) {
        // a new text: the last drop of an earlier drag may name the same zone
        await expect.poll(() => liveTexts(page).then((texts) => texts.some((text) => text.includes(target.zone) && !before.includes(text))), `the drag is over ${target.zone}`).toBe(true);
    } else {
        throw new Error(`drag(): no wait for a drop on ${to}; drop on a zone, a chip in one, or the field list`);
    }
}

/** A mouse drag from one element to another with intermediate moves, as dnd-kit needs them. */
export async function drag(page, from, to, { toPosition } = {}) {
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    const start = { x: a.x + Math.min(40, a.width / 2), y: a.y + a.height / 2 };
    const end = toPosition ? { x: b.x + toPosition.x, y: b.y + toPosition.y } : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const before = await liveTexts(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 16 });
    await page.mouse.move(end.x + 1, end.y + 1, { steps: 2 });
    await dropShown(page, to, before, { x: end.x + 1, y: end.y + 1 });
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

/** The menus beside the tabs: the settings of the table or of the chart, opened on their tab. */
export const SETTINGS = { "table-settings": "table", "chart-settings": "chart" };

/**
 * Waits until no animation or transition of the page runs (a drawer that slides, a fold that opens).
 * Call it after what starts the animation has shown, so it does not pass before the animation starts.
 * @param {import("@playwright/test").Page} page
 */
export async function animationsSettled(page) {
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
}

/** A `--pk-*` token's colour as the browser resolves it in the (first) report. */
export const tokenColor = (page, token) =>
    page.locator(".pk-root").first().evaluate((root, name) => {
        const probe = root.appendChild(document.createElement("span"));
        probe.style.color = `var(${name})`;
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    }, token);

/**
 * The weather start view without its short name for the grouping ("Month"): the table's corner and the
 * chip show the default name, "Date by month of year", with the years it combines, a name long enough
 * to wrap. `weatherLongName(query)` is its playground address.
 */
const WEATHER_LONG_NAME = toViewFile({
    rows: ["City"],
    cols: ["Date by month of year"],
    derived: [{ name: "Date by month of year", field: "Date", by: "month" }],
    values: [{ field: "Mean °C", agg: "average", format: "number:1" }],
    totals: { grandTotalRow: false }
}, {}, { link: true });
export const weatherLongName = (query = "") => `?data=weather&empty${query}#pivot-playground=${encodeViewLink(WEATHER_LONG_NAME)}`;

/**
 * Sets the report's font to Arial, or Liberation Sans on Linux, which has Arial's widths: a test that
 * measures text in pixels (a chip that must wrap or fit at a width) measures the same on every machine.
 * @param {import("@playwright/test").Page} page
 */
export const pinFont = (page) => page.addStyleTag({ content: '.pk-root { --pk-font: Arial, "Liberation Sans", sans-serif; }' });

/**
 * Waits two frames of the page. The toolbar decides again which buttons stand in "More" as the report
 * lays out (a ResizeObserver, then a render): a test that looks for a button, its own or in More,
 * looks once that has settled.
 * @param {import("@playwright/test").Page} page
 */
export const twoFrames = (page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/**
 * Clicks a toolbar action: its own button, or its entry in "More" when the report is too narrow for
 * all buttons. `scope` is the page or one report of several (a locator, also a web component's host).
 * `testId` is the button's ("redo", "views", "more", "export"), an action of Start over
 * ("reset", "new-report": its menu, then the action), "help" (More, then its Help level), or a menu
 * beside the tabs ("view-settings"; "table-settings", "chart-settings": its tab is shown first, with a
 * click, when it is not). A menu that is open already (Views stays open after a save) stays open: a
 * click on its button would close it.
 * @param {import("@playwright/test").Page | import("@playwright/test").Locator} scope
 */
export async function toolbar(scope, testId) {
    const page = "goto" in scope ? scope : scope.page();
    // the report has its data (a real data set loads as a chunk of its own) and its toolbar has settled
    await scope.locator('[data-testid="pivot-table"], [data-testid="pivot-chart"], [data-testid="empty-state"]').first().waitFor();
    await twoFrames(page);
    const button = START_OVER.includes(testId) ? "start-over" : testId;
    const own = scope.getByTestId(button);
    if (Object.hasOwn(SETTINGS, testId)) {
        const tab = scope.getByTestId(`show-${SETTINGS[testId]}`);
        if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
        const settings = scope.getByTestId("view-settings");
        if ((await settings.getAttribute("aria-expanded")) !== "true") await settings.click();
    } else if (testId === "help") {
        await scope.getByTestId("more").click();
        await scope.getByTestId("more-help").click();
        await expect(scope.getByTestId("level-help")).toBeVisible();
    } else if (await own.count()) {
        if ((await own.getAttribute("aria-expanded")) !== "true") await own.click();
        if (button !== testId) await scope.getByTestId(testId).click();
    } else {
        await scope.getByTestId("more").click();
        await scope.getByTestId(`more-${testId}`).click();
    }
    // a menu takes the focus a frame after it opens (from More once its panel is there): wait for it,
    // so a test that moves the focus inside does not lose it to that
    if (!["redo", ...START_OVER].includes(testId)) {
        await expect.poll(() => page.evaluate(() => {
            const deep = (root) => (root.activeElement?.shadowRoot ? deep(root.activeElement.shadowRoot) : root.activeElement);
            return Boolean(deep(document)?.closest(".pk-popover"));
        })).toBe(true);
    }
}

/**
 * Checks the chart type chosen, as Chart settings names its group of types ("Chart type: Pie") and
 * marks it pressed, then closes the menu again; `scope` is the page or one report.
 * @param {string} name  the type's name, "Automatic" for the automatic type
 * @param {string} id  its picker id ("auto", "pie")
 */
export async function expectChartType(scope, name, id) {
    const settings = scope.getByTestId("view-settings");
    await expect(settings).toHaveText(/Chart settings/);
    await settings.click();
    await expect(scope.getByTestId("chart-types")).toHaveAccessibleName(`Chart type: ${name}`);
    await expect(scope.getByTestId(`chart-${id}`)).toHaveAttribute("aria-pressed", "true");
    await settings.press("Escape");
    await expect(settings).toHaveAttribute("aria-expanded", "false");
}

/**
 * Reads `read()` until two readings in a row, apart, are the same (as JSON) and `ready` holds for the
 * reading, and returns it: a layout or a drawing settles over its first frames.
 * @template T
 * @param {() => Promise<T>} read
 * @param {{ ready?: (value: T) => boolean, intervals?: number[] }} [options]  `intervals`: expect.poll's
 * @returns {Promise<T>}
 */
export async function untilStable(read, { ready = () => true, intervals = [250, 250, 250, 500] } = {}) {
    let last;
    let seen = false;
    await expect
        .poll(async () => {
            const now = await read();
            const same = seen && ready(now) && JSON.stringify(now) === JSON.stringify(last);
            last = now;
            seen = true;
            return same;
        }, { intervals })
        .toBe(true);
    return last;
}

/**
 * Opens the report's zones when they are folded, once the report has settled: it folds or opens them
 * while it measures itself after the first renders, so the layout is read twice, apart, before.
 * `scope` is the page or one report of several.
 */
export async function openZones(scope) {
    const layout = await untilStable(() => scope.locator(".pk-root").first().getAttribute("data-pk-layout"));
    if (layout === "compact") await scope.getByTestId("layout-summary").click();
    await expect(scope.locator(".pk-zone").first()).toBeVisible();
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
 * its markup, its stylesheets (adopted, never a <style>), its language and the frame's sandbox; and
 * whether it ran in the click: `inClick` while the click was being dispatched (its listeners and the
 * microtasks after them; Safari asks before a print it does not take as the person's), `activation`
 * the page's transient user activation then (navigator.userActivation, null where it is missing).
 * window.__prints counts the calls; with window.__printThrows set, print() throws (a browser that
 * refuses it).
 */
export async function capturePrint(page) {
    // installed in the page after it loaded, not as an init script: Playwright runs init scripts in
    // every frame, and the sandboxed print frame (no scripts) would log that it blocked one
    await page.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__clicking = false;
        document.addEventListener("click", () => (w.__clicking = true), true);
        // the last listener of the click's way back up: after the report's own and their microtasks
        window.addEventListener("click", () => (w.__clicking = false));
        const own = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
        Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
            configurable: true,
            get() {
                const win = own.get.call(this);
                if (win && this.classList.contains("pk-print-frame")) {
                    win.print = () => {
                        w.__prints = (w.__prints ?? 0) + 1;
                        if (w.__printThrows) {
                            throw new Error("print refused");
                        }
                        const d = this.contentDocument;
                        w.__printed = {
                            inClick: w.__clicking,
                            activation: "userActivation" in navigator ? navigator.userActivation.isActive : null,
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

/**
 * navigator.clipboard.writeText that keeps what it was given in window.__copied (every browser, no
 * permission), and in window.__inClick whether it was called while the click was being dispatched:
 * Safari refuses a write after an await, so the copy must happen in the click itself.
 */
export async function captureClipboard(page) {
    await page.addInitScript(() => {
        const w = /** @type {any} */ (window);
        w.__clicking = false;
        document.addEventListener("click", () => (w.__clicking = true), true);
        // the last listener of the click's way back up: after the report's own
        window.addEventListener("click", () => (w.__clicking = false));
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
                writeText: async (text) => {
                    w.__copied = text;
                    w.__inClick = w.__clicking;
                }
            }
        });
    });
}

export const inClick = (page) => page.evaluate(() => /** @type {any} */ (window).__inClick);

export const copied = (page) => page.evaluate(() => /** @type {any} */ (window).__copied ?? null);
