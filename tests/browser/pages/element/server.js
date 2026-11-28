// One element that reads its rows from a server (server-url, record 0020) under the strict CSP: the
// server is this origin's /pk-test-server, whose rows route server.spec.js answers. The page's
// getToken() logs what it was asked and gives a token; ?token=none gives nothing (the sign-in ended),
// ?token=once a token the first time only, ?token=link and ?token=invalid the exchange route's
// refusal of the link's level (shut out, or not valid), ?token=large its refusal of a sign-in too
// large for a token, ?token=fail a getToken() that fails without saying why.
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
/** The exchange route's refusals by ?token= */
const REFUSALS = {
    link: { status: 403, code: "NOT_ALLOWED", linkAccess: "refused" },
    invalid: { status: 403, code: "NOT_ALLOWED", linkAccess: "invalid" },
    large: { status: 413, code: "LIMIT_EXCEEDED", limit: "token" }
};
report.getToken = async (request) => {
    w.__asked.push(request);
    const mode = query.get("token");
    const refusal = REFUSALS[mode ?? ""];
    if (refusal) {
        throw Object.assign(new Error("refused"), { problem: { ...refusal, requestId: "q3Zr8mT0aXw" } });
    }
    if (mode === "fail") {
        throw new TypeError("Failed to fetch");
    }
    // "once": a token the first time, then nothing (the sign-in ended)
    const none = mode === "none" || (mode === "once" && w.__asked.length > 1);
    return none ? null : { token: "pkb.a-test-token", expiresAt: new Date(Date.now() + 300_000).toISOString() };
};
report.serverUrl = `${location.origin}/pk-test-server`;
