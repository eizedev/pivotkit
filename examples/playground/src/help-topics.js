// The playground's "How do I…?" help: the questions a visitor asks most, each with the place in the
// live report it is about, a few plain sentences in English and German and the docs page that owns
// the topic. This file is the one place for that content; help.jsx only shows it.
//
// - `targets`: CSS selectors, tried in order; the first visible element is highlighted. Only
//   data-testid, data-zone and element names, the hooks the browser tests use too, never a class:
//   tests/playground-help.test.js fails on a class, and tests/browser/playground-help.spec.js on a
//   topic whose targets find nothing in the docs embed (?data=weather) at desktop and phone width.
//   Later selectors are the fallbacks of a narrow report: the toolbar moves buttons into More, and
//   the zones fold under "Fields in the report".
// - `docs`: the page under docs/ and its heading anchor. tests/playground-help.test.js fails when
//   the page or the heading is gone. The playground turns it into a link to the docs site.
// - Texts name the report's controls as its labels do in that language (pivotkit-react's labels).

/** @typedef {{ en: string, de: string }} Text */
/** @typedef {{ id: string, question: Text, text: Text, targets: string[], docs: string }} HelpTopic */

/** The dialog's own words. */
export const HELP_LABELS = {
    en: {
        button: "How do I…?",
        title: "How do I…?",
        intro: "Pick a question. The report shows you where, and you try it yourself.",
        close: "Close",
        back: "All questions",
        showMe: "Show me",
        readMore: "Read more in the docs",
        notShown: "This part of the report is not shown right now.",
        newTab: "(opens in a new tab)"
    },
    de: {
        button: "Wie geht …?",
        title: "Wie geht …?",
        intro: "Wähle eine Frage. Der Bericht zeigt dir die Stelle, und du probierst es selbst.",
        close: "Schließen",
        back: "Alle Fragen",
        showMe: "Zeig es mir",
        readMore: "Mehr in der Doku (Englisch)",
        notShown: "Dieser Teil des Berichts ist gerade nicht zu sehen.",
        newTab: "(öffnet in einem neuen Tab)"
    }
};

/** A chip's menu button in Rows, then in Columns; on a phone the folded zones. */
const CHIP_MENU = ['[data-zone="rows"] [data-testid^="chip-menu-"]', '[data-zone="cols"] [data-testid^="chip-menu-"]', '[data-testid="zone-section"]'];
/** The field list; on a phone the Fields button that opens it. */
const FIELD_LIST = ['[data-testid="field-list"]', '[data-testid="show-fields"]'];

