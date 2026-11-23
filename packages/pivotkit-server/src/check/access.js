/*
 * check-config's section for the server's address and who may call it: the HTTP address (or stdio)
 * with the bound on connections per address, the auth mode, each static token and where it comes from (a file by its full path, never a value),
 * the OAuth issuer and resource, how a signed-in person gets a profile (check/operator.js
 * signInItems), client and scope profiles and the tools' scopes.
 *
 *   HTTP: 127.0.0.1:3333
 *     connections per address: at most 32 (the default; clients reach the server directly)
 *
 *   Auth: oauth
 *     issuer https://auth.example.com/application/o/pivotkit/
 *     resource https://reports.example.com/mcp
 *     profile by group (claim groups; first match wins, a client's profile comes first):
 *       finance -> finance, staff -> staff
 *     otherwise: profile staff
 *
 * Whether the issuer can be reached is said under Issuer requests (check/issuer.js). check/index.js
 * says what a section returns.
 */

import { pathOf, restResourceOf } from "../config.js";
import { TOKEN_MIN, TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT, inertTokensText, tokenGuessable } from "../auth.js";
import { connectionLimitsOf, isLoopback } from "../listen.js";
import { UTF16_TEXT, madeAtStart, readSecretFile, secretFileWarning, secretValue, unreadable } from "../secrets.js";
import { personBound } from "../sources/auth.js";
import { noTokenText } from "../state.js";
import { expiryOf } from "../signed-tokens.js";
import { signInItems } from "./operator.js";
import { heading, plain, problem, secretText, warning } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const items = [...transport(options, runtime)];
    const auth = options.auth ?? {};
    const mode = auth.mode ?? "none";
    const stop = { stops: /** @type {const} */ (true) };
    items.push(heading(`Auth: ${mode}${mode === "none" && auth.allowUnauthenticated ? " (also off loopback)" : ""}`));
    // over HTTP only: a stdio server has no sign-in to check them in
    const inert = runtime.http ? inertTokensText(options) : null;
    if (inert) {
        items.push(warning(inert));
    }
    if (runtime.unusedToken) {
        // the start's own words (state.js unusedTokenText)
        items.push(warning(runtime.unusedToken));
    }
    if (runtime.http && mode === "none" && !auth.allowUnauthenticated && !isLoopback(options.http?.host ?? "127.0.0.1")) {
        items.push(problem(`${options.http?.host} is not loopback: it needs auth token or oauth (or auth.allowUnauthenticated)`, stop));
    }
    if (mode === "token" && runtime.http && !auth.tokens?.length && !runtime.env[runtime.tokenEnv]) {
        // the start's own words (state.js prepareHttpServe, auth.js): no "the token token"
        items.push(problem(noTokenText(runtime.tokenEnv, runtime.state?.stateDir), stop));
    } else if (mode === "token") {
        for (const t of auth.tokens?.length ? auth.tokens : [{ name: "token", env: runtime.tokenEnv }]) {
            items.push(plain(`token ${t.name} from ${secretText(options, t)}: ${t.scopes ? `scopes ${t.scopes.join(" ") || "none"}` : "all scopes"}${t.profile ? `, profile ${t.profile}` : ""}`));
            const expiry = expiryWarning(t);
            if (expiry) {
                items.push(warning(expiry));
            }
            const readable = await secretFileWarning(t, options, `the token ${t.name}'s file ${t.file}`);
            if (readable) {
                items.push(warning(readable));
            }
            // a token made at start is said under Credentials
            if (runtime.http && !(await madeAtStart(t, options))) {
                const why = await tokenProblem(t, runtime.env, options);
                if (why) {
                    items.push(problem(`the token ${t.name} ${why}`, stop));
                }
            }
        }
    }
    if (mode === "oauth") {
        items.push(plain(`issuer ${auth.issuer}`), plain(`resource ${auth.resource}`));
        // each endpoint checks its own audience (REST: rest/sign-in.js): both, where REST is served too
        const audience = (auth.audience ?? [auth.resource]).join(" ");
        const restAudience = runtime.rest ? (options.rest?.audience?.length ? options.rest.audience : [restResourceOf(options)]).join(" ") : null;
        if (restAudience !== null && restAudience !== audience) {
            items.push(plain(`MCP audience: ${audience}`), plain(`REST audience: ${restAudience}`));
        } else if (audience !== auth.resource) {
            items.push(plain(`audience: ${audience}`));
        }
        items.push(plain(`required scopes: ${auth.requiredScopes?.length ? auth.requiredScopes.join(" ") : "none (any token for this audience)"}`));
        // the start's own test (auth.js createAuthCore): the scheme as a URL reads it, in any case
        if (URL.canParse(String(auth.issuer)) && new URL(String(auth.issuer)).protocol !== "https:" && !auth.allowInsecureIssuer) {
            items.push(problem("auth.issuer: must be an https:// address (auth.allowInsecureIssuer is for tests only)", stop));
        }
    }
    for (const [kind, map] of /** @type {Array<[string, Record<string, string> | undefined]>} */ ([["client", auth.clientProfiles], ["scope", auth.scopeProfiles]])) {
        for (const [key, profile] of Object.entries(map ?? {})) {
            items.push(plain(`${kind} ${key}: profile ${profile}`));
        }
    }
    items.push(...(await signInItems(options, runtime)));
    if (auth.toolScopes) {
        items.push(plain(`tool scopes: ${Object.entries(auth.toolScopes).map(([t, s]) => `${t} ${s.join(" ")}`).join("; ")}`));
    }
    // a token's scope that no source, tool or required list names is probably a typo
    const known = new Set([...(auth.requiredScopes ?? []), ...Object.values(auth.toolScopes ?? {}).flat(), ...Object.values(options.sources ?? {}).flatMap((s) => s.scopes ?? []), ...(options.files?.scopes ?? [])]);
    for (const t of auth.tokens ?? []) {
        for (const s of t.scopes ?? []) {
            if (!known.has(s)) {
                items.push(warning(`the token ${t.name}'s scope "${s}" is named by no source, tool or required scope`));
            }
        }
    }
    return { items, upgrade: [] };
}

