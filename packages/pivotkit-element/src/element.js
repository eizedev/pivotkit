/*
 * <pivot-report>: pivotkit-react's <PivotReport> in an open shadow root, on a React of its own (bundled
 * by build.js), for pages without React. Properties and attributes become the report's props (the
 * table in props.js), the report's callbacks become events (events.js). One React root per element:
 * mounted when the element is connected, unmounted when it stays disconnected (a move to another
 * place in the same task keeps it). Without customElements (Node, a server render) importing this
 * module defines nothing and touches no DOM.
 *
 *   import { define } from "pivotkit-element/element";
 *   define("my-report");    // <my-report>, without defining <pivot-report>
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { PivotReport } from "pivotkit-react";
import { EVENTS, emit, request } from "./events.js";
import { ATTRIBUTES, OBJECT_PROPS, fromAttribute, localeOf, toAttribute } from "./props.js";
import { adoptStyles } from "./styles.js";

// the event names, so this entry has the same exports as the one that defines the tag
export { EVENTS };

/**
 * A view of pivotkit-core (the report template): plain JSON with field names only, normalized against
 * the data by the report; anything unknown is dropped. The full type is pivotkit-core's `View`.
 * @typedef {{ rows?: string[], cols?: string[], values?: Array<{ field?: string | null, agg?: string, format?: string | null, [key: string]: unknown }>, [key: string]: unknown }} PivotView
 */

/**
 * @typedef {object} Template  an entry of the Templates menu
 * @property {string} name
 * @property {PivotView} view
 * @property {boolean} [deletable]  offers a delete button (pivot-template-delete)
 */

/**
 * @typedef {object} FieldDefaults  the host's settings for a field, as pivotkit-react's
 * @property {string} [agg]  aggregator of a new value, when it fits the field's type ("average" for durations)
 * @property {string} [format]  a format of pivotkit-core ("duration:h", "currency:EUR") for a new value,
 *   and for the field's own numbers in the drill-down unless `drillFormat` is set
 * @property {string} [drillFormat]  the format of the field's values in the drill-down ("text": an identifier as it is)
 */

/**
 * @typedef {object} CellClick  the detail of pivot-cell-click
 * @property {any[]} row  key path of the row ([] is the grand total)
 * @property {any[]} col  key path of the column
 * @property {unknown} value  the raw value of the cell
 * @property {number | undefined} valueIndex
 * @property {string | undefined} text  the value as shown
 * @property {number} count  source rows behind the cell
 * @property {object[]} rows  the first `drillDownLimit` of them: the host's row objects
 */

/**
 * @typedef {object} ExportFile  the detail of pivot-export
 * @property {"xlsx" | "csv" | "png"} kind
 * @property {string} fileName  with the extension ("pivot.xlsx")
 * @property {Blob} blob
 */

/**
 * @typedef {object} TemplateSave  the detail of pivot-template-save
 * @property {string} name
 * @property {PivotView} view  the normalized view to store
 * @property {(result: unknown) => void} respondWith  call it in the listener with the promise of the
 *   host's save: "Saved" shows when it resolves, the error's message when it rejects
 */

/**
 * @typedef {object} TemplateDelete  the detail of pivot-template-delete
 * @property {string} name
 * @property {(result: unknown) => void} respondWith  as for pivot-template-save: the entry goes when
 *   the promise resolves (the host then sets `templates` without it)
 */

/** The tag the package defines. */
export const TAG = "pivot-report";

/** This package's version, from its package.json (build.js). */
const VERSION = typeof __PIVOTKIT_ELEMENT_VERSION__ === "string" ? __PIVOTKIT_ELEMENT_VERSION__ : "0.0.0-source";

// in Node there is no HTMLElement: a plain base keeps the module importable
const Base = /** @type {typeof HTMLElement} */ (typeof HTMLElement === "undefined" ? /** @type {any} */ (class {}) : HTMLElement);
const BY_ATTR = new Map(ATTRIBUTES.map((def) => [def.attr, def]));
/** Every property a page may have set before the element was defined. */
const UPGRADED = [...ATTRIBUTES.map((def) => def.prop), ...OBJECT_PROPS];

