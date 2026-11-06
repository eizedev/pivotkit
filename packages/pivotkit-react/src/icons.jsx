/*
 * Line icons on a 24 unit grid, drawn with currentColor. Icons are decoration next to a visible text
 * or an aria-label, so they are hidden from assistive technology.
 */

import React from "react";

const PATHS = {
    grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
    text: "M4 18 8.5 6h1L14 18M5.6 14h6.8M17 11.5c.6-.7 1.4-1 2.3-1 1.5 0 2.2.9 2.2 2.3V18m0-3.4c-.8-.4-1.6-.5-2.5-.5-1.4 0-2.3.7-2.3 1.9 0 1.1.8 1.8 2 1.8 1.2 0 2.1-.6 2.8-1.6",
    number: "M9 4 7 20M17 4l-2 16M4 9h16M3 15h16",
    date: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 12h2M14 12h2M8 16h2M14 16h2",
    boolean: "M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7ZM16 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
    x: "M6 6l12 12M18 6 6 18",
    chevronDown: "m6 9 6 6 6-6",
    chevronRight: "m9 6 6 6-6 6",
    undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
    redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
    reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
    table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
    chart: "M4 20h16M7 16v-5M12 16V6M17 16v-8",
    stacked: "M4 20h16M7 16v-3M7 13v-3M12 16v-4M12 12V6M17 16v-2M17 14V9",
    horizontal: "M4 4v16M8 7h7M8 12h11M8 17h5",
    line: "M4 18 9 12l4 3 7-9M4 20h16",
    area: "M4 18 9 11l4 3 7-8v14H4Z",
    pie: "M12 3a9 9 0 1 0 9 9h-9Z M15 3.5A9 9 0 0 1 20.5 9H15Z",
    heatmap: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    download: "M12 4v11M7 10l5 5 5-5M5 20h14",
    bookmark: "M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z",
    sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
    filter: "M4 5h16l-6 7.5V19l-4-2v-4.5Z",
    more: "M12 6h.01M12 12h.01M12 18h.01",
    plus: "M12 5v14M5 12h14",
    check: "m5 12 5 5 9-10",
    sortAsc: "M7 4v16M3 8l4-4 4 4M14 6h7M14 12h5M14 18h3",
    sortDesc: "M7 4v16M3 16l4 4 4-4M14 6h3M14 12h5M14 18h7",
    panel: "M4 5h16v14H4zM9 5v14",
    trash: "M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
    save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
    sparkle: "M12 4l1.8 4.6L18 10l-4.2 1.4L12 16l-1.8-4.6L6 10l4.2-1.4Z",
    rows: "M4 6h16M4 12h16M4 18h16",
    cols: "M6 4v16M12 4v16M18 4v16",
    sigma: "M18 5H6l6 7-6 7h12",
    info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01",
    image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
    file: "M6 3h8l4 4v14H6zM14 3v4h4",
    drag: "M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"
};

/**
 * @param {{ name: keyof typeof PATHS, size?: number, className?: string }} props
 */
export function Icon({ name, size = 16, className }) {
    return (
        <svg className={className ? `pk-icon ${className}` : "pk-icon"} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d={PATHS[name] ?? PATHS.info} />
        </svg>
    );
}

/** The icon of a column type. */
export const TYPE_ICON = { string: "text", number: "number", date: "date", boolean: "boolean", null: "text" };
