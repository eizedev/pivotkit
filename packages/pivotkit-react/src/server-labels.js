/*
 * The texts of a report that reads its rows from pivotkit-server (`server`): its states (loading,
 * refused, the link not shared with this account or no longer valid, a request that does not fit,
 * the sign-in ended, failed or too large, too much data, unreachable, busy) and the line for IT support. English and German. They load with the network code (server-module.js),
 * never in the first load; a host's texts for them go into the `labels` prop under `server` and are
 * merged by serverLabels(), as the import UI's are. {name} placeholders are filled by fill().
 */

import { MENU_TEXTS, fill, mergeLabels } from "./labels.js";

export const en = {
    loading: { title: "Loading the report…", text: "The report gets its data from the server. A large report takes a few seconds." },
    refused: {
        title: "No access to this data",
        text: "Your account may not see the data of this report. To get access, ask the person who shared the report, or your IT support."
    },
    // the link's access level shuts this account out (only the maker, a group)
    linkRefused: {
        title: "This link is not shared with this account",
        text: "The person who shared the link can share it with you. Or sign in with another account."
    },
    // the link's access level is not valid, no longer offered, or missing
    linkInvalid: {
        title: "This link no longer works",
        text: "The link is not complete, or it was made for another report. Ask the person who shared it for a new link."
    },
    // the page's request does not fit the source (400, 422): a parameter it does not take
    unfit: {
        title: "The link does not fit this report",
        text: "Its settings, such as a customer or a month, are not ones this report takes. Ask the person who shared it for a new link."
    },
    // getToken() failed without saying why: the page's sign-in step, not the report server
    signIn: {
        title: "The sign-in for this report did not work",
        text: "The page could not sign you in to the report server. Reload the page. If it keeps happening, tell your IT support."
    },
    // the sign-in carries more groups or details than a browser token holds
    signInLarge: {
        title: "Your sign-in carries too much for this report",
        text: "Your account has more groups or details than the report can take along. Tell your IT support, with the line below."
    },
    expired: {
        title: "Your sign-in has ended",
        text: "For your security, a sign-in only lasts a while. Reload the page to see the data again.",
        action: "Reload page"
    },
    // the rows are shown already, and reading them again failed
    expiredData: { text: "The data could not be refreshed because your sign-in has ended. The report still shows the data from {time}." },
    large: {
        title: "Too much data for one report",
        text: "This report would have more than {limit} rows, and a report shows at most {limit}. The person who shared it can send a link to less data, for example for one customer or one month.",
        // over the server's limit of values (rows times fields), which has no count of rows
        textValues: "This report would hold more values than a report shows. The person who shared it can send a link to less data, for example for one customer or one month."
    },
    unreachable: {
        title: "The report server cannot be reached",
        text: "This may be the network, or the server is away for a moment. Check your connection and try again. If it keeps happening, tell your IT support.",
        action: "Try again"
    },
    unreachableData: { text: "The data could not be refreshed because the report server cannot be reached. The report still shows the data from {time}." },
    // the server is busy with other reports (503 BUSY, 429)
    busy: {
        title: "The report server is busy",
        text: "Many reports are loading at the moment. Try again in a moment. If it keeps happening, tell your IT support.",
        // the server said how long to wait (Retry-After)
        textAfter: "Many reports are loading at the moment. Try again in {seconds} seconds. If it keeps happening, tell your IT support.",
        // the report tries again on its own once that wait has passed; {seconds} counts down
        textAuto: "Many reports are loading at the moment. Trying again in {seconds} s.",
        // what a screen reader hears of it, once: the count is not read out every second
        saidAuto: "Many reports are loading at the moment. The report tries again in {seconds} seconds."
    },
    support: "For IT support: {code}, request {id}",
    supportCode: "For IT support: {code}",
    supportNoAnswer: "For IT support: no answer from {host}",
    supportCut: "For IT support: the answer from {host} broke off"
};

/** @typedef {typeof en} ServerTexts */

