// The web component pivotkit-element as pages load it (tests/browser/pages/element/, built into
// dist/pages/element-*.html): its own React in a shadow root, properties, attributes and events, two
// elements on one page, the lifecycle, a page with a React of its own, keyboard and focus, and a
// strict Content-Security-Policy. Playwright's CSS locators reach into open shadow roots.
import { readFile } from "node:fs/promises";
import { test as plain } from "@playwright/test";
import { expect, test } from "./fixtures.js";

const wanted = process.env.PIVOTKIT_REACT === "19" ? /^19\./ : /^18\./;

/** The events the page logged (element/two.js), optionally of one type. */
const events = (page, type) => page.evaluate((t) => window.__events.filter((e) => !t || e.type === t), type);

/** The chip names of a zone of one element. */
const zone = (page, host, name) => page.locator(`${host} [data-zone="${name}"] .pk-chip`).evaluateAll((els) => els.map((e) => e.getAttribute("data-chip")));

/**
 * Clicks a toolbar action of one element: its own button, or its entry in "More" when the toolbar has
 * no room for it (fonts differ between machines).
 */
async function tool(host, testId) {
    const own = host.getByTestId(testId);
    if (await own.count()) {
        // an open menu stays open (Views after a save): a click on its button would close it
        if ((await own.getAttribute("aria-expanded")) !== "true") await own.click();
        return;
    }
    await host.getByTestId("more").click();
    await host.getByTestId(`more-${testId}`).click();
}

/** A custom property's value on an element's .pk-root. */
const token = (page, host, name) => page.locator(`${host} .pk-root`).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

test("the menus' German texts load only for a German report, also when the language changes, never English first; a host's text wins", async ({ page }) => {
    const loaded = [];
    page.on("request", (r) => loaded.push(new URL(r.url()).pathname));
    await page.goto("pages/element-views.html");
    const host = page.locator("#views");
    await expect(host.locator(".pk-root")).toBeVisible();
    await tool(host, "options");
    await expect(host.getByTestId("section-help")).toHaveText("Help");
    await page.keyboard.press("Escape");
    expect(loaded.filter((p) => /menu-texts-de-/.test(p))).toEqual([]);
    // every text the Help section's title shows from now on
    await page.evaluate(() => {
        const root = document.getElementById("views").shadowRoot;
        window.__seen = [];
        new MutationObserver(() => {
            const title = root.querySelector('[data-testid="section-help"]');
            if (title) window.__seen.push(title.textContent);
        }).observe(root, { subtree: true, childList: true, characterData: true });
        document.getElementById("views").locale = "de-DE";
    });
    await expect(host.locator(".pk-root")).toHaveAttribute("lang", "de");
    await tool(host, "options");
    await expect(host.getByTestId("section-help")).toHaveText("Hilfe");
    expect(loaded.filter((p) => /menu-texts-de-/.test(p))).toHaveLength(1);
    // the menu waited for the German texts: no English title in between
    expect(await page.evaluate(() => window.__seen.filter((t) => t !== "Hilfe"))).toEqual([]);
    await page.keyboard.press("Escape");
    // a host's text for a menu text wins over the German one
    await page.evaluate(() => {
        document.getElementById("views").labels = { help: "Hilfe und Tipps" };
    });
    await tool(host, "options");
    await expect(host.getByTestId("section-help")).toHaveText("Hilfe und Tipps");
});

test("a language change while a menu is open keeps the menu and its focus, and changes its texts", async ({ page }) => {
    await page.goto("pages/element-views.html");
    const host = page.locator("#views");
    await expect(host.locator(".pk-root")).toBeVisible();
    await tool(host, "options");
    await host.getByTestId("show-tips").focus();
    await page.evaluate(() => {
        document.getElementById("views").locale = "de-DE";
    });
    await expect(host.getByTestId("section-help")).toHaveText("Hilfe");
    await expect(host.getByTestId("show-tips")).toBeFocused();
});