/**
 * Which bound per address applies (listen.js connectionLimitsOf): the operator's number or 0, else
 * the default with or without http.trustProxy. It counts the socket's peer, a trusted proxy too, and
 * never loopback.
 */
function perAddressItems(options) {
    const { perAddress } = connectionLimitsOf(options);
    const written = options.http?.maxConnectionsPerAddress !== undefined;
    const trustProxy = options.http?.trustProxy === true;
    if (written) {
        return perAddress === 0
            ? [plain("connections per address: no bound (http.maxConnectionsPerAddress is 0)")]
            : [plain(`connections per address: at most ${perAddress} (http.maxConnectionsPerAddress)`), ...(trustProxy ? [plain(`it counts the proxy's address, so all clients behind it share these ${perAddress}`, 2)] : [])];
    }
    return trustProxy
        ? [plain("connections per address: no bound (the default with http.trustProxy; the proxy limits its clients)")]
        : [
              plain(`connections per address: at most ${perAddress} (the default; clients reach the server directly)`),
              // loopback clients are not bounded per address: the hint matters only off loopback
              ...(isLoopback(options.http?.host ?? "127.0.0.1") ? [] : [plain("behind NAT or a proxy, clients share one address: raise http.maxConnectionsPerAddress, or set http.trustProxy behind a proxy", 2)])
          ];
}

/** The address the server listens on, or what stdio cannot offer. */
function transport(options, runtime) {
    const address = `${options.http?.host ?? "127.0.0.1"}:${options.http?.port ?? 3333}`;
    if (runtime.http) {
        return [heading(`HTTP: ${address}`), ...(options.http?.page === false ? [plain("quick-start page: off")] : []), ...perAddressItems(options)];
    }
    const bound = Object.entries(options.sources ?? {}).filter(([, s]) => personBound(options, s)).map(([id]) => id);
    return [
        heading(`Transport: stdio (with --http: ${address})`),
        plain("no download links: a report is a file in output.dir"),
        plain(bound.length ? `no signed-in person: ${bound.join(", ")} cannot be used (they need one)` : "no signed-in person: every caller gets the sources' own policy")
    ];
}

/** How soon check-config warns of a static token's expiry: a week ahead. */
const EXPIRY_WARN_MS = 7 * 86_400_000;

/** The warning for a static token that expires within a week or has expired, or null. */
function expiryWarning(token) {
    const at = token.expires ? expiryOf(token.expires, { durations: false }) : null;
    if (at === null || at - Date.now() > EXPIRY_WARN_MS) {
        return null;
    }
    const day = new Date(at).toISOString().slice(0, 10);
    return at <= Date.now() ? `the token ${token.name} expired on ${day}: requests with it get 401; remove it (pivotkit-server token remove ${token.name}) or give it a later expires` : `the token ${token.name} expires on ${day}: requests with it get 401 from then on; give it a later expires or make a new token`;
}

/** Why a token is too easy to guess, named by where it comes from, or null (auth.js tokenGuessable). */
const guessableText = (where, value) => {
    const why = tokenGuessable(value);
    return why ? `(${where}) is ${why}` : null;
};

/** Why a static token would keep the server from starting, or null. */
async function tokenProblem(token, env, options) {
    if (token.env) {
        const value = env[token.env] ?? "";
        return value.length < TOKEN_MIN ? `($${token.env}) is not set or shorter than ${TOKEN_MIN} characters` : !TOKEN_SYNTAX.test(value) ? `($${token.env}) ${TOKEN_SYNTAX_TEXT}` : guessableText(`$${token.env}`, value);
    }
    try {
        const value = secretValue(await readSecretFile(pathOf(options, token.file)), "token");
        return value.length < TOKEN_MIN ? `(${token.file}) is shorter than ${TOKEN_MIN} characters` : !TOKEN_SYNTAX.test(value) ? `(${token.file}) ${TOKEN_SYNTAX_TEXT}` : guessableText(token.file, value);
    } catch (e) {
        return e?.code === "UTF16" ? `(${token.file}) ${UTF16_TEXT}` : `(${token.file}) cannot be read: ${unreadable(e?.code)}`;
    }
}
