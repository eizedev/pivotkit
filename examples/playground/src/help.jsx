// The playground's "How do I…?" help, opened only by its button (pull, never by itself). A modal
// <dialog> lists the questions of help-topics.js; picking one rings the place in the live report,
// says in a few sentences what to do there and links to the docs page that owns the topic. "Show me"
// closes the dialog, moves the focus to that place and leaves the ring on it until the visitor acts,
// so the visitor does the step in the real report. Escape, the close button or a click beside the
// card end the help and give the focus back to the button.
//
// Built on the native dialog (showModal) rather than a tour library: it traps the focus, makes the
// page behind it inert for screen readers, sits above the report's own menus and closes on Escape.
// Driver.js, the MIT tour library checked for this, left the focus on <body> after Escape, did not
// mark its popover modal while its overlay blocked the page, and wrote aria-haspopup="dialog" onto
// the highlighted control.
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { HELP_LABELS, HELP_TOPICS, docsHref } from "./help-topics.js";
import "./help.css";

/* global PIVOTKIT_SITE_URL */

const GAP = 12;
const MARGIN = 16;
const CARD_WIDTH = 380;
/** Below this many pixels beside a target, the card docks at the bottom of the window instead. */
const MIN_ROOM = 180;
/** About the height the question list needs; with less room below the button it takes the whole height. */
const LIST_HEIGHT = 560;
const FOCUSABLE = "button, a[href], input, select, textarea, [tabindex]";

/** The first visible element one of `selectors` finds, in their order. */
function findTarget(selectors) {
    for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
        }
    }
    return null;
}

/** Where the visitor acts: the target itself when it takes the focus, else the first control in it. */
function focusPoint(el) {
    if (el.matches(FOCUSABLE)) return el;
    return el.querySelector(FOCUSABLE) ?? null;
}

/**
 * Tab and Shift+Tab move through the card's controls and wrap around, as the APG dialog pattern
 * asks. A modal dialog alone lets Tab leave for the browser's toolbar, and Safari by default skips
 * buttons and links, which would leave the card unreachable from the keyboard there.
 * @param {React.KeyboardEvent} e
 */
function wrapTab(e) {
    if (e.key !== "Tab") return;
    const all = [...e.currentTarget.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.tabIndex >= 0);
    if (!all.length) return;
    e.preventDefault();
    const at = all.indexOf(document.activeElement);
    const next = at < 0 ? (e.shiftKey ? all.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + all.length) % all.length;
    all[next].focus();
}

/** A plain copy of an element's box, for state. */
const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
};

/**
 * Where the card goes next to `box`: below, above, right or left of it, on the side with room;
 * docked at the bottom of the window when no side has enough.
 * @returns {React.CSSProperties}
 */
function cardPlace(box) {
    const width = Math.min(CARD_WIDTH, innerWidth - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(box.left, innerWidth - width - MARGIN));
    const below = innerHeight - box.bottom - GAP - MARGIN;
    const above = box.top - GAP - MARGIN;
    if (below >= MIN_ROOM && below >= above) return { width, left, top: box.bottom + GAP, maxHeight: below };
    if (above >= MIN_ROOM) return { width, left, bottom: innerHeight - box.top + GAP, maxHeight: above };
    const top = Math.max(MARGIN, Math.min(box.top, innerHeight - MIN_ROOM - MARGIN));
    if (innerWidth - box.right - GAP - MARGIN >= width) return { width, left: box.right + GAP, top, maxHeight: innerHeight - top - MARGIN };
    if (box.left - GAP - MARGIN >= width) return { width, left: box.left - GAP - width, top, maxHeight: innerHeight - top - MARGIN };
    return { width, left: (innerWidth - width) / 2, bottom: MARGIN, maxHeight: innerHeight / 2 };
}

/** The question list: below the button, or over the whole height when it would not fit there. */
function listPlace(box) {
    const place = cardPlace(box);
    return place.maxHeight >= LIST_HEIGHT ? place : { width: place.width, left: place.left, top: MARGIN, maxHeight: innerHeight - 2 * MARGIN };
}

/** The box of `el`, drawn again while the page scrolls or the window changes size. */
function useTracked(el) {
    const [, redraw] = useState(0);
    useEffect(() => {
        if (!el) return undefined;
        const update = () => redraw((n) => n + 1);
        addEventListener("scroll", update, true);
        addEventListener("resize", update);
        return () => {
            removeEventListener("scroll", update, true);
            removeEventListener("resize", update);
        };
    }, [el]);
    return el ? boxOf(el) : null;
}

