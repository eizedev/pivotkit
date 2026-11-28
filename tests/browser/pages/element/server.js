// One element that reads its rows from a server (server-url, record 0020) under the strict CSP: the
// server is this origin's /pk-test-server, whose rows route server.spec.js answers. The page's
// getToken() logs what it was asked and gives a token; ?token=none gives nothing (the sign-in ended),
// ?token=once a token the first time only, ?token=link the exchange route's refusal of the link.
// ?lang=de and ?theme=dark set the report's locale and theme. Every pivot-server-state is logged in
// window.__states.
const query = new URLSearchParams(location.search);
const w = /** @type {any} */ (window);
w.__states = [];
w.__asked = [];
const report = /** @type {any} */ (document.getElementById("live"));
report.addEventListener("pivot-server-state", (e) => w.__states.push(e.detail));
if (query.get("lang") === "de") report.locale = "de-DE";
if (query.get("theme")) report.theme = query.get("theme");
report.defaultView = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };
report.getToken = async (request) => {
    w.__asked.push(request);
    const mode = query.get("token");
    if (mode === "link") {
        // the exchange route refused the link's access level
        throw Object.assign(new Error("refused"), { problem: { status: 403, code: "NOT_ALLOWED", linkAccess: true, requestId: "q3Zr8mT0aXw" } });
    }
    // "once": a token the first time, then nothing (the sign-in ended)
    const none = mode === "none" || (mode === "once" && w.__asked.length > 1);
    return none ? null : { token: "pkb.a-test-token", expiresAt: new Date(Date.now() + 300_000).toISOString() };
};
report.serverUrl = `${location.origin}/pk-test-server`;
