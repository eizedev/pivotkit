// The server's own download links in a real browser: a one-time link's page, its Download button
// clicked with the mouse (the browser's own Origin and fetch metadata under the page's
// Referrer-Policy: no-referrer), the file saved once, and the link used for any other browser.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "pivotkit-server";
import { expect, test } from "@playwright/test";

const SALES = "Region,Customer,Sales\nNorth,Alice Example,10\nSouth,Bob Example,20\n";

/** A pivotkit-server on loopback whose closed source gets one-time links. */
async function onceServer() {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "pivotkit-dl-")));
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "sales.csv"), SALES);
    const server = await serve({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out", downloads: { bind: "once" } }, policy: { results: true }, http: { port: 0, enable: ["rest"] }, log: "off", baseDir: dir }, { env: {}, stderr: { write() {} } });
    const r = await fetch(`${server.url}/api/v1/views/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "sales", view: { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }, format: "csv", name: "Sales once" }) });
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
        const [download] = await Promise.all([page.waitForEvent("download"), page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)]);
        expect(download.suggestedFilename()).toBe("Sales once.csv");
        expect(readFileSync(await download.path())).toEqual(readFileSync(join(dir, "out", output.name)));
        // another browser (no cookie of the first download) finds the link used
        const other = await browser.newContext();
        try {
            const second = await other.newPage();
            await second.goto(output.url);
            await second.getByRole("button", { name: "Download" }).click();
            await expect(second.getByText("This link was already used. Ask the assistant to make the report again.")).toBeVisible();
        } finally {
            await other.close();
        }
    } finally {
        await server.close();
    }
});
