/*
 * The import UI on demand (import-module.js, dist/import-ui.js): loadImport() imports it once, on the
 * first open of the Data menu, the first file dragged over the report or the empty report's "Load
 * data…"; importNow() gives it at once when it is there. A failed import is not kept, so the next use
 * tries again.
 */
import { lazy } from "./lazy.js";

const ui = lazy(() => import("./import-module.js"));

/** The import UI, imported once (lazy.js). */
export const loadImport = ui.load;

/** The import UI when it is loaded, else null. */
export const importNow = ui.now;
