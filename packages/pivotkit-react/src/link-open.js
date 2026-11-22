/*
 * What a link loads (share.js: loadLink): pivotkit-core/link, which reads and writes the view in a
 * link, and reading a link's view against the data. Neither is needed before a link is opened or
 * made, so both stay out of the report's first load.
 */

import { decodeViewLink } from "pivotkit-core/link";
import { loadCheck, viewFromObject } from "./share.js";

export * from "pivotkit-core/link";

/**
 * The view of a link, read against the data shown: `failed` names the text that says why it cannot
 * be used ("newer", "badLink"); else the view and, for a link made for other data, what to ask first
 * (share.js: loadCheck). Opening it is the report's (use-share-link.js).
 * @param {string} text  the link
 * @param {{ encoded: import("pivotkit-core").Encoded, limits: object | undefined, labels: any, sourceId: string | undefined, sources: unknown }} report
 * @returns {{ failed: "newer" | "badLink" } | { failed: null, loaded: import("./share.js").LoadedView, check: ReturnType<typeof loadCheck> }}
 */
export function readLink(text, { encoded, limits, labels, sourceId, sources }) {
    const decoded = decodeViewLink(text);
    // a link carries a view file (its link profile) or, made before it, a bare view
    const loaded = decoded.view ? viewFromObject(decoded.view, encoded, { limits, sourceId }) : null;
    if (!loaded || !loaded.view) {
        return { failed: loaded?.failed === "newer" ? "newer" : "badLink" };
    }
    // a link made for other data asks first, as a pasted view does
    return { failed: null, loaded, check: loadCheck(loaded, labels, Array.isArray(sources) ? sources : []) };
}
