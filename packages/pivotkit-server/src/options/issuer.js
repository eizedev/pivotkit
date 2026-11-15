/*
 * The options of the requests to the OAuth issuer (issuer.js): whether auth.issuer may be on a
 * loopback or private address (an issuer in the LAN or the cluster). Off by default, as for every
 * other outbound request (an HTTP source's backend, the upload target, a token endpoint).
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses
 * a second declaration).
 */

export const NAME = "issuer";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    auth: {
        intranet: "boolean"
    }
});

/** No rules between keys: check-config (check/issuer.js) says what the setting does with the loaded issuer. */
export function validate() {}
