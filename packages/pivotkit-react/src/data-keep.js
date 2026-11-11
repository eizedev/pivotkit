/*
 * A loaded file's data kept over a new mount of the report (allowImport with a storageKey). A host
 * may mount the report again at any time (PowerShell Universal does on its light/dark switch and on
 * Sync-UDElement); without this the file, its view and its undo steps would be gone, since they live
 * in the report's state alone (import-steps.js, data-history.js).
 *
 * In memory only, in this module, never in localStorage or sessionStorage: a file's data must not
 * outlive the page. One entry per storageKey, the report's latest state (the file shown, the data
 * steps, at most DATA_STEPS of them, the view history), written while a file is shown and dropped
 * once the host's data is shown again (Back to original data, Undo of the load). At most KEPT_REPORTS
 * keys, the one written longest ago going first, so reports that never come back free their data.
 * An entry names the host's data it was made over (`host`); a report mounted on other data takes
 * nothing, and lets the entry go (PivotReport.jsx, unless that data has no columns yet). Pure apart
 * from the module's map, so it is tested without a DOM.
 */

/** Reports (storageKeys) whose loaded file is kept at once: each may hold a few whole data sets. */
export const KEPT_REPORTS = 4;

/**
 * @typedef {object} KeptData
 * @property {string} host  the host's data the file was loaded over (hostIdentity)
 * @property {import("./import-steps.js").ShownData} imported  the file's data shown
 * @property {import("./data-history.js").DataSteps} steps
 * @property {import("./view-history.js").HistoryState} history  the view history of the file's data
 * @property {Record<string, string>} savedKeys  the saved views as loaded or saved (unsaved changes)
 */

/** @type {Map<string, KeptData>} */
const kept = new Map();

/**
 * The identity of the host's data for an entry: its `dataKey` when it gives one, else its columns
 * (names and types), with its `source` id either way. Rows are not compared: a host that renders its
 * data again with more rows still shows the file, as a mounted report does.
 * @param {{ dataKey: string | number | undefined, sourceId: string | undefined, schemaKey: string }} host
 */
export const hostIdentity = ({ dataKey, sourceId, schemaKey }) => JSON.stringify([sourceId ?? null, dataKey !== undefined ? ["key", String(dataKey)] : ["columns", schemaKey]]);

/**
 * Keeps the report's state under its key, as the latest written.
 * @param {string} key
 * @param {KeptData} entry
 */
export function keepData(key, entry) {
    kept.delete(key);
    kept.set(key, entry);
    while (kept.size > KEPT_REPORTS) {
        kept.delete(/** @type {string} */ (kept.keys().next().value));
    }
}

/**
 * Lets the entry of a key go.
 * @param {string} key
 */
export function forgetData(key) {
    kept.delete(key);
}

/**
 * The entry kept under a key for a report mounted over the host's data `host`; null when there is
 * none, or when it was made over other data. Reads only: the report lets an entry go in an effect.
 * @param {string} key
 * @param {string} host
 * @returns {KeptData | null}
 */
export function keptData(key, host) {
    const entry = kept.get(key);
    return entry && entry.host === host ? entry : null;
}