test("two reports on one page, English and German: each menu in its language, and back from German to English", async ({ page }) => {
    await page.goto("pages/element-two.html");
    const sales = page.locator("#sales");
    const tickets = page.locator("#tickets");
    await expect(tickets.locator(".pk-root")).toHaveAttribute("lang", "de");
    await tool(sales, "options");
    await expect(sales.getByTestId("section-help")).toHaveText("Help");
    await page.keyboard.press("Escape");
    await tool(tickets, "options");
    await expect(tickets.getByTestId("section-help")).toHaveText("Hilfe");
    await page.keyboard.press("Escape");
    // the English report stays English after the German texts loaded
    await tool(sales, "options");
    await expect(sales.getByTestId("section-help")).toHaveText("Help");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
        document.getElementById("tickets").locale = "en-US";
    });
    await expect(tickets.locator(".pk-root")).toHaveAttribute("lang", "en");
    await tool(tickets, "options");
    await expect(tickets.getByTestId("section-help")).toHaveText("Help");
});

// a partial copy of dist/, a Content-Security-Policy or a dropped connection: the German texts do not
// load (plain: the failed request is logged), the menu opens in English and works, and the next
// menu that opens tries the German texts again
plain("when the German menu texts cannot load, the menus open in English, work, and the next menu tries again", async ({ page }) => {
    let blocked = true;
    await page.route(/\/chunks\/menu-texts-de-[^/]+\.js$/, (route) => (blocked ? route.abort() : route.continue()));
    await page.goto("pages/element-two.html");
    const tickets = page.locator("#tickets");
    await expect(tickets.locator(".pk-root")).toHaveAttribute("lang", "de");
    await tool(tickets, "options");
    const help = tickets.getByTestId("section-help");
    await expect(help).toHaveText("Help");
    // it works: the section folds and opens
    await help.click();
    await expect(help).toHaveAttribute("aria-expanded", "false");
    await help.click();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    blocked = false;
    await tool(tickets, "options");
    await expect(tickets.getByTestId("section-help")).toHaveText("Hilfe");
});

