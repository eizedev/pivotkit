/*
 * The report while it waits: for the host's data (`loading`), for a large data set to be encoded and
 * its first result computed, for a shared view to be read. Grey shapes where the toolbar, the zones and
 * a few table rows will be, in the theme's tokens; their shimmer runs through --pk-duration, so
 * reduced motion stops it. One status message names what it waits for; the shapes are hidden from
 * assistive technology.
 */

import React from "react";

/** Rows of the table drawn while waiting. */
const ROWS = 6;

/**
 * The whole report waiting (`full`), or only its result area (the report is there, its data reloads).
 * @param {{ text: string, full?: boolean }} props
 */
export function Skeleton({ text, full = false }) {
    const rows = (
        <div className="pk-skel-table" aria-hidden="true">
            {Array.from({ length: ROWS }, (_, i) => (
                <div key={i} className="pk-skel-row">
                    <span className="pk-skel pk-skel-cell pk-skel-head" />
                    <span className="pk-skel pk-skel-cell" />
                    <span className="pk-skel pk-skel-cell" />
                    <span className="pk-skel pk-skel-cell" />
                </div>
            ))}
        </div>
    );
    return (
        <div className={full ? "pk-skeleton pk-skeleton-full" : "pk-skeleton"} role="status" aria-busy="true" data-testid="skeleton">
            <span className="pk-sr">{text}</span>
            {full ? (
                <div className="pk-skel-layout" aria-hidden="true">
                    <div className="pk-skel-panel">
                        <span className="pk-skel pk-skel-title" />
                        {Array.from({ length: 7 }, (_, i) => (
                            <span key={i} className="pk-skel pk-skel-field" />
                        ))}
                    </div>
                    <div className="pk-skel-main">
                        <div className="pk-skel-toolbar">
                            <span className="pk-skel pk-skel-btn pk-skel-wide" />
                            <span className="pk-skel pk-skel-btn" />
                            <span className="pk-skel pk-skel-btn" />
                            <span className="pk-skel-grow" />
                            <span className="pk-skel pk-skel-btn" />
                        </div>
                        <div className="pk-skel-zones">
                            {Array.from({ length: 4 }, (_, i) => (
                                <span key={i} className="pk-skel pk-skel-zone" />
                            ))}
                        </div>
                        {rows}
                    </div>
                </div>
            ) : (
                rows
            )}
        </div>
    );
}
