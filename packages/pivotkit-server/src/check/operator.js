/*
 * check-config's section for the operator's controls: how the log names a person (Audit:). How a
 * signed-in person gets a profile (groups, the default profile), which scopes the OAuth metadata
 * offers and which source no caller can reach are said under Auth: (signInItems, used by
 * check/access.js), next to the sign-in they belong to.
 *
 * check/index.js says what a section returns. Without audit the section prints nothing.
 */

import { GROUPS_REFUSED, NOT_IN_GROUP } from "../auth.js";
import { POLICY_LEVELS, levelOf, resolvePolicy } from "../policy.js";
import { AUDIT_KEY_MIN } from "../log.js";
import { offeredScopes } from "../scopes.js";
import { readSecret, secretFileWarning } from "../secrets.js";
import { fileText, heading, plain, problem, warning } from "./format.js";

/** The most entries of auth.groupProfiles compared pair by pair for the "first match wins" warning. */
const COMPARED_ENTRIES = 50;

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    // how a person gets a profile is said under Auth: (check/access.js signInItems); here the audit
    return options.audit ? auditItems(options, runtime, (options.auth?.mode ?? "none") === "oauth") : { items: [], upgrade: [] };
}

/**
 * How a signed-in person gets a profile, the scopes the metadata offers, and the warnings about
 * them: the lines under Auth: (check/access.js).
 * @param {import("../config.js").ServerOptions} options
 * @param {import("./index.js").SectionRuntime} runtime
 * @returns {Promise<import("./format.js").Item[]>}
 */
export async function signInItems(options, runtime) {
    const auth = options.auth ?? {};
    const mode = auth.mode ?? "none";
    const items = [];
    const oauth = mode === "oauth";

    if (!oauth && (auth.groupProfiles?.length || auth.groupsClaim || auth.groupsSeparator)) {
        items.push(warning("auth.groupProfiles takes effect with auth.mode oauth only: a static token has its own profile (auth.tokens[].profile)"));
    }
    if (oauth) {
        if (auth.subjectClaim) {
            items.push(plain(`a person is told apart by the claim ${auth.subjectClaim}`));
        }
        if (auth.groupProfiles?.length) {
            items.push(plain(`profile by group (claim ${auth.groupsClaim ?? "groups"}${auth.groupsSeparator ? `, a list or a text split by ${JSON.stringify(auth.groupsSeparator)}` : ""}; first match wins, a client's profile comes first):`));
            items.push(plain(auth.groupProfiles.map((e) => `${e.group} -> ${e.profile}`).join(", "), 2));
        }
        if (auth.defaultProfile) {
            items.push(plain(`otherwise: profile ${auth.defaultProfile}`));
        } else if (auth.groupProfiles?.length) {
            items.push(plain(`a person in none of these groups${auth.scopeProfiles || auth.clientProfiles ? " whose client or scopes name no profile" : ""} is refused: "${NOT_IN_GROUP}"`));
            items.push(plain(`a person whose token does not carry the groups is refused: "${GROUPS_REFUSED}"`));
        }
        const surfaces = /** @type {Array<"mcp" | "rest">} */ (runtime.rest ? ["mcp", "rest"] : ["mcp"]);
        const offered = new Set(surfaces.flatMap((surface) => offeredScopes(options, surface) ?? []));
        if (offered.size) {
            items.push(plain(`scopes offered: ${[...offered].join(" ")} (define these at your provider; it may refuse a sign-in that asks for one it does not know)`));
        }
        const required = new Set([...(auth.requiredScopes ?? []), ...(options.rest?.requiredScopes ?? [])]);
        for (const [id, source] of Object.entries(options.sources ?? {})) {
            for (const scope of source.scopes ?? []) {
                if (!offered.has(scope) && !required.has(scope)) {
                    items.push(warning(`the source ${id} needs the scope ${scope}, which the server does not offer (${notOfferedWhy(auth, scope)}): a client learns of it only from you`));
                }
            }
        }
        for (const scope of auth.scopesSupported ?? []) {
            if (auth.scopeProfiles && Object.hasOwn(auth.scopeProfiles, scope)) {
                items.push(warning(`auth.scopesSupported offers ${scope}, which auth.scopeProfiles binds to the profile ${auth.scopeProfiles[scope]}: a client that asks for it chooses that profile itself`));
            }
        }
        if (auth.groupProfiles?.length && !auth.defaultProfile) {
            items.push(warning("auth.groupProfiles without auth.defaultProfile: a person in none of the groups is refused (403); set auth.defaultProfile to a narrow profile to let them in"));
        }
    } else if (mode === "token") {
        // a scope no static token holds: nobody reaches the source
        const all = (auth.tokens ?? []).length === 0 || (auth.tokens ?? []).some((t) => !t.scopes);
        const held = new Set((auth.tokens ?? []).flatMap((t) => t.scopes ?? []));
        for (const [id, source] of Object.entries(options.sources ?? {})) {
            for (const scope of all ? [] : (source.scopes ?? [])) {
                if (!held.has(scope)) {
                    items.push(warning(`the source ${id} needs the scope ${scope}, which no static token holds: no caller can use it`));
                }
            }
        }
    }
    items.push(...widerEntries(options).map((line) => warning(line)));
    return items;
}

