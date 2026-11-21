/*
 * The small menu at a clicked bar, point or slice of the chart (#53): "Show the rows" first, then
 * "Only …" and "Without …" for the category's item and the series' item (menu-ops.js pointActions).
 * A filter is one step that Undo takes back, and the chip shows it. Opened at the point the click hit
 * (an anchor PivotReport places there); the arrow keys move, Enter picks, Escape closes. A double
 * click on the chart goes straight to the rows. Loaded with the menus (menus.js).
 */

import React, { useMemo } from "react";
import { fill } from "./labels.js";
import { pointActions } from "./menu-ops.js";
import { Option, Popover } from "./popover.jsx";

/**
 * @param {{ target: { anchor: HTMLElement, home?: HTMLElement | null, point: any } | null, onClose: () => void, onRows: (point: any) => void, view: any,
 *   encoded: import("pivotkit-core").Encoded, locale: string, labels: any, commit: (view: any, note?: any) => void }} props
 */
export function PointMenu({ target, onClose, onRows, view, encoded, locale, labels, commit }) {
    const anchor = useMemo(() => ({ current: target ? target.anchor : null }), [target]);
    const actions = target ? pointActions(view, target.point, encoded, labels, locale) : [];
    // closed: the focus goes to the chart (its anchor takes none), so the report's keys (Undo) work on
    const close = () => {
        target?.home?.focus({ preventScroll: true });
        onClose();
    };
    const pick = (a) => {
        close();
        if (a.id === "rows") {
            onRows(target?.point);
        } else if (a.change) {
            const { view: next, note } = a.change();
            commit(next, note);
        }
    };
    const name = target ? [target.point.rowLabel, target.point.colLabel].filter(Boolean).join(", ") : "";
    return (
        <Popover open={Boolean(target) && actions.length > 0} anchor={anchor} onClose={close} label={fill(labels.pointMenu, { name })} role="menu" className="pk-point-menu">
            {actions.map((a) => (
                <Option key={a.id} inMenu icon={a.id === "rows" ? "table" : a.id.startsWith("only") ? "filter" : "x"} onSelect={() => pick(a)} testId={`point-${a.id}`}>
                    {a.text}
                </Option>
            ))}
        </Popover>
    );
}
