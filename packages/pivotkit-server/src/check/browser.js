/*
 * check-config's section for the browser path (browser.js, records 0020 and 0021), once a profile
 * reads rows (records): the exchange route, how long a browser token lives, the
 * pages that may read rows with one, the access levels live links may carry, and the key.
 *
 *   Browser path (REST): POST /api/v1/sources/records/token
 *     browser tokens live 5 minutes, never longer than the person's own token
 *     pages that read rows with one: https://intranet.example.com (rest.browser.origins)
 *     access levels of live links: signedIn (rest.browser.levels)
 *     key from the file secrets/browser.key
 *     viewer page: https://reports.example.com/live/<source> (rest.browser.viewer)
 *       register https://reports.example.com/live/_/callback at the provider for the client pivotkit-web
 *       the sign-in asks for openid pivotkit: its access token must be one the REST service accepts
 *
 * A PROBLEM for a key that cannot be used: no browser token is made then. A WARNING for a random key
 * (tokens and levels end on a restart and differ between replicas), for rest.browser while no profile
 * reads rows, for a source whose backend exchanges the person's token: the browser path refuses it, and
 * for signedIn beside me or group: a link without its level then opens for every signed-in person,
 * for a viewer page without pivotkit-element installed next to the server (it answers 503) or with
 * one older than pivotkit-server needs, for a viewer page that is not served (http.enable without
 * rest), for a sign-in that does not ask for the REST service's required scopes, and for a source's
 * link to the viewer page while it is off.
 *
 * check/index.js says what a section returns.
 */

import { BROWSER_TOKEN_PATH } from "../rest/routes.js";
import { browserPathUsed, browserSettingsOf } from "../options/browser.js";
import { keyProblem } from "../secret-rules.js";
import { makeKey } from "../auth.js";
import { madeAtStart, readSecret, secretFileWarning } from "../secrets.js";
import { exchangesToken } from "../sources/auth.js";
import { heading, idsText, plain, problem, secretText, warning } from "./format.js";
import { publicOriginOf } from "../config.js";
import { settingsOf } from "../options/downloads.js";
import { VIEWER_PATH, VIEWER_CALLBACK_PATH } from "../viewer.js";
import { elementProblem, viewerAssets } from "../viewer/assets.js";
import { requiredScopesOf } from "../scopes.js";

/**
 * The sources whose link is an address of the viewer page.
 * @param {any} options
 */
function viewerLinks(options) {
    return Object.entries(options.sources ?? {})
        .filter(([, s]) => {
            try {
                return typeof s.link === "string" && new URL(s.link).pathname.startsWith(`${VIEWER_PATH}/`);
            } catch {
                return false;
            }
        })
        .map(([id]) => id);
}

/**
 * The warning for links to a viewer page that is off, or null.
 * @param {any} options
 */
