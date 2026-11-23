/*
 * Whether the buttons beside the tabs Table and Chart take their short form on a report that is not
 * narrow (view-tabs.jsx, #706): "Settings" and the icons of Enlarge and Full screen, as in the narrow
 * layout, when the row has no room for their whole names. The width the whole names need is measured
 * while they show, kept, and compared with the row's width on every resize; a change of what the row
 * holds (a text, a tab, a button) shows the whole names again to measure them anew. Only when even
 * the short form has no room do the buttons move to a line above the tabs (styles.css).
 */

import { useRef, useState } from "react";
import { useIsoLayoutEffect } from "./iso.js";

/**
 * The width (px) the row needs for the tabs and every button beside them on one line, as they show
 * now.
 * @param {HTMLElement} row  the row, `.pk-result-head`
 */
function oneLine(row) {
    const gap = (/** @type {Element} */ el) => parseFloat(getComputedStyle(el).columnGap) || 0;
    const tabs = row.querySelector(".pk-tabs");
    const actions = row.querySelector(".pk-result-actions");
    if (!tabs || !actions) {
        return 0;
    }
    const buttons = [...actions.children];
    const width = buttons.reduce((sum, b) => sum + b.getBoundingClientRect().width, 0);
    return tabs.getBoundingClientRect().width + gap(row) + width + gap(actions) * Math.max(0, buttons.length - 1);
}

/**
 * @param {React.RefObject<HTMLElement | null>} row  the row, `.pk-result-head`
 * @param {boolean} measure  false on a narrow report, which always shows the short form
 * @param {string} contents  what the row holds, as one text: a change measures the whole names anew
 * @returns {boolean} whether the buttons take their short form
 */
export function useTabsFit(row, measure, contents) {
    const [short, setShort] = useState(false);
    // the width the whole names need, measured while they showed
    const need = useRef(0);
    const measured = useRef("");
    useIsoLayoutEffect(() => {
        const el = row.current;
        if (!el || !measure || typeof ResizeObserver !== "function") {
            return undefined;
        }
        if (measured.current !== contents && short) {
            // the whole names show again first, to be measured
            setShort(false);
            return undefined;
        }
        const check = () => {
            if (!short) {
                need.current = oneLine(el);
                measured.current = contents;
            }
            // half a pixel: widths are fractions, the row's is rounded
            setShort(need.current > el.clientWidth + 0.5);
        };
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [row, measure, contents, short]);
    return measure && short;
}