test.describe("two elements on one page", () => {
    test("both render in their own shadow root, with their own language, theme and data", async ({ page }) => {
        await page.goto("pages/element-two.html");
        await expect(page.locator("#sales .pk-root")).toBeVisible();
        await expect(page.locator("#tickets .pk-root")).toBeVisible();
        // a shadow root each, the styles adopted (no <style> element, nothing in the page's head)
        expect(await page.evaluate(() => ["sales", "tickets"].map((id) => document.getElementById(id)).map((el) => (el.shadowRoot.adoptedStyleSheets.length === 1 && !el.shadowRoot.querySelector("style") ? "adopted" : "other")))).toEqual(["adopted", "adopted"]);
        expect(await page.evaluate(() => document.getElementById("sales").shadowRoot.querySelectorAll("style").length)).toBe(0);
        expect(await page.evaluate(() => document.querySelectorAll("head style, head link[rel=stylesheet]").length)).toBe(0);
        await expect(page.locator("#tickets .pk-root")).toHaveAttribute("lang", "de");
        await expect(page.locator('#tickets [data-zone="rows"]')).toHaveAttribute("aria-label", "Zeilen");
        await expect(page.locator("#tickets .pk-root")).toHaveAttribute("data-pk-theme", "dark");
        await expect(page.locator("#tickets")).toHaveAttribute("data-pk-theme", "dark");
        await expect(page.locator("#sales .pk-root")).toHaveAttribute("data-pk-theme", "light");
        await expect(page.locator("#sales .pk-root")).toHaveCSS("height", "720px");
        expect(await zone(page, "#sales", "rows")).toEqual(["Region", "Country"]);
        expect(await zone(page, "#tickets", "rows")).toEqual(["Team"]);
    });

    test("a change in one element is reported by that element only, as a composed event the document hears", async ({ page }) => {
        await page.goto("pages/element-two.html");
        await page.locator("#sales").getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => zone(page, "#sales", "rows")).toEqual(["Region"]);
        expect(await zone(page, "#tickets", "rows")).toEqual(["Team"]);
        const [change] = await events(page, "pivot-view-change");
        expect(change).toMatchObject({ where: "document", target: "sales", bubbles: true, composed: true, path: { element: true, document: true, window: true } });
        expect(change.detail.view.rows).toEqual(["Region"]);
        expect(await events(page, "pivot-view-change")).toHaveLength(1);
        // a click on a value: the rows behind it, from the element that was clicked
        await page.locator('#sales [data-testid="pivot-table"] td.pk-clickable').first().click();
        const [cell] = await events(page, "pivot-cell-click");
        expect(cell.target).toBe("sales");
        expect(cell.detail.count).toBeGreaterThan(0);
        expect(cell.detail.rows).toBe(Math.min(cell.detail.count, 1000));
        await expect(page.locator("#sales").getByTestId("drill-panel")).toBeVisible();
        await expect(page.locator("#tickets").getByTestId("drill-panel")).toHaveCount(0);
    });

    test("controlled: the view changes when the page sets it again, and stays when it does not", async ({ page }) => {
        await page.goto("pages/element-two.html");
        const tickets = page.locator("#tickets");
        await tickets.getByRole("button", { name: "Priority entfernen" }).click();
        await expect.poll(() => tickets.locator('[data-zone="cols"] .pk-chip').count()).toBe(0);
        await page.evaluate(() => (window.__echo = false));
        await tickets.getByRole("button", { name: "Team entfernen" }).click();
        // reported, but not set again by the page: the report keeps showing the page's view
        await expect.poll(async () => (await events(page, "pivot-view-change")).filter((e) => e.target === "tickets").length).toBe(2);
        await expect(tickets.locator('[data-zone="rows"] .pk-chip[data-chip="Team"]')).toHaveCount(1);
        // the page sets a view on its own
        await page.evaluate(() => (document.getElementById("tickets").view = { rows: ["Channel"], values: [{ field: "Ticket", agg: "count" }] }));
        await expect(tickets.locator('[data-zone="rows"] .pk-chip[data-chip="Channel"]')).toHaveCount(1);
    });

    test("templates: save and delete wait for the page's promise; a rejected one shows its message", async ({ page }) => {
        await page.goto("pages/element-two.html");
        const sales = page.locator("#sales");
        await tool(sales, "views");
        await sales.getByTestId("saved-view-name").fill("Mine");
        await sales.getByRole("button", { name: "Save", exact: true }).click();
        await expect(sales.locator(".pk-toasts")).toContainText("View “Mine” saved");
        const [save] = await events(page, "pivot-template-save");
        expect(save.detail.name).toBe("Mine");
        expect(save.detail.view.rows).toEqual(["Region", "Country"]);
        // a save goes to the user's own views
        expect(save.detail.scope).toBe("user");
        // the view shown is "Mine" now: the field saves it under another name, its button says so
        await tool(sales, "views");
        await sales.getByTestId("saved-view-name").fill("fail");
        await sales.getByRole("button", { name: "Save as", exact: true }).click();
        await expect(sales.locator(".pk-toasts")).toContainText("the server said no");
        await tool(sales, "views");
        await sales.getByRole("button", { name: "Delete Mine" }).click();
        await sales.getByTestId("confirm-delete").click();
        await expect(sales.locator(".pk-toasts")).toContainText("View “Mine” deleted");
        await tool(sales, "views");
        await expect(sales.getByTestId("saved-view-Mine")).toHaveCount(0);
        expect((await events(page, "pivot-template-delete"))[0].detail).toEqual({ name: "Mine", scope: "user" });
        // the other element has no save-templates: its Templates menu offers no save
        await page.keyboard.press("Escape");
        const tickets = page.locator("#tickets");
        await tool(tickets, "views");
        await expect(tickets.locator(".pk-popover")).toHaveCount(1);
        await expect(tickets.getByTestId("saved-view-name")).toHaveCount(0);
    });

    test("export: the page sees every file; preventDefault() keeps it from the download", async ({ page }) => {
        await page.goto("pages/element-two.html");
        const sales = page.locator("#sales");
        await sales.getByTestId("export").click();
        const [xlsx] = await Promise.all([page.waitForEvent("download"), sales.getByTestId("export-xlsx").click()]);
        expect(xlsx.suggestedFilename()).toBe("pivot.xlsx");
        let downloads = 0;
        page.on("download", () => downloads++);
        await sales.getByTestId("export").click();
        await sales.getByTestId("export-csv").click();
        await expect.poll(() => page.evaluate(() => window.__kept.length)).toBe(1);
        const kept = await page.evaluate(() => window.__kept[0]);
        expect(kept.name).toBe("pivot.csv");
        expect(kept.text).toMatch(/Grand Total/);
        expect(downloads).toBe(0);
        // the page kept the file: the report does not claim it was exported
        await expect(sales.locator(".pk-toasts")).toContainText("Exported pivot.xlsx");
        await expect(sales.locator(".pk-toasts")).not.toContainText("Exported pivot.csv");
        expect((await events(page, "pivot-export")).map((e) => e.detail.kind)).toEqual(["xlsx", "csv"]);
        // a copy goes through pivot-export too: kept by the page, it never reaches the clipboard
        await page.evaluate(() => {
            window.__clipboard = [];
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => void window.__clipboard.push(t) } });
        });
        await sales.getByTestId("export").click();
        await sales.getByTestId("export-copy-table").click();
        await expect.poll(() => page.evaluate(() => window.__kept.length)).toBe(2);
        const copy = await page.evaluate(() => window.__kept[1]);
        expect(copy.name).toBe("pivot.tsv");
        expect(copy.text).toBe(copy.given);
        expect(copy.text.split("\r\n")[0]).toContain("\t");
        expect(await page.evaluate(() => window.__clipboard.length)).toBe(0);
        await expect(sales.locator(".pk-toasts")).not.toContainText("Table copied");
        expect((await events(page, "pivot-export")).map((e) => e.detail.kind)).toEqual(["xlsx", "csv", "copy-table"]);
    });
});

