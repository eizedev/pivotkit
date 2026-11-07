// The playground's shared views (the "Shared views" of the Views menu): each data set's presets, and
// for the endoflife.date data also the views its OpenAPI document carries in `x-pivotkit-views`,
// read with pivotkit-core's templatesFromSchema. The API's own document has no such extension:
// data/endoflife-openapi.json stays the snapshot of it, and the playground adds an example to its
// copy here (a demo extension, as a host would add its views to the document it serves).
import { templatesFromSchema } from "pivotkit-core/templates";
import endoflifeApi from "../data/endoflife-openapi.json";

/** The views pivotkit's extension adds to the schema of a release: a view file and a named bare view. */
const RELEASE_VIEWS = [
    {
        format: "pivotkit-view",
        formatVersion: 1,
        name: "Long-term support cycles per category",
        description: "Release cycles per category, with and without long-term support.",
        source: { id: "endoflife" },
        view: {
            rows: ["Category"],
            cols: ["LTS"],
            values: [{ field: "Cycle", agg: "count", label: "Release cycles" }],
            sort: [{ field: "Category", by: "label", order: "asc" }]
        }
    },
    {
        name: "Release cycles per year (chart)",
        rows: ["Release year"],
        values: [{ field: "Cycle", agg: "count", label: "Release cycles" }],
        filters: [{ field: "Release year", type: "include", items: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] }],
        display: "chart",
        chart: { type: "line" }
    }
];

/** The API's document with the demo extension on ProductRelease; the snapshot itself is left as it is. */
const schemas = endoflifeApi.components.schemas;
export const ENDOFLIFE_API_WITH_VIEWS = {
    ...endoflifeApi,
    components: { ...endoflifeApi.components, schemas: { ...schemas, ProductRelease: { ...schemas.ProductRelease, "x-pivotkit-views": RELEASE_VIEWS } } }
};

const FROM_SCHEMA = { endoflife: templatesFromSchema(ENDOFLIFE_API_WITH_VIEWS, { schema: "ProductRelease" }).templates };

/**
 * The shared views of a data set: its presets, then the views of its schema.
 * @param {string} dataset
 * @param {Array<{ name: string, view: object }>} presets
 */
export function sharedViews(dataset, presets) {
    return [...presets, ...(FROM_SCHEMA[dataset] ?? [])].map((t) => ({ name: t.name, view: t.view, scope: "shared" }));
}
