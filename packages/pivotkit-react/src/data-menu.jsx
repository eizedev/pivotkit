/*
 * The Data menu's panel (allowImport), with the menus (menus.js): it loads the import UI on its first
 * open (lazy-import.jsx) and shows its panel (import-host.jsx), "Loading…" while it loads and "Try
 * again" when it failed.
 */

import React, { useEffect, useRef, useState } from "react";
import { activeIn } from "./dom.js";
import { importNow } from "./lazy-import.js";

/**
 * @param {{ api: import("./import-host.jsx").ImportApi & { load: () => Promise<unknown> }, close: () => void, labels: any }} props
 */
export function DataMenu({ api, close, labels }) {
    const mod = importNow();
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [late] = useState(() => !mod);
    // the report's api is a new object on every render: the load starts once per try, not per render
    const load = useRef(api.load);
    useEffect(() => {
        load.current = api.load;
    });
    useEffect(() => {
        if (mod) {
            return undefined;
        }
        let live = true;
        load.current().catch(() => live && setFailed(true));
        return () => {
            live = false;
        };
        // a new try: attempt
    }, [mod, attempt]);
    useEffect(() => {
        // loaded after the menu opened: the focus goes to its first entry, as on an open
        const popover = box.current?.closest(".pk-popover");
        const now = activeIn(popover);
        if (late && popover && (now === popover || !now || !popover.contains(now))) {
            /** @type {HTMLElement | null} */ (popover.querySelector("[data-pk-option], [data-autofocus]"))?.focus({ preventScroll: true });
        }
    }, [late, mod, failed]);
    return (
        <div ref={box}>
            {mod ? (
                <mod.DataMenuPanel api={api} close={close} />
            ) : failed ? (
                <div className="pk-menu-failed" role="alert" data-testid="menu-failed">
                    <p>{labels.menuFailed}</p>
                    <button type="button" className="pk-btn pk-small-btn" data-autofocus="" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>
                        {labels.tryAgain}
                    </button>
                </div>
            ) : (
                <p className="pk-hint pk-menu-loading" role="status">
                    {labels.loadingMenu}
                </p>
            )}
        </div>
    );
}