/** Why a source's scope is not offered. */
function notOfferedWhy(auth, scope) {
    if (auth.scopesSupported) {
        return "auth.scopesSupported does not list it";
    }
    if (auth.scopeProfiles && Object.hasOwn(auth.scopeProfiles, scope)) {
        return "auth.scopeProfiles names it, and a client must not choose its own profile";
    }
    return "auth.offerSourceScopes is not on";
}

/**
 * The warnings for entries of auth.groupProfiles where a later one shows a field an earlier one holds
 * back: a person in both groups gets the earlier, narrower one, since the first match wins. The
 * wider profile first is the usual order and says nothing.
 * @param {import("../config.js").ServerOptions} options
 * @returns {string[]}
 */
function widerEntries(options) {
    const entries = (options.auth?.groupProfiles ?? []).slice(0, COMPARED_ENTRIES);
    const profiles = options.policy?.profiles ?? {};
    const out = [];
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            const [a, b] = [entries[i], entries[j]];
            if (a.profile !== b.profile && Object.hasOwn(profiles, a.profile) && Object.hasOwn(profiles, b.profile) && shows(options, profiles[b.profile], profiles[a.profile])) {
                out.push(`groupProfiles entry ${j + 1} (${b.group}) shows fields that entry ${i + 1} (${a.group}) holds back: people in both groups get entry ${i + 1}, since the first match wins; if that is not intended, put the wider profile first`);
            }
        }
    }
    return out;
}

/** Whether a profile shows any field (of the server's policy or a source's) more than another. */
function shows(options, wide, narrow) {
    const strictness = (level) => POLICY_LEVELS.indexOf(level);
    for (const source of [undefined, ...Object.values(options.sources ?? {}).map((s) => s.policy)]) {
        const p = resolvePolicy(options.policy, source, wide);
        const q = resolvePolicy(options.policy, source, narrow);
        if (strictness(p.default) < strictness(q.default)) {
            return true;
        }
        for (const name of new Set([...p.fields.keys(), ...q.fields.keys()])) {
            if (strictness(levelOf(p, name)) < strictness(levelOf(q, name))) {
                return true;
            }
        }
    }
    return false;
}

/** The audit section: how the log names a person, the key, and what keeps it from working. */
async function auditItems(options, runtime, oauth) {
    const audit = options.audit ?? {};
    const subject = audit.subject ?? "off";
    const claim = options.auth?.subjectClaim ?? "sub";
    if (subject === "off") {
        return { items: [heading("Audit: off (log lines name the client, never the person)")], upgrade: [] };
    }
    const items = [heading(subject === "hash" ? `Audit: the person is logged as a keyed hash of issuer and ${claim}` : `Audit: the person is logged by ${claim} as it is`)];
    if (subject !== "hash") {
        items.push(plain("this is personal data: say so where your log goes and how long it is kept"));
    }
    if (!oauth) {
        items.push(warning("audit names a person only with auth.mode oauth; a static token is logged by its name already"));
    }
    if (subject === "hash") {
        if (!audit.key) {
            items.push(warning("no audit.key: a random key per start, so the same person gets another hash after every restart"));
        } else {
            items.push(plain(`key from ${audit.key.env ? `$${audit.key.env}` : `the file ${fileText(options, audit.key.file)}`}`));
            // read at start with OAuth only, where a key that cannot be read stops the start
            const unreadable = oauth
                ? await readSecret(audit.key, options, runtime.env).then(
                      (key) => (key.length < AUDIT_KEY_MIN ? `at least ${AUDIT_KEY_MIN} characters` : null),
                      (e) => String(e?.message ?? e)
                  )
                : null;
            if (unreadable) {
                items.push(problem(`audit.key: ${unreadable}`, { stops: true }));
            }
            const shared = await secretFileWarning(audit.key, options, `the audit key's file ${audit.key.file}`);
            if (shared) {
                items.push(warning(shared.replace(/^warning: /, "")));
            }
        }
    }
    return { items, upgrade: [] };
}
