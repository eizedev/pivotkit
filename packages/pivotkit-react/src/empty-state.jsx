/*
 * The start screen of an empty view: how to begin, a few saved views to try, and with allowImport a
 * place to drop a file or pick one; a report without any data shows only that.
 */

import React from "react";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";

/**
 * @param {{ labels: any, templates: any[], onTemplate: (t: any) => void, onLoad?: () => void, noData: boolean }} props
 *   onLoad: picks a file (allowImport); noData: the report has no data at all
 */
export function EmptyState({ labels, templates, onTemplate, onLoad, noData }) {
    return (
        <div className="pk-empty" data-testid="empty-state">
            <div className="pk-empty-art" aria-hidden="true">
                <span className="pk-empty-chip pk-c1" />
                <span className="pk-empty-chip pk-c2" />
                <span className="pk-empty-chip pk-c3" />
            </div>
            <h2>{noData ? labels.emptyNoData : labels.emptyTitle}</h2>
            {noData ? null : (
                <ol className="pk-steps">
                    {labels.emptySteps.map((s, i) => (
                        <li key={i}>
                            <span className="pk-step-n" aria-hidden="true">
                                {i + 1}
                            </span>
                            <span>{s}</span>
                        </li>
                    ))}
                </ol>
            )}
            {onLoad ? (
                <div className="pk-drop-zone" data-testid="empty-drop">
                    <p>{noData ? labels.emptyDrop : labels.emptyLoad}</p>
                    <button type="button" className="pk-btn" onClick={onLoad} data-testid="empty-load">
                        <Icon name="upload" />
                        <span className="pk-btn-text">{labels.loadData}</span>
                    </button>
                </div>
            ) : null}
            {templates.length ? (
                <div className="pk-empty-actions">
                    {templates.slice(0, 3).map((t, i) => (
                        <button key={`${i}:${t.name}`} type="button" className="pk-btn" onClick={() => onTemplate(t)}>
                            <Icon name="sparkle" />
                            <span className="pk-btn-text">{fill(labels.tryView, { name: t.name })}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
