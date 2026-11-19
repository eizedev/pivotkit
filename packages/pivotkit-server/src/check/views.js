/*
 * check-config's section for named views (options/views.js, views.js): per source each view by name,
 * where it is written and the fields it needs; what is no view as a PROBLEM that stops the start (the
 * same check as createContext), a file or folder that is not there as a PROBLEM the server starts
 * with (its views are left out until it can be read).
 *
 *   Named views (4):
 *     sales:
 *       by-region (views/sales/by-region.pivotkit.json): needs Region, Sales
 *       top-5 (in the configuration): needs Customer, Sales
 *
 * check/index.js says what a section returns.
 */

import { checkViews } from "../views.js";
import { nameText } from "./sources.js";
import { heading, plain, problem } from "./format.js";

/** @type {import("./index.js").Section} */
export async function section(options, _registry, _runtime) {
    const sources = await checkViews(options);
    if (!sources.length) {
        return { items: [], upgrade: [] };
    }
    const items = [heading(`Named views (${sources.reduce((n, s) => n + s.views.length, 0)}):`)];
    for (const { id, views, problems } of sources) {
        items.push(plain(`${id}:`));
        for (const v of views) {
            items.push(plain(`${v.name} (${v.file ?? "in the configuration"}): needs ${v.needs.map(nameText).join(", ") || "no field"}`, 2));
        }
        for (const p of problems) {
            items.push(problem(`sources.${id}.${p.key}: ${p.text}`, p.missing ? { effect: "the server starts; its views are left out until it can be read" } : { stops: true }));
        }
    }
    return { items, upgrade: [] };
}
