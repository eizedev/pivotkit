/*
 * The report's texts with the names of the fields: the host's display names (fieldDefaults labels),
 * told apart where two fields would look the same, and over them the view's own names (#158).
 */

import { useMemo } from "react";
import { withFieldLabels } from "pivotkit-core";
import { displayNames } from "./field-info.js";

/**
 * @param {any} baseLabels  the report's texts in its language (useHostProps)
 * @param {Map<string, any>} info  what the host says about its fields (useHostProps)
 * @param {import("pivotkit-core").Encoded} encoded  the data shown
 * @param {import("pivotkit-core").View} view  the view shown
 * @returns {any}  the labels; `hostNames` keeps the host's names, for the name a field has without the
 *   report's (a rename's placeholder, the field list)
 */
export function useReportLabels(baseLabels, info, encoded, view) {
    const fieldNamesKey = encoded.schema.fields.map((f) => f.name).join("\u0000");
    const hostLabels = useMemo(() => {
        const fields = displayNames(info, fieldNamesKey ? fieldNamesKey.split("\u0000") : []);
        return fields ? { ...baseLabels, core: { ...baseLabels.core, fields } } : baseLabels;
    }, [baseLabels, info, fieldNamesKey]);
    const fieldLabelsKey = view.fieldLabels ? JSON.stringify(view.fieldLabels) : "";
    return useMemo(() => {
        if (!fieldLabelsKey) {
            return hostLabels;
        }
        return { ...hostLabels, hostNames: hostLabels.core.fields ?? null, core: withFieldLabels(hostLabels.core, JSON.parse(fieldLabelsKey)) };
    }, [hostLabels, fieldLabelsKey]);
}