export class PivotReportElement extends Base {
    static get observedAttributes() {
        return [...BY_ATTR.keys(), "lang"];
    }

    /** @type {ShadowRoot} */
    #shadow;
    /** @type {import("react-dom/client").Root | null} */
    #root = null;
    /** @type {HTMLDivElement | null} */
    #container = null;
    /** @type {MutationObserver | null} */
    #observer = null;
    #queued = false;
    /** The values of the object properties and of the JSON attributes. */
    #values = /** @type {Record<string, any>} */ ({});
    /** The last view the report reported: the start view when the element is connected again. */
    /** @type {PivotView | undefined} */
    #lastView;
    /** The React key of the report: a new start view (defaultView) mounts a new report. */
    #start = { key: 0, json: "null" };

    constructor() {
        super();
        this.#shadow = this.attachShadow({ mode: "open" });
        adoptStyles(this.#shadow);
    }

    /** The version of pivotkit-element this class comes from (two copies on a page tell each other apart). */
    static get version() {
        return VERSION;
    }

    connectedCallback() {
        // a property set on the element before it was defined is an own property that hides the
        // accessor: take its value through the setter
        for (const prop of UPGRADED) {
            if (Object.hasOwn(this, prop)) {
                const value = /** @type {any} */ (this)[prop];
                delete (/** @type {any} */ (this)[prop]);
                /** @type {any} */ (this)[prop] = value;
            }
        }
        if (!this.#root) {
            this.#mount();
        }
        this.#update();
    }

    disconnectedCallback() {
        // removed and inserted again in the same task (a move): keep the report and its history
        queueMicrotask(() => {
            if (!this.isConnected) {
                this.#unmount();
            }
        });
    }

    /**
     * @param {string} name
     * @param {string | null} _old
     * @param {string | null} value
     */
    attributeChangedCallback(name, _old, value) {
        const def = BY_ATTR.get(name);
        if (def?.kind === "json") {
            const parsed = fromAttribute(def, value);
            if (parsed === undefined && value !== null && value.trim() !== "") {
                console.warn(`<${this.localName}>: the ${name} attribute is not a JSON object and is ignored`);
            }
            if (def.prop === "defaultView") {
                this.#restart(parsed);
            }
            this.#values[def.prop] = parsed;
        }
        this.#update();
    }

    // ---- attributes, reflected ----

    /** Numbers, dates, sorting and the language of the labels ("de-DE"); else the element's `lang`, else "en-US". */
    get locale() {
        return /** @type {string | undefined} */ (this.#read("locale"));
    }
    set locale(value) {
        this.#write("locale", value);
    }

    /** "auto" (default) follows the nearest data-theme above the report, then the system. */
    get theme() {
        return /** @type {"auto" | "light" | "dark"} */ (this.#read("theme"));
    }
    set theme(value) {
        this.#write("theme", value);
    }

    /** The report's height: a number of pixels or a CSS length (default 640). */
    get height() {
        return /** @type {number | string | undefined} */ (this.#read("height"));
    }
    set height(value) {
        this.#write("height", value);
    }

    /** The zone `data` is encoded in (default "UTC"). */
    get timeZone() {
        return /** @type {string | undefined} */ (this.#read("time-zone"));
    }
    set timeZone(value) {
        this.#write("time-zone", value);
    }

    /** Name of exported files without extension (default "pivot"). */
    get fileName() {
        return /** @type {string | undefined} */ (this.#read("file-name"));
    }
    set fileName(value) {
        this.#write("file-name", value);
    }

    /** The name of the report's region landmark (default the labels' `report`, "Pivot report"). */
    get label() {
        return /** @type {string | undefined} */ (this.#read("label"));
    }
    set label(value) {
        this.#write("label", value);
    }

    /** The panel with the rows behind a clicked value (default true; attribute drill-down="false"). */
    get drillDown() {
        return /** @type {boolean} */ (this.#read("drill-down"));
    }
    set drillDown(value) {
        this.#write("drill-down", value);
    }

    /** Rows passed to the panel and to pivot-cell-click (default 1000). */
    get drillDownLimit() {
        return /** @type {number | undefined} */ (this.#read("drill-down-limit"));
    }
    set drillDownLimit(value) {
        this.#write("drill-down-limit", value);
    }

    /** Offers "Save current view" in the Templates menu; a save is a pivot-template-save event. */
    get saveTemplates() {
        return /** @type {boolean} */ (this.#read("save-templates"));
    }
    set saveTemplates(value) {
        this.#write("save-templates", value);
    }

    // ---- views: properties, also set by the JSON attributes view and default-view ----

    /** Controlled: the view to show; set it again from every pivot-view-change. Undefined: uncontrolled. */
    get view() {
        return /** @type {PivotView | undefined} */ (this.#values.view);
    }
    set view(value) {
        this.#set("view", value);
    }

    /**
     * Uncontrolled: the start view. A different one (by value) starts the report again on it, with a
     * new undo history; frameworks often set it only after the element is in the page.
     */
    get defaultView() {
        return /** @type {PivotView | undefined} */ (this.#values.defaultView);
    }
    set defaultView(value) {
        this.#restart(value);
        this.#set("defaultView", value);
    }

    // ---- properties without an attribute ----

    /** The rows: an array of objects; encoded once per array, or once per `dataKey`. */
    get data() {
        return /** @type {object[] | undefined} */ (this.#values.data);
    }
    set data(value) {
        this.#set("data", value);
    }

    /** The identity of `data`: a new array with the same key is not encoded again. */
    get dataKey() {
        return /** @type {string | number | undefined} */ (this.#values.dataKey);
    }
    set dataKey(value) {
        this.#set("dataKey", value);
    }

    /** The Templates menu; the first three are also offered in the empty state. */
    get templates() {
        return /** @type {Template[] | undefined} */ (this.#values.templates);
    }
    set templates(value) {
        this.#set("templates", value);
    }

    /** Texts merged over the locale's labels (pivotkit-react's LABELS.en has every key). */
    get labels() {
        return /** @type {Record<string, unknown> | undefined} */ (this.#values.labels);
    }
    set labels(value) {
        this.#set("labels", value);
    }

    /** Per field name: the aggregator and format of a new value. */
    get fieldDefaults() {
        return /** @type {Record<string, FieldDefaults> | undefined} */ (this.#values.fieldDefaults);
    }
    set fieldDefaults(value) {
        this.#set("fieldDefaults", value);
    }

    /** pivotkit-core's limits (rows, cells, ...). */
    get limits() {
        return /** @type {Record<string, number> | undefined} */ (this.#values.limits);
    }
    set limits(value) {
        this.#set("limits", value);
    }

    // ---- internals ----

    /** @param {string} attr */
    #read(attr) {
        return fromAttribute(/** @type {import("./props.js").AttributeDef} */ (BY_ATTR.get(attr)), this.getAttribute(attr));
    }

    /** @param {string} attr @param {unknown} value */
    #write(attr, value) {
        const text = toAttribute(/** @type {import("./props.js").AttributeDef} */ (BY_ATTR.get(attr)), value);
        if (text === null) {
            this.removeAttribute(attr);
        } else {
            this.setAttribute(attr, text);
        }
    }

    /** @param {string} prop @param {unknown} value */
    #set(prop, value) {
        this.#values[prop] = value ?? undefined;
        this.#update();
    }

    /**
     * A new start view of an uncontrolled report: the report is mounted again (a new React key) and
     * starts on it. The same view again, or any start view of a controlled report, changes nothing.
     * @param {unknown} value
     */
    #restart(value) {
        const json = JSON.stringify(value ?? null);
        // the view the report reported, given back (a page that stores every change and binds it as
        // the start view): the report shows it already, a new mount would lose the history
        const shown = this.#lastView !== undefined && json === JSON.stringify(this.#lastView);
        if (shown) {
            this.#start = { key: this.#start.key, json };
        } else if (json !== this.#start.json && this.#values.view === undefined) {
            this.#start = { key: this.#start.key + 1, json };
            this.#lastView = undefined;
        }
    }

    #mount() {
        const container = this.ownerDocument.createElement("div");
        // fills the element, so height="100%" is a share of the element's own height
        container.className = "pk-mount";
        this.#shadow.append(container);
        this.#container = container;
        this.#root = createRoot(container);
        // the report's resolved theme on the element, for the dark token rules (host-css.js) and for
        // the page: the root element is observed once it exists
        const observer = new MutationObserver(() => this.#syncTheme());
        observer.observe(container, { childList: true });
        this.#observer = observer;
    }

    #unmount() {
        this.#observer?.disconnect();
        this.#observer = null;
        this.#root?.unmount();
        this.#root = null;
        this.#container?.remove();
        this.#container = null;
    }

    #syncTheme() {
        const report = this.#container?.firstElementChild;
        if (!report) {
            return;
        }
        this.#observer?.observe(report, { attributes: true, attributeFilter: ["data-pk-theme"] });
        const theme = report.getAttribute("data-pk-theme");
        if (theme && this.getAttribute("data-pk-theme") !== theme) {
            this.setAttribute("data-pk-theme", theme);
        }
    }

    /** Renders once per task, however many properties changed. */
    #update() {
        if (!this.#root || this.#queued) {
            return;
        }
        this.#queued = true;
        queueMicrotask(() => {
            this.#queued = false;
            this.#root?.render(React.createElement(PivotReport, { key: this.#start.key, ...this.#props() }));
        });
    }

    /** The props of <PivotReport>. */
    #props() {
        const v = this.#values;
        const controlled = v.view !== undefined;
        return {
            data: Array.isArray(v.data) ? v.data : [],
            dataKey: v.dataKey,
            view: v.view,
            defaultView: controlled ? undefined : (this.#lastView ?? v.defaultView),
            onViewChange: this.#onViewChange,
            templates: Array.isArray(v.templates) ? v.templates : [],
            onSaveTemplate: this.saveTemplates ? this.#onSaveTemplate : undefined,
            onDeleteTemplate: this.#onDeleteTemplate,
            fieldDefaults: v.fieldDefaults,
            onCellClick: this.#onCellClick,
            onExport: this.#onExport,
            drillDown: this.drillDown,
            drillDownLimit: this.drillDownLimit,
            locale: localeOf(this.locale, this.getAttribute("lang")),
            timeZone: this.timeZone,
            labels: v.labels,
            theme: this.theme,
            height: this.height,
            limits: v.limits,
            fileName: this.fileName,
            label: this.label
        };
    }

    /** @param {PivotView} view */
    #onViewChange = (view) => {
        this.#lastView = view;
        emit(this, EVENTS.viewChange, { view });
    };

    /** @param {CellClick} cell */
    #onCellClick = (cell) => {
        emit(this, EVENTS.cellClick, cell);
    };

    /** @param {string} name @param {PivotView} view */
    #onSaveTemplate = (name, view) => request(this, EVENTS.templateSave, { name, view });

    /** @param {string} name */
    #onDeleteTemplate = (name) => request(this, EVENTS.templateDelete, { name });

    /** false (no download) when a listener called preventDefault() @param {ExportFile} file */
    #onExport = (file) => emit(this, EVENTS.export, file, { cancelable: true });
}

/** Whether PivotReportElement itself is registered (a constructor is defined once per registry). */
let registered = false;

/**
 * Defines the element under a tag name (default "pivot-report"). A name that is already defined is
 * left alone, so loading the package twice does not throw; its constructor is returned, and a warning
 * names both versions when the definition is not this copy's.
 * @param {string} [name]
 * @returns {CustomElementConstructor | undefined} undefined without customElements (Node)
 */
export function define(name = TAG) {
    if (typeof customElements === "undefined") {
        return undefined;
    }
    const existing = customElements.get(name);
    if (existing) {
        if (existing !== PivotReportElement && !(existing.prototype instanceof PivotReportElement)) {
            const other = /** @type {any} */ (existing).version;
            console.warn(`<${name}> is defined already${typeof other === "string" ? ` by pivotkit-element ${other}` : " by another script"}; pivotkit-element ${VERSION} loaded again is not used for it`);
        }
        return existing;
    }
    const ctor = registered ? class extends PivotReportElement {} : PivotReportElement;
    customElements.define(name, ctor);
    registered = true;
    return ctor;
}
