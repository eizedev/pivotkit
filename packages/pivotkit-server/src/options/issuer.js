/*
 * The options of the requests to the OAuth issuer (issuer.js): whether auth.issuer may be on a
 * loopback or private address (an issuer in the LAN or the cluster). Off by default, as for every
 * other outbound request (an HTTP source's backend, the upload target, a token endpoint).
 *
 * And rest.signIn.clientId: the issuer's public client that `pivotkit login` signs in with. The REST
 * metadata publishes it (pivotkit-node/rest SIGN_IN_CLIENT_FIELD), so a user needs only the address.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses
 * a second declaration).
 */

import { CLIENT_ID_SYNTAX } from "pivotkit-node/rest";
import { ConfigError } from "./shared.js";

export const NAME = "issuer";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    auth: {
        intranet: "boolean"
    },
    // the public client pivotkit login signs in with, published in the REST metadata; named as
    // output.downloads.signIn names the browser client of a download link's sign-in
    rest: {
        signIn: { object: { clientId: "string" } }
    }
});

/**
 * rest.signIn: only with OAuth (the metadata it goes into is served only then), and a client ID of
 * the form the command line takes. The schema has no key for a secret: a client that needs one
 * cannot be published.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    const signIn = options.rest?.signIn;
    if (signIn === undefined) {
        return;
    }
    if (typeof signIn.clientId !== "string" || !CLIENT_ID_SYNTAX.test(signIn.clientId)) {
        throw new ConfigError("rest.signIn.clientId: the public client's ID at the issuer that pivotkit login signs in with: printable, no spaces, at most 200 characters");
    }
    if (options.auth?.mode !== "oauth") {
        throw new ConfigError('rest.signIn: needs auth.mode "oauth"; the server publishes it in its sign-in metadata, which only OAuth has');
    }
}
