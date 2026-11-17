/*
 * check-config's section for the tokens other systems issue (auth.externalIssuers,
 * external-issuers.js): each issuer with its type, its keys and the longest lifetime it may give a
 * token. A key that cannot be used is a PROBLEM: the server does not start with it (auth.js reads
 * the keys at start with the same loadExternalIssuers rules). So is an entry that gives a token
 * without a profile none the operator chose (missingProfile). A default profile its own `profiles`
 * do not list is a warning. No key is printed.
 *
 *   External token issuers (1):
 *     psu: type psu+jwt, key psu-2026-11, tokens live at most 15 min
 *       scopes at most: pivotkit:read
 *       profiles a token may name: staff
 *       without a profile: staff
 *
 * check/index.js says what a section returns.
 */

import { missingProfile, readPublicKey } from "../external-issuers.js";
import { EXTERNAL_ISSUER } from "../options/external.js";
import { heading, plain, problem, warning } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const list = options.auth?.externalIssuers ?? [];
    if (!list.length) {
        return { items: [], upgrade: [] };
    }
    const items = [heading(`External token issuers (${list.length}):`, "External token issuers")];
    for (const [i, entry] of list.entries()) {
        const kids = entry.keys.map((k) => k.kid);
        items.push(plain(`${entry.issuer}: type ${entry.typ}, key${kids.length === 1 ? "" : "s"} ${kids.join(", ")}, tokens live at most ${entry.maxMinutes ?? EXTERNAL_ISSUER.maxMinutes} min`));
        items.push(plain(`scopes at most: ${entry.scopes.length ? entry.scopes.join(", ") : "none"}`, 2));
        items.push(plain(`profiles a token may name: ${entry.profiles?.length ? entry.profiles.join(", ") : "none"}`, 2));
        const fallback = entry.profile ?? options.auth?.defaultProfile;
        items.push(plain(`without a profile: ${entry.profile ?? (fallback !== undefined ? `${fallback} (auth.defaultProfile)` : "none: refused")}`, 2));
        const missing = missingProfile(options, i);
        if (missing) {
            items.push(problem(missing, { stops: true }));
        }
        if (entry.profiles?.length && fallback !== undefined && !entry.profiles.includes(fallback)) {
            items.push(warning(`auth.externalIssuers[${i}]: a token that names no profile gets ${fallback}, which its profiles do not list (${entry.profiles.join(", ")}); a token naming ${fallback} itself gets 401`));
        }
        for (const [k, key] of entry.keys.entries()) {
            const read = await readPublicKey(key.publicKey, options, runtime.env);
            if ("problem" in read) {
                items.push(problem(`auth.externalIssuers[${i}].keys[${k}]: ${read.problem}`, { stops: true }));
            }
        }
    }
    return { items, upgrade: [] };
}
