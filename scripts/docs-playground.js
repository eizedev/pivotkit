// The built playground as the docs generators open it: docs-screenshots.js takes pictures of it,
// docs-clips.js records videos of it. Both start its server, open a page at a view and wait until the
// report has its data, in the same way, so a picture and a clip of the same view look alike.
import { toViewFile } from "pivotkit-core";
import { encodeViewLink as encodeLink } from "pivotkit-core/link";
import { startPlayground as startServer } from "../tests/playground-server.js";

/** A view as the playground's links carry it: the link profile of a view file. */
export const encodeViewLink = (view) => encodeLink(toViewFile(view, {}, { link: true }));

/** Hides a note at the bottom of the report: a status toast differs with every step and covers the result. */
export const hideToasts = (page) => page.addStyleTag({ content: ".pk-toast { visibility: hidden; }" });

/**
 * Starts the playground's server on `PLAYGROUND_PORT` (default `port`) and waits until it listens.
 * Fails when the port is taken, rather than take pictures of another server. Call `stop()` when done.
 * @param {number} port
 */
export async function startPlayground(port) {
    const { base, child } = await startServer({ port: Number(process.env.PLAYGROUND_PORT ?? port) });
    return { base, stop: () => child.kill() };
}

/**
 * Opens the playground at a view and waits until the report has its data.
 * The report as a host gets it by default: without the Data button (allowImport), which the playground
 * shows unless ?import=off, except where the query asks for it (`import`).
 * @param {import("@playwright/test").Page} page
 * @param {string} base  the server's address, from startPlayground()
 * @param {{ query: string, hash?: string, theme: string }} at
 */
export async function openPlayground(page, base, { query, hash, theme }) {
    const own = /(^|&)import(=|&|$)/.test(query) ? query : `${query}&import=off`;
    const url = `${base}?${own}&theme=${theme}${hash ? `#pivot-playground=${hash}` : ""}`;
    // startPlayground() has waited until the server listens
    await page.goto(url);
    await page.locator(".pk-root").waitFor();
    // a real data set loads first: the skeleton goes when the report has its data
    await page.getByTestId("skeleton").waitFor({ state: "detached" });
    // the playground's footer shows timings that differ on every run
    await page.addStyleTag({ content: ".pg-foot { visibility: hidden; }" });
}

/** Opens the zones when the report folded them (a note above the result can leave them no room). */
export async function openZones(page) {
    const fold = page.getByTestId("layout-summary");
    await fold.waitFor();
    if ((await fold.getAttribute("aria-expanded")) === "false") await fold.click();
}
