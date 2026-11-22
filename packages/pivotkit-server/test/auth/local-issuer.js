// A local OAuth issuer for the tests: OpenID Connect discovery and a key set of one RS256 key on a
// loopback port, and access tokens signed with that key. Every test that signs in with OAuth uses it,
// so the issuer's answers are written once.
import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

/** An RS256 key pair and its public key as a JWK with the key id `kid`. */
export async function signingKey(kid = "k1") {
    const key = await generateKeyPair("RS256");
    return { key, jwk: { ...(await exportJWK(key.publicKey)), kid, alg: "RS256", use: "sig" } };
}

/** The discovery document of an issuer at `issuer`, with `more` over it. */
export const metadataOf = (issuer, more = {}) => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    ...more
});

/**
 * An issuer on a free loopback port. It answers its discovery document (`metadata` over the default
 * one) and its key set. `routes` answers a path, by path, with a JSON body or a handler
 * `(req, res) => void`, also in place of those two. Both can change while a test runs. `asked` keeps the path of every request.
 * `token()` signs an access token: scope "pivotkit", client "report-bot", five minutes, the subject
 * and audience only when given.
 */
export async function localIssuer() {
    const { key, jwk } = await signingKey();
    const issuer = {
        url: "",
        key,
        jwk,
        /** @type {Record<string, unknown>} */
        metadata: {},
        /** @type {Record<string, unknown>} */
        routes: {},
        /** @type {string[]} */
        asked: [],
        /**
         * @param {{ claims?: Record<string, unknown>, header?: Record<string, unknown>, signWith?: CryptoKey | import("node:crypto").KeyObject, expires?: string | false, aud?: string, sub?: string, iss?: string }} [options]
         */
        token({ claims = {}, header = {}, signWith = key.privateKey, expires = "5m", aud, sub, iss } = {}) {
            let token = new SignJWT({ scope: "pivotkit", client_id: "report-bot", ...claims }).setProtectedHeader({ alg: "RS256", kid: "k1", ...header }).setIssuer(iss ?? /** @type {string | undefined} */ (claims.iss) ?? issuer.url).setIssuedAt();
            if (aud) token = token.setAudience(aud);
            if (sub) token = token.setSubject(sub);
            if (expires) token = token.setExpirationTime(expires);
            return token.sign(signWith);
        },
        close: () => new Promise((resolve) => server.close(resolve))
    };
    const server = createServer((req, res) => {
        const path = new URL(req.url ?? "/", issuer.url).pathname;
        issuer.asked.push(path);
        const route = issuer.routes[path] ?? (path === "/.well-known/openid-configuration" ? metadataOf(issuer.url, issuer.metadata) : path === "/jwks" ? { keys: [jwk] } : undefined);
        if (typeof route === "function") {
            route(req, res);
        } else if (route) {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(route));
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    issuer.url = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`;
    return issuer;
}