test.describe("lifecycle", () => {
    test("properties set before the element is defined are taken over when it is", async ({ page }) => {
        await page.goto("pages/element-upgrade.html");
        await expect(page.locator("#early .pk-root")).toBeVisible();
        expect(await page.evaluate(() => [window.__definedBefore, window.__definedAfter])).toEqual([false, true]);
        await expect(page.locator("#early .pk-root")).toHaveAttribute("data-pk-theme", "dark");
        await expect(page.locator("#early .pk-root")).toHaveCSS("height", "720px");
        expect(await zone(page, "#early", "rows")).toEqual(["Channel"]);
        // the setters run: the reflected attributes are there
        await expect(page.locator("#early")).toHaveAttribute("theme", "dark");
        await expect(page.locator("#early")).toHaveAttribute("height", "720");
    });

    test("a start view set after the element is in the page starts the report on it; the same one again changes nothing", async ({ page }) => {
        await page.goto("pages/element-two.html");
        const sales = page.locator("#sales");
        await expect(sales.locator(".pk-root")).toBeVisible();
        const start = { rows: ["Channel"], values: [{ field: "Units", agg: "sum" }] };
        await page.evaluate((v) => (document.getElementById("sales").defaultView = v), start);
        await expect.poll(() => zone(page, "#sales", "rows")).toEqual(["Channel"]);
        await sales.getByRole("button", { name: "Remove Channel" }).click();
        await expect.poll(() => zone(page, "#sales", "rows")).toEqual([]);
        // a new object with the same view: the user's change and the undo history stay
        await page.evaluate((v) => (document.getElementById("sales").defaultView = structuredClone(v)), start);
        await page.waitForTimeout(100);
        expect(await zone(page, "#sales", "rows")).toEqual([]);
        await expect(sales.getByTestId("undo")).toBeEnabled();
        // as a JSON attribute
        await page.evaluate(() => document.getElementById("sales").setAttribute("default-view", '{"rows":["Product"]}'));
        await expect.poll(() => zone(page, "#sales", "rows")).toEqual(["Product"]);
    });

    test("a page that stores every reported view and binds it as the start view does not restart the report", async ({ page }) => {
        await page.goto("pages/element-two.html");
        const sales = page.locator("#sales");
        await expect(sales.locator(".pk-root")).toBeVisible();
        // the pattern of a framework binding: [defaultView]="stored", stored = event.detail.view
        await page.evaluate(() => {
            const el = document.getElementById("sales");
            el.addEventListener("pivot-view-change", (e) => (el.defaultView = e.detail.view));
            window.__root = el.shadowRoot.querySelector(".pk-root");
        });
        await sales.getByRole("button", { name: "Remove Country" }).click();
        await sales.getByRole("button", { name: "Remove Category" }).click();
        await expect.poll(() => zone(page, "#sales", "rows")).toEqual(["Region"]);
        expect(await page.evaluate(() => document.getElementById("sales").shadowRoot.querySelector(".pk-root") === window.__root)).toBe(true);
        await expect(sales.getByTestId("undo")).toBeEnabled();
        await sales.getByTestId("undo").click();
        await expect.poll(() => sales.locator('[data-zone="cols"] .pk-chip').count()).toBe(1);
    });

    // not the shared fixture: the second copy warns on purpose, and the test checks the warnings
    plain("loading the package twice defines once, throws nothing and warns with both versions; define() takes other names", async ({ page }) => {
        const messages = [];
        page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && messages.push(`${m.type()}: ${m.text()}`));
        page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
        await page.goto("pages/element-twice.html");
        await expect(page.locator("my-pivot .pk-root")).toBeVisible();
        expect(await page.evaluate(() => window.__twice)).toEqual({ differentModules: true, sameDefinition: true, again: true, custom: true, customFirst: true });
        const version = JSON.parse(await readFile(new URL("../../packages/pivotkit-element/package.json", import.meta.url), "utf8")).version;
        expect(messages.length).toBeGreaterThan(0);
        for (const m of messages) {
            expect(m).toBe(`warning: <pivot-report> is defined already by pivotkit-element ${version}; pivotkit-element ${version} loaded again is not used for it`);
        }
    });

    test("height=\"100%\" fills an element with a height from the page", async ({ page }) => {
        await page.goto("pages/element-two.html");
        await page.evaluate(() => {
            const el = document.getElementById("sales");
            el.style.height = "700px";
            el.height = "100%";
        });
        await expect(page.locator("#sales .pk-root")).toHaveCSS("height", "700px");
    });

    test("the <style> fallback: without constructable stylesheets the report is styled all the same", async ({ page }) => {
        await page.goto("pages/element-fallback.html");
        const el = page.locator("#plain");
        await expect(el.locator(".pk-root")).toBeVisible();
        expect(await el.evaluate((e) => (e.shadowRoot.adoptedStyleSheets.length ? "adopted" : e.shadowRoot.querySelector("style") ? "style" : "none"))).toBe("style");
        await expect(el.locator(".pk-root")).toHaveCSS("border-top-style", "solid");
        // the tokens still sit on :host: the page themes the element as before
        await page.addStyleTag({ content: "#plain { --pk-accent: rgb(1, 2, 3); }" });
        expect(await token(page, "#plain", "--pk-accent")).toBe("rgb(1, 2, 3)");
    });

    test("a popover opens at its button inside a transformed ancestor", async ({ page }) => {
        // no opening animation: the place is measured once
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto("pages/element-two.html");
        await page.evaluate(() => {
            const wrap = document.createElement("div");
            Object.assign(wrap.style, { transform: "translateZ(0)", marginTop: "160px", marginLeft: "40px" });
            const el = document.getElementById("sales");
            el.before(wrap);
            wrap.append(el);
        });
        const button = page.locator("#sales").getByTestId("export");
        await button.click();
        const menu = page.locator("#sales .pk-popover");
        await expect(menu).toBeVisible();
        const b = await button.boundingBox();
        const m = await menu.boundingBox();
        expect(Math.abs(m.y - (b.y + b.height + 6))).toBeLessThan(3);
        expect(Math.abs(m.x + m.width - (b.x + b.width))).toBeLessThan(3);
    });

    test("disconnect unmounts, reconnect mounts again with the last view; a move keeps the report", async ({ page }) => {
        await page.goto("pages/element-two.html");
        const sales = page.locator("#sales");
        await sales.getByRole("button", { name: "Remove Country" }).click();
        await expect(sales.getByTestId("undo")).toBeEnabled();
        // a move in one task: the same report, the undo history kept
        const same = await page.evaluate(() => {
            const el = document.getElementById("sales");
            const before = el.shadowRoot.querySelector(".pk-root");
            document.body.append(el);
            return new Promise((resolve) => setTimeout(() => resolve(el.shadowRoot.querySelector(".pk-root") === before), 50));
        });
        expect(same).toBe(true);
        await expect(sales.getByTestId("undo")).toBeEnabled();
        // removed: the React root is unmounted, nothing of the report is left in the shadow root
        await page.evaluate(() => {
            window.__sales = document.getElementById("sales");
            window.__sales.remove();
        });
        await expect.poll(() => page.evaluate(() => window.__sales.shadowRoot.childElementCount)).toBe(0);
        // a property set while disconnected is used when it comes back
        await page.evaluate(() => {
            window.__sales.locale = "de-DE";
            document.body.prepend(window.__sales);
        });
        await expect(sales.locator(".pk-root")).toHaveAttribute("lang", "de");
        expect(await zone(page, "#sales", "rows")).toEqual(["Region"]);
        // a new mount starts a new history
        await expect(sales.getByTestId("undo")).toBeDisabled();
    });

    test("mounting and unmounting leaves no listener on the document or the window and no observer", async ({ page }) => {
        await page.goto("pages/element-leaks.html");
        await page.waitForFunction(() => customElements.get("pivot-report"));
        const baseline = await page.evaluate(() => window.__live());
        const cycle = async () => {
            await page.evaluate(() => {
                const el = document.createElement("pivot-report");
                el.data = [{ Team: "A", Hours: 2 }, { Team: "B", Hours: 3 }];
                el.defaultView = { rows: ["Team"], values: [{ field: "Hours", agg: "sum" }] };
                document.body.append(el);
            });
            // open and close a popover, and the drill-down: both listen on the document while open
            await page.locator("pivot-report").getByTestId("export").click();
            await expect(page.locator("pivot-report").getByTestId("export-xlsx")).toBeVisible();
            await page.keyboard.press("Escape");
            await page.locator('pivot-report [data-testid="pivot-table"] td.pk-clickable').first().click();
            await expect(page.locator("pivot-report").getByTestId("drill-panel")).toBeVisible();
            const open = await page.evaluate(() => window.__live());
            await page.evaluate(() => document.querySelector("pivot-report").remove());
            await page.waitForTimeout(100);
            return { open, closed: await page.evaluate(() => window.__live()) };
        };
        const first = await cycle();
        // the counter sees what the report adds while it is open
        expect(first.open.observers).toBeGreaterThan(baseline.observers);
        expect(first.open.listeners.length).toBeGreaterThan(baseline.listeners.length);
        const third = (await cycle(), await cycle());
        expect(first.closed.observers).toBe(baseline.observers);
        expect(third.closed).toEqual(first.closed);
        // React listens for selectionchange on the document once per document, for every root after it
        expect(first.closed.listeners.filter((l) => !baseline.listeners.includes(l)).every((l) => l === "document:selectionchange")).toBe(true);
    });
});

