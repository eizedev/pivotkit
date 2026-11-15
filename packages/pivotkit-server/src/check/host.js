/*
 * What keeps the server from reaching a host now, by the rule its requests apply (guardedFetch's
 * addressRefusal over every address the name has): for check-config's sections, which word the
 * line themselves (check/upload.js, check/issuer.js).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { addressRefusal } from "../sources/fetch.js";

/** How long check-config waits for a name's addresses. */
const LOOKUP_MS = 3000;

/**
 * @typedef {object} HostRefusal
 * @property {"ipLiteral" | "lookup" | "always" | "private"} kind  ipLiteral: an IP address where the
 *   requests refuse one; lookup: the name cannot be looked up from here; always: an address never
 *   connected to (link-local, metadata, multicast, unspecified); private: loopback or private
 * @property {string} said  the host and, for a name, the address it resolves to ("x resolves to y")
 */

/**
 * @param {string} host  a URL's hostname (an IPv6 address may keep its brackets)
 * @param {{ allowPrivate: boolean, ipLiterals: boolean }} rules
 * @returns {Promise<HostRefusal | null>}
 */
export async function resolveRefusal(host, { allowPrivate, ipLiterals }) {
    const bare = host.replace(/^\[|\]$/g, "");
    const literal = isIP(bare) !== 0;
    if (literal && !ipLiterals) {
        return { kind: "ipLiteral", said: bare };
    }
    /** @type {Array<{ address: string }> | null} */
    // the lookup itself cannot be cancelled and may outlive the wait: harmless in a command that ends
    const addresses = literal ? [{ address: bare }] : await Promise.race([lookup(bare, { all: true }), new Promise((resolve) => setTimeout(() => resolve(null), LOOKUP_MS).unref())]).catch(() => null);
    if (!addresses?.length) {
        return { kind: "lookup", said: bare };
    }
    for (const { address } of addresses) {
        const rule = addressRefusal(address, { allowPrivate });
        if (rule) {
            return { kind: rule === "always" ? "always" : "private", said: literal ? bare : `${bare} resolves to ${address}` };
        }
    }
    return null;
}