/** @type {ServerTexts} */
export const de = {
    loading: { title: "Bericht wird geladen…", text: "Der Bericht holt seine Daten vom Server. Ein großer Bericht braucht ein paar Sekunden." },
    refused: {
        title: "Kein Zugriff auf diese Daten",
        text: "Dieses Konto darf die Daten dieses Berichts nicht sehen. Wer Zugriff braucht, fragt die Person, die den Bericht geteilt hat, oder den IT-Support."
    },
    linkRefused: {
        title: "Dieser Link ist nicht für dieses Konto freigegeben",
        text: "Die Person, die den Link geteilt hat, kann ihn freigeben. Oder mit einem anderen Konto anmelden."
    },
    linkInvalid: {
        title: "Dieser Link funktioniert nicht mehr",
        text: "Der Link ist unvollständig oder wurde für einen anderen Bericht erstellt. Die Person, die ihn geteilt hat, um einen neuen Link bitten."
    },
    unfit: {
        title: "Der Link passt nicht zu diesem Bericht",
        text: "Seine Einstellungen, etwa ein Kunde oder ein Monat, nimmt dieser Bericht nicht an. Die Person, die ihn geteilt hat, um einen neuen Link bitten."
    },
    signIn: {
        title: "Die Anmeldung für diesen Bericht hat nicht geklappt",
        text: "Die Seite konnte nicht beim Berichtsserver anmelden. Die Seite neu laden. Passiert es wieder, dem IT-Support Bescheid geben."
    },
    signInLarge: {
        title: "Die Anmeldung enthält zu viel für diesen Bericht",
        text: "Dieses Konto hat mehr Gruppen oder Angaben, als der Bericht mitnehmen kann. Dem IT-Support Bescheid geben, mit der Zeile unten."
    },
    expired: {
        title: "Die Anmeldung ist abgelaufen",
        text: "Aus Sicherheitsgründen gilt eine Anmeldung nur eine Weile. Die Seite neu laden, um die Daten wieder zu sehen.",
        action: "Seite neu laden"
    },
    expiredData: { text: "Die Daten konnten nicht aktualisiert werden, weil die Anmeldung abgelaufen ist. Der Bericht zeigt weiter die Daten von {time}." },
    large: {
        title: "Zu viele Daten für einen Bericht",
        text: "Dieser Bericht hätte mehr als {limit} Zeilen, ein Bericht zeigt höchstens {limit}. Die Person, die ihn geteilt hat, kann einen Link für weniger Daten schicken, etwa für einen Kunden oder einen Monat.",
        textValues: "Dieser Bericht hätte mehr Werte, als ein Bericht zeigt. Die Person, die ihn geteilt hat, kann einen Link für weniger Daten schicken, etwa für einen Kunden oder einen Monat."
    },
    unreachable: {
        title: "Der Berichtsserver ist nicht erreichbar",
        text: "Das kann am Netzwerk liegen, oder der Server ist kurz nicht da. Die Verbindung prüfen und erneut versuchen. Passiert es wieder, dem IT-Support Bescheid geben.",
        action: "Erneut versuchen"
    },
    unreachableData: { text: "Die Daten konnten nicht aktualisiert werden, weil der Berichtsserver nicht erreichbar ist. Der Bericht zeigt weiter die Daten von {time}." },
    busy: {
        title: "Der Berichtsserver ist ausgelastet",
        text: "Gerade laden viele Berichte. In einem Moment erneut versuchen. Passiert es wieder, dem IT-Support Bescheid geben.",
        textAfter: "Gerade laden viele Berichte. In {seconds} Sekunden erneut versuchen. Passiert es wieder, dem IT-Support Bescheid geben.",
        textAuto: "Gerade laden viele Berichte. Neuer Versuch in {seconds} s.",
        saidAuto: "Gerade laden viele Berichte. Der Bericht versucht es in {seconds} Sekunden erneut."
    },
    support: "Für den IT-Support: {code}, Anfrage {id}",
    supportCode: "Für den IT-Support: {code}",
    supportNoAnswer: "Für den IT-Support: keine Antwort von {host}",
    supportCut: "Für den IT-Support: die Antwort von {host} brach ab"
};