function strayLinks(options) {
    const ids = browserSettingsOf(options).viewer ? [] : viewerLinks(options);
    return ids.length ? warning(`the link of ${idsText(ids)} is an address of the viewer page (${VIEWER_PATH}/<source>), but rest.browser.viewer is off: the link answers 404; set rest.browser.viewer to true or give the source another link`) : null;
}

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const written = /** @type {any} */ (options.rest)?.browser;
    const stray = strayLinks(options);
    if (!browserPathUsed(options)) {
        const said = [...(written ? [warning("rest.browser is set, but no profile reads rows (policy.profiles.<name>.records): nobody gets a browser token")] : []), ...(stray ? [stray] : [])];
        return { items: said.length ? [heading("Browser path (REST): off", "Browser path"), ...said] : [], upgrade: [] };
    }
    const settings = browserSettingsOf(options);
    const items = [heading(`Browser path (REST): POST /api/v1${BROWSER_TOKEN_PATH}`, "Browser path")];
    items.push(plain(`browser tokens live ${settings.minutes} minute${settings.minutes === 1 ? "" : "s"}, never longer than the person's own token`));
    items.push(plain(settings.origins.length ? `pages that read rows with one: ${settings.origins.join(", ")} (rest.browser.origins), and the server's own` : "pages that read rows with one: only the server's own (rest.browser.origins lists others)"));
    items.push(plain(`access levels of live links: ${settings.levels.join(", ")} (rest.browser.levels)`));
    if (settings.levels.includes("signedIn") && settings.levels.length > 1) {
        items.push(warning("rest.browser.levels offers signedIn beside me or group: a live link without its pk-access opens for every person who signs in, so me and group are advisory; each person still reads only the rows their own rights allow"));
    }
    const unusable = { effect: "the server starts; nobody gets a browser token until it can be read" };
    if (settings.key) {
        items.push(plain(`key from ${secretText(options, settings.key)}`));
        // a key made at start is said under Credentials
        if (!(await madeAtStart(settings.key, options))) {
            try {
                const why = keyProblem("browser")(await readSecret(settings.key, options, runtime.env));
                if (why) {
                    items.push(problem(`rest.browser.key is ${why}; make one with: ${makeKey("browser")}`, unusable));
                }
            } catch (e) {
                items.push(problem(`rest.browser.key: ${String(/** @type {any} */ (e)?.message ?? e)}`, unusable));
            }
        }
        const readable = await secretFileWarning(settings.key, options, `the file ${settings.key.file} of rest.browser.key`);
        if (readable) {
            items.push(warning(readable));
        }
    } else {
        items.push(warning(`rest.browser.key is not set: browser tokens${settings.levels.some((l) => l !== "signedIn") ? " and the access levels of live links" : ""} stop working on a restart and on another replica; make one with: ${makeKey("browser")}`));
    }
    const exchanging = Object.entries(options.sources ?? {})
        .filter(([, s]) => exchangesToken(options, s))
        .map(([id]) => id);
    if (exchanging.length) {
        items.push(warning(`the browser path refuses ${idsText(exchanging)}: its backend exchanges the person's own token, which a browser token never carries; its rows come through the host application's backend`));
    }
    if (settings.viewer) {
        items.push(...(await viewerItems(options, runtime)));
    }
    if (stray) {
        items.push(stray);
    }
    return { items, upgrade: [] };
}

/**
 * The viewer page's lines: where it is, what to register at the provider, what its sign-in asks for,
 * and whether it is served and pivotkit-element is installed next to the server in a version it takes.
 * @param {any} options
 * @param {{ rest?: boolean }} runtime  rest: the REST service is served (http.enable)
 */
async function viewerItems(options, runtime) {
    const host = options.http?.host ?? "127.0.0.1";
    const base = publicOriginOf(options) ?? `http://${host.includes(":") ? `[${host}]` : host}:${options.http?.port ?? 3333}`;
    const signIn = /** @type {NonNullable<ReturnType<typeof settingsOf>["signIn"]>} */ (settingsOf(options).signIn);
    const items = [
        plain(`viewer page: ${base}${VIEWER_PATH}/<source> (rest.browser.viewer); a source's link opens it when it is that address`),
        plain(`register ${base}${VIEWER_CALLBACK_PATH} at the provider for the client ${signIn.clientId}`, 2),
        plain(`the sign-in asks for ${signIn.scopes.join(" ")} (output.downloads.signIn.scopes): its access token must be one the REST service accepts: its aud in rest.audience, with rest.requiredScopes`, 2)
    ];
    if (!runtime.rest) {
        items.push(warning("the viewer page is part of the REST service, which this server does not serve (http.enable): its links answer 404 until http.enable includes rest"));
    }
    const missing = requiredScopesOf(options, "rest").filter((s) => !signIn.scopes.includes(s));
    if (missing.length) {
        items.push(warning(`output.downloads.signIn.scopes does not ask for ${missing.join(" ")} (rest.requiredScopes): the REST service refuses the sign-in's access token, so every person gets "no access" on the viewer page`));
    }
    const tooOld = elementProblem();
    if (!(await viewerAssets()).ready) {
        items.push(warning("the viewer page needs pivotkit-element installed next to pivotkit-server (npm install pivotkit-element): until then it answers 503"));
    } else if (tooOld) {
        items.push(warning(tooOld));
    }
    return items;
}
