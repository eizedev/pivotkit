/*
 * check-config's section for the operator's controls: how a signed-in person gets a profile (groups,
 * the default profile), which scopes the OAuth metadata offers and which source no caller can reach,
 * and how the log names a person (audit).
 *
 * check/index.js says what a section returns. A configuration without these settings and without
 * OAuth prints nothing here.
 */

import { GROUPS_REFUSED } from "../auth.js";
import { POLICY_LEVELS, levelOf, resolvePolicy } from "../policy.js";
import { offeredScopes, sourceScopes } from "../scopes.js";
import { readSecret, secretFileWarning } from "../secrets.js";

/** The most entries of auth.groupProfiles compared pair by pair for the "first match wins" warning. */
const COMPARED_ENTRIES = 50;

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const auth = options.auth ?? {};
    const mode = auth.mode ?? "none";
    const lines = [];
    let problems = 0;
    const upgrade = [];
    const oauth = mode === "oauth";

    if (!oauth && (auth.groupProfiles?.length || auth.groupsClaim || auth.groupsSeparator)) {
        lines.push("  warning: auth.groupProfiles takes effect with auth.mode oauth only: a static token has its own profile (auth.tokens[].profile)");
    }
    if (oauth) {
        const surfaces = /** @type {Array<"mcp" | "rest">} */ (runtime.rest ? ["mcp", "rest"] : ["mcp"]);
        const offered = new Set(surfaces.flatMap((surface) => offeredScopes(options, surface) ?? []));
        lines.push(`  scopes offered: ${offered.size ? `${[...offered].join(" ")} (define these at your provider; a provider may refuse a sign-in that asks for an undefined scope)` : "none"}`);
        const required = new Set([...(auth.requiredScopes ?? []), ...(options.rest?.requiredScopes ?? [])]);
        for (const [id, source] of Object.entries(options.sources ?? {})) {
            for (const scope of source.scopes ?? []) {
                if (!offered.has(scope) && !required.has(scope)) {
                    lines.push(`  warning: the source ${id} needs the scope ${scope}, which the server does not offer (${notOfferedWhy(auth, scope)}): a client learns of it only from you`);
                }
            }
        }
        for (const scope of auth.scopesSupported ?? []) {
            if (auth.scopeProfiles && Object.hasOwn(auth.scopeProfiles, scope)) {
                lines.push(`  warning: auth.scopesSupported offers ${scope}, which auth.scopeProfiles binds to the profile ${auth.scopeProfiles[scope]}: a client that asks for it chooses that profile itself`);
            }
        }
        // what changes with this version: the sources' scopes in the metadata
        const added = auth.scopesSupported ? [] : surfaces.flatMap((surface) => sourceScopes(options, surface)).filter((s) => !required.has(s) && !(auth.scopeProfiles && Object.hasOwn(auth.scopeProfiles, s)));
        if (added.length) {
            upgrade.push(`The OAuth metadata (scopes_supported) offers the sources' scopes too (${[...new Set(added)].join(" ")}): clients that ask for every offered scope request them at their next sign-in, and a provider may refuse a scope it does not define; define them there first, or set auth.offerSourceScopes: false`);
        }
    } else if (mode === "token") {
        // a scope no static token holds: nobody reaches the source
        const all = (auth.tokens ?? []).length === 0 || (auth.tokens ?? []).some((t) => !t.scopes);
        const held = new Set((auth.tokens ?? []).flatMap((t) => t.scopes ?? []));
        for (const [id, source] of Object.entries(options.sources ?? {})) {
            for (const scope of all ? [] : (source.scopes ?? [])) {
                if (!held.has(scope)) {
                    lines.push(`  warning: the source ${id} needs the scope ${scope}, which no static token holds: no caller can use it`);
                }
            }
        }
    }
    lines.push(...widerEntries(options).map((line) => `  ${line}`));
    // every line of the section stands under its heading
    if (lines.length || oauth || auth.groupProfiles?.length || auth.defaultProfile || auth.groupsClaim) {
        lines.unshift(`Sign-in: ${signInText(auth, mode)}`);
    }

    if (options.audit) {
        const audit = await auditLines(options, runtime, oauth);
        lines.push(...audit.lines);
        problems += audit.problems;
    }
    return { lines, problems, upgrade };
}

