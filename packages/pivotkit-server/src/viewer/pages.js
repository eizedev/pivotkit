/*
 * The viewer page's HTML (record 0021): one page for every step, in English or German by the
 * browser's Accept-Language. Its script and style are files of the server (assets.js), so its
 * Content-Security-Policy allows no inline script or style. Every text of the operator or a source
 * (branding.name, a source's title) is escaped; the page's data is a JSON block that no browser runs,
 * with "<" written as \u003c so no text closes it.
 */

import { escapeHtml } from "../downloads/pages.js";
import { BASE_HEADERS } from "../downloads/pages.js";
import { ICON_PATH } from "../branding.js";
import { newRequestId, requestId } from "../request-id.js";

/** Where the viewer's own files are served: under a name no source id takes (they start with a letter or digit). */
export const VIEWER_PATH = "/live";
export const OWN_PATH = `${VIEWER_PATH}/_`;

/**
 * The page's policy: its own files only, the rows route of its own origin, the operator's icon; no
 * inline script or style, no frames, no forms, no base.
 */
export const VIEWER_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** The page's words. `{name}` is the operator's name (branding.name). */
export const TEXTS = Object.freeze({
    en: {
        brand: "{name} report",
        signingIn: { heading: "Signing you in", text: "The report opens once you have signed in." },
        script: "This page needs JavaScript to show the report.",
        again: "Sign in again",
        reference: "Request id",
        answers: {
            NOT_FOUND: { heading: "Page not found", text: "There is no such report page. Check that the whole link was copied." },
            SIGN_IN_FAILED: { heading: "Sign-in failed", text: "The sign-in did not complete. Sign in again to open the report." },
            SIGN_IN_DENIED: { heading: "Not signed in", text: "The sign-in was cancelled or the sign-in service refused it. Sign in again to open the report." },
            SIGN_IN_STALE: { heading: "Sign-in page out of date", text: "This sign-in was already used, took too long, or was started in another browser. Sign in again to open the report." },
            SIGN_IN_TOO_MANY: { heading: "Too many sign-ins", text: "Too many sign-ins came from your network in a short time. Wait a minute, then sign in again." },
            SIGN_IN_NOT_READY: { heading: "Sign-in not ready", text: "The server is waiting for its sign-in service. Try again in a moment." },
            FORBIDDEN_HOST: { heading: "Address not served", text: "This address is not served here." },
            METHOD_NOT_ALLOWED: { heading: "Open the link in a browser", text: "This link is opened in a browser." },
            BODY_TOO_LARGE: { heading: "Request too large", text: "The request is larger than this page takes." },
            UNAVAILABLE: { heading: "Report page not available", text: "This server cannot show reports in the browser yet. Tell the operator, with the request id below." },
            INTERNAL: { heading: "The page failed", text: "Something went wrong on the server. Try again; if it keeps failing, tell the operator and give them the request id." }
        }
    },
    de: {
        brand: "{name} Bericht",
        signingIn: { heading: "Sie werden angemeldet", text: "Der Bericht öffnet sich, sobald Sie angemeldet sind." },
        script: "Diese Seite braucht JavaScript, um den Bericht zu zeigen.",
        again: "Erneut anmelden",
        reference: "Anfrage-ID",
        answers: {
            NOT_FOUND: { heading: "Seite nicht gefunden", text: "Diese Berichtsseite gibt es nicht. Prüfen Sie, ob der ganze Link kopiert wurde." },
            SIGN_IN_FAILED: { heading: "Anmeldung fehlgeschlagen", text: "Die Anmeldung wurde nicht abgeschlossen. Melden Sie sich erneut an, um den Bericht zu öffnen." },
            SIGN_IN_DENIED: { heading: "Nicht angemeldet", text: "Die Anmeldung wurde abgebrochen oder vom Anmeldedienst abgelehnt. Melden Sie sich erneut an, um den Bericht zu öffnen." },
            SIGN_IN_STALE: { heading: "Anmeldeseite veraltet", text: "Diese Anmeldung wurde schon verwendet, hat zu lange gedauert oder wurde in einem anderen Browser begonnen. Melden Sie sich erneut an, um den Bericht zu öffnen." },
            SIGN_IN_TOO_MANY: { heading: "Zu viele Anmeldungen", text: "Aus Ihrem Netz kamen in kurzer Zeit zu viele Anmeldungen. Warten Sie eine Minute und melden Sie sich dann erneut an." },
            SIGN_IN_NOT_READY: { heading: "Anmeldung noch nicht bereit", text: "Der Server wartet auf seinen Anmeldedienst. Versuchen Sie es gleich noch einmal." },
            FORBIDDEN_HOST: { heading: "Adresse nicht bedient", text: "Diese Adresse wird hier nicht bedient." },
            METHOD_NOT_ALLOWED: { heading: "Öffnen Sie den Link im Browser", text: "Dieser Link wird im Browser geöffnet." },
            BODY_TOO_LARGE: { heading: "Anfrage zu groß", text: "Die Anfrage ist größer, als diese Seite annimmt." },
            UNAVAILABLE: { heading: "Berichtsseite nicht verfügbar", text: "Dieser Server kann Berichte noch nicht im Browser zeigen. Sagen Sie es dem Betreiber, mit der Anfrage-ID unten." },
            INTERNAL: { heading: "Die Seite ist fehlgeschlagen", text: "Auf dem Server ist etwas schiefgegangen. Versuchen Sie es erneut; wenn es weiter fehlschlägt, sagen Sie es dem Betreiber und nennen Sie die Anfrage-ID." }
        }
    }
});