test.describe("theme and styles", () => {
    test("the theme attribute, data-theme above the element, and --pk-* tokens the page sets on it", async ({ page }) => {
        await page.goto("pages/element-two.html");
        const root = page.locator("#sales .pk-root");
        await expect(root).toHaveAttribute("data-pk-theme", "light");
        const lightSurface = await token(page, "#sales", "--pk-surface");
        await page.evaluate(() => document.getElementById("sales").setAttribute("theme", "dark"));
        await expect(root).toHaveAttribute("data-pk-theme", "dark");
        await expect(page.locator("#sales")).toHaveAttribute("data-pk-theme", "dark");
        const darkSurface = await token(page, "#sales", "--pk-surface");
        expect(darkSurface).not.toBe(lightSurface);
        // auto: the page's <html data-theme>
        await page.evaluate(() => {
            document.getElementById("sales").theme = "auto";
            document.documentElement.dataset.theme = "dark";
        });
        await expect(root).toHaveAttribute("data-pk-theme", "dark");
        await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
        await expect(root).toHaveAttribute("data-pk-theme", "light");
        await expect(page.locator("#sales")).toHaveAttribute("theme", "auto");
        // the page themes the element through its custom properties, per theme too; a token set
        // higher up (body) does not reach the report
        await page.addStyleTag({ content: "#sales { --pk-accent: rgb(1, 2, 3); } #sales[data-pk-theme='dark'] { --pk-surface: rgb(4, 5, 6); } body { --pk-text: rgb(7, 8, 9); --pk-font: 'Leaked Font', monospace; }" });
        expect(await token(page, "#sales", "--pk-accent")).toBe("rgb(1, 2, 3)");
        // and a primary button of the report draws with it
        const primary = await page.locator("#sales .pk-root").evaluate((root) => {
            const b = document.createElement("button");
            b.className = "pk-btn pk-primary";
            root.append(b);
            const color = getComputedStyle(b).backgroundColor;
            b.remove();
            return color;
        });
        expect(primary).toBe("rgb(1, 2, 3)");
        expect(await token(page, "#sales", "--pk-text")).not.toBe("rgb(7, 8, 9)");
        expect(await page.locator("#sales .pk-root").evaluate((el) => getComputedStyle(el).fontFamily)).not.toContain("Leaked Font");
        expect(await token(page, "#sales", "--pk-surface")).toBe(lightSurface);
        await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
        await expect(root).toHaveCSS("background-color", "rgb(4, 5, 6)");
    });

    test("no CSS of the page reaches into the report, and none of the report's reaches out", async ({ page }) => {
        await page.goto("pages/element-two.html");
        await expect(page.locator("#sales .pk-root")).toBeVisible();
        const undo = page.locator("#sales").getByTestId("undo");
        const before = await undo.evaluate((el) => getComputedStyle(el).backgroundColor);
        await page.addStyleTag({ content: "button, .pk-btn { background-color: rgb(255, 0, 0) !important; } .pk-root { display: none !important; }" });
        await expect(undo).toHaveCSS("background-color", before);
        await expect(page.locator("#sales .pk-root")).toBeVisible();
        // a page element with the report's class names keeps the browser's styles
        const outside = await page.evaluate(() => {
            const b = document.createElement("button");
            b.className = "pk-btn";
            document.body.append(b);
            const d = document.createElement("div");
            d.className = "pk-root";
            document.body.append(d);
            return { radius: getComputedStyle(b).borderTopLeftRadius, border: getComputedStyle(d).borderTopStyle };
        });
        expect(outside.border).toBe("none");
        expect(outside.radius).not.toBe("7px");
    });
});

