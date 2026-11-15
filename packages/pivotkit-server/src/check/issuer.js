/*
 * check-config's lines for the requests to the OAuth issuer (issuer.js, options/issuer.js): the rules
 * they follow, and whether the issuer's host (and auth.jwksUri's) is one the server may reach now:
 *
 *   Issuer requests:
 *     https only, no redirects, metadata up to 256 KiB, keys up to 256 KiB
 *     loopback and private addresses: allowed (auth.intranet)
 *
 * and, among the PROBLEM lines: auth.issuer: idp.example.lan resolves to 10.0.0.5, a loopback or
 * private address, which the server refuses without auth.intranet: true
 */

import { ISSUER_LIMITS, issuerRulesOf } from "../issuer.js";
import { settingsOf as downloadSettingsOf } from "../options/downloads.js";
import { resolveRefusal } from "./host.js";
import { heading, plain, problem, warning } from "./format.js";

/** A size in KiB for a line. */
const kib = (bytes) => `${+(bytes / 1024).toFixed(1)} KiB`;

/** What a PROBLEM of the issuer's host does: the server starts, the sign-in does not work. */
const NO_SIGN_IN = { effect: "the server starts; callers get 503 until it can reach the issuer" };

/**
 * What keeps the server from reaching the host of an address the operator wrote (check/host.js): a
 * PROBLEM, a WARNING when the name cannot be looked up now, or null. An IP address is allowed
 * there (an origin the operator wrote).
 * @param {string} text  the address
 * @param {string} key  the option that names it
 * @param {import("../issuer.js").IssuerRules} rules
 * @returns {Promise<import("./format.js").Item | null>}
 */
async function hostItem(text, key, rules) {
    if (!URL.canParse(text)) {
        return null;
    }
    const url = new URL(text);
    // a test issuer on plain http: loopback only, which guardedFetch checks when it connects
    if (url.protocol === "http:" && rules.insecure) {
        return null;
    }
    const refusal = await resolveRefusal(url.hostname, { allowPrivate: rules.intranet, ipLiterals: true });
    if (!refusal) {
        return null;
    }
    const { kind, said } = refusal;
    if (kind === "lookup") {
        return warning(`${key}: ${said} cannot be looked up from here; the server checks its addresses when it connects`);
    }
    if (kind === "always") {
        return problem(`${key}: ${said}, which is never connected to (link-local, metadata, multicast or unspecified)`, NO_SIGN_IN);
    }
    return problem(`${key}: ${said}, a loopback or private address, which the server refuses without auth.intranet: true`, NO_SIGN_IN);
}

/** @type {import("./index.js").Section} */
export async function section(options) {
    const auth = options.auth ?? {};
    /** @type {import("./format.js").Item[]} */
    const items = [];
    /** @type {string[]} */
    const upgrade = [];
    if (auth.mode !== "oauth") {
        if (auth.intranet !== undefined) {
            items.push(heading('Issuer requests: none (auth.mode is not "oauth")'), warning("auth.intranet has no effect without an OAuth issuer; leave it out"));
        }
        return { items, upgrade };
    }
    const rules = issuerRulesOf(options);
    const signIn = downloadSettingsOf(options).signIn;
    items.push(
        heading("Issuer requests:"),
        plain(`https only, no redirects, metadata up to ${kib(ISSUER_LIMITS.metadataBytes)}, keys up to ${kib(ISSUER_LIMITS.jwksBytes)}`),
        plain(rules.intranet ? "loopback and private addresses: allowed (auth.intranet)" : "loopback and private addresses: refused (set auth.intranet: true for an issuer in your LAN or cluster)")
    );
    // where the download sign-in sends its code (and the client secret)
    if (signIn) {
        items.push(plain(signIn.tokenUrl && URL.canParse(signIn.tokenUrl) ? `download links' token endpoint: on ${new URL(signIn.tokenUrl).host} (output.downloads.signIn.tokenUrl)` : "download links' token endpoint: on the issuer's host only"));
    }
    for (const [key, text] of /** @type {Array<[string, string | undefined]>} */ ([["auth.issuer", auth.issuer], ["auth.jwksUri", auth.jwksUri], ["output.downloads.signIn.tokenUrl", signIn?.tokenUrl ?? undefined]])) {
        const said = text ? await hostItem(text, key, rules) : null;
        if (said) {
            items.push(said);
        }
    }
    upgrade.push("issuer requests under guardedFetch's rules (auth.intranet: true for a LAN issuer)");
    return { items, upgrade };
}
