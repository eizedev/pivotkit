// What pivotkit-element loads after its first load (#546): the German first-load texts before the first
// render of a German report, the tips' table after the first render, the rules only the menus match
// with the menus. Each spec holds the chunk back (page.route) to see the report while it waits.
import { test as plain } from "@playwright/test";
import { expect, test } from "./fixtures.js";

/** Holds back the requests whose path matches `pattern` until release() is called; `requests` counts them. */
async function holdBack(page, pattern) {
    let release;
    const released = new Promise((resolve) => {
        release = resolve;
    });
    const held = { requests: 0, release: () => release() };
    await page.route(pattern, async (route) => {
        held.requests++;
        await released;
        await route.continue();
    });
    return held;
}

/**
 * Records the words of every shadow root on the page, after each change: its text and the names of
 * its elements (aria-label, title). window.__words holds a list per element id.
 */
const recordWords = () => {
    window.__words = {};
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
        const root = attach.call(this, init);
        const host = this;
        const take = () => {
            const names = [...root.querySelectorAll("[aria-label], [title]")].map((el) => `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`);
            (window.__words[host.id] ??= []).push(`${root.textContent} ${names.join(" ")}`);
        };
        new MutationObserver(take).observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
        return root;
    };
};

/** Words only the English first-load texts have. */
const ENGLISH = /\b(Rows|Columns|Values|Pivot report|Fields|Loading)\b/;

test("a German report waits for its texts: no English word before them, then German; an English one never loads them", async ({ page }) => {
    await page.addInitScript(recordWords);
    const german = await holdBack(page, /\/chunks\/labels-de-[^/]+\.js$/);
    await page.goto("pages/element-two.html");
    const sales = page.locator("#sales");
    const tickets = page.locator("#tickets");
    // the English report renders at once; the German one waits, with its skeleton and no word
    await expect(sales.getByRole("region", { name: "Pivot report" })).toBeVisible();
    await expect.poll(() => german.requests).toBe(1);
    await expect(tickets.getByTestId("skeleton")).toBeVisible();
    await expect(tickets.getByTestId("skeleton")).toHaveText("");
    await expect(tickets.locator(".pk-root")).not.toHaveAttribute("lang", /./);
    german.release();
    await expect(tickets.getByRole("region", { name: "Pivot-Bericht" })).toBeVisible();
    await expect(tickets.locator('[aria-label="Zeilen"]')).toBeVisible();
    const words = await page.evaluate(() => window.__words.tickets);
    expect(words.length).toBeGreaterThan(1);
    expect(words.filter((w) => ENGLISH.test(w))).toEqual([]);
    // the German texts were requested once, for both German parts of the page
    expect(german.requests).toBe(1);
});

test("a report that changes its language keeps the old texts until the new ones are here, never a mix", async ({ page }) => {
    await page.addInitScript(recordWords);
    const german = await holdBack(page, /\/chunks\/labels-de-[^/]+\.js$/);
    await page.goto("pages/element-views.html");
    const host = page.locator("#views");
    await expect(host.locator(".pk-root")).toHaveAttribute("lang", "en");
    expect(german.requests).toBe(0);
    await page.evaluate(() => {
        window.__words.views = [];
        document.getElementById("views").locale = "de-DE";
    });
    await expect.poll(() => german.requests).toBe(1);
    // waiting: the report stays as it was, in English, with its table
    await expect(host.locator(".pk-root")).toHaveAttribute("lang", "en");
    await expect(host.locator('[aria-label="Rows"]')).toBeVisible();
    await expect(host.getByTestId("skeleton")).toHaveCount(0);
    german.release();
    await expect(host.locator(".pk-root")).toHaveAttribute("lang", "de");
    await expect(host.locator('[aria-label="Zeilen"]')).toBeVisible();
    // every state in between was one language: English words without German ones, or German alone
    const words = await page.evaluate(() => window.__words.views);
    expect(words.filter((w) => ENGLISH.test(w) && /\b(Zeilen|Spalten|Pivot-Bericht)\b/.test(w))).toEqual([]);
});

plain("when the German texts cannot load, the German report shows in English and says so once", async ({ page }) => {
    const warnings = [];
    page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
    await page.route(/\/chunks\/labels-de-[^/]+\.js$/, (route) => route.abort());
    await page.goto("pages/element-two.html");
    const tickets = page.locator("#tickets");
    await expect(tickets.getByRole("region", { name: "Pivot report" })).toBeVisible();
    await expect(tickets.locator('[aria-label="Rows"]')).toBeVisible();
    // the report says which language its texts are in
    await expect(tickets.locator(".pk-root")).toHaveAttribute("lang", "en");
    expect(warnings.filter((w) => /the de texts did not load, English stands in/.test(w))).toHaveLength(1);
});

