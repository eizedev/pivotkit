// Builds pivotkit-core's JSON Schemas of view version 2 from the tables the engine runs on, so a
// schema can never describe a view the engine reads otherwise:
//   schema/view-2.json       a view (FILTERS' keys and required keys, the enum tables, LIMITS)
//   schema/view-file-2.json  the view file: the envelope (VIEW_FILE_LIMITS, source.params by LIMITS) with the view
// tests/view-file-schema.test.js checks that the committed files are what this script builds (run it
// after changing a table) and that the schema refuses every issue case VIEW_ISSUES marks `schema`.
//
//   node scripts/schemas.js
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGGREGATOR_NAMES } from "../packages/pivotkit-core/src/aggregators.js";
import { DERIVE_UNITS, MIN_BIN_SIZE } from "../packages/pivotkit-core/src/derive.js";
import { COMPARE_OPS, COMPARE_PRECISIONS, FILTERS, FILTER_BLANKS, RELATIVE_ANCHORS, RELATIVE_DIRECTIONS, RELATIVE_MAX_COUNT, RELATIVE_UNITS, TEXT_ON, TEXT_OPS, TOP_TIES } from "../packages/pivotkit-core/src/filters.js";
import { LIMITS } from "../packages/pivotkit-core/src/limits.js";
import { SHOW_AS_NAMES } from "../packages/pivotkit-core/src/show-as.js";
import { MATCH_CASES, MATCH_WHITESPACE } from "../packages/pivotkit-core/src/text-match.js";
import { FIELD_TYPES, VIEW_FILE_FORMAT, VIEW_FILE_LIMITS, VIEW_FILE_SCHEMA, VIEW_FILE_VERSION } from "../packages/pivotkit-core/src/view-file.js";
import { CHART_AXIS_LABELS, CHART_GROUP_LABELS, CHART_LABEL_POSITIONS, CHART_LEGENDS, CHART_TYPES, CHART_VALUE_LABELS, COLOR, DISPLAY_MODES, SORT_BY, VIEW_VERSION, emptyView } from "../packages/pivotkit-core/src/view.js";

/** Where the schemas are published (the site copies schema/ there, scripts/docs-demo.js). */
export const SCHEMA_BASE = "https://pivotkit.eize.dev/schema/";

/** An object of exactly these properties, `required` of them. */
const object = (properties, required = [], extra = {}) => ({ type: "object", additionalProperties: false, ...(required.length ? { required } : {}), properties, ...extra });
const list = (items, maxItems, extra = {}) => ({ type: "array", maxItems, items, ...extra });
const text = (maxLength) => ({ type: "string", maxLength });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const ref = (name) => ({ $ref: `#/$defs/${name}` });
/** A date as a view writes one: "2025-06-30", with a time "2025-06-30T18:00", a year beyond 9999 with its sign. */
const ISO_DATE = "^[+-]?\\d{4,6}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:?\\d{2})?)?$";

/** The schema of each key a filter can have; a key with another meaning per type is keyed "type.key". */
const FILTER_KEYS = {
    field: ref("fieldName"),
    items: list(ref("item"), LIMITS.items, { description: "The items, as the data has them; a blank is no item (see blanks)." }),
    not: { type: "boolean", description: "Inverts which items with a value the filter keeps; blanks are decided by blanks alone." },
    blanks: { enum: [...FILTER_BLANKS], description: "What happens to blank items: exclude (the default) drops them, include keeps them too, only keeps them alone." },
    "text.op": { enum: [...TEXT_OPS] },
    "text.value": text(LIMITS.textValue),
    on: { enum: [...TEXT_ON], description: "value: a text field's own value; label: the label the table shows (any field)." },
    match: object({ case: { enum: [...MATCH_CASES] }, whitespace: { enum: [...MATCH_WHITESPACE] } }, [], { description: "How text is folded before it is compared; default insensitive and collapse." }),
    "compare.op": { enum: [...COMPARE_OPS] },
    "compare.value": { type: ["number", "string"], description: "A number (also as text, \"2022\") or a date \"2022-03-01\"." },
    "compare.value2": { type: ["number", "string"] },
    precision: { enum: [...COMPARE_PRECISIONS], description: "Dates only: both sides as the start of their unit; default day." },
    direction: { enum: [...RELATIVE_DIRECTIONS], description: "Default last." },
    unit: { enum: [...RELATIVE_UNITS] },
    "relative.count": { type: "integer", minimum: 1, maximum: RELATIVE_MAX_COUNT },
    calendar: { type: "boolean", description: "true (the default): whole units; false: rolling from now." },
    includeCurrent: { type: "boolean", description: "With calendar: whether the current unit counts; default true." },
    anchor: { anyOf: [{ enum: [...RELATIVE_ANCHORS] }, { type: "string", pattern: ISO_DATE }], description: "What the range counts from: today (the default), latest, first, or a date." },
    by: ref("valueRef"),
    "top.count": { type: "integer", minimum: 1, maximum: LIMITS.topCount },
    bottom: { type: "boolean" },
    ties: { enum: [...TOP_TIES], description: "first (the default): exactly count groups; all: every group tied at the cut too." },
    "value.op": { enum: [...COMPARE_OPS] },
    "value.value": { type: "number" },
    "value.value2": { type: "number" }
};

