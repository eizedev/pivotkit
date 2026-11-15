/*
 * check-config's lines for the requests to the OAuth issuer (issuer.js, options/issuer.js): the rules
 * they follow, and whether the issuer's host (and auth.jwksUri's) is one the server may reach now:
 *
 *   Issuer requests: guardedFetch rules (https, no redirects, metadata 256 KiB, keys 256 KiB); loopback and private addresses allowed (auth.intranet)
 *     PROBLEM: auth.issuer: idp.example.lan resolves to 10.0.0.5, a loopback or private address, which the server refuses without auth.intranet: true
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ISSUER_LIMITS, issuerRulesOf } from "../issuer.js";
import { addressRefusal } from "../sources/fetch.js";

/** How long check-config waits for a name's addresses. */
const LOOKUP_MS = 3000;

/** A size in KiB for a line. */
const kib = (bytes) => `${+(bytes / 1024).toFixed(1)} KiB`;

/**
 * What keeps the server from reaching the host of an address the operator wrote: a PROBLEM line, a
 * warning when the name cannot be looked up now, or null. Every address the name has now is checked
 * by the rule a request applies (guardedFetch's addressRefusal).
 * @param {string} text  the address
 * @param {string} key  the option that names it
 * @param {import("../issuer.js").IssuerRules} rules
 * @returns {Promise<string | null>}
 */
async function hostLine(text, key, rules) {
    if (!URL.canParse(text)) {
        return null;
    }
    const url = new URL(text);
    const bare = url.hostname.replace(/^\[|\]$/g, "");
    // a test issuer on plain http: loopback only, which guardedFetch checks when it connects
    if (url.protocol === "http:" && rules.insecure) {
        return null;
    }
    /** @type {Array<{ address: string }> | null} */
    // the lookup itself cannot be cancelled and may outlive the wait: harmless in a command that ends
    const addresses = isIP(bare) ? [{ address: bare }] : await Promise.race([lookup(bare, { all: true }), new Promise((resolve) => setTimeout(() => resolve(null), LOOKUP_MS).unref())]).catch(() => null);
    if (!addresses?.length) {
        return `warning: ${key}: ${bare} cannot be looked up from here; the server checks its addresses when it connects`;
    }
    for (const { address } of addresses) {
        const rule = addressRefusal(address, { allowPrivate: rules.intranet });
        const said = address === bare ? bare : `${bare} resolves to ${address}`;
        if (rule === "always") {
            return `PROBLEM: ${key}: ${said}, which is never connected to (link-local, metadata, multicast or unspecified)`;
        }
        if (rule) {
            return `PROBLEM: ${key}: ${said}, a loopback or private address, which the server refuses without auth.intranet: true`;
        }
    }
    return null;
}

/** @type {import("./index.js").Section} */
export async function section(options) {
    const auth = options.auth ?? {};
    /** @type {string[]} */
    const lines = [];
    /** @type {string[]} */
    const upgrade = [];
    if (auth.mode !== "oauth") {
        if (auth.intranet !== undefined) {
            lines.push('Issuer requests: none (auth.mode is not "oauth")', "  warning: auth.intranet has no effect without an OAuth issuer; leave it out");
        }
        return { lines, problems: 0, upgrade };
    }
    const rules = issuerRulesOf(options);
    lines.push(`Issuer requests: https only, no redirects, metadata up to ${kib(ISSUER_LIMITS.metadataBytes)}, keys up to ${kib(ISSUER_LIMITS.jwksBytes)}; ${rules.intranet ? "loopback and private addresses allowed (auth.intranet)" : "loopback and private addresses refused (set auth.intranet: true for an issuer in your LAN or cluster)"}`);
    let problems = 0;
    for (const [key, text] of /** @type {Array<[string, string | undefined]>} */ ([["auth.issuer", auth.issuer], ["auth.jwksUri", auth.jwksUri]])) {
        const said = text ? await hostLine(text, key, rules) : null;
        if (said) {
            lines.push(`  ${said}`);
            problems += said.startsWith("PROBLEM:") ? 1 : 0;
        }
    }
    upgrade.push(`The issuer's metadata, keys and the download sign-in's token endpoint are read under the rules of every other outbound request: no redirects, no proxy from the environment, a key set over ${kib(ISSUER_LIMITS.jwksBytes)} is refused, and an issuer on a loopback or private address needs auth.intranet: true.`);
    return { lines, problems, upgrade };
}
