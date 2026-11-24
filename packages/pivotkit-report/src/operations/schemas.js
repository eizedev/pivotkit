/*
 * The JSON Schema fragments the operations' inputs and outputs share (draft 2020-12, no "$schema"
 * key).
 */

import { CATALOG, LAYOUT_LIMITS, OUTSIDE_LIMITS } from "pivotkit-core";
import { RENDER_FORMATS } from "../render.js";

export const SOURCE = { type: "string", minLength: 1, maxLength: 1024, description: 'A source id from list_sources, or "file:" and a path inside the allowed directories.' };
export const VIEW = {
    type: ["object", "string"],
    description: "The view: a JSON object with rows, cols, values, filters, derived, sort, display (see get_view_guide), or a view file, or its JSON text."
};
const NAME = { type: "string", minLength: 1, maxLength: LAYOUT_LIMITS.name };
const NAMES = { type: "array", maxItems: LAYOUT_LIMITS.entries, items: NAME };
/** A layout (pivotkit-core's viewFromLayout): a view by field names, instead of a view. */
export const LAYOUT = {
    type: "object",
    additionalProperties: false,
    description: 'A view by field names, instead of a view (give one of them, not both): { "rows": ["Region"], "cols": ["OrderDate"], "values": [{ "field": "Sales", "agg": "sum" }], "groups": [{ "field": "OrderDate", "by": "yearQuarter" }] }. A date on rows or cols is grouped by its span unless groups says how; a value without agg is summed when it is a number, else counted.',
    properties: {
        rows: { ...NAMES, description: "Fields (or groupings) on the rows, outer first." },
        cols: { ...NAMES, description: "Fields on the columns." },
        values: { type: "array", maxItems: LAYOUT_LIMITS.entries, items: { type: "object", additionalProperties: false, properties: { field: NAME, agg: { type: "string", maxLength: 40 } } } },
        groups: { type: "array", maxItems: LAYOUT_LIMITS.entries, items: { type: "object", additionalProperties: false, required: ["field", "by"], properties: { field: NAME, by: { type: "string", maxLength: 40, description: "year, yearQuarter, yearMonth, yearWeek, day; quarter, month, week, weekday, hour (every year together); bin with size." }, size: { type: "number" } } } },
        filters: { type: "array", maxItems: OUTSIDE_LIMITS.filters, items: { type: "object" }, description: "Filters as a view writes them (see get_view_guide)." },
        chart: { enum: [...CATALOG.chartTypes], description: "Show the chart of this type." },
        map: { type: "object", maxProperties: LAYOUT_LIMITS.entries, additionalProperties: { type: "string", minLength: 1, maxLength: LAYOUT_LIMITS.name }, description: "A field the layout names (key) is the data's field (value): for a column renamed since." }
    }
};
const FINDING = {
    type: "object",
    required: ["severity", "code", "path", "message"],
    properties: {
        severity: { enum: ["error", "warning", "info"] },
        code: { type: "string" },
        path: { type: "string", description: "Where in the view, e.g. filters.0.items" },
        message: { type: "string" },
        suggestion: { type: "string", description: "The name or item meant" },
        field: { type: "string", description: "The data field the finding is about, where it is about one" }
    }
};
export const FINDINGS = { type: "array", items: FINDING };
export const USES = { type: "array", items: { type: "string" }, description: "The data fields the view uses (rows, columns, values, filters, sort; a grouping as its source field)." };
export const FORMATS = Object.keys(RENDER_FORMATS);
export const DESCRIBED_VIEW = {
    type: "object",
    properties: {
        text: { type: "string" },
        valid: { type: "boolean" },
        rows: { type: "object", properties: { fields: { type: "array", items: { type: "string" } }, text: { type: "string" } } },
        cols: { type: "object", properties: { fields: { type: "array", items: { type: "string" } }, text: { type: "string" } } },
        values: { type: "array", items: { type: "object" } },
        filters: { type: "array", items: { type: "object" } },
        derived: { type: "array", items: { type: "object" } },
        sort: { type: "array", items: { type: "object" } },
        display: { type: "object" }
    }
};

/** An input or output object: its properties, the required ones, no others. */
export const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

/** render_view's locale: a language tag the caller asks for (localeOf checks it). */
export const LOCALE = { type: "string", maxLength: 35, pattern: "^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$", description: "The language of the report's labels and its number format, such as de-DE, for a view or layout that names none." };

/**
 * render_view's `inline`, for a front end that may put the result into its answer (pivotkit-server;
 * it leaves it out of the schemas callers see): the result also as text for a reader, csv or json,
 * with its own `numbers` (default "shown"), up to `maxCells` cells (inlineOf).
 */
export const INLINE_INPUT = { type: "object", additionalProperties: false, properties: { numbers: { enum: ["shown", "full"] }, maxCells: { type: "integer", minimum: 0 } } };

/** How csv and json write numbers (pivotkit-core's toCsv and toJson `numbers`). */
export const NUMBERS = { enum: ["shown", "full"], description: "csv and json: shown rounds each number to the decimals the view shows (no float noise such as 9.59999999999999); full keeps 15 significant digits." };
