/*
 * Export of the report from its Export menu: the work is in export-run.js, which loads with the menus
 * (menus.js), so the first load of a page stays small; the menus are there before a menu opens.
 *
 * A copy must reach the clipboard inside the click: Safari refuses a write after an await. So when the
 * menus and the export module are loaded (the Export menu and the drill-down start loading the export
 * when they open), the whole way from the click to navigator.clipboard.writeText runs without an
 * await. Only when a module is still loading is there a wait first; if the browser then refuses the
 * copy, the note says so ("This page does not allow copying. Download a file instead.").
 */

import { loadMenus, menusNow } from "./lazy-menus.jsx";
import { fill, messageOf } from "./labels.js";

/**
 * @param {import("./export-run.js").ExportContext} context
 * @returns {(kind: "xlsx" | "csv" | "png" | "html" | "svg" | "print" | "copy-table" | "copy-json" | "data-csv" | "data-json") => Promise<void>}
 */
export function useExport(context) {
    return async (kind) => {
        try {
            // loaded: no await before the copy (see above)
            // with the menus' texts of the report's language: the notes of a copy say it in that language
            const lang = context.labels.lang;
            const menus = menusNow(lang) ?? (await loadMenus(lang));
            await menus.runExport(kind, context);
        } catch (e) {
            // the menus could not load (runExport says itself what went wrong in an export)
            context.announce(fill(context.labels.toastExportFailed, { message: messageOf(e) }), { tone: "error" });
        }
    };
}

/** Starts loading the export module when a menu that copies opens: a copy right in the click is allowed everywhere. */
export const prepareExporters = () => void loadMenus().then((m) => m.prepareExporters(), () => undefined);