plain("German texts that do not arrive within 4 seconds: the report shows in English, then takes them when they come", async ({ page }) => {
    const german = await holdBack(page, /\/chunks\/labels-de-[^/]+\.js$/);
    await page.goto("pages/element-two.html");
    const tickets = page.locator("#tickets");
    await expect.poll(() => german.requests).toBe(1);
    await expect(tickets.getByTestId("skeleton")).toHaveText("");
    // wall time: the report's own time limit for the texts
    await expect(tickets.getByRole("region", { name: "Pivot report" })).toBeVisible({ timeout: 8000 });
    german.release();
    await expect(tickets.getByRole("region", { name: "Pivot-Bericht" })).toBeVisible();
});

test("the tips show once their table is here; a choice the user makes before keeps the dismissed tips", async ({ page }) => {
    // tip "cells" was dismissed before
    await page.addInitScript(() => localStorage.setItem("pivotkit:tips:fields-a", '["cells"]'));
    const tips = await holdBack(page, /\/chunks\/tips-[^/]+\.js$/);
    await page.goto("pages/element-fields.html");
    const a = page.locator("#a");
    const b = page.locator("#b");
    await expect(a.locator(".pk-table")).toBeVisible();
    await expect.poll(() => tips.requests).toBe(1);
    await expect(b.getByTestId("tip-cells")).toHaveCount(0);
    // the user folds #a's field list while the table loads: the list keeps "cells"
    await a.getByTestId("collapse-fields").click();
    await expect(a.getByTestId("field-rail")).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pivotkit:tips:fields-a")).sort())).toEqual(["-fields", "cells"]);
    tips.release();
    await expect(b.getByTestId("tip-cells")).toBeVisible();
    await expect(a.getByTestId("tip-cells")).toHaveCount(0);
    expect(tips.requests).toBe(1);
});

/** The computed styles of every element in a shadow root, by element: kept on the page as window.__styles[key]. */
const keepStyles = (host, key) =>
    host.evaluate(async (el, k) => {
        // the chips' entry animation, not the rules, would change them meanwhile
        await Promise.all(el.shadowRoot.getAnimations().map((a) => a.finished));
        const map = new Map();
        for (const node of el.shadowRoot.querySelectorAll("*")) {
            const s = getComputedStyle(node);
            map.set(node, [...s].map((p) => `${p}:${s.getPropertyValue(p)}`).join(";"));
        }
        (window.__styles ??= {})[k] = map;
    }, key);

test("the menus' rules arrive with the menus and change nothing the first render drew; an open menu has them", async ({ page }) => {
    const menus = await holdBack(page, /\/chunks\/menus-[^/]+\.js$/);
    const tips = await holdBack(page, /\/chunks\/tips-[^/]+\.js$/);
    await page.goto("pages/element-fields.html");
    const host = page.locator("#a");
    await expect(host.locator(".pk-table")).toBeVisible();
    await expect.poll(() => menus.requests).toBeGreaterThan(0);
    const rules = () => host.evaluate((el) => [...el.shadowRoot.adoptedStyleSheets[0].cssRules].some((r) => r.cssText.startsWith(".pk-level-menu ")));
    expect(await rules()).toBe(false);
    await keepStyles(host, "before");
    menus.release();
    await expect.poll(rules).toBe(true);
    await keepStyles(host, "after");
    const changed = await page.evaluate(() => {
        const { before, after } = window.__styles;
        return [...before]
            .filter(([node, css]) => after.has(node) && after.get(node) !== css)
            .map(([node, css]) => {
                const now = after.get(node).split(";");
                return `${node.className}: ${css.split(";").filter((d, i) => d !== now[i]).join("; ")}`;
            });
    });
    expect(changed).toEqual([]);
    tips.release();
    // a chip menu in levels uses the menus' rules
    await host.locator('[data-testid^="chip-menu-"]').first().click();
    await expect(host.locator(".pk-level-menu").first()).toHaveCSS("display", "flex");
});

test("the <style> fallback gets the menus' rules too", async ({ page }) => {
    await page.goto("pages/element-fallback.html");
    const el = page.locator("#plain");
    await expect(el.locator(".pk-root")).toBeVisible();
    // the menus load right after the first render; their rules join the one <style> element
    await expect.poll(() => el.evaluate((e) => [...e.shadowRoot.querySelectorAll("style")].map((s) => s.textContent.includes(".pk-level-menu{")))).toEqual([true]);
});
