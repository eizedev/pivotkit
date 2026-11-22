/*
 * The zones folded into one line (the compact layout) or open. The user's choice (the section's fold
 * button) wins until the next load, else the host's start state (`zones`), else the report's height
 * (use-report-size.js: short). A new start state from the host starts over from it.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The zones' start state from the host's `zones`: folded (true), open (false), or null, the report's
 * height decides (compactAt). Any other value is null too.
 * @param {unknown} zones
 */
export const zonesStart = (zones) => (zones === "folded" ? true : zones === "open" ? false : null);

/**
 * @param {{ zones: unknown, short: boolean, empty: boolean }} options  zones: the host's prop; short:
 *   the report is low (use-report-size.js); empty: no field is placed
 * @returns {{ folded: boolean, setFolded: (folded: boolean) => void, keepOpen: () => void }}  folded:
 *   what the layout shows; keepOpen: the user placed a field, the zones open only for the empty view stay
 */
export function useZoneFold({ zones, short, empty }) {
    const [choice, setFolded] = useState(/** @type {boolean | null} */ (zonesStart(zones)));
    const [zonesSeen, setZonesSeen] = useState(zones);
    if (zones !== zonesSeen) {
        setZonesSeen(zones);
        setFolded(zonesStart(zones));
    }
    // the zones are open only because nothing is placed yet (a low report)
    const openWhileEmpty = useRef(false);
    // a low report with no field placed shows its zones, so "+ Add" is there to start with (the host's
    // `zones` and the user's click win); the first field the user places keeps them open (keepOpen)
    const folded = choice ?? (short && !empty);
    useEffect(() => {
        openWhileEmpty.current = empty && short && choice === null;
    });
    // the user placed the first field of an empty low report: its zones stay open, as if opened by
    // hand, so they do not fold under the user's hand (a view loaded folds them)
    const keepOpen = useCallback(() => {
        if (openWhileEmpty.current) {
            setFolded(false);
        }
    }, []);
    return { folded, setFolded, keepOpen };
}
