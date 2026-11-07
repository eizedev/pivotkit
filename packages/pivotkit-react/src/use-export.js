/*
 * Export of the report from its Export menu: the work is in export-run.js, which loads with the menus
 * (menus.js), so the first load of a page stays small; the menus are there before a menu opens.
 */

import { loadMenus } from "./lazy-menus.jsx";
import { fill, messageOf } from "./labels.js";

/**
 * @param {import("./export-run.js").ExportContext} context
 * @returns {(kind: "xlsx" | "csv" | "png" | "copy-table" | "copy-json") => Promise<void>}
 */
export function useExport(context) {
    return async (kind) => {
        try {
            await (await loadMenus()).runExport(kind, context);
        } catch (e) {
            // the menus could not load (runExport says itself what went wrong in an export)
            context.announce(fill(context.labels.toastExportFailed, { message: messageOf(e) }), { tone: "error" });
        }
    };
}

/** Starts loading the export module when a menu that copies opens: a copy right in the click is allowed everywhere. */
export const prepareExporters = () => void loadMenus().then((m) => m.prepareExporters(), () => undefined);