test.describe("a page with a React of its own", () => {
    test("the page's React and the element's React 18.3.1 run side by side (React 19: props and on<event> props)", async ({ page }) => {
        await page.goto("pages/element-react.html");
        await expect(page.locator("pivot-report .pk-root")).toBeVisible();
        expect(await page.evaluate(() => window.__pivotkitReact)).toMatch(wanted);
        // the element leaves no React global behind
        expect(await page.evaluate(() => typeof window.React)).toBe("undefined");
        // React 19 set the data as a property, not as an attribute "[object Object],..."
        expect(await page.locator("pivot-report").evaluate((el) => [el.hasAttribute("data"), Array.isArray(el.data)])).toEqual([false, true]);
        const renders = Number(await page.getByTestId("host-renders").textContent());
        await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(renders + 3);
        // the host's re-renders do not touch the shadow root: a change stays, and its event reaches the page's React
        await page.locator("pivot-report").getByRole("button", { name: "Remove Country" }).click();
        await expect(page.getByTestId("host-changes")).toHaveText("1");
        await expect.poll(async () => Number(await page.getByTestId("host-renders").textContent())).toBeGreaterThan(renders + 6);
        expect(await zone(page, "pivot-report", "rows")).toEqual(["Region"]);
        await page.locator("pivot-report").getByTestId("undo").click();
        expect(await zone(page, "pivot-report", "rows")).toEqual(["Region", "Country"]);
        await page.getByTestId("host-button").click();
        await expect(page.getByTestId("host-changes")).toHaveText("102");
        // drag and drop inside the element
        await page.locator("pivot-report").getByTestId("show-chart").click();
        await expect(page.locator('pivot-report [data-testid="pivot-chart"] canvas')).toBeVisible();
    });
});

