/*
 * The parts of a menu's panel: a titled section that can fold (its state kept with the tips, see
 * SECTIONS in tips.js), and the "i" next to a setting that needs explaining (Options → Help → "Show
 * explanations" hides them all). One way to explain a setting: an "i" next to it; a menu row stays one
 * line. What the report knows about these comes from HelpContext (help.js, PivotReport provides it).
 * Only the menus use these, so they load with them (menus.js), not with the report.
 */

import React, { useContext, useId } from "react";
import { HelpContext } from "./help.js";
import { Icon } from "./icons.jsx";
import { InfoButton } from "./info.jsx";
import { fill } from "./labels.js";

/**
 * The "i" next to a setting: its explanation (labels.settingInfo[id], loaded with the menus) on
 * hover, focus or tap. Nothing while "Show explanations" is off or the text is missing.
 * @param {{ id: string, name: string }} props  `name`: the setting's name, for the button's name
 */
export function SettingInfo({ id, name }) {
    const { explain, labels } = useContext(HelpContext);
    // the texts load with the menus (menu-labels.js): none before
    const text = labels && labels.settingInfo && Object.hasOwn(labels.settingInfo, id) ? labels.settingInfo[id] : null;
    if (!explain || !labels || !text) {
        return null;
    }
    return <InfoButton info={{ description: text }} name={name} label={fill(labels.aboutSetting, { setting: name })} labels={labels} className="pk-setting-info" testId={`setting-info-${id}`} />;
}

/**
 * A titled group of options. With an `id` of SECTIONS (tips.js) its title is a button that folds it;
 * folded, the title says what the section holds (`state`, muted at its end) and marks a setting that
 * is not the default (`changed`). `info` is the id of an explanation shown as an "i" next to the
 * title.
 * @param {{ title: React.ReactNode, children: React.ReactNode, id?: string, info?: string, state?: string | null, changed?: boolean }} props
 */
export function Section({ title, children, id, info, state, changed }) {
    const titleId = useId();
    const bodyId = useId();
    const { isOpen, setOpen, labels } = useContext(HelpContext);
    const name = typeof title === "string" ? title : "";
    const head = info ? <SettingInfo id={info} name={name} /> : null;
    if (!id) {
        return (
            <div className="pk-section" role="group" aria-labelledby={titleId}>
                <div className="pk-section-head">
                    <div className="pk-section-title" id={titleId}>
                        {title}
                    </div>
                    {head}
                </div>
                {children}
            </div>
        );
    }
    const open = isOpen(id);
    // folded, its name says what it holds, and that it is not the default: "Number format, Currency, changed"
    const shown = !open && state;
    const label = shown && name ? `${name}, ${state}${changed && labels?.sectionChanged ? labels.sectionChanged : ""}` : undefined;
    return (
        <div className={`pk-section${open ? "" : " pk-folded"}`} role="group" aria-labelledby={titleId} data-section={id}>
            <div className="pk-section-head">
                <button type="button" className="pk-section-title pk-section-toggle" id={titleId} aria-expanded={open} aria-controls={bodyId} aria-label={label} onClick={() => setOpen(id, !open)} data-testid={`section-${id}`}>
                    <Icon name={open ? "chevronDown" : "chevronRight"} size={18} />
                    <span className="pk-section-name">{title}</span>
                    {shown ? (
                        <span className="pk-section-state pk-badge-cut" data-testid={`section-state-${id}`}>
                            {changed ? (
                                <span className="pk-section-mark" aria-hidden="true">
                                    {"● "}
                                </span>
                            ) : null}
                            {state}
                        </span>
                    ) : null}
                </button>
                {head}
            </div>
            <div id={bodyId} className="pk-section-body" hidden={!open}>
                {children}
            </div>
        </div>
    );
}
