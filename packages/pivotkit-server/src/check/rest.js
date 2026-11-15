/*
 * check-config's section for the REST service (only where it is served): its path, its own OAuth
 * resource, and what differs from the defaults (inline results, CORS, who may read /openapi.json,
 * file downloads for every caller).
 *
 *   REST: /api/v1
 *     resource https://reports.example.com/api/v1
 *     CORS: https://app.example.com
 *
 * check/index.js says what a section returns.
 */

import { restResourceOf } from "../config.js";
import { heading, plain } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    if (!runtime.rest) {
        return { items: [], upgrade: [] };
    }
    const r = options.rest ?? {};
    const items = [heading("REST: /api/v1")];
    if ((options.auth?.mode ?? "none") === "oauth") {
        items.push(plain(`resource ${restResourceOf(options)}`));
    }
    if (r.inline) items.push(plain("inline results: on"));
    if (r.cors?.origins?.length) items.push(plain(`CORS: ${r.cors.origins.join(" ")}`));
    if ((r.openapi ?? "auth") !== "auth") items.push(plain(`/openapi.json: ${r.openapi}`));
    if (options.policy?.results) items.push(plain("file downloads: allowed for every caller (policy.results)"));
    return { items, upgrade: [] };
}
