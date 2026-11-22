/*
 * The field list as a drawer on a narrow report: opened by the toolbar's Fields button, closed by its
 * own button, the scrim, a field placed or dragged. Closed, it is out of the tab order and hidden from
 * assistive technology. On a wider report the field list is always there and the drawer stays shut.
 */

import { useCallback, useEffect, useState } from "react";

/**
 * @param {string} size  the report's width class (use-report-size.js)
 * @param {React.RefObject<HTMLElement | null>} panelRef  the field list's slot
 */
export function useDrawer(size, panelRef) {
    const [drawer, setDrawer] = useState(false);
    const narrow = size === "narrow";
    const open = drawer && narrow;
    useEffect(() => {
        if (panelRef.current) {
            panelRef.current.inert = narrow && !open;
        }
    }, [narrow, open, panelRef]);
    const show = useCallback(() => setDrawer(true), []);
    const close = useCallback(() => setDrawer(false), []);
    /** The drawer closes when the field list's work is done (a field placed, dragged out, filtered). */
    const closeIfNarrow = useCallback(() => {
        if (narrow) {
            setDrawer(false);
        }
    }, [narrow]);
    return { narrow, open, show, close, closeIfNarrow };
}