/** How a signed-in caller's profile is chosen, in one line. */
function signInText(auth, mode) {
    const parts = [];
    if (mode === "oauth") {
        parts.push(`subject from claim ${auth.subjectClaim ?? "sub"}`);
    }
    if (auth.groupProfiles?.length) {
        const map = auth.groupProfiles.map((e) => `${e.group} → profile ${e.profile}`).join(", ");
        parts.push(`groups from claim ${auth.groupsClaim ?? "groups"}${auth.groupsSeparator ? ` (a list, or a text split by ${JSON.stringify(auth.groupsSeparator)})` : ""}: ${map} (first match wins; a client profile comes first)`);
    }
    if (auth.defaultProfile) {
        parts.push(`otherwise profile ${auth.defaultProfile}`);
    } else if (auth.groupProfiles?.length && mode === "oauth") {
        parts.push(`a person whose token does not carry the groups is refused ("${GROUPS_REFUSED}"); set auth.defaultProfile to give them a profile instead`);
    }
    return parts.join("; ") || "each static token's own profile, else the sources' policy";
}

/** Why a source's scope is not offered. */
function notOfferedWhy(auth, scope) {
    if (auth.scopesSupported) {
        return "auth.scopesSupported does not list it";
    }
    if (auth.scopeProfiles && Object.hasOwn(auth.scopeProfiles, scope)) {
        return "auth.scopeProfiles names it, and a client must not choose its own profile";
    }
    return "auth.offerSourceScopes is false";
}

/**
 * The warnings for entries of auth.groupProfiles where an earlier one shows a field a later one
 * holds back: a person in both groups gets the earlier one, since the first match wins.
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
            if (a.profile !== b.profile && Object.hasOwn(profiles, a.profile) && Object.hasOwn(profiles, b.profile) && shows(options, profiles[a.profile], profiles[b.profile])) {
                out.push(`warning: groupProfiles entry ${i + 1} (${a.group}) shows fields that entry ${j + 1} (${b.group}) holds back: people in both groups get the wider profile, since the first match wins`);
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

/** The audit lines: how the log names a person, the key, and what keeps it from working. */
async function auditLines(options, runtime, oauth) {
    const audit = options.audit ?? {};
    const subject = audit.subject ?? "off";
    const claim = options.auth?.subjectClaim ?? "sub";
    const lines = [];
    let problems = 0;
    if (subject === "off") {
        return { lines: ["Audit: off (log lines name the client, never the person)"], problems };
    }
    lines.push(subject === "hash" ? `Audit: the person is logged as a keyed hash of ${claim}` : `Audit: the person is logged by ${claim} as it is (personal data: say so where your log goes and how long it is kept)`);
    if (!oauth) {
        lines.push("  warning: audit names a person only with auth.mode oauth; a static token is logged by its name already");
    }
    if (subject === "hash") {
        if (!audit.key) {
            lines.push("  warning: no audit.key: a random key per start, so the same person gets another hash after every restart");
        } else {
            // read at start with OAuth only, where a key that cannot be read stops the start
            const readable = oauth
                ? await readSecret(audit.key, options, runtime.env).then(
                      () => null,
                      (e) => String(e?.message ?? e)
                  )
                : null;
            if (readable) {
                problems += 1;
                lines.push(`  PROBLEM: audit.key: ${readable}; the server will not start`);
            } else {
                lines.push(`  key from ${audit.key.env ? `$${audit.key.env}` : audit.key.file}`);
            }
            const shared = await secretFileWarning(audit.key, options, `the audit key's file ${audit.key.file}`);
            if (shared) {
                lines.push(`  ${shared}`);
            }
        }
    }
    return { lines, problems };
}
