/*
 * check-config's section for the server's address and who may call it: the HTTP address (or stdio),
 * the auth mode, each static token and where it comes from (a file by its full path, never a value),
 * the OAuth issuer and resource, how a signed-in person gets a profile (check/operator.js
 * signInItems), client and scope profiles and the tools' scopes.
 *
 *   HTTP: 127.0.0.1:3333
 *
 *   Auth: oauth
 *     issuer https://auth.example.com/application/o/pivotkit/
 *     resource https://reports.example.com/mcp
 *     profile by group (claim groups; first match wins, a client's profile comes first):
 *       finance -> finance, staff -> staff
 *     otherwise: profile staff
 *
 * With `runtime.discover` (the runners pass auth.js discover) the issuer's metadata is loaded once,
 * with a short time limit: a WARNING when it cannot be, since the server starts and loads it in the
 * background. Nothing secret is sent. check/index.js says what a section returns.
 */

import { readFile } from "node:fs/promises";
import { pathOf } from "../config.js";
import { TOKEN_MIN, TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT } from "../auth.js";
import { isLoopback } from "../listen.js";
import { secretFileWarning } from "../secrets.js";
import { personBound } from "../sources/auth.js";
import { settingsOf as downloadSettingsOf } from "../options/downloads.js";
import { issuerRulesOf } from "../issuer.js";
import { signInItems } from "./operator.js";
import { fileText, heading, plain, problem, warning } from "./format.js";

/** How long check-config waits for an issuer's metadata. */
export const ISSUER_MS = 3000;

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const items = [...transport(options, runtime)];
    const auth = options.auth ?? {};
    const mode = auth.mode ?? "none";
    const stop = { stops: /** @type {const} */ (true) };
    items.push(heading(`Auth: ${mode}${mode === "none" && auth.allowUnauthenticated ? " (also off loopback)" : ""}`));
    if (runtime.http && mode === "none" && !auth.allowUnauthenticated && !isLoopback(options.http?.host ?? "127.0.0.1")) {
        items.push(problem(`${options.http?.host} is not loopback: it needs auth token or oauth (or auth.allowUnauthenticated)`, stop));
    }
    if (mode === "token") {
        for (const t of auth.tokens?.length ? auth.tokens : [{ name: "token", env: runtime.tokenEnv }]) {
            items.push(plain(`token ${t.name} from ${t.env ? `$${t.env}` : `the file ${fileText(options, t.file)}`}: ${t.scopes ? `scopes ${t.scopes.join(" ") || "none"}` : "all scopes"}${t.profile ? `, profile ${t.profile}` : ""}`));
            const readable = await secretFileWarning(t, options, `the token ${t.name}'s file ${t.file}`);
            if (readable) {
                items.push(warning(readable.replace(/^warning: /, "")));
            }
            if (runtime.http) {
                const why = await tokenProblem(t, runtime.env, options);
                if (why) {
                    items.push(problem(`the token ${t.name} ${why}`, stop));
                }
            }
        }
    }
    if (mode === "oauth") {
        items.push(plain(`issuer ${auth.issuer}`), plain(`resource ${auth.resource}`));
        const audience = auth.audience ?? [auth.resource];
        if (audience.join(" ") !== auth.resource) {
            items.push(plain(`audience ${audience.join(" ")}`));
        }
        if (auth.requiredScopes?.length) {
            items.push(plain(`required scopes: ${auth.requiredScopes.join(" ")}`));
        }
        if (String(auth.issuer).startsWith("http:") && !auth.allowInsecureIssuer) {
            items.push(problem("auth.issuer must be https:// (auth.allowInsecureIssuer is for tests only)", stop));
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
    items.push(...(await issuerItems(options, runtime)));
    return { items, upgrade: [] };
}

/** The address the server listens on, or what stdio cannot offer. */
function transport(options, runtime) {
    const address = `${options.http?.host ?? "127.0.0.1"}:${options.http?.port ?? 3333}`;
    if (runtime.http) {
        return [heading(`HTTP: ${address}`), ...(options.http?.page === false ? [plain("quick-start page: off")] : [])];
    }
    const bound = Object.entries(options.sources ?? {}).filter(([, s]) => personBound(options, s)).map(([id]) => id);
    return [
        heading(`Transport: stdio (with --http: ${address})`),
        plain("no download links: a report is a file in output.dir"),
        plain(bound.length ? `no signed-in person: ${bound.join(", ")} cannot be used (they need one)` : "no signed-in person: every caller gets the sources' own policy")
    ];
}

/**
 * A WARNING per issuer whose metadata cannot be loaded now (the sign-in for MCP and REST, and the
 * download links' own): the server starts anyway and keeps trying.
 */
async function issuerItems(options, runtime) {
    if (typeof runtime.discover !== "function") {
        return [];
    }
    const issuers = new Map();
    if (options.auth?.mode === "oauth" && options.auth.issuer) {
        // download links (signed in) use the same issuer (options/downloads.js)
        const links = runtime.http && downloadSettingsOf(options).signIn ? "; download links (signed in) answer 503 too" : "";
        issuers.set(options.auth.issuer, ["auth.issuer", `callers get 503 until it loads${links}`]);
    }
    const out = [];
    for (const [issuer, [key, until]] of issuers) {
        // one wait for both of discover's tries; the race is a backstop for a discover that ignores it
        const signal = AbortSignal.timeout(ISSUER_MS);
        const late = `no answer within ${ISSUER_MS / 1000} s`;
        const why = await Promise.race([
            Promise.resolve()
                .then(() => runtime.discover(issuer, issuerRulesOf(options), { signal }))
                .then(
                    () => null,
                    // discover tries two addresses: a reason said twice is said once
                    (e) => (signal.aborted ? late : [...new Set(String(e?.message ?? e).split("; "))].join("; ").slice(0, 200))
                ),
            new Promise((resolve) => setTimeout(() => resolve(late), ISSUER_MS + 100).unref())
        ]);
        if (why) {
            out.push(warning(`${key}: the metadata of ${issuer} cannot be loaded from here (${why}); the server starts and keeps trying; ${until}`));
        }
    }
    return out;
}

/** Why a static token would keep the server from starting, or null. */
async function tokenProblem(token, env, options) {
    if (token.env) {
        const value = env[token.env] ?? "";
        return value.length < TOKEN_MIN ? `($${token.env}) is not set or shorter than ${TOKEN_MIN} characters` : TOKEN_SYNTAX.test(value) ? null : `($${token.env}) ${TOKEN_SYNTAX_TEXT}`;
    }
    try {
        const value = (await readFile(pathOf(options, token.file), "utf8")).trim();
        return value.length < TOKEN_MIN ? `(${token.file}) is shorter than ${TOKEN_MIN} characters` : TOKEN_SYNTAX.test(value) ? null : `(${token.file}) ${TOKEN_SYNTAX_TEXT}`;
    } catch (e) {
        return `(${token.file}) cannot be read: ${e?.code === "ENOENT" ? "no such file" : e?.code === "EACCES" ? `permission denied for the user ${process.getuid?.() ?? ""} the server runs as` : "unreadable"}`;
    }
}
