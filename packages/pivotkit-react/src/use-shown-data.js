/*
 * The data the report shows: the host's, encoded once per data set, or a file loaded in the report
 * (allowImport, import-steps.js), with the data steps of the undo history (data-history.js) and the
 * saved views as loaded or saved (for "unsaved changes"). A report mounted again with its storageKey
 * over the same host data starts where it was (data-keep.js: memory only); useKeepData keeps and
 * restores that entry.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encode } from "pivotkit-core";
import { forgetData, hostIdentity, keepData, keptData } from "./data-keep.js";
import { NO_DATA_STEPS, withoutFuture } from "./data-steps.js";
import { useIsoLayoutEffect } from "./iso.js";
import { measured } from "./measure.js";
import { schemaKeyOf } from "./use-view-history.js";

/** The host's data as encode() takes it: rows, or columnar ({ columns, types, data }, one array per column). */
const dataOf = (d) => (Array.isArray(d) || Array.isArray(d?.columns) ? d : []);

/** @type {readonly string[]} */
const NO_SHEETS = Object.freeze([]);

/** A saved view's identity (view-save.js: LoadedView), for the keys of the views as saved. */
export const savedKeyOf = (t) => JSON.stringify([t.scope, t.store, t.storeSource ?? null, t.storeSheet ?? null, t.sourceId ?? null, t.name]);

/**
 * @param {import("./index.js").PivotReportProps} props
 * @param {{ typesKey: string, hostLimits: object | undefined, fileLimits: object | undefined, hostSourceId: string | undefined,
 *   hostSourceName: string | undefined }} host  useHostProps's
 */
export function useShownData(props, host) {
    const { data, dataKey, encoded: encodedProp, timeZone, allowImport = false, storageKey } = props;
    const { typesKey, hostLimits, fileLimits, hostSourceId, hostSourceName } = host;
    // the data, encoded once per data set: per array, or per dataKey when the host gives one (a host
    // that builds a new array on every render passes a key, so the rows are not encoded again)
    const dataIdentity = dataKey !== undefined ? dataKey : data;
    const source = useMemo(() => {
        try {
            const types = JSON.parse(typesKey);
            const enc = encodedProp ?? measured("encode", () => encode(dataOf(data), { timeZone: timeZone ?? "UTC", limits: hostLimits, ...(types ? { types } : {}) }));
            return { encoded: /** @type {import("pivotkit-core").Encoded} */ (enc), error: /** @type {unknown} */ (null) };
        } catch (error) {
            return { encoded: /** @type {import("pivotkit-core").Encoded} */ (encode([])), error: /** @type {unknown} */ (error) };
        }
        // data is read through dataIdentity: with a dataKey a new array with the same key is the same data
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [encodedProp, dataIdentity, timeZone, hostLimits, typesKey]);
    // the file's data shown (null: the host's) and the data steps of the undo history (data-history.js)
    const keepKey = allowImport && typeof storageKey === "string" && storageKey ? storageKey : null;
    const hostData = hostIdentity({ dataKey, sourceId: hostSourceId, schemaKey: schemaKeyOf(source.encoded) });
    const [kept] = useState(() => (keepKey ? keptData(keepKey, hostData) : null));
    const [imported, setImported] = useState(/** @type {import("./import-steps.js").ShownData | null} */ (kept?.imported ?? null));
    const [steps, setSteps] = useState(/** @type {import("./data-history.js").DataSteps} */ (kept?.steps ?? NO_DATA_STEPS));
    // each saved view as it was loaded or saved (history.keyOf, by savedKeyOf), so the toolbar shows
    // when the view shown has unsaved changes
    const [savedKeys, setSavedKeys] = useState(/** @type {Record<string, string>} */ (kept?.savedKeys ?? {}));
    /** A new step drops the data steps undone before it. */
    const newStep = useCallback(() => setSteps(withoutFuture), []);
    /** A saved view as it is kept now (loaded or saved): the view shown differs from it, or not. */
    const remember = useCallback((tag, key) => setSavedKeys((all) => ({ ...all, [savedKeyOf(tag)]: key })), []);
    // the sheet of a workbook shown (a loaded file's), which the views saved, downloaded and linked from
    // it name (source.params.sheet, sheet-views.js); the host's own source is passed on as it is
    const sheet = imported?.sheet ?? null;
    return {
        source,
        keepKey,
        hostData,
        kept,
        imported,
        setImported,
        steps,
        setSteps,
        newStep,
        savedKeys,
        remember,
        // the data the view is made for: the file's (its name and the hash of its columns, so the
        // browser store keeps views per file), else the host's source
        sourceId: imported ? imported.source.id : hostSourceId,
        sourceName: imported ? imported.source.name : hostSourceName,
        sheet,
        sheets: imported?.sheets ?? NO_SHEETS,
        sourceParams: sheet ? { sheet } : undefined,
        encoded: /** @type {import("pivotkit-core").Encoded} */ (imported ? imported.encoded : source.encoded),
        // the limits of the data shown: a file's are the import limits, so its views, results and
        // exports are bounded the way it was read
        limits: imported ? fileLimits : hostLimits
    };
}

/**
 * Keeps a file's data for a new mount of the report while it is shown, and starts a report mounted
 * again on what was kept.
 *
 * A report mounted again with its file's data starts on its kept view history (the first render
 * already, so the kept entry is never written from a history before it, even when the host unmounts
 * the report again before it renders twice); `restore` tells the host that the file is shown again
 * (onDataLoad "restore") and shows the history's view before the browser paints (once: React's
 * StrictMode runs a mount's effects twice).
 *
 * While a file's data is shown the report's latest state is kept; the host's data shown again after
 * a file lets it go (Back to original data, Undo of the load). An unmount keeps it. A report mounted
 * over other host data lets an entry made over another go; over data without columns (a host still on
 * its way, without `loading`) it leaves it for the next mount.
 * @param {ReturnType<typeof useShownData>} shown
 * @param {{ snapshot: () => import("./view-history.js").HistoryState, restore: (kept: import("./data-keep.js").KeptData) => void }} history
 *   restore: shows what was kept; read on the first render only
 */
export function useKeepData(shown, { snapshot, restore }) {
    const { keepKey, kept, hostData, imported, steps, savedKeys } = shown;
    const restored = useRef(false);
    useIsoLayoutEffect(() => {
        if (kept && !restored.current) {
            restored.current = true;
            restore(kept);
        }
        // once per mounted report
    }, []);
    const keptKey = useRef(keepKey);
    const fileShown = useRef(false);
    const hostHasColumns = shown.source.encoded.schema.fields.length > 0;
    useIsoLayoutEffect(() => {
        if (keepKey !== null && !kept && hostHasColumns) {
            forgetData(keepKey);
        }
        // once per mounted report
    }, []);
    useEffect(() => {
        if (keptKey.current !== keepKey && keptKey.current !== null) {
            forgetData(keptKey.current);
        }
        keptKey.current = keepKey;
        if (keepKey === null) {
            return;
        }
        if (imported) {
            fileShown.current = true;
            keepData(keepKey, { host: hostData, imported, steps, history: snapshot(), savedKeys });
        } else if (fileShown.current) {
            fileShown.current = false;
            forgetData(keepKey);
        }
    }, [keepKey, hostData, imported, steps, snapshot, savedKeys]);
}
