/*
 * What the "i" of the settings read from the report (section.jsx): whether the explanations show,
 * and the labels with the menus' texts. The context is
 * part of the first load (PivotReport provides it); the parts that read it load with the menus.
 */

import { createContext } from "react";

/**
 * @typedef {object} Help
 * @property {boolean} explain  the "i" of the settings are shown
 * @property {import("./labels.js").UiLabels | null} labels
 */

/** @type {import("react").Context<Help>} */
export const HelpContext = createContext(/** @type {Help} */ ({ explain: true, labels: null }));
