/*
 * The download links' pages and problems: a short page for a browser, an RFC 9457 problem for a
 * program, in the operator's name (branding.js). The pages' style and script are allowed by their
 * hashes only; nothing of a request is in them.
 */

import { createHash } from "node:crypto";
import { newRequestId, requestId } from "../request-id.js";
import { problemDocument } from "../rest/problem.js";

/** How long the same browser may repeat a one-time download, and how long a sign-in may take, in seconds. */
export const REPEAT_SECONDS = 120;
export const SIGN_IN_SECONDS = 600;

/** The headers every answer of the route carries. */
export const BASE_HEADERS = Object.freeze({ "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" });

/**
 * The pages' own style and script, allowed by their hashes and nothing else. Both are the same text on
 * every page (nothing of a request in them). Colours: text, the muted text and the button's text on
 * its background reach 4.5:1 in both schemes (tests/browser/download-link.spec.js measures them); the
 * focus ring is the accent, 3:1 or more against the page. The script writes a `<time>` in the
 * browser's own zone and, after the click, says that the download started and how long it can be
 * repeated.
 */
const PAGE_STYLE = ":root{color-scheme:light dark;--fg:#1f2328;--bg:#fff;--muted:#59636e;--accent:#0969da;--on-accent:#fff}@media (prefers-color-scheme:dark){:root{--fg:#e6edf3;--bg:#0d1117;--muted:#9198a1;--accent:#4493f8;--on-accent:#0d1117}}body{font:16px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg);max-width:36rem;margin:3rem auto;padding:0 1rem;overflow-wrap:anywhere}.brand{color:var(--muted);font-size:.875rem;margin:0}h1{font-size:1.5rem;margin:.25rem 0 1rem}.file{font-weight:600;margin:0}button{font:inherit;min-height:2.75rem;padding:.5rem 1.25rem;border:0;border-radius:6px;background:var(--accent);color:var(--on-accent);cursor:pointer}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}[role=status]{min-height:1.5em}.ref{color:var(--muted);font-size:.875rem}";
const PAGE_SCRIPT = `for(const t of document.querySelectorAll('time[datetime]')){t.textContent=new Date(t.dateTime).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}document.querySelector('form')?.addEventListener('submit',()=>{document.getElementById('status').textContent='Downloaded once. You can repeat it for ${REPEAT_SECONDS / 60} minutes, in this browser.';document.getElementById('until')?.remove()});`;
const hashOf = (text) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
const PAGE_CSP = `default-src 'none'; style-src ${hashOf(PAGE_STYLE)}; script-src ${hashOf(PAGE_SCRIPT)}; form-action 'self'; frame-ancestors 'none'`;

/** How a page writes a duration of whole minutes. */
const minutesText = (seconds) => `${seconds / 60} minutes`;

/**
 * The answers of the route that are not a file: their status, the page's heading (also its title) and
 * the words of the page and the problem. An entry with `code` answers under that code with words of
 * its own (a problem's `code` is part of the contract; the words are not).
 */
export const ANSWERS = Object.freeze({
    NOT_FOUND: { status: 404, heading: "Link not found", text: "There is no such link. Check that the whole link was copied." },
    LINK_EXPIRED: { status: 410, heading: "Link expired", text: "This link has expired. Ask whoever made the report to make it again." },
    REPORT_REMOVED: { status: 410, code: "LINK_EXPIRED", heading: "Report removed", text: "The report was removed from the server before the link expired. Ask whoever made the report to make it again." },
    LINK_USED: { status: 409, heading: "Link already used", text: "This link was already used. If you downloaded the report earlier, look in the downloads of the browser you used. Otherwise ask whoever made the report to make it again." },
    LINK_NOT_YOURS: { status: 403, heading: "Signed in as someone else", text: "You are signed in as a different account than the one that asked for this report. To get it, open the download link you were sent once more and sign in with that account." },
    SIGN_IN_FAILED: { status: 400, heading: "Sign-in failed", text: "The sign-in did not complete. Open the download link you were sent once more (not this page) to try again." },
    SIGN_IN_DENIED: { status: 400, code: "SIGN_IN_FAILED", heading: "Not signed in", text: "You were not signed in. The sign-in was cancelled or the sign-in service refused it. To get the report, open the download link you were sent once more and sign in." },
    SIGN_IN_STALE: { status: 400, code: "SIGN_IN_FAILED", heading: "Sign-in page out of date", text: `This sign-in was already used, is older than ${minutesText(SIGN_IN_SECONDS)}, or was started in another browser. Open the download link you were sent once more, in this browser.` },
    SIGN_IN_TOO_MANY: { status: 429, code: "RATE_LIMITED", heading: "Too many sign-ins", text: "Too many sign-ins came from your network in a short time. Wait a minute, then open the download link you were sent once more." },
    SIGN_IN_NOT_READY: { status: 503, heading: "Sign-in not ready", text: "The server is waiting for its sign-in service. Try again in a moment." },
    FORBIDDEN_ORIGIN: { status: 403, heading: "Download not started from its page", text: "This download must be started from its own page. Open the download link once more and press Download there." },
    FORBIDDEN_HOST: { status: 403, heading: "Address not served", text: "This address is not served here." },
    METHOD_NOT_ALLOWED: { status: 405, heading: "Open the link in a browser", text: "This link is opened in a browser." },
    BODY_TOO_LARGE: { status: 413, heading: "Request too large", text: "The request is larger than a download takes." },
    INTERNAL: { status: 500, heading: "Download failed", text: "The download failed. Try again; if it keeps failing, tell the operator and give them the request id." }
});

