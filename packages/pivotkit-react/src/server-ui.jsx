/*
 * What a report with a `server` shows when its rows do not come (the design of #621):
 *
 * - ServerMessage: in place of the whole report while it shows no rows (variant A). A mark, a
 *   heading that says what happened, a sentence that says what to do, at most one button, and a
 *   small line for IT support.
 * - ServerBanner: above the report while it shows rows already and reading them again failed
 *   (variant B). It says from when the rows shown are.
 * - SlowLine: over the waiting report's skeleton, after a few seconds (use-server-rows.js).
 *
 * The texts are server-labels.js's. Every colour is a --pk-* token (styles.css: .pk-server-*).
 */

import React, { useEffect, useState } from "react";
import { Icon } from "./icons.jsx";
import { serverLabels, stateWords } from "./server-labels.js";

/** @typedef {{ icon: string, tone: "plain" | "accent" | "warn" }} Look  icon: the path of its mark */

/** The marks of the states: here, not in icons.jsx, so they load with this module. */
const MARK = Object.freeze({
    lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
    unplug: "M3 3l18 18M9.5 5.2A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.4 7.2M17 19H7a5 5 0 0 1-1.6-9.7",
    tooMuch: "M4 6h16M4 12h16M4 18h10M18 15v6M15 18h6"
});

/** The mark and the tone of each state. @type {Readonly<Record<string, Look>>} */
const LOOK = Object.freeze({
    refused: { icon: MARK.lock, tone: "plain" },
    linkRefused: { icon: MARK.lock, tone: "plain" },
    linkInvalid: { icon: MARK.lock, tone: "plain" },
    unfit: { icon: MARK.lock, tone: "plain" },
    signIn: { icon: MARK.clock, tone: "accent" },
    signInLarge: { icon: MARK.tooMuch, tone: "warn" },
    expired: { icon: MARK.clock, tone: "accent" },
    large: { icon: MARK.tooMuch, tone: "warn" },
    unreachable: { icon: MARK.unplug, tone: "plain" },
    busy: { icon: MARK.clock, tone: "plain" }
});

/**
 * @typedef {object} StateProps
 * @property {import("./server-rows.js").ServerFailure} failure
 * @property {any} labels  the report's labels
 * @property {string} locale
 * @property {() => void} onRetry
 * @property {number | null} [shownAt]
 */

/**
 * The whole seconds until `at` (ms since the epoch), counted down as each one passes; null without `at`.
 * @param {number | undefined} at
 * @returns {number | null}
 */
function useSecondsLeft(at) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (at === undefined) {
            return undefined;
        }
        /** @type {ReturnType<typeof setTimeout>} */
        let tick;
        const step = () => {
            const t = Date.now();
            setNow(t);
            // the next tick when the next whole second is up
            tick = setTimeout(step, Math.max(0, at - t) % 1000 || 1000);
        };
        step();
        return () => clearTimeout(tick);
    }, [at]);
    return at === undefined ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * The words and the button of a state.
 * @param {StateProps & { compact?: boolean }} props
 */
function StateBody({ failure, labels, locale, onRetry, shownAt = null, compact = false }) {
    const t = serverLabels(labels);
    const left = useSecondsLeft(failure.retryAt);
    const w = stateWords(failure, t, { locale, shownAt, left });
    const look = LOOK[failure.state] ?? LOOK.unreachable;
    const button =
        w.action === "reload" ? (
            <button type="button" className="pk-btn pk-primary" onClick={() => location.reload()} data-testid="server-reload">
                <Icon name="reset" />
                <span className="pk-btn-text">{t.expired.action}</span>
            </button>
        ) : w.action === "retry" ? (
            <button type="button" className={`pk-btn${compact ? "" : " pk-primary"}`} onClick={onRetry} data-testid="server-retry">
                <Icon name="reset" />
                <span className="pk-btn-text">{t.unreachable.action}</span>
            </button>
        ) : null;
    return (
        <>
            <span className={`pk-server-mark pk-server-${look.tone}`} aria-hidden="true">
                <Icon d={look.icon} size={compact ? 18 : 26} />
            </span>
            <div className="pk-server-words">
                <h2 className="pk-server-title">{w.title}</h2>
                {w.said ? (
                    <>
                        <p className="pk-server-text" aria-hidden="true" data-testid="server-countdown">
                            {w.text}
                        </p>
                        <p className="pk-sr">{w.said}</p>
                    </>
                ) : (
                    <p className="pk-server-text">{w.text}</p>
                )}
                {button ? <div className="pk-empty-actions">{button}</div> : null}
                {w.support ? <p className="pk-server-support">{w.support}</p> : null}
            </div>
        </>
    );
}

/**
 * In place of the report: it shows no rows.
 * @param {StateProps} props
 */
export function ServerMessage(props) {
    return (
        <div className="pk-server-full" role="alert" data-testid="server-state" data-state={props.failure.state}>
            <div className="pk-empty">
                <StateBody {...props} />
            </div>
        </div>
    );
}

/**
 * Above the report: it shows rows from `shownAt`, and reading them again failed.
 * @param {StateProps} props
 */
export function ServerBanner(props) {
    const look = LOOK[props.failure.state] ?? LOOK.unreachable;
    return (
        <div className={`pk-server-banner pk-server-banner-${look.tone}`} role="alert" data-testid="server-banner" data-state={props.failure.state}>
            <StateBody {...props} compact />
        </div>
    );
}

/**
 * Over the skeleton, once loading takes a while.
 * @param {{ labels: any }} props
 */
export function SlowLine({ labels }) {
    const t = serverLabels(labels);
    return (
        <div className="pk-server-slow" data-testid="server-slow">
            <span className="pk-server-spinner" aria-hidden="true" />
            <span>
                <strong>{t.loading.title}</strong> {t.loading.text}
            </span>
        </div>
    );
}
