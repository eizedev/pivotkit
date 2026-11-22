/*
 * A view that comes back by itself: the tab's stored one (`persistView`, sessionStorage), then a
 * shared link in the page's address (`shareLink`), which wins. Both are read once, after the first
 * render, so a server render and its hydration match, and both pass normalize(). A link needs
 * pivotkit-core/link: while it loads the result waits (`opening`). A link opened later in the tab
 * (only the fragment changed) is a step Undo takes back, like Open view file. A link made for other
 * data asks first (`check`), as a pasted view does.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { linkNow, loadLink, readLinkParam, readStoredView, shareBase, viewFromObject, writeStoredView } from "./share.js";
import { useIsoLayoutEffect } from "./iso.js";

/** The page's address and fragment, or undefined outside a browser. */
const here = () => (typeof location !== "undefined" ? { href: location.href, hash: location.hash } : undefined);

/** The tab's sessionStorage, or null where it is missing or blocked. */
function sessionStore() {
    try {
        return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
    } catch {
        return null;
    }
}

/**
 * @param {import("./index.js").PivotReportProps} props
 * @param {{ latest: React.MutableRefObject<import("./link-open.js").LinkReport>, kept: boolean, history: any, encoded: import("pivotkit-core").Encoded,
 *   limits: object | undefined } & ShareParts} report  latest: the report as it is when a link opens (filled after
 *   every render); kept: the report was mounted again with its file's data (data-keep.js): its own view comes back
 */
export function useShareLink(props, report) {
    const { latest, kept, history, encoded, limits } = report;
    const { shareLink, storageKey, persistView } = props;
    const [opening, setOpening] = useState(false);
    const appliedLink = useRef(/** @type {string | null} */ (null));
    // a link for other data, waiting for the user's choice (Load anyway, Cancel, Switch)
    const [check, setCheck] = useState(/** @type {null | { lines: string[], quiet: boolean, load: () => void, switchTo?: { name: string, run: () => void } }} */ (null));
    /** Opens the view of a link text; the result waits while the link module loads. */
    const openLink = useCallback((text, asStep = false) => {
        appliedLink.current = text;
        const now = linkNow();
        if (now) {
            now.openWith(text, asStep, latest.current, setCheck);
            return;
        }
        setOpening(true);
        loadLink().then(
            (m) => {
                setOpening(false);
                m.openWith(text, asStep, latest.current, setCheck);
            },
            () => {
                setOpening(false);
                latest.current.announce(latest.current.labels.viewFailed.badLink, { tone: "error" });
            }
        );
    }, [latest]);
    useIsoLayoutEffect(() => {
        if (kept) {
            return;
        }
        const page = here();
        const link = shareLink ? readLinkParam(page?.hash ?? "", storageKey) : null;
        if (link) {
            openLink(link);
        } else if (persistView === "session") {
            const raw = readStoredView(storageKey, sessionStore());
            if (raw) {
                try {
                    const loaded = viewFromObject(JSON.parse(raw), encoded, { limits });
                    if (loaded.view) {
                        history.restore(loaded.view);
                    }
                } catch {
                    // a stored text that is no JSON (changed by hand): the start view stays
                }
            }
        }
        // once per mounted report: a later change of these props does not bring a stored view back
    }, []);
    // a link opened in the same tab (only the fragment changed): its view, once
    useEffect(() => {
        if (!shareLink || typeof window === "undefined") {
            return undefined;
        }
        const onHash = () => {
            const link = readLinkParam(here()?.hash ?? "", storageKey);
            if (link && link !== appliedLink.current) {
                openLink(link, true);
            }
        };
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
    }, [shareLink, storageKey, openLink]);
    // the tab keeps the view shown (persistView="session"); Reset stores the start view the same way
    useEffect(() => {
        if (persistView === "session") {
            writeStoredView(storageKey, sessionStore(), JSON.parse(history.viewKey));
        }
    }, [persistView, storageKey, history.viewKey]);
    return {
        context: shareContext(props, report),
        opening,
        check,
        closeCheck: () => setCheck(null),
        // a link not opened: the same link given again (the fragment set once more) asks again
        cancelCheck: () => {
            appliedLink.current = null;
            setCheck(null);
        }
    };
}

/**
 * What the Share menu needs of the report besides its props.
 * @typedef {{ view: import("pivotkit-core").View, viewName: string | null, data: { sourceId?: string, sourceName?: string, sourceParams?: Record<string, string> },
 *   encoded: import("pivotkit-core").Encoded, limits: object | undefined, root: React.RefObject<HTMLElement | null>,
 *   announce: (text: string, extra?: object) => void, fileName: string, viaSheet: (made: { id?: string | null, sheet?: string | null }, name: string, file: object) => "switch" | "missing" | "none",
 *   applyLoaded: (loaded: import("./share.js").LoadedView) => void }} ShareParts
 */

/**
 * What the toolbar's Share menu works with (share-actions.js, loaded with the menus): a link when the
 * host allows it, the view as a view file, and loading one.
 * @param {import("./index.js").PivotReportProps} props
 * @param {ShareParts} report
 * @returns {import("./share-actions.js").ShareContext}
 */
function shareContext(props, { view, viewName, data, encoded, limits, root, announce, fileName, viaSheet, applyLoaded }) {
    const { shareLink, schemaUrl, storageKey, onExport, sources, onSourceSwitch } = props;
    const base = shareBase(shareLink, here()?.href);
    return {
        canLink: base !== null,
        prepare: base !== null ? () => void loadLink().catch(() => undefined) : undefined,
        view,
        viewName,
        sourceId: data.sourceId,
        sourceName: data.sourceName,
        sourceParams: data.sourceParams,
        // a view file that names another sheet of the workbook shown reads that sheet first
        viaSheet,
        schemaUrl,
        encoded,
        shareLink,
        linkKey: storageKey,
        root,
        fileName,
        onExport,
        announce,
        limits,
        sources,
        onSourceSwitch,
        applyLoaded
    };
}