/** The ring around a target: inside the dialog it also dims the rest of the page. */
function Ring({ box, dim }) {
    if (!box) return null;
    const pad = 4;
    const style = { top: box.top - pad, left: box.left - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
    return <div className={dim ? "pg-help-ring pg-help-dim" : "pg-help-ring"} style={style} data-testid="pg-help-ring" aria-hidden="true" />;
}

/** The ring that stays on the target after "Show me" until the visitor acts there or presses Escape. */
function StayingRing({ el, onEnd }) {
    const box = useTracked(el);
    useEffect(() => {
        const key = (e) => {
            if (e.key === "Escape") onEnd({ back: true });
            else if (e.key === "Enter" || e.key === " ") onEnd({ back: false });
        };
        const act = () => onEnd({ back: false });
        // the visitor's own step: a click anywhere, Enter or Space, or the focus leaving the place
        const leave = (e) => {
            if (!el.contains(e.target)) onEnd({ back: false });
        };
        addEventListener("keydown", key, true);
        addEventListener("pointerdown", act, true);
        addEventListener("focusin", leave, true);
        return () => {
            removeEventListener("keydown", key, true);
            removeEventListener("pointerdown", act, true);
            removeEventListener("focusin", leave, true);
        };
    }, [el, onEnd]);
    return <Ring box={box} dim={false} />;
}

/** One topic: its question, its text, "Show me" when its place is on screen, and the docs link. */
function Answer({ topic, target, t, lang, ids, onShow, onBack }) {
    const heading = useRef(null);
    useEffect(() => heading.current?.focus(), [topic]);
    const href = docsHref(topic.docs, new URL(location.href), PIVOTKIT_SITE_URL);
    return (
        <>
            <h2 id={ids.title} ref={heading} tabIndex={-1}>{topic.question[lang]}</h2>
            <p id={ids.text} data-testid="pg-help-text">{topic.text[lang]}</p>
            {target ? null : <p className="pg-help-note">{t.notShown}</p>}
            <div className="pg-help-actions">
                {target ? <button type="button" className="pg-help-primary" onClick={onShow} data-testid="pg-help-show">{t.showMe}</button> : null}
                <a href={href} target="_blank" rel="noopener" data-testid="pg-help-docs">
                    {t.readMore}
                    <span className="pg-sr"> {t.newTab}</span>
                </a>
            </div>
            <button type="button" className="pg-help-back" onClick={onBack} data-testid="pg-help-back">‹ {t.back}</button>
        </>
    );
}

/** The question list. */
function Questions({ t, lang, ids, onPick }) {
    const first = useRef(null);
    useEffect(() => first.current?.focus(), []);
    return (
        <>
            <h2 id={ids.title}>{t.title}</h2>
            <p id={ids.text}>{t.intro}</p>
            <ul className="pg-help-list">
                {HELP_TOPICS.map((topic, i) => (
                    <li key={topic.id}>
                        <button type="button" ref={i === 0 ? first : undefined} onClick={() => onPick(topic)} data-testid={`pg-help-${topic.id}`}>
                            {topic.question[lang]}
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
}

/** The header's "How do I…?" button with its dialog. */
export function Help({ lang }) {
    const t = HELP_LABELS[lang];
    const dialog = useRef(null);
    // the button as state, not a ref: the list's place is measured from it while rendering
    const [button, setButton] = useState(null);
    // where the focus goes when the dialog closes: the button, or the target after "Show me"
    const focusAfter = useRef(null);
    const [open, setOpen] = useState(false);
    const [topic, setTopic] = useState(null);
    const [target, setTarget] = useState(null);
    const [staying, setStaying] = useState(null);
    const targetBox = useTracked(open ? target : null);
    const buttonBox = useTracked(open && !topic ? button : null);
    const base = useId();
    const ids = { title: `${base}-title`, text: `${base}-text` };

    const start = () => {
        setStaying(null);
        setTopic(null);
        setTarget(null);
        focusAfter.current = null;
        setOpen(true);
        dialog.current.showModal();
    };
    const pick = (next) => {
        const el = findTarget(next.targets);
        el?.scrollIntoView({ block: "nearest", inline: "nearest" });
        setTarget(el);
        setTopic(next);
    };
    const show = () => {
        focusAfter.current = focusPoint(target);
        setStaying(target);
        dialog.current.close();
    };
    // every way out (Escape, the close button, a click beside the card, "Show me") ends here
    const closed = () => {
        setOpen(false);
        (focusAfter.current ?? button).focus();
        focusAfter.current = null;
    };
    const endStaying = useCallback(({ back }) => {
        setStaying(null);
        if (back) button?.focus();
    }, [button]);

    const place = topic ? (targetBox ? cardPlace(targetBox) : cardPlace(boxOf(button))) : buttonBox ? listPlace(buttonBox) : undefined;
    return (
        <>
            <button type="button" ref={setButton} className="pg-help-button" onClick={start} aria-haspopup="dialog" data-testid="pg-help">
                {t.button}
            </button>
            <dialog
                ref={dialog}
                className={topic && targetBox ? "pg-help" : "pg-help pg-help-dimmed"}
                aria-labelledby={ids.title}
                aria-describedby={ids.text}
                onClose={closed}
                onKeyDown={wrapTab}
                onClick={(e) => {
                    if (e.target === dialog.current) dialog.current.close();
                }}
                data-testid="pg-help-dialog"
            >
                {open && topic ? <Ring box={targetBox} dim /> : null}
                {open ? (
                    <div className="pg-help-card" style={place} lang={lang} data-testid="pg-help-card">
                        <button type="button" className="pg-help-close" onClick={() => dialog.current.close()} aria-label={t.close} data-testid="pg-help-close">×</button>
                        {topic ? (
                            <Answer topic={topic} target={target} t={t} lang={lang} ids={ids} onShow={show} onBack={() => { setTopic(null); setTarget(null); }} />
                        ) : (
                            <Questions t={t} lang={lang} ids={ids} onPick={pick} />
                        )}
                    </div>
                ) : null}
            </dialog>
            {staying ? <StayingRing el={staying} onEnd={endStaying} /> : null}
        </>
    );
}
