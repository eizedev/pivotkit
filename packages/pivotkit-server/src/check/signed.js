/*
 * check-config's section for the signed tokens the server issues itself (signed-tokens.js), once
 * their directory is there (the first `token issue` makes it): the keys (the newest signs), how many
 * tokens work and how many are revoked, and a warning for a key file others may read or one that
 * cannot be used. No key and no token value is printed.
 *
 *   Signed tokens: /var/lib/pivotkit/secrets/signed
 *     1 key (k20261116120000000-3f2a signs), 2 active, 1 revoked
 *
 * check/index.js says what a section returns.
 */

import { pathOf } from "../config.js";
import { secretFileWarning } from "../secrets.js";
import { signedStore } from "../signed-tokens.js";
import { heading, plain, warning } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options) {
    const dir = options.auth?.mode === "token" ? options.auth.signedTokens?.dir : undefined;
    if (!dir) {
        return { items: [], upgrade: [] };
    }
    const store = signedStore(pathOf(options, dir));
    if (Number.isNaN(await store.keysStamp().catch(() => 0))) {
        return { items: [], upgrade: [] };
    }
    const items = [heading(`Signed tokens: ${store.dir}`, "Signed tokens")];
    let loaded;
    try {
        loaded = await store.loadKeys();
    } catch (e) {
        items.push(warning(`the keys cannot be read (${String(e?.code ?? e?.message ?? e).slice(0, 60)}): every signed token is refused`));
        return { items, upgrade: [] };
    }
    const kids = [...loaded.keys.keys()];
    const now = Date.now();
    const revoked = await store.revokedIds().catch(() => new Map());
    const active = (await store.issued().catch(() => [])).filter((r) => !revoked.has(r.id) && Date.parse(r.expiresAt) > now).length;
    items.push(plain(`${kids.length} key${kids.length === 1 ? "" : "s"}${kids.length ? ` (${kids.at(-1)} signs)` : ""}, ${active} active, ${revoked.size} revoked`));
    if (!kids.length) {
        items.push(warning(`no usable key in ${store.dir}: every signed token is refused; pivotkit-server key new --for signing makes one`));
    }
    for (const problem of loaded.problems) {
        items.push(warning(`a signing key ${problem}`));
    }
    for (const [kid, key] of loaded.keys) {
        const shared = await secretFileWarning({ file: key.path }, options, `the signing key ${kid}'s file ${key.path}`);
        if (shared) {
            items.push(warning(shared));
        }
    }
    return { items, upgrade: [] };
}
