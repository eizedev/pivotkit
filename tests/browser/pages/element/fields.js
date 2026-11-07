// Two elements with field descriptions and display names from an OpenAPI document (through
// pivotkit-core's fieldDefaultsFromSchema), each with its own storage key for dismissed tips; #b
// allows two tips only. Every pivot-tip-dismiss is logged in window.__tipEvents.
import { fieldDefaultsFromSchema } from "pivotkit-core";
import { DATASETS } from "../../../../examples/playground/src/data.js";

// shaped like a real API description of the sales rows (made up)
const openapi = {
    openapi: "3.1.0",
    info: { title: "Sales API", version: "1.0.0" },
    components: {
        schemas: {
            Sale: {
                type: "object",
                properties: {
                    Region: { type: "string", title: "Sales region", description: "The region the order was booked in.", externalDocs: { url: "https://example.org/regions" } },
                    Revenue: { type: "number", title: "Net revenue", description: "Revenue after discounts, in euros." },
                    Units: { type: "integer", description: "Units sold in the order." },
                    Channel: { type: "string", enum: ["Web", "Retail", "Partner"] }
                }
            }
        }
    }
};

window.__tipEvents = [];
document.addEventListener("pivot-tip-dismiss", (e) => window.__tipEvents.push({ target: e.target.id, ...e.detail }));

for (const el of document.querySelectorAll("pivot-report")) {
    el.data = DATASETS.sales.make(2000);
    el.defaultView = DATASETS.sales.presets[0].view;
    el.fieldDefaults = fieldDefaultsFromSchema(openapi, { schema: "Sale" }).defaults;
}
