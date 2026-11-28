/*
 * The access level of a live link (record 0021): who may open it. create_link writes it signed into
 * the page's query string as `pk-access`; the page's backend or the page passes it on to the
 * exchange route (browser.js), which checks it before it makes a browser token.
 *
 *   pk-access = base64url(JSON { v: 1, l, t, n, d? }) "." base64url(HMAC-SHA256(accessKey, [source, the first part]))
 *
 * l is the level: "me" (only the person who made the link), "signedIn" (every signed-in person) or
 * "group" (a group of the sign-in, the groups claim). t is when the link was made, in seconds, and n
 * a random nonce. d is a keyed digest of the person or the group with the source, t and n, so the
 * link names neither, and two links of one person share no value. The signature covers the source: a value works only for the
 * source of its link. The key is the access subkey of rest.browser.key (browser-tokens.js).
 *
 * A level is advisory: it only narrows who opens a link. It is no data boundary: every reader reads
 * with their own rights, and could read the same rows without the link. rest.browser.levels lists
 * the levels the instance offers; a link without a level opens as signed-in where that is offered.
 *
 * A refusal says why in `linkAccess` of the exchange route's problem (browser.js): "refused" when the
 * level shuts this person out, "invalid" when the value is not valid, no longer offered or missing,
 * so the page asks for a new link.
 */

import { randomBytes } from "node:crypto";
import { OperationError } from "pivotkit-report/operations";
import { browserGrantOf, isExternalCaller } from "./auth.js";
import { mac, sameText } from "./downloads/tokens.js";
import { browserPathUsed, browserSettingsOf } from "./options/browser.js";

/** The name of the query parameter that carries the level. */
export const ACCESS_PARAM = "pk-access";

/** A pk-access value: its two parts. */
const ACCESS_SYNTAX = /^([A-Za-z0-9_-]{8,400})\.([A-Za-z0-9_-]{43})$/;

/** The keyed digest of what a level names: the person's identity, or a group, with the link's source and time. */
const digestOf = (key, what) => mac(key, JSON.stringify(what));

/** The signature of a value's first part, for one source. */
const signatureOf = (key, source, text) => mac(key, JSON.stringify([source, text]));

/**
 * NOT_ALLOWED of a link's level, with why for the page (linkAccess).
 * @param {"refused" | "invalid"} why
 * @param {string} message
 */
const linkRefusal = (why, message) => Object.assign(new OperationError("NOT_ALLOWED", message), { linkAccess: why });

/**
 * The pk-access value of a level for a link a caller makes. NOT_ALLOWED on a server without the
 * browser path (no profile reads rows), for a level the instance does not offer, a group the caller is not in, and "me" or a group for a person of an external
 * issuer (record 0014: no links bound to a sign-in).
 * @param {() => Promise<{ access: Buffer }>} keys
 * @param {import("./config.js").ServerOptions} options
 * @param {import("./registry.js").Caller} caller
 * @param {string} source  the link's source
 * @param {{ level: string, group?: string }} access
 * @returns {Promise<string>}
 */
export async function linkAccessOf(keys, options, caller, source, { level, group }) {
    if (!browserPathUsed(options)) {
        throw new OperationError("NOT_ALLOWED", "this server makes no live links (no profile reads rows), so a link takes no access level; leave access out");
    }
    const offered = browserSettingsOf(options).levels;
    if (!offered.includes(level)) {
        throw new OperationError("NOT_ALLOWED", `this server offers the access levels ${offered.join(", ")} for live links`);
    }
    if (level !== "signedIn" && isExternalCaller(caller)) {
        throw new OperationError("NOT_ALLOWED", "a sign-in of a host application gets no link bound to a person or a group; use the level signedIn");
    }
    const key = (await keys()).access;
    /** @type {Record<string, unknown>} */
    const body = { v: 1, l: level, t: Math.floor(Date.now() / 1000), n: randomBytes(9).toString("base64url") };
    if (level === "me") {
        const grant = browserGrantOf(caller);
        if (!grant) {
            throw new OperationError("NOT_ALLOWED", "only a person who signed in can make a link for themselves");
        }
        body.d = digestOf(key, ["me", source, body.t, body.n, ...grant.basis]);
    } else if (level === "group") {
        if (typeof group !== "string" || !(caller.groups ?? []).includes(group)) {
            throw new OperationError("NOT_ALLOWED", "a group link names one of your own groups");
        }
        body.d = digestOf(key, ["group", source, body.t, body.n, group]);
    }
    const text = Buffer.from(JSON.stringify(body)).toString("base64url");
    return `${text}.${signatureOf(key, source, text)}`;
}

/**
 * Checks a link's pk-access value (or its absence) for the person who opens the link; throws
 * NOT_ALLOWED with `linkAccess` when the level does not let them in. The value is never repeated in a message.
 * @param {() => Promise<{ access: Buffer }>} keys
 * @param {import("./config.js").ServerOptions} options
 * @param {import("./registry.js").Caller} caller
 * @param {string} source  the source the person asks a token for
 * @param {string | undefined} value
 */
export async function checkLinkAccess(keys, options, caller, source, value) {
    const offered = browserSettingsOf(options).levels;
    if (value === undefined) {
        if (!offered.includes("signedIn")) {
            throw linkRefusal("invalid", "this server opens a live link only with its access level (pk-access in the link): open the link as it was shared");
        }
        return;
    }
    const key = (await keys()).access;
    const parts = ACCESS_SYNTAX.exec(value);
    let body = null;
    if (parts && sameText(signatureOf(key, source, parts[1]), parts[2])) {
        try {
            body = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        } catch {
            body = null;
        }
    }
    if (body?.v !== 1 || typeof body.l !== "string" || !Number.isSafeInteger(body.t) || typeof body.n !== "string") {
        throw linkRefusal("invalid", "the link's access level (pk-access) is not valid; ask for a new link");
    }
    if (!offered.includes(body.l)) {
        throw linkRefusal("invalid", "the link's access level is no longer offered on this server; ask for a new link");
    }
    if (body.l === "me") {
        const grant = browserGrantOf(caller);
        if (!grant || !sameText(digestOf(key, ["me", source, body.t, body.n, ...grant.basis]), body.d)) {
            throw linkRefusal("refused", "this link opens only for the person who made it");
        }
    } else if (body.l === "group") {
        if (!(caller.groups ?? []).some((g) => sameText(digestOf(key, ["group", source, body.t, body.n, g]), body.d))) {
            throw linkRefusal("refused", "this link opens only for a group your sign-in does not carry");
        }
    }
}
