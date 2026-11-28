import { useState } from "react";

/**
 * Keep a date editor in text mode once its saved rule or live data requires signed years.
 * Promotion happens during render, before a native date input can discard the signed value.
 * @param {{ value?: unknown, value2?: unknown } | null} rule
 * @param {boolean} needed
 */
export function useDateInput(rule, needed) {
    const [expanded, setExpanded] = useState(() => needed || [rule?.value, rule?.value2].some((value) => /^(?:[+-]|0000-)/.test(String(value))));
    if (needed && !expanded) setExpanded(true);
    return expanded;
}
