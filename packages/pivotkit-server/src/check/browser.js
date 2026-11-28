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
 *
 * A PROBLEM for a key that cannot be used: no browser token is made then. A WARNING for a random key
 * (tokens and levels end on a restart and differ between replicas), for rest.browser while no profile
 * reads rows, for a source whose backend exchanges the person's token: the browser path refuses it, and
 * for signedIn beside me or group: a link without its level then opens for every signed-in person.
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

/** @type {import("./index.js").Section} */
export async function section(options, _registry, runtime) {
    const written = /** @type {any} */ (options.rest)?.browser;
    if (!browserPathUsed(options)) {
        return { items: written ? [heading("Browser path (REST): off", "Browser path"), warning("rest.browser is set, but no profile reads rows (policy.profiles.<name>.records): nobody gets a browser token")] : [], upgrade: [] };
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
    return { items, upgrade: [] };
}
