// Loading files in the browser tests: a file as the page gets it, a drop of files onto the report,
// the Data menu and its file chooser, the field list's names. Shared by the specs that load data.
import { expect } from "./fixtures.js";

/** A file for the page: its name, type and content (text, or bytes as base64). */
export const fileOf = (name, type, content) => ({ name, type, ...(typeof content === "string" ? { text: content } : { base64: Buffer.from(content).toString("base64") }) });

/**
 * Drags files over the report and drops them, as a browser does with files from the desktop:
 * dragenter, dragover (the overlay shows), then drop, all with one DataTransfer holding the files.
 * `drop: false` drags them out again instead.
 */
export async function dropFiles(page, target, files, { drop = true, expectOverlay = true } = {}) {
    const dt = await page.evaluateHandle((list) => {
        const t = new DataTransfer();
        for (const f of list) {
            const content = f.text ?? Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
            t.items.add(new File([content], f.name, { type: f.type }));
        }
        return t;
    }, files);
    const box = await target.boundingBox();
    const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    await target.dispatchEvent("dragenter", { dataTransfer: dt, ...at });
    await target.dispatchEvent("dragover", { dataTransfer: dt, ...at });
    if (expectOverlay) {
        await expect(page.getByTestId("drop-overlay")).toBeVisible();
    }
    await target.dispatchEvent(drop ? "drop" : "dragleave", { dataTransfer: dt, ...at });
    await expect(page.getByTestId("drop-overlay")).toHaveCount(0);
}

/** The field names of the field list. */
export const fieldNames = (scope) => scope.locator(".pk-field-list [data-field]").evaluateAll((els) => els.map((e) => e.getAttribute("data-field")));

/** Opens the Data menu: its own button, or its entry in "More". */
export async function dataMenu(scope) {
    const own = scope.getByTestId("data");
    if (await own.count()) {
        await own.click();
    } else {
        await scope.getByTestId("more").click();
        await scope.getByTestId("more-data").click();
    }
    await expect(scope.getByTestId("data-menu")).toBeVisible();
}

/** Picks a file through the Data menu's "Load data…" and the browser's file chooser. */
export async function pickThroughMenu(page, scope, file) {
    await dataMenu(scope);
    const chooser = page.waitForEvent("filechooser");
    await scope.getByTestId("load-file").click();
    await (await chooser).setFiles({ name: file.name, mimeType: file.type, buffer: file.base64 ? Buffer.from(file.base64, "base64") : Buffer.from(file.text) });
}

