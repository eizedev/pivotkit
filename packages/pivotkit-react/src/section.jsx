/*
 * The parts of a menu's panel: a titled section that can fold (its state kept with the tips, see
 * SECTIONS in tips.js), and the "i" next to a setting that needs explaining (Options → Help → "Show
 * explanations" hides them all). One way to explain a setting: an "i" next to it; a menu row stays one
 * line. What the report knows about these comes from HelpContext (PivotReport provides it).
 */

import React, { createContext, useContext, useId } from "react";
import { Icon } from "./icons.jsx";
import { InfoButton } from "./info.jsx";
import { fill } from "./labels.js";

/**
 * @typedef {object} Help
 * @property {boolean} explain  the "i" of the settings are shown
 * @property {(id: string) => boolean} isOpen  whether a section is open
 * @property {(id: string, open: boolean) => void} setOpen
 * @property {import("./labels.js").UiLabels | null} labels
 */

/** @type {React.Context<Help>} */
export const HelpContext = createContext(/** @type {Help} */ ({ explain: true, isOpen: () => true, setOpen: () => {}, labels: null }));

/**
 * The "i" next to a setting: its explanation (labels.settingInfo[id]) on hover, focus or tap. Nothing
 * while "Show explanations" is off or the text is missing.
 * @param {{ id: string, name: string }} props  `name`: the setting's name, for the button's name
 */
export function SettingInfo({ id, name }) {
    const { explain, labels } = useContext(HelpContext);
    const text = labels && Object.hasOwn(labels.settingInfo, id) ? labels.settingInfo[id] : null;
    if (!explain || !labels || !text) {
        return null;
    }
    return <InfoButton info={{ description: text }} name={name} label={fill(labels.aboutSetting, { setting: name })} labels={labels} className="pk-setting-info" testId={`setting-info-${id}`} />;
}

/**
 * A titled group of options. With an `id` of SECTIONS (tips.js) its title is a button that folds it;
 * `info` is the id of an explanation shown as an "i" next to the title.
 * @param {{ title: React.ReactNode, children: React.ReactNode, id?: string, info?: string }} props
 */
export function Section({ title, children, id, info }) {
    const titleId = useId();
    const bodyId = useId();
    const { isOpen, setOpen } = useContext(HelpContext);
    const name = typeof title === "string" ? title : "";
    const infoButton = info ? <SettingInfo id={info} name={name} /> : null;
    if (!id) {
        return (
            <div className="pk-section" role="group" aria-labelledby={titleId}>
                <div className="pk-section-head">
                    <div className="pk-section-title" id={titleId}>
                        {title}
                    </div>
                    {infoButton}
                </div>
                {children}
            </div>
        );
    }
    const open = isOpen(id);
    return (
        <div className={`pk-section${open ? "" : " pk-folded"}`} role="group" aria-labelledby={titleId} data-section={id}>
            <div className="pk-section-head">
                <button type="button" className="pk-section-title pk-section-toggle" id={titleId} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(id, !open)} data-testid={`section-${id}`}>
                    <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
                    <span>{title}</span>
                </button>
                {infoButton}
            </div>
            <div id={bodyId} className="pk-section-body" hidden={!open}>
                {children}
            </div>
        </div>
    );
}
