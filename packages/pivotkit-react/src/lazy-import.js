/*
 * The import UI on demand (import-module.js, dist/import-ui.js): loadImport() imports it once, on the
 * first open of the Data menu, the first file dragged over the report or the empty report's "Load
 * data…"; importNow() gives it at once when it is there. A failed import is not kept, so the next use
 * tries again.
 */

/** @type {Promise<typeof import("./import-module.js")> | null} */
let pending = null;
/** @type {typeof import("./import-module.js") | null} */
let loaded = null;

/** The import UI, imported once; a failed import is forgotten, so the next call tries again. */
export function loadImport() {
    pending ??= import("./import-module.js").then(
        (m) => (loaded = m),
        (error) => {
            pending = null;
            throw error;
        }
    );
    return pending;
}

/** The import UI when it is loaded, else null. */
export const importNow = () => loaded;
