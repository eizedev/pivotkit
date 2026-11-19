/*
 * check-config's section for the branding (branding.js): the name, the documentation links, the icon
 * and where / goes. Left out when the operator set none of them, so a configuration without them
 * reads as before.
 *
 *   Branding:
 *     name: Team reports
 *     documentation links: none (branding.docsUrl null)
 *     icon: /srv/pivotkit/team-icon.png, 64x64 PNG
 *     page: / goes to https://intranet.example/reports
 *
 * An icon that cannot be used is a PROBLEM that stops the start, as createContext refuses it.
 * check/index.js says what a section returns.
 */

import { DEFAULT_NAME, docsLink, docsOf, iconOf } from "../branding.js";
import { heading, plain, problem } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const branding = options.branding ?? {};
    const page = options.http?.page;
    const pageUrl = typeof page === "object" && page?.url ? page.url : null;
    if (!Object.keys(branding).length && !pageUrl) {
        return { items: [], upgrade: [] };
    }
    const items = [heading("Branding:")];
    items.push(plain(`name: ${branding.name ?? `${DEFAULT_NAME} (the default)`}`));
    const docs = docsOf(options);
    items.push(plain(docs === null ? "documentation links: none (branding.docsUrl null)" : `documentation links: ${docsLink(docs, "")}...`));
    if (branding.icon !== undefined) {
        try {
            const icon = /** @type {NonNullable<Awaited<ReturnType<typeof iconOf>>>} */ (await iconOf(options));
            items.push(plain(`icon: ${icon.path}, ${icon.width}x${icon.height} PNG`));
        } catch (e) {
            items.push(problem(/** @type {Error} */ (e).message, { stops: true }));
        }
    }
    if (pageUrl) {
        items.push(plain(`page: / goes to ${pageUrl}${runtime.mcp !== false ? ", and a browser that opens /mcp too" : ""}`));
    }
    return { items, upgrade: [] };
}
