/*
 * The table and the chart side by side (#51, display "both", a wide report only): the table on the
 * left, the chart on the right, a divider between them. The divider is a separator (WAI-ARIA window
 * splitter): a drag moves it, and with the focus on it the arrow keys move it in steps, Home and End
 * to the narrowest and widest table. Where it stands is the person's, not the view's: it is kept while
 * the report is shown.
 */

import React, { useRef, useState } from "react";

/** The table's share of the width, in percent: at the start, the least and the most, a key's step. */
const SPLIT = Object.freeze({ start: 50, min: 25, max: 75, step: 5 });

/**
 * @param {{ labels: any, table: React.ReactNode, chart: React.ReactNode }} props
 */
export function SideBySide({ labels, table, chart }) {
    const [split, setSplit] = useState(/** @type {number} */ (SPLIT.start));
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const clamp = (/** @type {number} */ n) => Math.round(Math.min(SPLIT.max, Math.max(SPLIT.min, n)));
    const onPointerDown = (/** @type {React.PointerEvent<HTMLDivElement>} */ e) => {
        if (e.button !== 0) {
            return;
        }
        e.preventDefault();
        const bar = e.currentTarget;
        bar.setPointerCapture(e.pointerId);
        const move = (/** @type {PointerEvent} */ m) => {
            const rect = box.current?.getBoundingClientRect();
            if (rect && rect.width > 0) {
                setSplit(clamp(((m.clientX - rect.left) / rect.width) * 100));
            }
        };
        const up = () => {
            bar.removeEventListener("pointermove", move);
            bar.removeEventListener("pointerup", up);
            bar.removeEventListener("pointercancel", up);
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", up);
        bar.addEventListener("pointercancel", up);
    };
    const onKeyDown = (/** @type {React.KeyboardEvent} */ e) => {
        const next = e.key === "ArrowLeft" ? split - SPLIT.step : e.key === "ArrowRight" ? split + SPLIT.step : e.key === "Home" ? SPLIT.min : e.key === "End" ? SPLIT.max : null;
        if (next !== null) {
            e.preventDefault();
            setSplit(clamp(next));
        }
    };
    return (
        <div className="pk-both" ref={box} style={/** @type {any} */ ({ "--pk-split": `${split}%` })} data-testid="side-by-side">
            <div className="pk-both-part pk-both-table">{table}</div>
            <div
                className="pk-both-divider"
                role="separator"
                aria-orientation="vertical"
                aria-label={labels.splitDivider}
                aria-valuemin={SPLIT.min}
                aria-valuemax={SPLIT.max}
                aria-valuenow={split}
                tabIndex={0}
                onPointerDown={onPointerDown}
                onKeyDown={onKeyDown}
                data-testid="split-divider"
            />
            <div className="pk-both-part pk-both-chart">{chart}</div>
        </div>
    );
}
