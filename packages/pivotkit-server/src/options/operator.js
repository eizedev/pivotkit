/*
 * The options of the operator's controls: a person's groups mapped to policy profiles, the profile of
 * every other caller, the source scopes the OAuth metadata offers, and the person in the log (audit).
 *
 * The keys this feature adds, by slot (options/shared.js SLOTS), and the rules between them. A key is
 * declared here once, never also in config.js or another fragment (options/index.js refuses a second
 * declaration).
 */

import { closest } from "pivotkit-core";
import { ConfigError, CREATABLE_SECRET_REF } from "./shared.js";

export const NAME = "operator";

/** How a log line names the person: not at all, as a keyed hash, or as the claim's own text. */
export const AUDIT_SUBJECT = Object.freeze(/** @type {const} */ (["off", "hash", "plain"]));

/** The longest group name an entry of auth.groupProfiles may name (the longest a token's group may be). */
export const GROUP_TEXT = 256;

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    auth: {
        groupsClaim: "string",
        groupsSeparator: "string",
        groupProfiles: { list: { object: { group: "string", profile: "string" } } },
        defaultProfile: "string",
        offerSourceScopes: "boolean"
    },
    top: {
        audit: { object: { subject: { enum: AUDIT_SUBJECT }, key: CREATABLE_SECRET_REF } }
    }
});

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    const auth = options.auth ?? {};
    const profiles = Object.keys(options.policy?.profiles ?? {});
    /** A profile a key names must exist, with the nearest name as a hint. */
    const known = (path, name) => {
        if (!profiles.includes(name)) {
            const near = closest(String(name), profiles);
            throw new ConfigError(`${path}: no profile "${String(name).slice(0, 60)}" in policy.profiles${near ? `; did you mean "${near}"?` : ""}`);
        }
    };
    if (auth.groupsClaim === "") {
        throw new ConfigError("auth.groupsClaim: the name of a claim, not empty");
    }
    if (auth.groupsSeparator === "") {
        throw new ConfigError("auth.groupsSeparator: a separator such as \",\" or \" \", not empty (leave it out to accept lists only)");
    }
    for (const [i, entry] of (auth.groupProfiles ?? []).entries()) {
        if (!entry.group || entry.group.length > GROUP_TEXT) {
            throw new ConfigError(`auth.groupProfiles[${i}].group: a group's name, 1 to ${GROUP_TEXT} characters`);
        }
        if (entry.profile === undefined) {
            throw new ConfigError(`auth.groupProfiles[${i}]: needs a profile (one of policy.profiles)`);
        }
        known(`auth.groupProfiles[${i}].profile`, entry.profile);
    }
    if (auth.defaultProfile !== undefined) {
        known("auth.defaultProfile", auth.defaultProfile);
    }
    if (options.audit?.key && (options.audit.subject ?? "off") !== "hash") {
        throw new ConfigError('audit.key: only audit.subject "hash" uses a key');
    }
}