/** What a page calls a report's file, by extension. */
export const FILE_KINDS = Object.freeze({ xlsx: "Excel workbook", html: "HTML report", csv: "CSV file", json: "JSON file", svg: "SVG image" });

/** A file's size as a page writes it: bytes, KB or MB (of 1024), one decimal below 10. */
export function sizeText(bytes) {
    if (bytes < 1024) {
        return bytes === 1 ? "1 byte" : `${bytes} bytes`;
    }
    const [value, unit] = bytes < 1024 * 1024 ? [bytes / 1024, "KB"] : [bytes / (1024 * 1024), "MB"];
    return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} ${unit}`;
}

/** A time (seconds) as a `<time>` element: UTC in the page, the browser's own zone once its script ran. */
export function timeHtml(seconds) {
    const iso = new Date(seconds * 1000).toISOString();
    return `<time datetime="${iso}">${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC</time>`;
}

/** Escapes a text for HTML. */
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A short page: a heading (also the title), its body as HTML (escaped by the caller) and, for a
 * one-time link, the button. A page of status 500 or more names the request's id, for the operator.
 * The operator's name (branding.name) heads it: "<name> report"; the operator's icon
 * (branding.icon) is its favicon, a data: image its policy then allows.
 * @param {{ name: string, icon: { src: string } | null }} brand  branding.js's
 */
export function pageOf(brand, heading, body, { status = 200, form = false, headers = {} } = {}) {
    // the request id where the operator has something to look up: a failure of the server's own
    const tail = form ? `<form method="post"><button type="submit">Download</button></form><p id="status" role="status"></p><script>${PAGE_SCRIPT}</script>` : status >= 500 ? `<p class="ref">Request id: ${escapeHtml(requestId() ?? newRequestId())}</p>` : "";
    const brandLine = `${escapeHtml(brand.name)} report`;
    const icon = brand.icon ? `<link rel="icon" type="image/png" href="${brand.icon.src}">` : "";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(heading)} - ${brandLine}</title>${icon}<style>${PAGE_STYLE}</style></head><body><main><p class="brand">${brandLine}</p><h1>${escapeHtml(heading)}</h1>${body}${tail}</main></body></html>`;
    return new Response(html, { status, headers: { ...BASE_HEADERS, "content-security-policy": brand.icon ? `${PAGE_CSP}; img-src data:` : PAGE_CSP, "content-type": "text/html; charset=utf-8", ...headers } });
}

/** Whether a request asks for JSON rather than a page (a program, not a browser). */
const wantsJson = (request) => {
    const accept = request.headers.get("accept") ?? "";
    return !accept.includes("text/html") && /application\/(problem\+)?json/.test(accept);
};

/**
 * The answer of a code: a page for a browser, a problem document for a program.
 * @param {{ name: string, docs: string | null, icon: { src: string } | null }} brand  branding.js's: the page's name and icon, the problem's documentation base
 * @param {Request} request
 * @param {keyof typeof ANSWERS} code
 * @param {Record<string, string>} [headers]
 */
export function answerOf(brand, request, code, headers = {}) {
    const { status, heading, text, code: shown = code } = /** @type {{ status: number, heading: string, text: string, code?: string }} */ (ANSWERS[code]);
    if (wantsJson(request)) {
        const body = problemDocument(shown, text, { status, docs: brand.docs, extra: { requestId: requestId() ?? newRequestId() } });
        return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, "content-type": "application/problem+json", ...headers } });
    }
    return pageOf(brand, heading, `<p>${escapeHtml(text)}</p>`, { status, headers });
}
