/*
 * What the user switched off, kept per storageKey (tip-state.js): the tips dismissed one by one or all
 * of them, the explanations (the "i" of the fields, zones and settings) and the field list folded to
 * a rail. The host allows some tips or all (`tips`), may hold the list itself (`dismissedTips` with
 * `onTipDismiss`), and may force a kind of explanation or the field list (`fieldInfo`, `zoneInfo`,
 * `settingInfo`, `fieldList`). The storage is read after hydration: on the server and in the first
 * render nothing is stored, so the markup of both is the same (useSyncExternalStore's server snapshot).
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { localStore } from "./storage.js";
import { ALL_TIPS, FIELDS_COLLAPSED, NO_EXPLANATIONS, allowedTips, cleanDismissed, fieldsCollapsed, helpSwitch, keptOnReset, parseStored, readStored, subscribeStored, writeDismissed } from "./tip-state.js";

/**
 * @param {import("./index.js").PivotReportProps} props
 * @param {{ size: string, describedFields: boolean }} report  size: the width class; describedFields: a
 *   field of the data has a description
 */
export function useDismissed(props, { size, describedFields }) {
    const { tips = "on", dismissedTips, storageKey, onTipDismiss, fieldList } = props;
    const allowedKey = JSON.stringify(allowedTips(tips));
    const allowed = useMemo(() => JSON.parse(allowedKey), [allowedKey]);
    const dismissedKey = JSON.stringify(cleanDismissed(dismissedTips));
    // what this report holds (from the host, or dismissed here) and what is stored under storageKey
    const [own, setOwn] = useState(() => cleanDismissed(JSON.parse(dismissedKey)));
    const [lastDismissedKey, setLastDismissedKey] = useState(dismissedKey);
    if (dismissedKey !== lastDismissedKey) {
        // the host passed other dismissed tips: they replace the list (the host stores it itself)
        setLastDismissedKey(dismissedKey);
        setOwn(JSON.parse(dismissedKey));
    }
    const subscribe = useCallback((callback) => subscribeStored(storageKey, callback), [storageKey]);
    const storedRaw = useSyncExternalStore(subscribe, () => readStored(storageKey, localStore()), () => null);
    const dismissed = useMemo(() => cleanDismissed([...own, ...parseStored(storedRaw)]), [own, storedRaw]);
    /** The list changed: kept, stored and told to the host (`id`: the tip dismissed, else null). */
    const change = useCallback(
        (next, id) => {
            setOwn(next);
            writeDismissed(storageKey, localStore(), next);
            onTipDismiss?.({ id, dismissed: next });
        },
        [storageKey, onTipDismiss]
    );
    const toggle = (id, on) => change(on ? dismissed.filter((d) => d !== id) : [...dismissed, id], on ? null : id);
    // one switch of the user's ("Show explanations") for the three kinds; a host's prop forces its kind
    const fieldSwitch = helpSwitch(props.fieldInfo, dismissed);
    const zoneSwitch = helpSwitch(props.zoneInfo, dismissed);
    const settingSwitch = helpSwitch(props.settingInfo, dismissed);
    const explainUser = settingSwitch.user || zoneSwitch.user || (describedFields && fieldSwitch.user);
    // the field list folded to a rail (wide and medium; a narrow report has the drawer): the user's
    // choice is stored with the tips, unless the host's fieldList decides, then it lasts this session
    const [fieldsSession, setFieldsSession] = useState(/** @type {boolean | null} */ (null));
    const collapseFields = (next) => {
        if (fieldList === "open" || fieldList === "collapsed") {
            setFieldsSession(next);
        } else {
            change(next ? [...dismissed, FIELDS_COLLAPSED] : dismissed.filter((d) => d !== FIELDS_COLLAPSED), null);
        }
    };
    return {
        allowed,
        dismissed,
        /** A tip dismissed by its close button. */
        dismiss: (id) => change([...dismissed, id], id),
        showFieldInfo: fieldSwitch.on,
        explainZones: zoneSwitch.on,
        explainSettings: settingSwitch.on,
        railed: size !== "narrow" && fieldsCollapsed(fieldsSession, fieldList, dismissed),
        collapseFields,
        // the Toolbar's switches of the tips and the explanations
        toolbar: {
            tipsControls: allowed !== "off",
            tipsOn: allowed !== "off" && !dismissed.includes(ALL_TIPS),
            onTipsOn: (on) => change(on ? dismissed.filter((id) => id !== ALL_TIPS) : [...dismissed, ALL_TIPS], on ? null : ALL_TIPS),
            canResetTips: dismissed.some((id) => !keptOnReset(id)),
            onResetTips: () => change(dismissed.filter(keptOnReset), null),
            help: {
                explanations: explainUser ? { on: !dismissed.includes(NO_EXPLANATIONS), set: (on) => toggle(NO_EXPLANATIONS, on) } : null
            }
        }
    };
}
