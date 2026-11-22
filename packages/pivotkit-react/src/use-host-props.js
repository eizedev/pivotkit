/*
 * The host's props as the report reads them. A host may render the report on every change of its
 * state and build its objects anew each time, so `labels`, `limits`, `importLimits`, `fieldDefaults`,
 * `chartOptions` and `colorMap` are compared by value: what depends on them runs again only when they
 * change. usePropWarnings says once in the console what a prop holds that the report does not know.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { fieldInfoOf, typesOf } from "./field-info.js";
import { hasLabels, onLabels, removedLabels, resolveLabels } from "./labels.js";
import { importLimitsOf } from "./import-limits.js";
import { warnOnce } from "./warn-once.js";
import { zonesStart } from "./use-zone-fold.js";

/** A host's chartOptions as a text that changes only when they do, or the object itself (a cycle). */
function optionsKey(options) {
    try {
        return JSON.stringify(options ?? null, (k, v) => (["function", "symbol", "bigint"].includes(typeof v) ? `\u0000${typeof v}` : v));
    } catch {
        return options;
    }
}

/** A string prop that says something, else undefined. */
const named = (value) => (typeof value === "string" && value ? value : undefined);

/**
 * The host's custom orders (fieldDefaults.order) as a lookup by field name, or undefined without any.
 * @param {string} ordersKey  the orders as JSON, [field, order][]
 */
function ordersOf(ordersKey) {
    const orders = /** @type {[string, unknown[]][]} */ (JSON.parse(ordersKey));
    if (!orders.length) {
        return undefined;
    }
    return (/** @type {string} */ field) => orders.find(([name]) => name.toLowerCase() === field.toLowerCase())?.[1];
}

/**
 * @param {import("./index.js").PivotReportProps} props
 */
export function useHostProps(props) {
    const { locale = "en-US", labels: customLabels, fieldDefaults, limits: limitsProp, importLimits: importLimitsProp, chartOptions, colorMap, source } = props;
    // past its box only without a height of the host's (or when the host asks for it): a card with a
    // height keeps the report inside, its result scrolls
    const grow = props.grow === "on" || (props.grow !== "off" && props.height === undefined);
    const labelsKey = JSON.stringify(customLabels ?? null);
    usePropWarnings({ fieldList: props.fieldList, labelsKey, zones: props.zones });
    const defaultsKey = JSON.stringify(fieldDefaults ?? null);
    // what the host says about its fields: display names, descriptions, links; nothing changes without it
    const info = useMemo(() => fieldInfoOf(JSON.parse(defaultsKey)), [defaultsKey]);
    // English while the language's texts are not here; texts that arrive after English stood in for
    // them (deferred-late.js) take their place
    const textsHere = useSyncExternalStore(onLabels, () => hasLabels(locale), () => hasLabels(locale));
    const baseLabels = useMemo(() => resolveLabels(textsHere ? locale : "en", JSON.parse(labelsKey)), [textsHere, locale, labelsKey]);
    const typesKey = JSON.stringify(typesOf(fieldDefaults));
    const limitsKey = JSON.stringify(limitsProp ?? null);
    const hostLimits = useMemo(() => JSON.parse(limitsKey) ?? undefined, [limitsKey]);
    // a loaded file's limits: the host's `importLimits` over its `limits`, key by key, so a host that
    // keeps uploads small does not cap its own data; without importLimits the very object of hostLimits,
    // so showing a file or the host's data again does not re-run what depends on the limits
    const importLimitsKey = JSON.stringify(importLimitsProp ?? null);
    const fileLimits = useMemo(() => /** @type {object | undefined} */ (importLimitsOf(hostLimits, JSON.parse(importLimitsKey))), [hostLimits, importLimitsKey]);
    // the host's custom orders (fieldDefaults.order), compared by value: every view shown sorts by them
    const ordersKey = JSON.stringify(
        fieldDefaults && typeof fieldDefaults === "object"
            ? Object.entries(fieldDefaults).filter(([, d]) => d && Array.isArray(d.order) && d.order.length > 0).map(([field, d]) => [field, d.order])
            : []
    );
    const orderOf = useMemo(() => ordersOf(ordersKey), [ordersKey]);
    // the host's chartOptions and colorMap, compared by value (a function or another value JSON cannot
    // hold counts as its kind); the chart checks them (chart-options.js, loaded with ECharts) before it draws
    const chartHostKey = optionsKey([chartOptions, colorMap]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const [stableChartOptions, stableColorMap] = useMemo(() => [chartOptions, colorMap], [chartHostKey]);
    return {
        grow,
        // the data the view is made for (the host's source), for the view files and the check before a load
        hostSourceId: named(source?.id),
        hostSourceName: named(source?.name),
        plugins: Array.isArray(props.plugins) ? props.plugins : [],
        info,
        baseLabels,
        typesKey,
        hostLimits,
        fileLimits,
        orderOf,
        chartOptions: stableChartOptions,
        colorMap: stableColorMap
    };
}

/**
 * Says once in the console what of `fieldList`, `labels` and `zones` the report ignores.
 * @param {{ fieldList: unknown, labelsKey: string, zones: unknown }} props  labelsKey: the host's labels as JSON
 */
function usePropWarnings({ fieldList, labelsKey, zones }) {
    useEffect(() => {
        if (fieldList !== undefined && fieldList !== "open" && fieldList !== "collapsed") {
            warnOnce(`pivotkit: fieldList ${JSON.stringify(String(fieldList)).slice(0, 40)} is neither "open" nor "collapsed"; the user's choice decides`);
        }
    }, [fieldList]);
    // a host's labels for texts the report no longer shows: ignored, said once with what replaces them
    useEffect(() => {
        for (const [key, now] of removedLabels(JSON.parse(labelsKey))) {
            warnOnce(`pivotkit: labels.${key} is no longer shown and is ignored; set labels.${now} instead`);
        }
    }, [labelsKey]);
    useEffect(() => {
        if (zones !== undefined && zonesStart(zones) === null) {
            warnOnce(`pivotkit: zones ${JSON.stringify(String(zones)).slice(0, 40)} is neither "open" nor "folded"; the report's height decides`);
        }
    }, [zones]);
}
