/*
 * What the report's parts ask about a field of the view: its type (a grouping's is its source
 * field's), its names, its description with the dates it spans, its settings from the host
 * (fieldDefaults), the zones it is placed in, and whether the host gives it an order.
 */

import { useCallback, useMemo } from "react";
import { fieldLabel, viewFields } from "pivotkit-core";
import { dateDisplayLocale, dateRangeText } from "./date-context.js";
import { fieldDefaultsFor } from "./field-info.js";
import { fill } from "./labels.js";
import { sourceFieldName } from "./names.js";
import { dateSpan, filterZoneFields, sourceOf } from "./view-ops.js";

/**
 * The zones each source field of the view is placed in, by its name in lower case.
 * @param {import("pivotkit-core").View} view
 * @returns {Map<string, string[]>}
 */
function placedZones(view) {
    const map = new Map();
    const mark = (name, zone) => {
        const key = sourceOf(view, name).toLowerCase();
        const list = map.get(key) ?? [];
        if (!list.includes(zone)) {
            list.push(zone);
        }
        map.set(key, list);
    };
    view.rows.forEach((f) => mark(f, "rows"));
    view.cols.forEach((f) => mark(f, "cols"));
    view.values.forEach((v) => v.field && mark(v.field, "values"));
    filterZoneFields(view).forEach((f) => mark(f, "filters"));
    return map;
}

/**
 * @param {{ view: import("pivotkit-core").View, encoded: import("pivotkit-core").Encoded, labels: any, info: Map<string, any>,
 *   fieldDefaults: object | undefined, orderOf: ((field: string) => unknown[] | undefined) | undefined, locale: string,
 *   context: { titles: Map<string, string> } }} options  info, orderOf: useHostProps's; context: the result's date context
 */
export function useFields({ view, encoded, labels, info, fieldDefaults, orderOf, locale, context }) {
    const dateLocale = useMemo(() => dateDisplayLocale(view.formatting?.locale || locale), [view.formatting?.locale, locale]);
    const types = useMemo(() => new Map(viewFields(view, encoded).map((f) => [f.name.toLowerCase(), f.type])), [view, encoded]);
    const typeOf = useCallback((field) => types.get(sourceOf(view, field ?? "").toLowerCase()) ?? "string", [types, view]);
    /** A field's display name (fieldDefaults label), else its name. */
    const nameOf = useCallback((field) => fieldLabel(field, labels.core), [labels]);
    // the name a field has without the report's own (#158), for the field list
    const sourceNameOf = useCallback((field) => sourceFieldName(field, labels), [labels]);
    /** True when the host gives a field on an axis an order (fieldDefaults.order); a grouping has items of its own. */
    const hostOrdered = useCallback((field) => sourceOf(view, field) === field && (orderOf?.(field)?.length ?? 0) > 0, [view, orderOf]);
    // a chip keeps the plain name; its tooltip names the years its date grouping combines
    const titleOf = useCallback((/** @type {string} */ field) => context.titles.get(field), [context]);
    /** A field's description and link (of its source field for a grouping), or undefined. */
    const infoOf = useCallback(
        (field) => {
            if (!field) {
                return undefined;
            }
            const entry = info.get(sourceOf(view, field).toLowerCase());
            const range = dateRangeText(dateSpan(encoded, sourceOf(view, field)), dateLocale);
            const description = [entry?.description, range && fill(labels.dateRangeData, { range })].filter(Boolean).join(" · ");
            return description ? { ...entry, description } : undefined;
        },
        [info, view, encoded, dateLocale, labels]
    );
    // the descriptions of the data's fields, for the field list
    const fieldInfo = useMemo(() => {
        const entries = new Map(info);
        for (const field of encoded.schema.fields) {
            const entry = infoOf(field.name);
            if (entry) entries.set(field.name.toLowerCase(), entry);
        }
        return entries;
    }, [info, infoOf, encoded]);
    const placed = useMemo(() => placedZones(view), [view]);
    /** A field's settings: the host's (fieldDefaults), and an identifier's own when the host says nothing (field-info.js). */
    const defaultsOf = useCallback((field) => fieldDefaultsFor(fieldDefaults, field, encoded.column(field)), [fieldDefaults, encoded]);
    return { fields: /** @type {import("pivotkit-core").SchemaField[]} */ (encoded.schema.fields), dateLocale, types, typeOf, nameOf, sourceNameOf, hostOrdered, titleOf, infoOf, fieldInfo, placed, defaultsOf };
}
