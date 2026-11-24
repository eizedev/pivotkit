/*
 * check-config's section for the REST service (only where it is served): its path, its own OAuth
 * resource, CORS, where the OpenAPI document is and who may read it, and where they are on: inline
 * results and file downloads for every caller.
 *
 *   REST: https://reports.example.com/api/v1
 *     resource https://reports.example.com/api/v1
 *     sign-in client for pivotkit login: pivotkit-cli (published; a public client without a secret)
 *     CORS: https://app.example.com
 *     OpenAPI document: https://reports.example.com/openapi.json; needs auth
 *
 * check/index.js says what a section returns.
 */

import { restAddressesOf, restResourceOf } from "../config.js";
import { heading, plain } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    if (!runtime.rest) {
        return { items: [], upgrade: [] };
    }
    const r = options.rest ?? {};
    const where = restAddressesOf(options);
    const items = [heading(`REST: ${where.rest}`)];
    if ((options.auth?.mode ?? "none") === "oauth") {
        items.push(plain(`resource ${restResourceOf(options)}`));
        const signIn = r.signIn?.clientId;
        if (signIn) {
            items.push(plain(`sign-in client for pivotkit login: ${signIn} (published; a public client without a secret)`));
        }
    }
    if (r.inline) {
        items.push(plain("inline results: on"));
    }
    items.push(plain(`CORS: ${r.cors?.origins?.length ? r.cors.origins.join(" ") : "off"}`));
    if (!where.openapi) {
        items.push(plain("OpenAPI document: off"));
    } else {
        const who = (r.openapi ?? "auth") === "auth" ? "needs auth" : "public";
        items.push(plain(`OpenAPI document: ${where.openapi}; ${who}`));
    }
    if (options.policy?.results) {
        items.push(plain("file downloads: allowed for every caller (policy.results)"));
    }
    return { items, upgrade: [] };
}
