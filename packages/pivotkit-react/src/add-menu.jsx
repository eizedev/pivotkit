/*
 * The menu of "+ Add" in a zone: "Add to Rows" (or the zone's name), a level menu (levels.jsx) with a
 * search and every field of the data with its type. The search finds a field as the field list's does
 * (matchingFields: name, display name, description). A field placed elsewhere shows a mark of its zone;
 * a pick moves it there and the screen reader hears that first ("Moves it from Columns."). A pick that
 * would change nothing (the field in this zone already, as it would be placed: a date as its grouping)
 * is disabled with its reason. Values takes a field again as a second value. Filters opens the field's
 * filter as the next level, on a draft that places it: Apply places it with the choice, Cancel and
 * Back return to the list. Loaded with the menus (menus.js).
 */

import React, { useState } from "react";
import { axisOf, filterZoneFields, same } from "./view-ops.js";
import { matchingFields } from "./field-info.js";
import { FilterBody } from "./filter.jsx";
import { TYPE_ICON, ZONE_ICON } from "./icons.jsx";
import { fill } from "./labels.js";
import { LevelMenu } from "./levels.jsx";

/** The other axis of an axis. */
const OTHER = { rows: "cols", cols: "rows" };

/**
 * Where a field is now that a pick for `zone` would take it from (null: nowhere, or it stays there
 * too), and whether the pick would change nothing. `name` is what the pick places (a date's grouping).
 * @param {any} view
 * @param {string} zone
 * @param {string} name
 * @returns {{ from: string | null, already: boolean }}
 */
export function addEffect(view, zone, name) {
    const inFilters = filterZoneFields(view).some((f) => same(f, name));
    if (zone === "values") {
        // a second value of a field is a value of its own: never nothing
        return { from: null, already: false };
    }
    if (zone === "filters") {
        return { from: inFilters ? null : axisOf(view, name) ?? null, already: inFilters };
    }
    if (view[zone].some((f) => same(f, name))) {
        return { from: null, already: true };
    }
    // a field keeps one place: on one axis or in Filters (view-ops.js addField)
    return { from: view[OTHER[zone]].some((f) => same(f, name)) ? OTHER[zone] : inFilters ? "filters" : null, already: false };
}

/**
 * @param {{ zone: string, view: any, fields: Array<{ name: string, type: string }>, placed: Map<string, string[]>,
 *   nameOf: (field: string) => string, info: Map<string, import("./field-info.js").FieldInfo>, labels: any,
 *   close: () => void, placeName: (field: string, zone: string) => string, onAdd: (field: string, zone: string) => boolean,
 *   filterDraft: (field: string) => { field: string, base: object | undefined }, onAdded: (from: string | null, run: () => boolean) => void,
 *   commit: (view: object, note?: any) => boolean, encoded: import("pivotkit-core").Encoded, locale: string,
 *   fullText: (zone: string, count: number) => string | null }} props
 *   `placeName`: what a pick places (a date's grouping); `onAdded`: says where a field came from before
 *   `run` places it (the zones then focus its chip and say so); `fullText`: why a zone with `count`
 *   entries takes no more, or null
 */
export function AddMenu({ zone, view, fields, placed, nameOf, info, labels, close, placeName, onAdd, filterDraft, onAdded, commit, encoded, locale, fullText }) {
    // the field whose filter is open (Filters)
    const [picked, setPicked] = useState(/** @type {{ field: string, from: string | null } | null} */ (null));
    const zoneName = labels.zones[zone];
    // a zone at its limit: every pick that would add to it is off, with the reason
    const full = zone === "filters" ? null : fullText(zone, view[zone].length);
    const name = fill(labels.addTo, { zone: zoneName });
    /** @param {{ name: string, type: string }} f @returns {import("./menu-topics.js").Choice} */
    const choiceOf = (f) => {
        const { from, already } = addEffect(view, zone, placeName(f.name, zone));
        // field names are one per spelling case-insensitively (pivotkit-core's encode keeps one of
        // "Name" and "name"), so the lower-case key names one field
        const where = placed.get(f.name.toLowerCase()) ?? [];
        const second = zone === "values" && where.includes("values");
        return {
            id: `add-${f.name}`,
            testId: `add-pick-${f.name}`,
            text: nameOf(f.name),
            icon: TYPE_ICON[f.type] ?? "text",
            className: `pk-add-type-${f.type}`,
            tags: where.map((z) => ({ icon: ZONE_ICON[z], text: labels.zones[z] })),
            note: already ? undefined : from ? fill(labels.addMoves, { zone: labels.zones[from] }) : second ? labels.addSecond : undefined,
            disabled: already || Boolean(full),
            reason: already ? fill(labels.addAlready, { zone: zoneName }) : full ?? undefined,
            closes: zone !== "filters",
            open: zone === "filters" ? "filter" : undefined,
            run: () => {
                if (zone === "filters") {
                    setPicked({ field: f.name, from });
                } else {
                    close();
                    onAdded(from, () => onAdd(f.name, zone));
                }
            }
        };
    };
    // data without columns: the list says so, as the field list does
    const topicOf = (list) => ({ id: "fields", title: name, kind: /** @type {const} */ ("inline"), groups: [{ choices: list.map(choiceOf) }], note: fields.length ? null : labels.emptyFields, noteId: "add-empty" });
    const draft = picked ? filterDraft(picked.field) : null;
    const topics = [
        topicOf(fields),
        // the filter of the field picked for Filters: a level of its own, with no row
        { id: "filter", title: picked ? nameOf(picked.field) : "", kind: /** @type {const} */ ("panel"), hidden: true }
    ];
    return (
        <div className="pk-add-menu" data-testid={`add-menu-${zone}`}>
            <LevelMenu
                name={name}
                labels={labels}
                locale={locale}
                topics={topics}
                close={close}
                onPick={(choice) => choice.run?.()}
                search
                searchText={labels.searchFields}
                filter={(query) => [topicOf(matchingFields(fields, query, info, nameOf))]}
                head={
                    <div className="pk-level-name">
                        <span className="pk-level-name-text" data-testid="menu-head">
                            {name}
                        </span>
                    </div>
                }
                panel={(id, back) =>
                    id === "filter" && picked && draft ? (
                        <FilterBody
                            view={view}
                            base={draft.base}
                            field={draft.field}
                            encoded={encoded}
                            locale={locale}
                            labels={labels}
                            commit={(next, note) => onAdded(picked.from, () => commit(next, note))}
                            close={close}
                            onCancel={() => back()}
                            titled={false}
                        />
                    ) : null
                }
            />
        </div>
    );
}