test.describe("keyboard and focus inside the shadow root", () => {
    test("Tab enters the report, a menu opens and closes from the keyboard, the focus comes back", async ({ page }) => {
        await page.goto("pages/element-two.html");
        await expect(page.locator("#sales .pk-root")).toBeVisible();
        await page.locator("#before").focus();
        await page.keyboard.press("Tab");
        const inside = await page.evaluate(() => {
            const host = document.activeElement;
            const el = host.shadowRoot?.activeElement;
            return { host: host.id, inside: Boolean(el && el.closest(".pk-root")) };
        });
        expect(inside).toEqual({ host: "sales", inside: true });
        const exportButton = page.locator("#sales").getByTestId("export");
        await exportButton.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#sales").getByTestId("export-xlsx")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.locator("#sales").getByTestId("export-csv")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator("#sales .pk-popover")).toHaveCount(0);
        await expect(exportButton).toBeFocused();
        // the table's values move with the arrow keys and open with Enter
        const first = page.locator('#sales [data-testid="pivot-table"] td.pk-clickable').first();
        await first.focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator('#sales [data-testid="pivot-table"] td.pk-clickable').nth(1)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("#sales").getByTestId("drill-panel").getByRole("button", { name: "Close" })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator('#sales [data-testid="pivot-table"] td.pk-clickable').nth(1)).toBeFocused();
        // undo from the keyboard, inside the shadow root
        await page.locator("#sales").getByRole("button", { name: "Remove Country" }).click();
        await page.locator("#sales .pk-status").click();
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(() => zone(page, "#sales", "rows")).toEqual(["Region", "Country"]);
    });
});