/** @type {HelpTopic[]} */
export const HELP_TOPICS = [
    {
        id: "example",
        question: { en: "Where is an example?", de: "Wo finde ich ein Beispiel?" },
        text: {
            en: "Each data set comes with ready reports, asked as questions. Pick one under Start, then change it: drag fields, open menus, switch to the chart.",
            de: "Jeder Datensatz hat fertige Berichte, als Fragen formuliert. Wähle einen unter Start und ändere ihn dann: Felder ziehen, Menüs öffnen, zum Diagramm wechseln."
        },
        targets: ['[data-testid="pg-preset"]'],
        docs: "learn.md#before-you-start"
    },
    {
        id: "add-field",
        question: { en: "How do I add a field?", de: "Wie füge ich ein Feld hinzu?" },
        text: {
            en: "Drag a field from the field list into Rows, Columns or Values. Or open the field's menu (the three dots) and choose where it goes.",
            de: "Ziehe ein Feld aus der Feldliste in Zeilen, Spalten oder Werte. Oder öffne das Menü des Felds (die drei Punkte) und wähle, wohin es soll."
        },
        targets: FIELD_LIST,
        docs: "use/fields.md#adding-fields"
    },
    {
        id: "filter",
        question: { en: "How do I filter?", de: "Wie filtere ich?" },
        text: {
            en: "Open the menu of a field in Rows or Columns and choose Filter. Untick the values to leave out; each change applies at once. On a small screen, open Fields in the report first.",
            de: "Öffne das Menü eines Felds in Zeilen oder Spalten und wähle Filter. Entferne die Haken bei den Werten, die wegfallen sollen; jede Änderung gilt sofort. Auf einem kleinen Bildschirm öffne zuerst Felder im Bericht."
        },
        targets: CHIP_MENU,
        docs: "use/filters.md#filter-by-values"
    },
    {
        id: "date-range",
        question: { en: "How do I show only a date range?", de: "Wie zeige ich nur einen Zeitraum?" },
        text: {
            en: "Open the menu of a date field, such as Date in the field list, and choose Filter. Quick choices such as Last 3 months or This year keep only those days.",
            de: "Öffne das Menü eines Datumsfelds, etwa Date in der Feldliste, und wähle Filter. Unter Schnellauswahl behältst du etwa nur die letzten 3 Monate oder das laufende Jahr."
        },
        targets: FIELD_LIST,
        docs: "use/filters.md#quick-choices-for-dates"
    },
    {
        id: "top-n",
        question: { en: "How do I show only the top 10?", de: "Wie zeige ich nur die obersten 10?" },
        text: {
            en: "Open the menu of a field in Rows and choose Top items. Pick Top 10 or your own count. On a small screen, open Fields in the report first.",
            de: "Öffne das Menü eines Felds in Zeilen und wähle Oberste Einträge. Wähle Top 10 oder eine eigene Anzahl. Auf einem kleinen Bildschirm öffne zuerst Felder im Bericht."
        },
        targets: CHIP_MENU,
        docs: "use/filters.md#top-n"
    },
    {
        id: "chart",
        question: { en: "How do I make a chart?", de: "Wie mache ich ein Diagramm?" },
        text: {
            en: "Switch from Table to Chart. The chart shows the same numbers; Settings next to it picks the chart type.",
            de: "Wechsle von Tabelle zu Diagramm. Das Diagramm zeigt dieselben Zahlen. Daneben wählst du unter Einstellungen die Art des Diagramms."
        },
        targets: ['[data-testid="show-chart"]'],
        docs: "use/charts.md#chart-types"
    },
    {
        id: "drill-down",
        question: { en: "Which rows are behind a number?", de: "Welche Zeilen stecken hinter einer Zahl?" },
        text: {
            en: "Click a number in the table, or move to it with the arrow keys and press Enter. A panel lists the rows behind it.",
            de: "Klicke auf eine Zahl in der Tabelle, oder gehe mit den Pfeiltasten hin und drücke Enter. Ein Bereich listet die Zeilen dahinter."
        },
        targets: ['[data-testid="pivot-table"] tbody td', '[data-testid="show-table"]'],
        docs: "use/drill-down.md#open-and-close-the-panel"
    },
    {
        id: "share",
        question: { en: "How do I save or share a view?", de: "Wie speichere oder teile ich eine Ansicht?" },
        text: {
            en: "Views → Save current view keeps it in this browser. Views → Copy link copies an address that opens the same report.",
            de: "Ansichten → Aktuelle Ansicht speichern behält sie in diesem Browser. Ansichten → Link kopieren kopiert eine Adresse, die denselben Bericht öffnet."
        },
        targets: ['[data-testid="views"]', '[data-testid="more"]'],
        docs: "use/views.md#share-a-view"
    },
    {
        id: "export",
        question: { en: "How do I export to Excel?", de: "Wie exportiere ich nach Excel?" },
        text: {
            en: "Export → Excel workbook downloads the table with its formats. The same menu has CSV, a web page, print and the chart as a picture.",
            de: "Export → Excel-Arbeitsmappe lädt die Tabelle mit ihren Formaten herunter. Im selben Menü gibt es CSV, eine Webseite, Drucken und das Diagramm als Bild."
        },
        targets: ['[data-testid="export"]', '[data-testid="more"]'],
        docs: "use/export.md#what-each-one-holds"
    },
    {
        id: "load-data",
        question: { en: "How do I use my own file?", de: "Wie nutze ich meine eigene Datei?" },
        text: {
            en: "Drop a CSV, JSON or Excel file onto the report, or choose Data → Load data…. The file is read in this browser; nothing is uploaded.",
            de: "Ziehe eine CSV-, JSON- oder Excel-Datei auf den Bericht, oder wähle Daten → Daten laden…. Die Datei wird in diesem Browser gelesen, nichts wird hochgeladen."
        },
        targets: ['[data-testid="data"]', '[data-testid="more"]'],
        docs: "use/load-data.md#load-a-file"
    }
];

/**
 * The address of a docs page (`use/filters.md#top-n`) as seen from the playground. On the docs site
 * the playground is its folder playground/, so the link is relative and works on any copy of the
 * site (a preview too); served on its own (npm run playground), it points at the published site.
 * @param {string} docs the page under docs/ with its anchor
 * @param {URL} here the playground's address
 * @param {string} site the docs site's address, without a trailing slash
 */
export function docsHref(docs, here, site) {
    const [page, anchor] = docs.split("#");
    const path = `${page.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "/")}${anchor ? `#${anchor}` : ""}`;
    return /\/playground\/$/.test(here.pathname) ? new URL(`../${path}`, here).href : `${site}/${path}`;
}