const SERVER_TEXTS = Object.freeze({ en, de });

/** @type {WeakMap<object, ServerTexts>} */
const done = new WeakMap();

/**
 * The server texts of the report's language, with the host's `labels.server` merged over them.
 * @param {import("./labels.js").UiLabels} labels
 * @returns {ServerTexts}
 */
export function serverLabels(labels) {
    const known = done.get(labels);
    if (known) {
        return known;
    }
    const base = Object.hasOwn(SERVER_TEXTS, labels.lang) ? SERVER_TEXTS[/** @type {"en" | "de"} */ (labels.lang)] : en;
    const own = /** @type {any} */ (labels)[MENU_TEXTS]?.server;
    const out = /** @type {ServerTexts} */ (mergeLabels(base, own));
    done.set(labels, out);
    return out;
}

/**
 * The words of a state: heading, sentence, button, support line. `said` is the sentence a screen
 * reader hears where it differs from the one shown (a count that changes every second).
 * @param {import("./server-rows.js").ServerFailure} failure
 * @param {ServerTexts} t
 * @param {{ locale: string, shownAt?: number | null, left?: number | null }} how  shownAt: when the rows shown were loaded (a banner); left: seconds until the automatic try (failure.retryAt)
 * @returns {{ title: string, text: string, said?: string, action: "reload" | "retry" | null, support: string | null }}
 */
export function stateWords(failure, t, how) {
    const time = how.shownAt ? new Date(how.shownAt).toLocaleTimeString(how.locale, { hour: "2-digit", minute: "2-digit" }) : null;
    const count = (n) => n.toLocaleString(how.locale);
    const support = failure.code ? (failure.requestId ? fill(t.support, { code: failure.code, id: failure.requestId }) : fill(t.supportCode, { code: failure.code })) : !failure.host ? null : failure.cut ? fill(t.supportCut, { host: failure.host }) : fill(t.supportNoAnswer, { host: failure.host });
    switch (failure.state) {
        case "refused":
            return { title: t.refused.title, text: t.refused.text, action: null, support };
        case "linkRefused":
        case "linkInvalid":
        case "unfit":
        case "signInLarge":
            return { title: t[failure.state].title, text: t[failure.state].text, action: null, support };
        case "signIn":
            return { title: t.signIn.title, text: t.signIn.text, action: "reload", support };
        case "expired":
            // only the host page can sign the person in again: reload it
            return { title: t.expired.title, text: time ? fill(t.expiredData.text, { time }) : t.expired.text, action: "reload", support: time || !failure.code ? null : support };
        case "large":
            return { title: t.large.title, text: failure.maxRows ? fill(t.large.text, { limit: count(failure.maxRows) }) : t.large.textValues, action: null, support };
        case "busy":
            return busyWords(failure, t, count, how.left, support);
        default:
            return { title: t.unreachable.title, text: time ? fill(t.unreachableData.text, { time }) : t.unreachable.text, action: "retry", support: time ? null : support };
    }
}

/**
 * The words of "busy": with the automatic try, the seconds left (shown) and the wait (said once);
 * else the server's wait, or none.
 * @param {import("./server-rows.js").ServerFailure} failure
 * @param {ServerTexts} t
 * @param {(n: number) => string} count
 * @param {number | null | undefined} left
 * @param {string | null} support
 */
function busyWords(failure, t, count, left, support) {
    const words = { title: t.busy.title, action: /** @type {const} */ ("retry"), support };
    if (failure.retryAt !== undefined && typeof left === "number") {
        return { ...words, text: fill(t.busy.textAuto, { seconds: count(left) }), said: fill(t.busy.saidAuto, { seconds: count(Math.max(1, Math.ceil(failure.retryAfter ?? left))) }) };
    }
    return { ...words, text: failure.retryAfter ? fill(t.busy.textAfter, { seconds: count(failure.retryAfter) }) : t.busy.text };
}
