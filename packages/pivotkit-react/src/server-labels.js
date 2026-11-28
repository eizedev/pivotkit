/*
 * The texts of a report that reads its rows from pivotkit-server (`server`): its states (loading,
 * refused, the link not shared with this account, the sign-in ended, too large, unreachable) and the
 * line for IT support. English and German. They load with the network code (server-module.js),
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
        text: "Many reports are loading at the moment. Try again in a moment. If it keeps happening, tell your IT support."
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
        text: "Dieses Konto darf die Daten dieses Berichts nicht sehen. Wer Zugriff braucht, fragt die Person, die den Bericht geteilt hat, oder den IT‑Support."
    },
    linkRefused: {
        title: "Dieser Link ist nicht für dieses Konto freigegeben",
        text: "Die Person, die den Link geteilt hat, kann ihn freigeben. Oder mit einem anderen Konto anmelden."
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
        text: "Das kann am Netzwerk liegen, oder der Server ist kurz nicht da. Die Verbindung prüfen und erneut versuchen. Passiert es wieder, dem IT‑Support Bescheid geben.",
        action: "Erneut versuchen"
    },
    unreachableData: { text: "Die Daten konnten nicht aktualisiert werden, weil der Berichtsserver nicht erreichbar ist. Der Bericht zeigt weiter die Daten von {time}." },
    busy: {
        title: "Der Berichtsserver ist ausgelastet",
        text: "Gerade laden viele Berichte. In einem Moment erneut versuchen. Passiert es wieder, dem IT‑Support Bescheid geben."
    },
    support: "Für den IT‑Support: {code}, Anfrage {id}",
    supportCode: "Für den IT‑Support: {code}",
    supportNoAnswer: "Für den IT‑Support: keine Antwort von {host}",
    supportCut: "Für den IT‑Support: die Antwort von {host} brach ab"
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
 * The words of a state: heading, sentence, button, support line.
 * @param {import("./server-rows.js").ServerFailure} failure
 * @param {ServerTexts} t
 * @param {{ locale: string, shownAt?: number | null }} how  shownAt: when the rows shown were loaded (a banner)
 * @returns {{ title: string, text: string, action: "reload" | "retry" | null, support: string | null }}
 */
export function stateWords(failure, t, how) {
    const time = how.shownAt ? new Date(how.shownAt).toLocaleTimeString(how.locale, { hour: "2-digit", minute: "2-digit" }) : null;
    const count = (n) => n.toLocaleString(how.locale);
    const support = failure.code ? (failure.requestId ? fill(t.support, { code: failure.code, id: failure.requestId }) : fill(t.supportCode, { code: failure.code })) : !failure.host ? null : failure.cut ? fill(t.supportCut, { host: failure.host }) : fill(t.supportNoAnswer, { host: failure.host });
    switch (failure.state) {
        case "refused":
            return { title: t.refused.title, text: t.refused.text, action: null, support };
        case "linkRefused":
            return { title: t.linkRefused.title, text: t.linkRefused.text, action: null, support };
        case "expired":
            // only the host page can sign the person in again: reload it
            return { title: t.expired.title, text: time ? fill(t.expiredData.text, { time }) : t.expired.text, action: "reload", support: time || !failure.code ? null : support };
        case "large":
            return { title: t.large.title, text: failure.maxRows ? fill(t.large.text, { limit: count(failure.maxRows) }) : t.large.textValues, action: null, support };
        case "busy":
            return { title: t.busy.title, text: t.busy.text, action: "retry", support };
        default:
            return { title: t.unreachable.title, text: time ? fill(t.unreachableData.text, { time }) : t.unreachable.text, action: "retry", support: time ? null : support };
    }
}