// Not the shared fixture: this test provokes one violation on purpose, to show that the policy is
// enforced, and checks the console itself.
plain("a strict Content-Security-Policy: styles, chart and export work without 'unsafe-inline' or 'unsafe-eval'", async ({ page }) => {
    const problems = [];
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
    page.on("pageerror", (e) => problems.push(e.message));
    await page.goto("pages/element-csp.html");
    const el = page.locator("#strict");
    await expect(el.locator(".pk-root")).toBeVisible();
    expect(await page.locator("#strict").evaluate((el) => (el.shadowRoot.adoptedStyleSheets.length === 1 && !el.shadowRoot.querySelector("style") ? "adopted" : "other"))).toBe("adopted");
    // styled: the stylesheet applies
    await expect(el.locator(".pk-root")).toHaveCSS("border-top-style", "solid");
    // ECharts from its chunk, drawn on a canvas
    await el.getByTestId("show-chart").click();
    const chart = el.getByTestId("pivot-chart");
    const canvas = chart.locator("canvas").first();
    await expect(canvas).toBeVisible();
    // the tooltip: hovering the plot shows it (the axis tooltip of the bar chart) without an inline
    // style attribute, which style-src 'self' would refuse (style-src-attr)
    const before = await chart.textContent();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 + 4);
    await expect.poll(() => chart.textContent()).not.toBe(before);
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
    await el.getByTestId("export").click();
    await expect(el.getByTestId("export-png")).toBeEnabled();
    const [png] = await Promise.all([page.waitForEvent("download"), el.getByTestId("export-png").click()]);
    expect((await readFile(await png.path())).subarray(1, 4).toString()).toBe("PNG");
    await el.getByTestId("show-table").click();
    await el.getByTestId("export").click();
    const [xlsx] = await Promise.all([page.waitForEvent("download"), el.getByTestId("export-xlsx").click()]);
    expect(xlsx.suggestedFilename()).toBe("pivot.xlsx");
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
    expect(problems).toEqual([]);
    // the policy is in force: an inline <style> is refused (the element's fallback for browsers
    // without constructable stylesheets would need 'unsafe-inline')
    await page.evaluate(() => {
        const s = document.createElement("style");
        s.textContent = "body { outline: 1px solid; }";
        document.head.append(s);
    });
    await expect.poll(() => page.evaluate(() => window.__violations.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => getComputedStyle(document.body).outlineStyle)).toBe("none");
});

test("the element example renders, and its theme switch themes the report", async ({ page }) => {
    await page.goto("examples/element/index.html");
    const root = page.locator("pivot-report .pk-root");
    await expect(root).toBeVisible();
    expect(await zone(page, "pivot-report", "rows")).toEqual(["Region", "Country"]);
    await page.locator("#theme").selectOption("dark");
    await expect(root).toHaveAttribute("data-pk-theme", "dark");
    await page.locator("pivot-report").getByRole("button", { name: "Remove Country" }).click();
    await expect(page.locator("#last-event")).toHaveText("View: rows Region; 1 value(s).");
    // the chart template groups the dates by month: the categories read "Jan 2025", not "Jan 1, 2025"
    await tool(page.locator("pivot-report"), "views");
    await page.locator("pivot-report").getByTestId("saved-view-Units per month (chart)").click();
    const summary = page.locator('pivot-report [data-testid="chart-summary"]');
    await expect(summary).toContainText(/\b[A-Z][a-z]{2} 202[56]\b/);
    await expect(summary).not.toContainText(/[A-Z][a-z]{2} \d{1,2}, 202/);
});
