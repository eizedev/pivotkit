/*
 * What only the menus do with the sections' states (kept in the tips' list, tips.js): "Reset menu
 * sections" in Options → Help. A module of the menus' (menus.js), so the report's first load does not
 * carry it.
 */

import { isSection } from "./tips.js";

/** The list without the sections' states: every section open or folded as at first, the tips as they are. */
export const withoutSections = (dismissed) => dismissed.filter((id) => !isSection(id));