/** The schema of one filter type, from its keys and required keys in FILTERS. */
function filterSchema(type) {
    const def = FILTERS[type];
    const properties = Object.fromEntries(def.keys.map((key) => [key, key === "type" ? { const: type } : FILTER_KEYS[`${type}.${key}`] ?? FILTER_KEYS[key]]));
    const missing = Object.entries(properties).filter(([, schema]) => schema === undefined);
    if (missing.length) {
        throw new Error(`scripts/schemas.js: no schema for the key ${missing.map(([k]) => `${type}.${k}`).join(", ")}`);
    }
    const rules = [];
    if (def.keys.includes("value2")) {
        rules.push({ if: { properties: { op: { const: "between" } }, required: ["op"] }, then: { required: ["value2"] } });
    }
    if (type === "relative") {
        rules.push({ if: { properties: { direction: { const: "this" } }, required: ["direction"] }, then: { not: { required: ["count"] } }, else: { required: ["count"] } });
    }
    return object(properties, [...def.required], rules.length ? { allOf: rules } : {});
}

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/** The JSON Schema of a view of version 2. */
export function viewSchema() {
    const { body, $defs } = viewParts();
    return {
        $schema: DRAFT,
        $id: `${SCHEMA_BASE}view-${VIEW_VERSION}.json`,
        title: `pivotkit view, version ${VIEW_VERSION}`,
        description:
            "A pivotkit view: the report's layout as JSON. Names are resolved against the data by pivotkit-core's normalize(), which also checks what a schema cannot (a field's name and type, an aggregator for a field). Built by scripts/schemas.js from pivotkit-core's tables. See https://pivotkit.eize.dev/concepts/views/",
        ...body,
        $defs
    };
}

/** A view's schema without its header: the object (`body`) and the definitions it refers to. */
function viewParts() {
    const empty = emptyView();
    return {
        body: object({
            version: { const: VIEW_VERSION, description: "A view without a version is read as version 1." },
            rows: list(ref("fieldName"), LIMITS.axisFields),
            cols: list(ref("fieldName"), LIMITS.axisFields),
            values: list(ref("value"), LIMITS.values),
            filters: list({ oneOf: Object.keys(FILTERS).map(filterSchema) }, LIMITS.filters, { description: "The filters, applied together (and)." }),
            derived: list(ref("derived"), LIMITS.derived),
            sort: list(ref("sort"), LIMITS.sort),
            totals: object(Object.fromEntries(Object.keys(empty.totals).map((k) => [k, { type: "boolean" }]))),
            collapsed: object({ rows: list(list(ref("item"), LIMITS.axisFields, { minItems: 1 }), LIMITS.collapsed), cols: list(list(ref("item"), LIMITS.axisFields, { minItems: 1 }), LIMITS.collapsed) }),
            display: { enum: [...DISPLAY_MODES] },
            chart: object({
                type: { enum: [...CHART_TYPES] },
                stacked: { type: "boolean" },
                horizontal: { type: "boolean" },
                valueLabels: { enum: [...CHART_VALUE_LABELS] },
                legend: { enum: [...CHART_LEGENDS] },
                title: nullable(text(LIMITS.name)),
                smooth: { type: "boolean" },
                axisLabels: { enum: [...CHART_AXIS_LABELS] },
                groupLabels: { enum: [...CHART_GROUP_LABELS] },
                labelPosition: { enum: [...CHART_LABEL_POSITIONS] }
            }),
            formatting: object({ locale: nullable({ type: "string" }), timeZone: nullable({ type: "string" }), weekStart: { type: "integer", minimum: 1, maximum: 7 } })
        }),
        $defs: {
            fieldName: { type: "string", minLength: 1, maxLength: LIMITS.name },
            item: { type: ["string", "number", "boolean"] },
            valueRef: object({ field: nullable(ref("fieldName")), agg: { enum: [...AGGREGATOR_NAMES] } }, ["agg"], {
                // every aggregator but a row count needs a field
                if: { properties: { agg: { not: { const: "count" } } } },
                then: { required: ["field"], properties: { field: ref("fieldName") } }
            }),
            value: object(
                {
                    field: nullable(ref("fieldName")),
                    agg: { enum: [...AGGREGATOR_NAMES] },
                    format: nullable({ type: "string" }),
                    label: nullable(text(LIMITS.name)),
                    showAs: nullable({ anyOf: [{ enum: [...SHOW_AS_NAMES] }, object({ type: { enum: [...SHOW_AS_NAMES] }, axis: { enum: ["rows", "cols"] } }, ["type"])] }),
                    conditional: nullable({
                        oneOf: [
                            object({ type: { const: "colorScale" }, colors: { type: "array", items: { type: "string", pattern: COLOR.source }, anyOf: [{ maxItems: 0 }, { minItems: 2, maxItems: 3 }] } }, ["type"]),
                            object({ type: { const: "dataBar" }, color: nullable({ type: "string", pattern: COLOR.source }) }, ["type"])
                        ]
                    })
                },
                ["agg"],
                { if: { properties: { agg: { not: { const: "count" } } } }, then: { required: ["field"], properties: { field: ref("fieldName") } } }
            ),
            derived: object({ name: ref("fieldName"), field: ref("fieldName"), by: { enum: [...DERIVE_UNITS] }, size: { type: "number", minimum: MIN_BIN_SIZE }, origin: { type: "number" } }, ["name", "field", "by"], {
                if: { properties: { by: { const: "bin" } } },
                then: { required: ["size"] }
            }),
            sort: object({ field: ref("fieldName"), by: { enum: [...SORT_BY] }, order: { enum: ["asc", "desc"] }, items: list(ref("item"), LIMITS.items), value: ref("valueRef") }, ["field"], {
                if: { properties: { by: { const: "custom" } }, required: ["by"] },
                then: { required: ["items"] }
            })
        }
    };
}

