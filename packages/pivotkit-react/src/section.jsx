/*
 * The parts of a menu's panel: a titled group of entries, and the "i" next to a setting that needs explaining (Options → Help → "Show
 * explanations" hides them all). One way to explain a setting: an "i" next to it; a menu row stays one
 * line. What the report knows about these comes from HelpContext (help.js, PivotReport provides it).
 * Only the menus use these, so they load with them (menus.js), not with the report.
 */

import React, { useContext } from "react";
import { HelpContext } from "./help.js";
import { InfoButton } from "./info.jsx";
import { fill } from "./labels.js";
import { Group } from "./popover.jsx";

/**
 * The "i" next to a setting: its explanation (labels.settingInfo[id], loaded with the menus) on
 * hover, focus or tap. Nothing while "Show explanations" is off or the text is missing.
 * @param {{ id: string, name: string, tabIndex?: number }} props  `name`: the setting's name, for the button's name;
 *   `tabIndex` -1 next to a menu's item (the item has the text as its description)
 */
export function SettingInfo({ id, name, tabIndex }) {
    const { explain, labels } = useContext(HelpContext);
    // the texts load with the menus (menu-labels.js): none before
    const text = labels && labels.settingInfo && Object.hasOwn(labels.settingInfo, id) ? labels.settingInfo[id] : null;
    if (!explain || !labels || !text) {
        return null;
    }
    return <InfoButton info={{ description: text }} name={name} label={fill(labels.aboutSetting, { setting: name })} labels={labels} className="pk-setting-info" testId={`setting-info-${id}`} tabIndex={tabIndex} />;
}

/**
 * A titled group of a menu's entries (the Export menus, the chart type): popover.jsx's Group, with
 * `info`, the id of an explanation shown as an "i" next to the title.
 * @param {{ title: React.ReactNode, children: React.ReactNode, info?: string }} props
 */
export function Section({ title, children, info }) {
    const name = typeof title === "string" ? title : "";
    return (
        <Group title={title} head={info ? <SettingInfo id={info} name={name} /> : null}>
            {children}
        </Group>
    );
}
