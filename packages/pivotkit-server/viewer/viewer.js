// The viewer page's script (pivotkit-server's src/viewer.js, record 0021). The server writes the
// page's step into its data block (#pk-live), a JSON block no browser runs:
//
// - "start": the link was opened. The view in the fragment never reaches the server, so the tab
//   keeps it (sessionStorage) and goes to the sign-in, which comes back with the report's page.
// - "report": signed in. The browser token is in the block; it stays in memory only. The link's
//   address and view go back into the address bar, so a reload or Copy link uses the link, and the
//   report reads its rows with the token. When the report asks for another (it reads again after
//   the token expired), the page signs in again, and the report comes back with the view the person
//   had (persist-view), not the link's.
// - any other: a sign-in that failed; its button signs in again with the link this tab opened.

const STORE = "pivotkit-live:";
const SIGN_IN = "/live/_/sign-in";

/** The tab's own store: nothing breaks where the browser refuses it. */
const session = {
    get(key) {
        try {
            return sessionStorage.getItem(STORE + key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            sessionStorage.setItem(STORE + key, value);
        } catch {
            // a private window may refuse it: the link then opens without its view
        }
    }
};

/** Goes to the sign-in of a link (its path and query). */
const signIn = (to) => location.replace(`${SIGN_IN}?to=${encodeURIComponent(to)}`);

const block = document.getElementById("pk-live");
const data = block ? JSON.parse(block.textContent || "{}") : {};
// the block's token is not left in the page
block?.remove();

if (data.step === "start") {
    const link = location.pathname + location.search;
    session.set(`view:${link}`, location.hash);
    session.set("last", link);
    signIn(link);
} else if (data.step === "report") {
    history.replaceState(null, "", data.to + (session.get(`view:${data.to}`) ?? ""));
    await showReport(data);
} else {
    const again = document.querySelector('[data-action="sign-in"]');
    const last = session.get("last");
    if (again && last) {
        again.addEventListener("click", () => signIn(last));
    } else {
        again?.closest("p")?.remove();
    }
}

/**
 * The report of a live link: pivot-report with the server's rows. Its first getToken() is the
 * sign-in's answer (a token, or the refusal the report shows as its state); a later one signs in again.
 * A refused person's page names neither the source nor its parameters: the report then takes the
 * source from the link they opened, and shows the refusal.
 * @param {{ to: string, source?: string, params?: string[], lang: string, token?: unknown, problem?: unknown, failed?: boolean }} page
 */
async function showReport(page) {
    await import("./element/index.js");
    const report = document.createElement("pivot-report");
    report.setAttribute("server-url", location.origin);
    report.setAttribute("server-source", page.source ?? new URL(page.to, location.origin).pathname.split("/")[2]);
    if (page.params?.length) {
        report.setAttribute("server-params", page.params.join(","));
    }
    // Copy link: this page's address with the link's parameters and access level, the view in the fragment
    report.setAttribute("share-link", "");
    // the page's height less its header; on a phone the report grows and the page scrolls
    report.setAttribute("height", "100%");
    report.setAttribute("grow", "on");
    // the tab keeps the view shown, so a sign-in on expiry brings it back
    report.setAttribute("persist-view", "session");
    if (page.lang === "de") {
        report.setAttribute("locale", "de-DE");
    }
    let answer = { token: page.token, problem: page.problem, failed: page.failed };
    report.getToken = () => {
        const first = answer;
        answer = null;
        if (!first) {
            // a new token: sign in again; the page leaves, so no answer comes. Without the
            // link's view, the report opens with the one it keeps for this tab
            session.set(`view:${page.to}`, "");
            signIn(page.to);
            return new Promise(() => {});
        }
        if (first.token) {
            return first.token;
        }
        if (first.problem) {
            throw Object.assign(new Error("refused"), { problem: first.problem });
        }
        // the sign-in could not read this person's rights: the report says the sign-in did not work
        throw new Error("sign-in failed");
    };
    document.getElementById("report")?.append(report);
}