/**
 * The JSON Schema of a view file of the version pivotkit-core writes: the envelope (open: a reader
 * ignores keys it does not know) with the view of viewSchema() inside it, whole.
 */
export function viewFileSchema() {
    const { body: view, $defs } = viewParts();
    const name = (description) => ({ description, ...text(VIEW_FILE_LIMITS.name) });
    return {
        $schema: DRAFT,
        $id: VIEW_FILE_SCHEMA,
        title: `pivotkit view file, format version ${VIEW_FILE_VERSION}`,
        description: `A pivotkit view (the report's layout as JSON) with what a person and another pivotkit need to know about it. Readers ignore keys of the envelope they do not know; a newer formatVersion or view.version is refused. Built by scripts/schemas.js. See https://pivotkit.eize.dev/reference/view-file/`,
        type: "object",
        required: ["format", "formatVersion", "view"],
        properties: {
            $schema: { description: "This schema's address.", type: "string" },
            format: { description: "Marks a view file; a document without it is read as a bare view.", const: VIEW_FILE_FORMAT },
            formatVersion: { description: "The version of this envelope. A reader refuses a newer one.", const: VIEW_FILE_VERSION },
            name: name("What the view shows, for people. Plain text."),
            description: { description: "More about the view, for people. Plain text; left out when empty.", ...text(VIEW_FILE_LIMITS.description) },
            createdAt: { description: "When the file was written, in UTC (ISO 8601).", type: "string", format: "date-time" },
            generator: { description: "The program that wrote the file.", type: "object", properties: { name: text(VIEW_FILE_LIMITS.name), version: text(VIEW_FILE_LIMITS.name) }, required: ["name"] },
            source: {
                description: "The data the view was made for.",
                type: "object",
                properties: {
                    id: name("The host's stable name of the data (\"sales\"): opaque, never an address or a query."),
                    name: name("The data's name for people."),
                    fields: {
                        description: "The fields of the data the view uses (rows, columns, values, filters, sort; a grouping as its source field), with their types.",
                        type: "array",
                        maxItems: VIEW_FILE_LIMITS.fields,
                        items: { type: "object", required: ["name", "type"], properties: { name: { type: "string", minLength: 1, maxLength: VIEW_FILE_LIMITS.name }, type: { enum: [...FIELD_TYPES] } } }
                    },
                    params: {
                        description: "What the host needs besides the id to find the data (a report's parameters): opaque names and texts. A reader takes only those its host allows by name.",
                        type: "object",
                        maxProperties: LIMITS.srcParams,
                        propertyNames: { minLength: 1, maxLength: LIMITS.srcParamLength },
                        additionalProperties: text(LIMITS.srcParamLength)
                    }
                }
            },
            extensions: { description: "Reserved for hosts: their own data under a key of their own (a domain or a package name). pivotkit ignores it.", type: "object" },
            view: { description: "The view itself, with its own version. Every reader passes it through normalize() against its data.", ...view }
        },
        $defs
    };
}

/** Every schema this script builds, by its file name in packages/pivotkit-core/schema/. */
export function buildSchemas() {
    return { [`view-${VIEW_VERSION}.json`]: viewSchema(), [`view-file-${VIEW_FILE_VERSION}.json`]: viewFileSchema() };
}

/** A schema file's text: JSON with a 2-space indent and a trailing newline. */
export const schemaText = (schema) => `${JSON.stringify(schema, null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    for (const [name, schema] of Object.entries(buildSchemas())) {
        writeFileSync(new URL(`../packages/pivotkit-core/schema/${name}`, import.meta.url), schemaText(schema));
        console.log(`packages/pivotkit-core/schema/${name}`);
    }
}
