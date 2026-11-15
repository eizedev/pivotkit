// The server's own download links in a real browser: a one-time link's page, its Download button
// clicked with the mouse (the browser's own Origin and fetch metadata under the page's
// Referrer-Policy: same-origin), the page's word that the download started and how long it can be
// repeated, the file saved once, and the link used for any other browser at once. Then the pages as
// people read them, light and dark, wide and at 390 px: every text's contrast 4.5:1 or more as the
// engine draws it, a visible focus ring on the button, nothing wider than the window.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "pivotkit-server";
import { expect, test } from "@playwright/test";
import { measure } from "./report-contrast.js";

const SALES = "Region,Customer,Sales\nNorth,Alice Example,10\nSouth,Bob Example,20\n";

/** A pivotkit-server on loopback whose closed source gets one-time links (a report named `name`). */
async function onceServer(name = "Sales once") {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "pivotkit-dl-")));
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "sales.csv"), SALES);
    const server = await serve({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", downloads: { bind: "once" } }, policy: { results: true }, http: { port: 0, enable: ["rest"] }, log: "off", baseDir: dir }, { env: {}, stderr: { write() {} } });
    const r = await fetch(`${server.url}/api/v1/views/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "sales", view: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }, format: "csv", name }) });
    const { output } = await r.json();
    return { dir, server, output };
}

test("a one-time link: the page's Download button saves the file once; the link is used for another browser", async ({ page, browser }) => {
    const { dir, server, output } = await onceServer();
    try {
        expect(output.bound).toBe("once");
        await page.goto(output.url);
        await expect(page.getByRole("heading", { name: "Download the report" })).toBeVisible();
        const button = page.getByRole("button", { name: "Download" });
        const box = await button.boundingBox();
        if (!box) {
            throw new Error("no button");
        }
        // the POST's answer is the file as an attachment. Chromium, Firefox and WebKit on macOS save it
        // (a download); Playwright's WebKit on Linux shows a text attachment in the page instead, so
        // there the answer's headers and the text shown are checked
        const stored = readFileSync(join(dir, "out", output.name));
        const posted = page.waitForResponse((r) => r.request().method() === "POST");
        const downloading = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        const answer = await posted;
        expect(answer.status()).toBe(200);
        expect(answer.headers()["content-disposition"]).toBe(`attachment; filename="Sales once.csv"; filename*=UTF-8''Sales%20once.csv`);
        const download = await downloading;
        if (download) {
            await expect(page.getByRole("status")).toHaveText("The download has started: look in your browser's downloads.");
            await expect(page.getByText("If the download did not arrive, press Download again within 2 minutes, in this browser; after that the link is used.")).toBeVisible();
            expect(download.suggestedFilename()).toBe("Sales once.csv");
            expect(readFileSync(await download.path())).toEqual(stored);
        } else {
            // the text the page shows (its body is not kept for such an answer): the file without its byte order mark
            const shown = await page.locator("pre").textContent();
            expect(String(shown).replace(/\r\n/g, "\n")).toBe(stored.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"));
        }
        // another browser (no cookie of the first download) finds the link used as soon as it opens it
        const other = await browser.newContext();
        try {
            const second = await other.newPage();
            const opened = await second.goto(output.url);
            expect(opened?.status()).toBe(409);
            await expect(second).toHaveTitle("Link already used - pivotkit report");
            await expect(second.getByRole("heading", { name: "Link already used" })).toBeVisible();
            await expect(second.getByText("This link was already used. Ask whoever made the report to make it again.")).toBeVisible();
            await expect(second.getByRole("button")).toHaveCount(0);
        } finally {
            await other.close();
        }
        // the browser that took it may repeat it, and the page says until when
        if (download) {
            await page.goto(output.url);
            await expect(page.getByText(/You downloaded it in this browser a moment ago and can download it again until/)).toBeVisible();
            await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
        }
    } finally {
        await server.close();
    }
});

/** A name without spaces, longer than a phone's width. */
const LONG_NAME = "Quarterly_sales_by_region_customer_and_product_segment_2026";

test("the pages, light and dark, wide and at 390 px: details of the file, contrast 4.5:1 for every text, a visible focus ring, no sideways scrolling", async ({ browser, browserName }) => {
    const { server, output } = await onceServer(LONG_NAME);
    try {
        const base = new URL(output.url).origin;
        const pages = {
            once: output.url,
            notFound: `${base}/downloads/not-a-link`,
            callback: `${base}/downloads/callback?error=access_denied&state=${"A".repeat(22)}`
        };
        for (const colorScheme of /** @type {const} */ (["light", "dark"])) {
            for (const width of [1280, 390]) {
                const context = await browser.newContext({ colorScheme, viewport: { width, height: 844 } });
                try {
                    const page = await context.newPage();
                    for (const [name, url] of Object.entries(pages)) {
                        await page.goto(url);
                        const where = `${name}, ${colorScheme}, ${width} px`;
                        const drawn = await page.evaluate(measure);
                        // the scheme's own surface is what is measured against
                        expect(drawn.body, where).toBe(colorScheme === "dark" ? "rgb(13, 17, 23)" : "rgb(255, 255, 255)");
                        for (const t of drawn.texts) {
                            expect(t.ratio, `${where}: "${t.text}"`).toBeGreaterThanOrEqual(4.5);
                        }
                        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where}: no sideways scrolling`).toBe(true);
                    }
                    // the once page: the file, its kind and size, the expiry in the browser's own zone
                    await page.goto(pages.once);
                    await expect(page).toHaveTitle("Download the report - pivotkit report");
                    await expect(page.getByText(`${LONG_NAME}.csv`)).toBeVisible();
                    await expect(page.getByText(/^CSV file, \d+ bytes\. It can be downloaded once, until .+\.$/)).toBeVisible();
                    const shown = await page.locator("time").evaluate((t) => ({ text: t.textContent, at: t.getAttribute("datetime") }));
                    expect(shown.text).not.toContain("UTC");
                    expect(Date.parse(String(shown.at))).toBe(Date.parse(String(output.expiresAt)));
                    // the button reached by the keyboard shows its ring: the accent, 3:1 or more on the page
                    // (in WebKit focused after a key, since Safari's Tab skips buttons unless the user turns that on)
                    const button = page.getByRole("button", { name: "Download" });
                    if (browserName === "webkit") {
                        await page.keyboard.press("End");
                        await button.focus();
                    } else {
                        for (let i = 0; i < 5 && !(await button.evaluate((b) => b === document.activeElement)); i++) {
                            await page.keyboard.press("Tab");
                        }
                    }
                    const ring = await button.evaluate((b) => {
                        const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3).map((v) => (c.startsWith("color(") ? v * 255 : v));
                        const lum = (rgb) => rgb.map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
                        const style = getComputedStyle(b);
                        const [x, y] = [lum(parse(style.outlineColor)), lum(parse(getComputedStyle(document.body).backgroundColor))].sort((p, q) => q - p);
                        return { visible: b.matches(":focus-visible"), style: style.outlineStyle, width: parseFloat(style.outlineWidth), ratio: (x + 0.05) / (y + 0.05) };
                    });
                    expect(ring.visible, `${colorScheme} ${width}: focus by keyboard`).toBe(true);
                    expect(ring.style).toBe("solid");
                    expect(ring.width).toBeGreaterThanOrEqual(2);
                    expect(ring.ratio).toBeGreaterThanOrEqual(3);
                } finally {
                    await context.close();
                }
            }
        }
    } finally {
        await server.close();
    }
});
