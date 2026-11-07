---
title: Field descriptions and names
description: Give fields a display name, a description with a link and a column type through fieldDefaults, by hand or from a JSON Schema or OpenAPI document with fieldDefaultsFromSchema.
---

# Field descriptions and names

A field's name is what the data calls it: `gdp_usd`, `eol`, `Max °C`. A report can show a clearer
name and say what the field means, through `fieldDefaults`:

| Entry | What the report does with it |
| --- | --- |
| `label` | The name shown for the field: in the field list, on chips, in the table's headers, in value names ("Sum of Net revenue"), in the drill-down, in the chart and in the exported files. At most 120 characters. |
| `description` | Plain text, at most 1,000 characters: an **i** next to the field in the list and on its chips shows it on hover, focus and tap; it is at the top of the chip's menu, on the field's table and drill-down headers (tooltip and `aria-description`), and the field search finds it. |
| `href` | An https link to more about the field, shown as **Learn more** with the description (`target="_blank"`, `rel="noopener noreferrer"`). Any other link is dropped. |
| `type` | The column type the field is read as: `"number"`, `"date"`, `"string"` or `"boolean"` (pivotkit-core's `encode` `types`), for numbers that arrive as text, say. |

A field without them looks and works as it does without `fieldDefaults`: no **i**, no extra text,
its own name. A label is display only: views and templates always hold the field's own name, so a
template saved with German labels opens with English ones too. A date or number grouping gets its name
from the label when it is made ("Release date (Month)") and keeps it, like a value's own name.

```jsx
<PivotReport
    data={rows}
    fieldDefaults={{
        gdp_usd: { label: "GDP (US$)", description: "Gross domestic product in current US dollars.", href: "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD", format: "compact" },
        Population: { description: "Midyear estimate of all residents." }
    }}
/>
```

The texts are shown as text, never as markup; control characters become spaces and longer texts are
cut with "…".

## From a JSON Schema or an OpenAPI document

Many APIs describe their rows already. pivotkit-core's `fieldDefaultsFromSchema(schema, options?)`
turns that description into `fieldDefaults`:

| Schema | `fieldDefaults` |
| --- | --- |
| `title` | `label` |
| `description` | `description` |
| `externalDocs.url` (https) | `href` |
| `type: "integer"` or `"number"` | `type: "number"` |
| `type: "string"` with `format: "date"` or `"date-time"` | `type: "date"` |
| `enum` | `order`, the field's custom order of items |

It takes the schema of one row (an object with `properties`, or an array of such rows), or a whole
OpenAPI 3 or Swagger 2 document and, in `options.schema`, the name of the row's schema in
`components.schemas` (or `definitions`) or a local reference such as `"#/components/schemas/Release"`.

```js
import { fieldDefaultsFromSchema } from "pivotkit-core";

const openapi = {
    openapi: "3.1.0",
    info: { title: "Inventory API", version: "2.0.0" },
    components: {
        schemas: {
            Status: { type: "string", enum: ["planned", "active", "retired"], description: "Where the item is in its life." },
            Item: {
                type: "object",
                properties: {
                    name: { type: "string", title: "Name" },
                    status: { $ref: "#/components/schemas/Status", title: "Status" },
                    units: { type: ["integer", "null"], title: "Units in stock", externalDocs: { url: "https://example.org/docs/units" } },
                    released: { type: "string", format: "date", title: "Release date", description: "The day the item was first sold." }
                }
            }
        }
    }
};

const defaults = fieldDefaultsFromSchema(openapi, { schema: "Item" });
// {
//   name: { label: "Name" },
//   status: { label: "Status", description: "Where the item is in its life.", order: ["planned", "active", "retired"] },
//   units: { label: "Units in stock", href: "https://example.org/docs/units", type: "number" },
//   released: { label: "Release date", description: "The day the item was first sold.", type: "date" }
// }

<PivotReport data={items} fieldDefaults={defaults} />;
```

Add a field's aggregator or format by merging: `{ ...defaults, units: { ...defaults.units, agg: "sum" } }`.

What it reads, and what it does not:

- References are followed inside the document only (`#/...`); nothing is fetched, a remote `$ref` is
  skipped. `allOf` parts are merged; a nullable `anyOf` or `oneOf` (one schema and `null`) is read as
  that schema; `type: ["integer", "null"]` as `integer`.
- The schema is data: nothing in it is run. Its sizes are capped: 1,000 fields, 1,000 enum entries,
  32 levels of references and a bounded number of schema objects per call, so a hostile document
  cannot ask for unbounded work.
- A property with nothing to say is left out. Input that is no schema throws a `PivotkitError`
  (`INVALID_ARGUMENT`) with what is missing.

The playground's "Software end of life" data set describes its fields this way, from the
endoflife.date API's own OpenAPI document.

## In the web component

`fieldDefaults` is a property of `<pivot-report>`:

```js
import { fieldDefaultsFromSchema } from "pivotkit-core";

const report = document.querySelector("pivot-report");
report.fieldDefaults = fieldDefaultsFromSchema(await (await fetch("/api/openapi.json")).json(), { schema: "Release" });
```

The page fetches the document itself; pivotkit never does.