/** The status of each answer that is not the report. */
export const STATUSES = Object.freeze({ NOT_FOUND: 404, SIGN_IN_FAILED: 400, SIGN_IN_DENIED: 400, SIGN_IN_STALE: 400, SIGN_IN_TOO_MANY: 429, SIGN_IN_NOT_READY: 503, FORBIDDEN_HOST: 403, METHOD_NOT_ALLOWED: 405, BODY_TOO_LARGE: 413, UNAVAILABLE: 503, INTERNAL: 500 });

/** The answers that offer to sign in again. */
const SIGN_IN_AGAIN = new Set(["SIGN_IN_FAILED", "SIGN_IN_DENIED", "SIGN_IN_STALE", "SIGN_IN_TOO_MANY", "SIGN_IN_NOT_READY"]);

/**
 * The page's language: German where the browser's first language is German, else English.
 * @param {Request} request
 * @returns {"en" | "de"}
 */
export function languageOf(request) {
    const first = (request.headers.get("accept-language") ?? "").split(",")[0].trim().toLowerCase();
    return first === "de" || first.startsWith("de-") ? "de" : "en";
}

/**
 * The JSON of the page's data block: no text in it can end the block or start markup.
 * @param {unknown} data
 */
const blockJson = (data) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/**
 * A page of the viewer: its header (the operator's icon and name, the report's title where the
 * person may see it), a message or the report, and the data block the script reads.
 * @param {{ name: string, icon: unknown }} brand  branding.js's
 * @param {"en" | "de"} lang
 * @param {{ heading: string, text?: string, again?: boolean, report?: boolean, data?: Record<string, unknown>, status?: number, headers?: Record<string, string>, head?: boolean, title?: boolean }} how
 *   report: the page holds the report (the heading is its title, shown unless title is false); again: the button that signs in again; head: a HEAD's answer (no body)
 */
export function viewerPage(brand, lang, how) {
    const t = TEXTS[lang];
    const brandLine = escapeHtml(t.brand.replace("{name}", brand.name));
    const status = how.status ?? 200;
    const icon = brand.icon ? `<img class="icon" src="${ICON_PATH}" alt="" width="24" height="24">` : "";
    const reference = status >= 500 ? `<p class="ref">${escapeHtml(t.reference)}: ${escapeHtml(requestId() ?? newRequestId())}</p>` : "";
    const message = how.report
        ? `<div id="report" class="report"></div>`
        : `<section class="message"><h1>${escapeHtml(how.heading)}</h1>${how.text ? `<p>${escapeHtml(how.text)}</p>` : ""}${how.again ? `<p><button type="button" data-action="sign-in">${escapeHtml(t.again)}</button></p>` : ""}${reference}<noscript><p>${escapeHtml(t.script)}</p></noscript></section>`;
    const title = how.report && how.title !== false ? `<h1 class="title">${escapeHtml(how.heading)}</h1>` : "";
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${escapeHtml(how.heading)} - ${brandLine}</title>${brand.icon ? `<link rel="icon" type="image/png" href="${ICON_PATH}">` : ""}<link rel="stylesheet" href="${OWN_PATH}/viewer.css"><script type="module" src="${OWN_PATH}/viewer.js"></script></head><body><header class="bar"><p class="brand">${icon}<span>${brandLine}</span></p>${title}</header><main>${message}</main><script type="application/json" id="pk-live">${blockJson({ lang, ...(how.data ?? {}) })}</script></body></html>`;
    return new Response(how.head ? null : html, { status, headers: { ...BASE_HEADERS, "content-security-policy": VIEWER_CSP, "content-type": "text/html; charset=utf-8", ...(how.headers ?? {}) } });
}

/**
 * The page of an answer that is not the report.
 * @param {{ name: string, icon: unknown }} brand
 * @param {Request} request
 * @param {keyof typeof STATUSES} code
 * @param {Record<string, string>} [headers]
 * @param {Record<string, unknown>} [data]  what the script needs to sign in again (the link's address)
 */
export function answerPage(brand, request, code, headers = {}, data = {}) {
    const lang = languageOf(request);
    const { heading, text } = TEXTS[lang].answers[code];
    return viewerPage(brand, lang, { heading, text, again: SIGN_IN_AGAIN.has(code), status: STATUSES[code], headers, data: { answer: code, ...data }, head: request.method === "HEAD" });
}
