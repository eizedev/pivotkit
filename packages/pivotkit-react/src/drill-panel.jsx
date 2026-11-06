/*
 * The rows behind a clicked value, in a side panel over the report: the cell's labels as the title,
 * the number of rows, and the first rows (the limit of the drill-down) as a table.
 */

import React, { useEffect, useId, useRef } from "react";
import { cellText } from "./drill.js";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";

/**
 * @param {{ drill: { title: string, count: number, rows: object[], columns: string[] } | null, onClose: () => void,
 *   labels: import("./labels.js").UiLabels, locale: string, timeZone: string }} props
 */
export function DrillPanel({ drill, onClose, labels, locale, timeZone }) {
    const id = useId();
    const close = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const back = useRef(/** @type {Element | null} */ (null));
    useEffect(() => {
        if (drill) {
            back.current = document.activeElement;
            close.current?.focus({ preventScroll: true });
            return () => {
                const el = /** @type {HTMLElement | null} */ (back.current);
                if (el && el.isConnected) {
                    el.focus({ preventScroll: true });
                }
            };
        }
        return undefined;
    }, [drill]);
    if (!drill) {
        return null;
    }
    const n = drill.count.toLocaleString(locale);
    return (
        <>
            <div className="pk-scrim pk-drill-scrim" onClick={onClose} aria-hidden="true" />
            <div
                className="pk-drill"
                role="dialog"
                aria-modal="true"
                aria-labelledby={id}
                data-testid="drill-panel"
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        onClose();
                    }
                }}
            >
                <div className="pk-drill-head">
                    <div>
                        <h2 id={id}>{labels.drillTitle}</h2>
                        <p className="pk-drill-path">{drill.title}</p>
                        <p className="pk-muted" data-testid="drill-count">
                            {drill.rows.length < drill.count ? fill(labels.drillShown, { shown: drill.rows.length.toLocaleString(locale), count: n }) : fill(labels.drillCount, { count: n })}
                        </p>
                    </div>
                    <button ref={close} type="button" className="pk-icon-btn" onClick={onClose} aria-label={labels.close} title={labels.close}>
                        <Icon name="x" />
                    </button>
                </div>
                <div className="pk-drill-body">
                    <table className="pk-drill-table">
                        <thead>
                            <tr>
                                {drill.columns.map((c) => (
                                    <th key={c} scope="col">
                                        {c}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {drill.rows.map((row, i) => (
                                <tr key={i}>
                                    {drill.columns.map((c) => {
                                        const v = row ? row[c] : null;
                                        return (
                                            <td key={c} className={typeof v === "number" ? "pk-num" : undefined}>
                                                {cellText(v, { locale, timeZone })}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
