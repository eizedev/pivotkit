/*
 * The REST routes, one per operation of pivotkit-report's table (its `http` method and path under
 * /api/v1), plus GET /sources/{id} (describe_source by address) and POST /views/render/file (the
 * rendered file itself). What the table's words say to a model ("call it first") is replaced by a
 * neutral summary here; the examples are synthetic (a made-up "sales" source) and a test checks each
 * against the input and output schemas.
 */

import { OPERATIONS } from "pivotkit-report/operations";

export { REST_BASE } from "../config.js";

const VIEW = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };
const FINDING = { severity: "error", code: "unknownField", path: "rows[0]", message: 'unknown field "Regoin"', suggestion: "Region" };

/** Per operation: a neutral summary and one example of input and output. */
const WORDS = {
    list_sources: {
        summary: "List the data sources",
        description: "The data sources this caller may use: id, title, whether a link or a schedule works for them.",
        example: { input: {}, output: { sources: [{ id: "sales", title: "Sales", kind: "source", link: true, schedulable: true }] } }
    },
    describe_source: {
        summary: "Describe a data source",
        description: "A source's fields: name, type, level, counts, the aggregators and filter types each works with, and example views. Values (items, smallest and largest) only for fields the policy shows.",
        example: {
            input: { source: "sales" },
            output: {
                rows: 2000,
                fields: [
                    { name: "Region", type: "string", level: "show", distinct: 4, blanks: 0, items: ["North", "South", "East", "West"], aggregators: ["count", "countDistinct"], filters: ["in", "text"], text: "Region: string, show, 4 distinct, 0 blank" },
                    { name: "Sales", type: "number", level: "summary", distinct: 1850, blanks: 0, aggregators: ["sum", "avg", "min", "max"], filters: ["compare", "between"], text: "Sales: number, summary, 1850 distinct, 0 blank" }
                ],
                hiddenFields: 1,
                text: "2000 rows, 2 fields (1 more hidden by the operator)",
                examples: [{ title: "Sum of Sales by Region", view: { version: 2, ...VIEW } }],
                notes: []
            }
        }
    },
    get_view_guide: {
        summary: "How to write a view",
        description: "The format of a view in short: its keys, the aggregators, filter types and date groupings, and example views.",
        example: { input: {}, output: { text: "A view is JSON: rows, cols, values, filters, ...", catalog: {}, examples: [{ title: "Sum of Sales by Region", view: { version: 2, ...VIEW } }] } }
    },
    validate_view: {
        summary: "Validate a view",
        description: "Checks a view against a source: errors and warnings with where they are and, for a misspelt name, the name meant (suggestion).",
        example: { input: { source: "sales", view: { ...VIEW, rows: ["Regoin"] } }, output: { valid: false, findings: [FINDING], uses: ["Sales"] } }
    },
    describe_view: {
        summary: "Describe a view",
        description: "What a view shows and filters, in plain parts, with the same findings as validate.",
        example: { input: { source: "sales", view: VIEW }, output: { valid: true, name: "", description: { text: "Sum of Sales by Region", valid: true, rows: { fields: ["Region"], text: "Region" } }, findings: [], uses: ["Region", "Sales"] } }
    },
    render_view: {
        summary: "Render a view into the output directory",
        description: "Runs a view over a source and saves the report (xlsx by default; html, csv, json, svg) in the server's output directory. A view with errors answers 200 with ok: false and its findings. csv and json come back inline only where the operator allows it (rest.inline).",
        example: { input: { source: "sales", view: VIEW, format: "xlsx" }, output: { ok: true, findings: [], uses: ["Region", "Sales"], format: "xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", withheld: ["rows", "columns", "bytes", "content"], output: { name: "Sum of Sales by Region.xlsx", format: "xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, message: "The report is saved as Sum of Sales by Region.xlsx in the output directory." } }
    },
    create_link: {
        summary: "Create a link to a view",
        description: "A link that opens the view in the source's report page, where a person sees the data with their own rights. Only for sources with link: true; a view with errors gets no link.",
        example: { input: { source: "sales", view: VIEW, name: "Sales by region" }, output: { ok: true, url: "https://reports.example.com/sales#pk=...", findings: [], uses: ["Region", "Sales"] } }
    },
    draft_schedule: {
        summary: "Draft a schedule",
        description: "Writes a draft for a report that runs on a schedule. It runs nothing and sends nothing: a person approves the draft in the host. Recipients are names the host knows, never addresses.",
        example: {
            input: { source: "sales", view: VIEW, name: "Weekly sales", formats: ["xlsx"], every: { unit: "week", at: "07:00", weekday: "mon", timeZone: "Europe/Berlin" }, recipients: ["Sales team"] },
            output: { ok: true, findings: [], uses: ["Region", "Sales"], draft: { format: "pivotkit-report-draft", status: "draft", name: "Weekly sales" }, output: { name: "Weekly sales.report.json", format: "json", mediaType: "application/json" }, message: 'The draft "Weekly sales" is ready for approval, saved as Weekly sales.report.json in the output directory. Nothing runs until a person approves it in the host.' }
        }
    }
};

/**
 * @typedef {object} RestRoute
 * @property {string} id  the OpenAPI operationId
 * @property {string} operation  the operation of pivotkit-report's table
 * @property {"GET" | "POST"} method
 * @property {string} path  under REST_BASE; "{id}" is a path parameter
 * @property {string} summary
 * @property {string} description
 * @property {"json" | "file"} answer
 * @property {{ input: Record<string, unknown>, output: Record<string, unknown> }} example
 */

/** @type {ReadonlyArray<RestRoute>} */
export const REST_ROUTES = Object.freeze([
    ...Object.values(OPERATIONS).map((op) => ({ id: camel(op.name), operation: op.name, method: /** @type {"GET" | "POST"} */ (op.http.method), path: op.http.path, summary: WORDS[op.name]?.summary ?? op.title, description: WORDS[op.name]?.description ?? op.title, answer: /** @type {const} */ ("json"), example: WORDS[op.name]?.example ?? { input: {}, output: {} } })),
    { id: "getSource", operation: "describe_source", method: /** @type {const} */ ("GET"), path: "/sources/{id}", summary: "Describe a data source by its id", description: `${WORDS.describe_source.description} The same as POST /sources/describe.`, answer: /** @type {const} */ ("json"), example: WORDS.describe_source.example },
    {
        id: "renderViewFile",
        operation: "render_view",
        method: /** @type {const} */ ("POST"),
        path: "/views/render/file",
        summary: "Render a view and download the file",
        description: "Runs a view over a source and answers with the file itself (Content-Disposition: attachment). Allowed only for callers whose policy profile has results: true; a view with errors answers 422 with its findings.",
        answer: /** @type {const} */ ("file"),
        example: { input: { source: "sales", view: VIEW, format: "csv" }, output: {} }
    }
].map((route) => Object.freeze(route)));

/** "describe_source" as "describeSource". */
function camel(name) {
    return name.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
}
