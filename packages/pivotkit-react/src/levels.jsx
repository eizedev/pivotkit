/*
 * A menu in levels: its first level is a short summary (a row per topic with what is set on its
 * right, or a topic's few choices right there), and a topic opens its own level in place, with
 * "Back" and a title that names the field ("Month › Group"). The first level and the levels of
 * choices are ARIA menus (WAI-ARIA Authoring Practices, menu pattern): one Tab stop with the arrow
 * keys, Home and End, type-ahead; Enter or the right arrow opens a level, Escape or the left arrow
 * goes back with the focus on the row it came from, Escape on the first level closes the menu and
 * the focus goes back to its button, Tab closes it and moves on. A level with form controls (a
 * filter, a name) is a panel: a group with its heading, Tab through its controls, Escape back. Every
 * choice applies at once. A search above the first level finds any choice of any level (topics in
 * chip-topics.js). Loaded with the menus (menus.js).
 */

import React, { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { activeIn, rootOf } from "./dom.js";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { ClearInput } from "./clear-input.jsx";
import { HelpContext } from "./help.js";
import { SettingInfo } from "./section.jsx";
import { rowName, searchEntries, searchHits, stepIndex, typeAheadIndex } from "./menu-topics.js";

/** The items of a menu: its own, not those of a menu inside it. */
const ITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/** The items of the menu element `menu`, in order. */
function itemsOf(menu) {
    return /** @type {HTMLElement[]} */ ([...menu.querySelectorAll(ITEM)]).filter((el) => el.closest('[role="menu"]') === menu && el.getClientRects().length > 0);
}

/** The button that opened the popover around `el` (MenuButton's aria-controls names it). */
export function openerOf(el) {
    const id = el.closest(".pk-popover")?.id;
    return id ? /** @type {HTMLElement | null} */ (rootOf(el)?.querySelector(`[aria-controls="${CSS.escape(id)}"]`) ?? null) : null;
}

/**
 * Tab in a menu leaves it: the focus goes to its button first, so the browser's Tab moves on from
 * there to what follows it, and the menu closes.
 * @param {KeyboardEvent | React.KeyboardEvent} e
 * @param {() => void} close
 */
export function tabLeaves(e, close) {
    if (e.key !== "Tab" || e.shiftKey) {
        return false;
    }
    const opener = openerOf(/** @type {Element} */ (e.target));
    if (opener) {
        opener.focus({ preventScroll: true });
    } else {
        e.preventDefault();
    }
    close();
    return true;
}

/**
 * An ARIA menu: one Tab stop (the item focused last, else the one marked `data-pk-start`, else the
 * first), the arrow keys, Home and End, type-ahead; left and right move inside a group of choices
 * side by side (`data-pk-seg`). `onKey` runs first and may take a key (return true).
 * @param {{ label?: string, labelledBy?: string, className?: string, close: () => void, children: React.ReactNode, testId?: string }} props
 */
export function MenuList({ label, labelledBy, className, close, children, testId }) {
    const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
    const last = useRef(/** @type {string | null} */ (null));
    const typed = useRef({ text: "", at: 0 });
    // after every render: one item takes Tab (roving tabindex)
    useLayoutEffect(() => {
        const menu = ref.current;
        if (!menu) {
            return;
        }
        const items = itemsOf(menu);
        const keep = items.find((el) => el.dataset.pkItem === last.current) ?? items.find((el) => el.hasAttribute("data-pk-start")) ?? items[0];
        for (const el of items) {
            el.tabIndex = el === keep ? 0 : -1;
        }
    });
    const onFocus = (e) => {
        const item = /** @type {HTMLElement} */ (e.target).closest?.(ITEM);
        if (item && ref.current && item.closest('[role="menu"]') === ref.current) {
            last.current = /** @type {HTMLElement} */ (item).dataset.pkItem ?? null;
            for (const el of itemsOf(ref.current)) {
                el.tabIndex = el === item ? 0 : -1;
            }
        }
    };
    const onKeyDown = (e) => {
        const menu = ref.current;
        if (!menu || e.target.closest('[role="menu"]') !== menu || e.altKey || e.ctrlKey || e.metaKey) {
            return;
        }
        if (tabLeaves(e, close)) {
            return;
        }
        const items = itemsOf(menu);
        const at = items.indexOf(/** @type {HTMLElement} */ (activeIn(menu)));
        const go = (i) => {
            if (i !== null && items[i]) {
                e.preventDefault();
                e.stopPropagation();
                items[i].focus();
            }
        };
        const seg = /** @type {HTMLElement} */ (e.target).closest("[data-pk-seg]");
        if (seg && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            const own = itemsOf(menu).filter((el) => seg.contains(el));
            const i = own.indexOf(/** @type {HTMLElement} */ (e.target)) + (e.key === "ArrowRight" ? 1 : -1);
            if (i >= 0 && i < own.length) {
                e.preventDefault();
                e.stopPropagation();
                own[i].focus();
            } else if (e.key === "ArrowRight") {
                // past the end of a group of choices: nothing to open
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        const opens = /** @type {HTMLElement} */ (e.target).closest("[data-pk-level]");
        if (opens && (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ")) {
            // a topic's row: its level opens
            e.preventDefault();
            e.stopPropagation();
            /** @type {HTMLElement} */ (opens).click();
            return;
        }
        const step = stepIndex(e.key, at, items.length);
        if (step !== null) {
            go(step);
            return;
        }
        if (e.key.length === 1 && e.key !== " ") {
            const now = Date.now();
            typed.current = { text: now - typed.current.at < 600 ? typed.current.text + e.key : e.key, at: now };
            go(typeAheadIndex(items.map((el) => el.dataset.pkText ?? el.textContent ?? ""), at, typed.current.text));
        }
    };
    return (
        <div ref={ref} role="menu" aria-label={label} aria-labelledby={labelledBy} className={`pk-level-menu${className ? ` ${className}` : ""}`} onKeyDown={onKeyDown} onFocus={onFocus} data-testid={testId}>
            {children}
        </div>
    );
}

/**
 * One item of a menu: a choice (`checked` set: menuitemradio, or menuitemcheckbox with `checkbox`)
 * or an action. `hint` stands on its right (a format's example, a date unit's).
 * @param {{ id: string, text: React.ReactNode, onSelect: () => void, checked?: boolean, checkbox?: boolean,
 *   hint?: string, icon?: string, danger?: boolean, testId?: string, start?: boolean, plain?: string,
 *   label?: string, className?: string, disabled?: boolean, reason?: string, haspopup?: "menu" | "dialog", level?: string,
 *   description?: string | null, current?: boolean, children?: React.ReactNode }} props
 *   `plain`: the text type-ahead matches; `start`: takes Tab first; `level`: the topic it opens;
 *   `description`: an explanation a screen reader reads with it (the "i" next to it shows it);
 *   `current`: the entry shown now (the view loaded), with a check and aria-current
 */
export function MenuItem({ id, text, onSelect, checked, checkbox, hint, icon, danger, testId, start, plain, label, className, disabled, reason, haspopup, level, description, current, children }) {
    const role = checked === undefined ? "menuitem" : checkbox ? "menuitemcheckbox" : "menuitemradio";
    const reasonId = useId();
    const describedBy = [disabled && reason ? reasonId : null, description ? `${reasonId}-d` : null].filter(Boolean).join(" ") || undefined;
    return (
        <button
            type="button"
            role={role}
            aria-checked={checked === undefined ? undefined : checked}
            aria-label={label}
            aria-haspopup={haspopup}
            aria-disabled={disabled || undefined}
            aria-describedby={describedBy}
            aria-current={current ? "true" : undefined}
            tabIndex={-1}
            className={`pk-option${checked ? " pk-checked" : ""}${danger ? " pk-danger" : ""}${disabled ? " pk-disabled" : ""}${className ? ` ${className}` : ""}`}
            data-pk-option=""
            data-pk-item={id}
            data-pk-text={plain ?? (typeof text === "string" ? text : undefined)}
            data-pk-start={start ? "" : undefined}
            data-pk-level={level}
            data-testid={testId ?? id}
            onClick={disabled ? undefined : onSelect}
        >
            <span className="pk-option-icon">{checked || current ? <Icon name="check" /> : icon ? <Icon name={/** @type {any} */ (icon)} /> : null}</span>
            <span className="pk-option-text">
                {text}
                {disabled && reason ? (
                    <span id={reasonId} className="pk-option-hint" data-testid={`${testId ?? id}-reason`}>
                        {reason}
                    </span>
                ) : null}
            </span>
            {hint ? <span className="pk-item-hint">{hint}</span> : null}
            {description ? (
                <span id={`${reasonId}-d`} hidden>
                    {description}
                </span>
            ) : null}
            {children}
        </button>
    );
}

/**
 * A choice as a menu item; one with an explanation (`info`) has its "i" next to it while "Show
 * explanations" is on: for the pointer (a screen reader reads the text with the item, the Tab key
 * stays on the menu).
 * @param {{ choice: import("./menu-topics.js").Choice, onPick: (choice: import("./menu-topics.js").Choice) => void, start?: boolean }} props
 */
function ChoiceItem({ choice: c, onPick, start }) {
    const { explain, labels } = useContext(HelpContext);
    const text = c.info && explain && labels?.settingInfo && Object.hasOwn(labels.settingInfo, c.info) ? labels.settingInfo[c.info] : null;
    const item = (
        <MenuItem id={c.id} testId={c.testId} text={c.text} hint={c.hint} icon={c.icon} checked={c.checked} checkbox={c.checkbox} current={c.current} disabled={c.disabled} reason={c.reason} description={text} start={start} haspopup={c.open ? "dialog" : undefined} className={c.open ? "pk-topic-row" : undefined} onSelect={() => onPick(c)}>
            {c.open ? <Icon name="chevronRight" size={16} className="pk-topic-chevron" /> : null}
        </MenuItem>
    );
    if (!text && !c.actions?.length) {
        return item;
    }
    return (
        <div role="none" className="pk-setting-row">
            {item}
            {/* an entry's own actions (delete, publish): items of the menu, next to it */}
            {(c.actions ?? []).map((a) => (
                <button key={a.id} type="button" role="menuitem" tabIndex={-1} className="pk-icon-btn" aria-label={a.label} title={a.label} aria-haspopup={a.open ? "dialog" : undefined} data-pk-item={a.id} data-pk-text={a.label} data-testid={a.testId ?? a.id} onClick={() => onPick(a)}>
                    <Icon name={/** @type {any} */ (a.icon)} />
                </button>
            ))}
            {text ? (
                <span aria-hidden="true">
                    <SettingInfo id={/** @type {string} */ (c.info)} name={c.text} tabIndex={-1} />
                </span>
            ) : null}
        </div>
    );
}

/**
 * A topic's row on the first level: its title, what is set on its right (a dot before it when it is
 * not the default), and a chevron: it opens the topic's level.
 * @param {{ topic: import("./menu-topics.js").Topic, labels: any, onOpen: () => void }} props
 */
function TopicRow({ topic, labels, onOpen }) {
    return (
        <MenuItem
            id={`topic-${topic.id}`}
            level={topic.id}
            text={topic.title}
            plain={topic.title}
            icon={topic.icon}
            label={rowName(topic.title, topic.state, topic.changed, labels.sectionChanged)}
            haspopup={topic.kind === "menu" ? "menu" : "dialog"}
            className="pk-topic-row"
            onSelect={onOpen}
        >
            {topic.state ? (
                <span className="pk-topic-state" data-testid={`topic-state-${topic.id}`}>
                    {topic.changed ? (
                        <span className="pk-section-mark" aria-hidden="true">
                            {"● "}
                        </span>
                    ) : null}
                    <span className="pk-badge-cut">{topic.state}</span>
                </span>
            ) : null}
            <Icon name="chevronRight" size={16} className="pk-topic-chevron" />
        </MenuItem>
    );
}

/** The choices of a topic's groups as menu items, each group with its title. */
function Groups({ topic, onPick }) {
    const ids = useId();
    const groups = (topic.groups ?? []).map((g, i) => {
        const items = g.choices.map((c) => <ChoiceItem key={c.id} choice={c} start={c.checked} onPick={onPick} />);
        return g.title ? (
            <React.Fragment key={i}>
                <div className="pk-subtitle" id={`${ids}-${i}`} role="presentation">
                    {g.title}
                </div>
                <div role="group" aria-labelledby={`${ids}-${i}`} >
                    {items}
                </div>
            </React.Fragment>
        ) : (
            <div key={i} role="group" aria-label={topic.title}>
                {items}
            </div>
        );
    });
    return (
        <>
            {groups}
            {topic.note ? (
                <p className="pk-hint pk-menu-hint" role="none" data-testid={topic.noteId}>
                    {topic.note}
                </p>
            ) : null}
        </>
    );
}

/**
 * A topic on the first level: a row that opens its level, or its choices right there (side by side
 * with its title before them, or one below the other).
 */
function TopicFirst({ topic, labels, onPick, onOpen }) {
    const titleId = useId();
    if (topic.hidden) {
        return null;
    }
    if (topic.kind === "menu" || topic.kind === "panel") {
        return <TopicRow topic={topic} labels={labels} onOpen={onOpen} />;
    }
    const choices = topic.groups?.[0]?.choices ?? [];
    if (topic.kind === "segmented") {
        return (
            // a setting that is not the default says so in words too ("Highlight, changed")
            <div role="group" aria-label={rowName(topic.title, topic.state, topic.changed, labels.sectionChanged)} className="pk-topic-seg" data-pk-seg="" data-testid={`topic-${topic.id}`}>
                <span className="pk-topic-seg-title" aria-hidden="true">
                    <span className="pk-option-icon">{topic.icon ? <Icon name={/** @type {any} */ (topic.icon)} /> : null}</span>
                    {topic.title}
                    {topic.changed && !topic.state ? <span className="pk-section-mark">{" ●"}</span> : null}
                </span>
                {/* what is set when none of the segments is it (a sort by a value) */}
                {topic.state ? (
                    <span className="pk-topic-state pk-topic-seg-state" data-testid={`topic-state-${topic.id}`}>
                        {topic.changed ? (
                            <span className="pk-section-mark" aria-hidden="true">
                                {"● "}
                            </span>
                        ) : null}
                        <span className="pk-badge-cut">{topic.state}</span>
                    </span>
                ) : null}
                <span className="pk-segmented pk-small">
                    {choices.map((c) => (
                        <button key={c.id} type="button" role="menuitemradio" aria-checked={Boolean(c.checked)} tabIndex={-1} data-pk-option="" data-pk-item={c.id} data-pk-text={c.text} data-testid={c.id} onClick={() => onPick(c)}>
                            {c.text}
                        </button>
                    ))}
                </span>
            </div>
        );
    }
    return (
        <>
            {topic.titled ? (
                <div className="pk-subtitle" id={titleId} role="presentation" data-testid={`topic-title-${topic.id}`}>
                    {topic.title}
                </div>
            ) : null}
            <div role="group" aria-label={topic.titled ? undefined : topic.title} aria-labelledby={topic.titled ? titleId : undefined} data-testid={`topic-${topic.id}`}>
                {choices.map((c) => (
                    <ChoiceItem key={c.id} choice={c} onPick={onPick} />
                ))}
            </div>
            {topic.note ? (
                <p className="pk-hint pk-menu-hint" role="none" data-testid={topic.noteId}>
                    {topic.note}
                </p>
            ) : null}
        </>
    );
}

/**
 * The search of a menu: every choice of every level, by its text and its path. Enter runs only a hit
 * the arrow keys moved to; nothing found says so.
 */
function SearchHits({ hits, labels, onPick, onOpen, close }) {
    if (!hits.length) {
        return (
            <p className="pk-hint pk-level-nothing" role="status" data-testid="menu-search-nothing">
                {labels.searchNothing}
            </p>
        );
    }
    return (
        <MenuList label={labels.searchResults} close={close} testId="menu-search-hits">
            {hits.map((h) => (
                <MenuItem key={h.id} id={`hit-${h.id}`} text={h.choice ? h.text : `${h.text}…`} plain={h.text} checked={h.choice?.checked} icon={h.choice ? h.topic.icon : "chevronRight"} hint={h.path || undefined} haspopup={h.choice ? undefined : "dialog"} onSelect={() => (h.choice ? onPick(h.choice) : onOpen(h.topic.id, undefined, h.focus))} />
            ))}
        </MenuList>
    );
}

/**
 * A menu in levels.
 * @param {{ name: string, labels: any, topics: import("./menu-topics.js").Topic[], close: () => void,
 *   onPick: (choice: import("./menu-topics.js").Choice) => void, panel: (id: string, back: (focus?: string) => void, hint?: string) => React.ReactNode,
 *   head?: React.ReactNode, foot?: React.ReactNode, search?: boolean, locale?: string, focusAgain?: unknown }} props
 *   `onPick`: applies a choice (the menu then goes back to its first level, unless the choice closes
 *   it); `panel`: the form of a "panel" topic, with `back` (one level back, the focus where the level
 *   was opened from, or `focus`); `foot`: items after the topics (Remove field); `focusAgain`: when it
 *   changes, the focus goes once more where the last step sent it (that element may come later)
 */
export function LevelMenu({ name, labels, topics, close, onPick, panel, head, foot, search = false, locale, focusAgain }) {
    // the levels open (a topic's id with the focus that goes back to where it was opened from; none:
    // the first level) and where the focus goes once it shows: "level" the level's first control,
    // "search" the search, "row:<topic>" a topic's row, "item:<choice>" a choice
    const [nav, setNav] = useState(/** @type {{ stack: Array<{ level: string, from: string, hint?: string }>, focus: string | null }} */ ({ stack: [], focus: null }));
    const level = nav.stack.length ? nav.stack[nav.stack.length - 1].level : null;
    const [query, setQuery] = useState("");
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const titleId = useId();
    const topic = level ? topics.find((t) => t.id === level) ?? null : null;
    useLayoutEffect(() => {
        const el = box.current;
        const want = nav.focus;
        if (!el || !want) {
            return;
        }
        const at = want.indexOf(":");
        const [kind, id] = [want.slice(0, at), want.slice(at + 1)];
        /** @type {HTMLElement | null} */
        const target =
            want === "level"
                ? el.querySelector(".pk-level-body [data-autofocus]") ?? el.querySelector('.pk-level-body [role="menuitemradio"][aria-checked="true"]') ?? el.querySelector(".pk-level-body :is(button, input, select):not([disabled])") ?? el.querySelector(".pk-level-back")
                : want === "search"
                  ? el.querySelector(".pk-level-search input")
                  : el.querySelector(kind === "row" ? `[data-pk-level="${CSS.escape(id)}"]` : `[data-pk-item="${CSS.escape(id)}"]`) ?? el.querySelector(ITEM);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: "nearest" });
        // `focusAgain` changes when what the focus goes to may have come later (a view deleted)
    }, [nav, focusAgain]);
    /** Opens a topic's level; `hint` tells its panel what to show and focus first ("conditions"). */
    const open = (id, from = `row:${id}`, hint = undefined) => {
        setQuery("");
        setNav({ stack: [...nav.stack, { level: id, from, hint }], focus: "level" });
    };
    /** One level back, the focus where the level was opened from (or `focus`). */
    const back = (/** @type {string | undefined} */ focus = undefined) => {
        const top = nav.stack[nav.stack.length - 1];
        setNav({ stack: nav.stack.slice(0, -1), focus: focus ?? top?.from ?? null });
    };
    const pick = (choice) => {
        if (choice.open) {
            // a choice that asks or takes a form first: its level
            choice.run?.();
            open(choice.open, choice.backTo ?? `item:${choice.id}`);
            return;
        }
        if (!choice.closes) {
            // the summary shows the new state, the focus on the row of the topic (or the search)
            setNav({ stack: [], focus: query ? "search" : nav.stack.length ? nav.stack[0].from : `item:${choice.id}` });
            setQuery("");
        }
        onPick(choice);
    };
    const onKeyDown = (e) => {
        if (e.defaultPrevented) {
            return;
        }
        const t = /** @type {HTMLElement} */ (e.target);
        const typing = t.matches("input:not([type=checkbox], [type=radio]), textarea, select");
        if (e.key === "/" && search && !level && !typing) {
            // "/" goes to the search, as on many sites
            e.preventDefault();
            /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(".pk-level-search input"))?.focus();
            return;
        }
        if (!level) {
            return;
        }
        if (e.key === "Escape" || (e.key === "ArrowLeft" && !typing && !t.closest("[data-pk-seg], .pk-segmented"))) {
            // one level back; the document's Escape (which closes the menu) sees it taken
            e.preventDefault();
            e.stopPropagation();
            back();
        }
    };
    const first = () => {
        const hits = search && query.trim() ? searchHits(searchEntries(topics, query), query, locale) : null;
        return (
            <>
                {head}
                {search ? (
                    <label className="pk-search pk-level-search">
                        <Icon name="search" />
                        <span className="pk-sr">{fill(labels.searchMenu, { name })}</span>
                        <ClearInput
                            type="search"
                            value={query}
                            placeholder={labels.searchMenuShort}
                            onChange={setQuery}
                            clearLabel={labels.clearText}
                            aria-label={fill(labels.searchMenu, { name })}
                            autoComplete="off"
                            data-testid="menu-search"
                            onKeyDown={(e) => {
                                if (e.key === "ArrowDown") {
                                    // into the hits (or the menu): Enter there runs one
                                    e.preventDefault();
                                    /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(`.pk-level-first ${ITEM}`))?.focus();
                                } else if (e.key === "Enter") {
                                    e.preventDefault();
                                }
                            }}
                        />
                    </label>
                ) : null}
                <div className="pk-level-first">
                    {hits ? (
                        <SearchHits hits={hits} labels={labels} onPick={pick} onOpen={open} close={close} />
                    ) : (
                        <MenuList label={name} close={close} testId="level-first">
                            {topics.map((t) => (
                                <TopicFirst key={t.id} topic={t} labels={labels} onPick={pick} onOpen={() => open(t.id)} />
                            ))}
                            {foot ? (
                                <>
                                    <div role="separator" className="pk-level-sep" />
                                    {foot}
                                </>
                            ) : null}
                        </MenuList>
                    )}
                </div>
            </>
        );
    };
    return (
        <div ref={box} className="pk-levels" onKeyDown={onKeyDown} data-level={level ?? ""}>
            {topic ? (
                <>
                    <div className="pk-level-head">
                        <button type="button" className="pk-link pk-level-back" onClick={() => back()} aria-label={fill(labels.backTo, { name })} data-testid="level-back">
                            <Icon name="chevronRight" size={16} className="pk-flip" />
                            {labels.back}
                        </button>
                        <h3 id={titleId} className="pk-level-title" data-testid="level-title">
                            {fill(labels.levelTitle, { name, topic: topic.levelTitle ?? topic.title })}
                        </h3>
                        {topic.info ? <SettingInfo id={topic.info} name={topic.title} /> : null}
                    </div>
                    <div className="pk-level-body" data-testid={`level-${topic.id}`}>
                        {topic.kind === "menu" ? (
                            <MenuList labelledBy={titleId} close={close}>
                                <Groups topic={topic} onPick={pick} />
                            </MenuList>
                        ) : (
                            <div role="group" aria-labelledby={titleId} className="pk-level-panel">
                                {panel(topic.id, back, nav.stack[nav.stack.length - 1]?.hint)}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                first()
            )}
        </div>
    );
}

/**
 * Runs the last function handed to `later` a moment after the last call (the typing stopped); `now`
 * runs it at once, `cancel` drops it.
 * @param {number} [wait]  ms
 */
export function useLater(wait = 450) {
    const timer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
    const job = useRef(/** @type {(() => void) | null} */ (null));
    const cancel = () => {
        if (timer.current) {
            clearTimeout(timer.current);
        }
        timer.current = null;
        job.current = null;
    };
    const now = () => {
        const run = job.current;
        cancel();
        run?.();
    };
    // the menu closing (a click outside it, Tab) or the level going applies what waits, as leaving
    // the field does; Escape in the field takes it back first (cancel)
    const latest = useRef(now);
    useEffect(() => {
        latest.current = now;
    });
    useEffect(() => () => latest.current(), []);
    return {
        later: (/** @type {() => void} */ fn) => {
            cancel();
            job.current = fn;
            timer.current = setTimeout(now, wait);
        },
        now,
        cancel
    };
}

/**
 * A value the user types that applies a moment after the typing stops (`apply` with the text), at
 * once on Enter or when the field is left; Escape gives the text it had back. Returns the text and
 * what the field's handlers call.
 * @param {string} applied  the text that applies now
 * @param {(text: string) => void} apply
 * @param {number} [wait]  ms; 0: only on Enter and when the field is left (a name)
 */
export function useAppliedText(applied, apply, wait = 450) {
    const [text, setText] = useState(applied);
    // the text that applies; one changed elsewhere (Undo) shows here while nothing is typed
    const [seen, setSeen] = useState(applied);
    if (applied !== seen) {
        setSeen(applied);
        if (text === seen) {
            setText(applied);
        }
    }
    // what the handlers and the timer read: the latest text, the text that applies, apply
    const live = useRef({ text, seen, apply });
    useEffect(() => {
        live.current = { ...live.current, seen, apply };
    });
    const later = useLater(wait);
    const flush = () => {
        later.cancel();
        if (live.current.text !== live.current.seen) {
            live.current.seen = live.current.text;
            live.current.apply(live.current.text);
        }
    };
    // a name waits for Enter or the field's blur; the menu closing first (a click outside) applies it too
    const flushLatest = useRef(flush);
    useEffect(() => {
        flushLatest.current = flush;
    });
    useEffect(() => () => flushLatest.current(), []);
    return {
        text,
        set: (/** @type {string} */ value) => {
            live.current.text = value;
            setText(value);
            if (wait > 0) {
                later.later(flush);
            }
        },
        flush,
        /** Escape: back to the text that applies; true when there was something to give back. */
        restore: () => {
            later.cancel();
            if (live.current.text === live.current.seen) {
                return false;
            }
            live.current.text = live.current.seen;
            setText(live.current.seen);
            return true;
        }
    };
}
