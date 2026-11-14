/*
 * What the Views menu's sharing does (toolbar-panels.jsx: ShareSection): copy a link, copy the view as
 * JSON, download it as a view file, and load one that was pasted or chosen. Loaded with the menus
 * (menus.js), so the first load holds only what reads a link at the start (share.js); the report passes
 * what it knows (PivotReport: the `share` context), the menu its texts (with the menus' own).
 */

import { toViewFile, viewFileName, viewFileText } from "pivotkit-core";
import { copyText, safeFileName, saveBlob } from "./files.js";
import { fill } from "./labels.js";
import { linkNow, loadCheck, loadLink, readLinkParam, shareBase, viewFromObject, viewFromText, withLinkParam } from "./share.js";
import { sheetOfSource } from "./sheet-views.js";
import { VERSION } from "./version.js";

/** The page's address, read when a link is made (a host may change it after the report rendered). */
const here = () => (typeof location !== "undefined" ? location.href : undefined);

/**
 * @typedef {object} ShareContext  what the report passes (PivotReport.jsx)
 * @property {boolean} canLink  the host allows links (shareLink) and the page has an address
 * @property {(() => void) | undefined} prepare  starts loading pivotkit-core/link, so a copy happens in the click
 * @property {any} view  the view shown
 * @property {string | null} viewName  the loaded view's name
 * @property {string | undefined} sourceId
 * @property {string | undefined} sourceName
 * @property {Record<string, string> | undefined} sourceParams  the source's params the files and links carry (a loaded workbook's sheet)
 * @property {((made: { id?: string | null, sheet?: string | null }, name: string, file: object) => "switch" | "missing" | "none") | undefined} viaSheet
 *   a view file made on another sheet of the workbook shown: reads that sheet, then loads `file` on it ("switch" when that started)
 * @property {string | null | undefined} schemaUrl  the `$schema` of the view files (the prop)
 * @property {import("pivotkit-core").Encoded} encoded
 * @property {boolean | string | undefined} shareLink  the prop: the base of the link
 * @property {string | undefined} linkKey  the report's key in the fragment (its storageKey): "pivot-<key>", else "pivot"
 * @property {{ current: HTMLElement | null }} root  the report's root (copies and downloads start from its document)
 * @property {string | undefined} fileName  the host's file name of exports
 * @property {((file: any) => unknown) | undefined} onExport
 * @property {(text: string, extra?: object) => void} announce
 * @property {object | undefined} limits
 * @property {Array<{ id: string, name?: string }> | undefined} sources
 * @property {((choice: any) => void) | undefined} onSourceSwitch
 * @property {(loaded: import("./share.js").LoadedView) => void} applyLoaded  shows a loaded view (a step Undo takes back)
 */

/**
 * The share entries' actions.
 * @param {ShareContext} ctx
 * @param {any} labels  with the menus' texts
 */
export function shareActions(ctx, labels) {
    const { view, viewName, sourceId, sourceName, sourceParams, schemaUrl, encoded, announce, limits, linkKey } = ctx;
    // a workbook's sheet travels with the source (source.params.sheet)
    const params = sourceParams ? { params: sourceParams } : {};
    /** The view as a view file (pivotkit-core's toViewFile): its name, the source, the fields it uses. */
    const viewFile = () => viewFileText(toViewFile(view, { name: viewName ?? "", createdAt: new Date(), generator: { name: "pivotkit-react", version: VERSION }, source: { id: sourceId, name: sourceName, ...params }, data: encoded, ...(schemaUrl !== undefined ? { schemaUrl } : {}) }));
    return {
        copyLink: async () => {
            const target = shareBase(ctx.shareLink, here());
            if (target === null) {
                return;
            }
            let text;
            try {
                text = (linkNow() ?? (await loadLink())).encodeViewLink(toViewFile(view, { name: viewName ?? undefined, source: { id: sourceId, ...params } }, { link: true }));
            } catch (e) {
                announce(e && /** @type {any} */ (e).code === "LIMIT_EXCEEDED" ? labels.toastLinkTooLong : fill(labels.error, { message: String(e) }), { tone: "error" });
                return;
            }
            const ok = await copyText(withLinkParam(target, linkKey, text), ctx.root.current);
            announce(ok ? labels.toastLinkCopied : labels.toastCopyFailed, ok ? undefined : { tone: "error" });
        },
        copyJson: async () => {
            const ok = await copyText(viewFile(), ctx.root.current);
            announce(ok ? labels.toastJsonCopied : labels.toastCopyFailed, ok ? undefined : { tone: "error" });
        },
        download: () => {
            // "<name>.pivotkit.json": the view's name, else the data's, else the host's fileName
            const file = viewFileName(viewName || sourceName || safeFileName(ctx.fileName));
            const blob = new Blob([viewFile()], { type: "application/json" });
            // the host sees the file first, as every export (kind "json"); false keeps it from the download
            if (ctx.onExport?.({ kind: "json", fileName: file, blob }) === false) {
                return;
            }
            saveBlob(blob, file, ctx.root.current?.ownerDocument ?? document);
            announce(fill(labels.toastExported, { file }));
        },
        /**
         * @param {string} text
         * @returns {Promise<string | null | { lines: string[], load: () => void, switchTo?: { name: string, run: () => void } }>}
         *   why nothing was loaded, null when it was, or what to ask first (a view for other data)
         */
        loadText: async (text) => {
            let loaded = viewFromText(text, encoded, { limits, sourceId });
            if (loaded.failed === "notJson") {
                // a link (or its "#pivot=..." part) pasted instead of JSON
                const t = text.trim();
                const fromUrl = t.includes("#") ? readLinkParam(t.slice(t.indexOf("#")), linkKey) ?? readLinkParam(t.slice(t.indexOf("#")), undefined) : null;
                const payload = fromUrl ?? (t.startsWith("1.") ? t : null);
                if (!payload) {
                    return labels.viewFailed.notJson;
                }
                try {
                    const decoded = (linkNow() ?? (await loadLink())).decodeViewLink(payload);
                    loaded = decoded.view ? viewFromObject(decoded.view, encoded, { limits, sourceId }) : { view: null, issues: [], failed: "badLink", file: null };
                } catch {
                    return labels.viewFailed.badLink;
                }
            }
            if (!loaded.view) {
                return labels.viewFailed[loaded.failed ?? "notView"] ?? labels.viewFailed.notView;
            }
            const ready = /** @type {import("./share.js").LoadedView} */ (loaded);
            // made on another sheet of the workbook shown: that sheet first, then the view on it
            const made = ready.file?.source;
            if (made && ready.file?.view && ctx.viaSheet?.({ id: made.id, sheet: sheetOfSource(made) }, ready.file.name || viewName || "", toViewFile(ready.file.view, { name: ready.file.name, source: made })) === "switch") {
                return null;
            }
            const check = loadCheck(ready, labels, Array.isArray(ctx.sources) ? ctx.sources : []);
            if (!check) {
                ctx.applyLoaded(ready);
                return null;
            }
            const target = check.switchTo;
            const switchTo = ctx.onSourceSwitch;
            return {
                lines: check.lines,
                load: () => ctx.applyLoaded(ready),
                switchTo:
                    target && typeof switchTo === "function"
                        ? { name: target.name, run: () => switchTo({ source: { id: target.id, name: target.name }, view: /** @type {Record<string, unknown>} */ (ready.file?.view ?? ready.view), name: ready.file?.name || undefined }) }
                        : undefined
            };
        }
    };
}
