// The element in the DOM's type maps: document.createElement("pivot-report") and querySelector give a
// PivotReportElement, and addEventListener("pivot-view-change", ...) on it (or on a parent: the events
// bubble and are composed) knows the event's detail. Copied next to the generated declarations by
// types.js; written by hand because JSDoc cannot augment global interfaces.
import type { CellClick, DataLoad, ExportFile, PivotReportElement, PivotView, SourceSwitch, TemplateDelete, TemplatePublish, TemplateSave, TipDismiss } from "./element.js";

/** The events of <pivot-report>. */
export interface PivotReportEventMap {
    /** Every change of the view, normalized. Controlled: set `view` to `detail.view`. */
    "pivot-view-change": CustomEvent<{ view: PivotView }>;
    /** A click (or Enter) on a value or a chart point. */
    "pivot-cell-click": CustomEvent<CellClick>;
    /** "Save current view" (shown with `save-templates`); answer with `detail.respondWith(promise)`. */
    "pivot-template-save": CustomEvent<TemplateSave>;
    /** Delete of a template marked `deletable`, after the user confirmed; answer with `detail.respondWith(promise)`. */
    "pivot-template-delete": CustomEvent<TemplateDelete>;
    /** "Publish as shared view" on a user's view (shown with `can-publish`); answer with `detail.respondWith(promise)`. */
    "pivot-template-publish": CustomEvent<TemplatePublish>;
    /** Every exported file before its download and every copy before the clipboard; `preventDefault()` skips it. */
    "pivot-export": CustomEvent<ExportFile>;
    /** A tip dismissed, all tips switched off or back on; `detail.dismissed` is the whole list to store. */
    "pivot-tip-dismiss": CustomEvent<TipDismiss>;
    /** "Switch to <name> and load" for a view made for other data (one of `sources`): show that data with `detail.view`. */
    "pivot-source-switch": CustomEvent<SourceSwitch>;
    /** The data shown changed (with `allow-import`): a file loaded (`preventDefault()` refuses it), the page's data again, or one of those undone or redone. */
    "pivot-data-load": CustomEvent<DataLoad>;
}

declare global {
    interface HTMLElementTagNameMap {
        "pivot-report": PivotReportElement;
    }
    // on the element, a parent, the document and the window: the events bubble and are composed
    interface GlobalEventHandlersEventMap extends PivotReportEventMap {}
}
