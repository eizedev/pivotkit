/*
 * check-config's lines for the requests to the OAuth issuer (issuer.js, options/issuer.js): the rules
 * they follow, whether the issuer's host (and auth.jwksUri's) is one the server may reach now, and,
 * with `runtime.discover` (the runners pass issuer.js discover), whether its metadata loads within
 * ISSUER_MS (a WARNING when not: the server starts and keeps trying; nothing secret is sent):
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
import { bytesText } from "../text.js";
import { heading, plain, problem, warning } from "./format.js";

/** How long check-config waits for an issuer's metadata. */
export const ISSUER_MS = 3000;

/** What a PROBLEM of the issuer's host does: the server starts, the sign-in does not work. */
const NO_SIGN_IN = { effect: "the server starts; callers get 503 until the issuer can be reached" };

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
    // plain http: a test issuer reaches loopback only, which guardedFetch checks when it connects;
    // without auth.allowInsecureIssuer the start refuses it already (check/access.js)
    if (url.protocol === "http:") {
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

/**
 * Why the metadata could not be loaded, in a few words and whole: the connection's error code, the
 * status the issuer answered, or that the answer was not its metadata. The addresses discover tried
 * are left out (the start's log names them).
 * @param {unknown} error  discover's Error, its cause the first try's
 */
function reasonOf(error) {
    const text = String(/** @type {any} */ (error)?.message ?? error);
    const code = /\b(E[A-Z]{3,}|ERR_[A-Z_]+|CERT_[A-Z_]+|UNABLE_TO_[A-Z_]+|SELF_SIGNED_[A-Z_]+)\b/.exec(`${text} ${/** @type {any} */ (error)?.cause?.cause?.code ?? ""}`)?.[1];
    if (code) {
        return `the connection failed: ${code}`;
    }
    const status = /\b([1-5]\d\d) from /.exec(text)?.[1];
    if (status) {
        return `the issuer answered ${status}`;
    }
    for (const refusal of ["REFUSED_ADDRESS", "IP_LITERAL", "NOT_HTTPS", "TOO_LARGE", "TIMEOUT"]) {
        if (text.includes(refusal)) {
            return `refused: ${refusal}`;
        }
    }
    return /names the issuer/.test(text) ? "its metadata names another issuer" : "the answer is not the issuer's metadata";
}

/**
 * A WARNING per issuer whose metadata cannot be loaded now (the sign-in for MCP and REST, and the
 * download links' own): the server starts anyway and keeps trying.
 */
async function reachItems(options, runtime) {
    if (typeof runtime.discover !== "function") {
        return [];
    }
    const issuers = new Map();
    // an issuer the start refuses for its scheme is a PROBLEM already (check/access.js)
    const scheme = URL.canParse(String(options.auth?.issuer)) ? new URL(String(options.auth?.issuer)).protocol : "";
    if (options.auth?.mode === "oauth" && options.auth.issuer && (scheme === "https:" || options.auth.allowInsecureIssuer)) {
        // download links (signed in) use the same issuer (options/downloads.js)
        const links = runtime.http && downloadSettingsOf(options).signIn ? "; download links (signed in) answer 503 too" : "";
        issuers.set(options.auth.issuer, ["auth.issuer", `callers get 503 until it loads${links}`]);
    }
    const out = [];
    for (const [issuer, [key, until]] of issuers) {
        // one wait for both of discover's tries, on a timer that holds the process (an unref'd one
        // lets a command whose only work is this wait end before it settles); it aborts discover and,
        // for a discover that ignores the signal, settles the race; cleared once the race settles, so a
        // library call leaves no timer behind
        const stop = new AbortController();
        const signal = stop.signal;
        const late = `no answer within ${ISSUER_MS / 1000} s`;
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let timer;
        let why;
        try {
            why = await Promise.race([
                Promise.resolve()
                    .then(() => runtime.discover(issuer, issuerRulesOf(options), { signal }))
                    .then(
                        () => null,
                        (e) => (signal.aborted ? late : reasonOf(e))
                    ),
                new Promise((resolve) => {
                    timer = setTimeout(() => {
                        stop.abort();
                        resolve(late);
                    }, ISSUER_MS);
                })
            ]);
        } finally {
            clearTimeout(timer);
        }
        if (why) {
            out.push(warning(`${key}: the metadata of ${issuer} cannot be loaded from here (${why}); the server starts and keeps trying; ${until}`));
        }
    }
    return out;
}

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const auth = options.auth ?? {};
    /** @type {import("./format.js").Item[]} */
    const items = [];
    if (auth.mode !== "oauth") {
        if (auth.intranet !== undefined) {
            items.push(heading('Issuer requests: none (auth.mode is not "oauth")', "Auth"), warning("auth.intranet has no effect without an OAuth issuer; leave it out"));
        }
        return { items, upgrade: [] };
    }
    const rules = issuerRulesOf(options);
    const signIn = downloadSettingsOf(options).signIn;
    items.push(
        // its warnings are about the sign-in: they carry Auth's name, where the operator looks
        heading("Issuer requests:", "Auth"),
        plain(`https only, no redirects, metadata up to ${bytesText(ISSUER_LIMITS.metadataBytes)}, keys up to ${bytesText(ISSUER_LIMITS.jwksBytes)}`),
        plain(rules.intranet ? "loopback and private addresses: allowed (auth.intranet)" : "loopback and private addresses: refused (set auth.intranet: true for an issuer in your LAN or cluster)")
    );
    // where the download sign-in sends its code (and the client secret)
    if (signIn) {
        items.push(plain(signIn.tokenUrl && URL.canParse(signIn.tokenUrl) ? `download links' token endpoint: on ${new URL(signIn.tokenUrl).host} (output.downloads.signIn.tokenUrl)` : "download links' token endpoint: on the issuer's host only"));
    }
    let issuerRefused = false;
    for (const [key, text] of /** @type {Array<[string, string | undefined]>} */ ([["auth.issuer", auth.issuer], ["auth.jwksUri", auth.jwksUri], ["output.downloads.signIn.tokenUrl", signIn?.tokenUrl ?? undefined]])) {
        const said = text ? await hostItem(text, key, rules) : null;
        issuerRefused ||= key === "auth.issuer" && said?.kind === "problem";
        // one cause, one warning: an issuer that cannot be looked up is said by the metadata check
        // below, with the connection's error, where the commands ask it
        if (said && !(said.kind === "warning" && key === "auth.issuer" && typeof runtime.discover === "function")) {
            items.push(said);
        }
    }
    // whether the metadata loads now (with runtime.discover, the commands'), unless the issuer's
    // address is a problem already
    if (!issuerRefused) {
        items.push(...(await reachItems(options, runtime)));
    }
    return { items, upgrade: [] };
}
