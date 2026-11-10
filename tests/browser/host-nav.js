// Helpers of the tests in a host page with a fixed left navigation and an app bar whose z-indexes are
// above the report's (pages/nav.html and pages/element-nav.html, as PowerShell Universal draws its
// apps; see pages/nav-shell.js): what the window shows at a point (through shadow roots), and the
// menus of one report of several.
import { expect } from "./fixtures.js";

/** The page with pivotkit-react and the page with the web component, both in the host's frame. */
export const NAV_PAGES = [
    ["pivotkit-react", "pages/nav.html"],
    ["the web component", "pages/element-nav.html"]
];

/** The page's first report: a locator that pierces the element's shadow root. */
export const reportOf = (page) => page.locator("#one");

/**
 * What the window shows at a point, down through shadow roots: the element at the point of the
 * document, then of each shadow root it is the host of.
 */
export const hitAt = (page, x, y) =>
    page.evaluate(([px, py]) => {
        let el = document.elementFromPoint(px, py);
        while (el?.shadowRoot) {
            const inner = el.shadowRoot.elementFromPoint(px, py);
            if (!inner || inner === el) {
                break;
            }
            el = inner;
        }
        return el ? { inPopover: Boolean(el.closest(".pk-popover")), inScrim: Boolean(el.closest(".pk-scrim")), where: el.closest(".host-drawer, .host-appbar")?.className ?? el.className ?? el.localName } : null;
    }, [x, y]);

/** Waits until a popover is where it ends up: a sheet slides in from the bottom, a popover grows in. */
export const settled = (popover) => popover.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));

/** Every visible label of an open popover: each is what the window shows at its own left edge. */
export async function labelsOnTop(page, popover) {
    await settled(popover);
    const boxes = await popover.locator(".pk-level-row, [data-pk-option], .pk-option, [role='menuitem'], [role='menuitemradio'], p, h3").evaluateAll((els) =>
        els
            .map((el) => {
                const r = el.getBoundingClientRect();
                return { text: el.textContent.trim().slice(0, 40), x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2, w: r.width, h: r.height };
            })
            .filter((b) => b.w > 0 && b.h > 0 && b.y > 0 && b.y < window.innerHeight)
    );
    expect(boxes.length).toBeGreaterThan(0);
    const out = [];
    for (const b of boxes) {
        const hit = await hitAt(page, b.x, b.y);
        out.push({ text: b.text, on: hit?.inPopover ? "popover" : hit?.where });
    }
    return out;
}

/**
 * Opens the zones of one report of several when they are folded, once the report has settled (as
 * openZones does for a page of one: the layout read twice, apart, before).
 */
export async function openZonesIn(report) {
    const root = report.locator(".pk-root");
    let last = "";
    await expect
        .poll(async () => {
            const now = String(await root.getAttribute("data-pk-layout"));
            const same = now === last;
            last = now;
            return same;
        }, { intervals: [250, 250, 250, 500] })
        .toBe(true);
    if (last === "compact") {
        await report.getByTestId("layout-summary").click();
    }
    await expect(report.locator(".pk-zone").first()).toBeVisible();
}

/** Opens a toolbar menu of one report of several: its button, or its entry in "More" (toolbar() for a page of one). */
export async function toolbarIn(report, testId) {
    const own = report.getByTestId(testId);
    if (await own.count()) {
        await own.click();
    } else {
        await report.getByTestId("more").click();
        await report.getByTestId(`more-${testId}`).click();
    }
    await expect(report.locator(".pk-popover")).toHaveCount(1);
}

/** Every form field of a report: its name, id and whether it has a label. */
export const formFields = (report) =>
    report.locator("input, select, textarea").evaluateAll((els) =>
        els.map((el) => ({
            tag: el.localName,
            type: el.getAttribute("type") ?? "",
            name: el.getAttribute("name") ?? "",
            id: el.id,
            labelled: Boolean(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.labels?.length),
            testid: el.getAttribute("data-testid") ?? el.closest("[data-testid]")?.getAttribute("data-testid")
        }))
    );

/** Opens each topic of a menu in turn (the menu opened by `open`) and collects the form fields shown. */
export async function everyTopic(page, report, open, seen) {
    await open();
    const topics = await report.locator(".pk-popover button[data-testid^='topic-']").evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => e.getAttribute("data-testid")));
    seen.push(...(await formFields(report)));
    await page.keyboard.press("Escape");
    for (const topic of topics) {
        await open();
        const row = report.locator(`.pk-popover button[data-testid='${topic}']`);
        if (!(await row.isEnabled())) {
            await page.keyboard.press("Escape");
            continue;
        }
        await row.click();
        await page.waitForTimeout(150);
        seen.push(...(await formFields(report)));
        while (await report.locator(".pk-popover").count()) {
            await page.keyboard.press("Escape");
        }
    }
}
