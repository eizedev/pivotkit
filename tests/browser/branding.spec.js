// The operator's branding in a real browser: the MCP page under the operator's name with its icon as
// favicon (its Content-Security-Policy lets the data: icon through, so no engine logs a refusal), no
// documentation links with branding.docsUrl null, and the download pages under the operator's name.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "pivotkit-server";
import { expect, test } from "./fixtures.js";
import { removeTempDirs, tempDir } from "../temp-dir.js";

// the servers' directories go when the file's tests are done
test.afterAll(removeTempDirs);

// the 404 of a download link nobody has is the answer this test asks for, not a fault of the page
test.use({ ignoreConsole: [/^Failed to load resource: the server responded with a status of 404/] });

/** A 1x1 PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** REST and MCP on loopback under the name "Team Reports", with an icon and no documentation links. */
async function brandedServer() {
    const dir = tempDir("brand");
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "sales.csv"), "Region,Sales\nNorth,10\nSouth,20\n");
    writeFileSync(join(dir, "icon.png"), PNG);
    return serve({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, branding: { name: "Team Reports", docsUrl: null, icon: "icon.png" }, http: { port: 0, enable: ["rest", "mcp"] }, log: "off", baseDir: dir }, { env: {}, stderr: { write() {} } });
}

test("the MCP page and the download pages carry the operator's name and icon, and no documentation links", async ({ page }) => {
    const server = await brandedServer();
    try {
        const answer = await page.goto(`${server.url}/`);
        expect(answer?.headers()["content-security-policy"]).toContain("img-src data:");
        await expect(page).toHaveTitle("Team Reports MCP server");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Team Reports MCP server");
        await expect(page.getByRole("heading", { name: "Documentation" })).toHaveCount(0);
        await expect(page.locator("a[href]")).toHaveCount(0);
        // the favicon is the operator's icon, which the page's policy allows: the image decodes
        const decoded = await page.evaluate(async () => {
            const link = /** @type {HTMLLinkElement | null} */ (document.querySelector('link[rel="icon"]'));
            if (!link) return "no icon link";
            const img = new Image();
            img.src = link.href;
            try {
                await img.decode();
                return `${img.naturalWidth}x${img.naturalHeight}`;
            } catch (e) {
                return `refused: ${String(e)}`;
            }
        });
        expect(decoded).toBe("1x1");
        // a download link nobody has: the page in the operator's name
        await page.goto(`${server.url}/downloads/no-such-link`);
        await expect(page).toHaveTitle(/ - Team Reports report$/);
        await expect(page.getByText("Team Reports report", { exact: true })).toBeVisible();
        expect(await page.locator('link[rel="icon"]').getAttribute("href")).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
    } finally {
        await server.close();
    }
});
