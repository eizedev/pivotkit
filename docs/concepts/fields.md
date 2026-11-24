---
title: Field descriptions and names
description: Give fields a display name, a description with a link and a column type through fieldDefaults, by hand or from a JSON Schema or OpenAPI document with fieldDefaultsFromSchema.
---

# Field descriptions and names

A field's name is what the data calls it: `gdp_usd`, `eol`, `Max °C`. With `fieldDefaults`, a report
can show a clearer name and say what the field means:

| Entry | What the report does with it |
| --- | --- |
| `label` | The name shown for the field: in the field list, on chips, in the table's headers, in value names ("Sum of Net revenue"), in the drill-down, in the chart and in the exported files. At most 120 characters. |
| `description` | Plain text, at most 1,000 characters. An **i** next to the field in the list and on its chips shows it on hover, focus and tap. In a narrow report, only the list has the **i**, so a chip keeps its room. The text is also behind the **i** at the top of the chip's menu and on the field's table and drill-down headers (tooltip and `aria-description`). The field search finds it. Options, Help, "Show explanations" hides the **i** and the header tooltips. Screen readers keep the text. The `fieldInfo` prop (`field-info` attribute) decides it for the user. |
| `href` | An https link to more about the field, shown as **Learn more** with the description (`target="_blank"`, `rel="noopener noreferrer"`). Any other link is dropped. |
| `type` | The column type pivotkit reads the field as: `"number"`, `"date"`, `"string"` or `"boolean"` (pivotkit-core's `encode` `types`). Use it, for example, for numbers that arrive as text. |

The other entries of `fieldDefaults` set a field's aggregator, formats and order of items. The
[React reference](../reference/react.md#prop-fielddefaults) lists them.

Two fields may share a label, or a label may be another field's own name. Then the label gets the
field's name in parentheses ("Name (product_name)"). So no two fields look the same in the list, on
chips, in headers or in exported files.

A field without these entries looks and works as it does without `fieldDefaults`: no **i**, no extra
text, its own name.

A label is for display only. Views and templates always hold the field's own name, so a template saved
with German labels opens with English ones too. A date or number grouping takes its name from the label
when you make it ("Release date by month"). It keeps that name, like a value's own name.

```jsx
<PivotReport
    data={rows}
    fieldDefaults={{
        gdp_usd: { label: "GDP (US$)", description: "Gross domestic product in current US dollars.", href: "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD", format: "compact" },
        Population: { description: "Midyear estimate of all residents." }
    }}
/>
```

The report shows the texts as text, never as markup. Control characters become spaces. The report cuts
longer texts and ends them with "…".

## Identifier fields

A number field that identifies a row (`ID`, `CustomerId`, `Order No`) is not a quantity. Its sum
means nothing, and 27,880 reads worse than 27880. The report treats a field as an identifier when
`fieldDefaults` says nothing about how to count or show it, and

- it is a number field whose values are all whole numbers, and
- its name ends in the word **ID**, **Nr**, **No**, **Number**, **Key** or **#**, in any case.

How the report finds the last word:

- First it leaves out a part in parentheses at the end and digits at the end. So `ID (Asset)`,
  `Asset ID (old) (2)`, `userID2`, `user_id_2` and `Ticket No.2` end in their identifier word.
- It splits words at these places:
    - a space, `_`, `-`, `.`, `/`, `:`
    - a change from a small letter or a digit to a capital (`CustomerId`, `CustomerID`)
    - before the last capital of a run of capitals that a small letter follows (`HTTPId` is `HTTP Id`)
    - a change from a letter to a digit (`userID2`)
- A `#` is a word of its own (`Serial#` is `Serial #`).
- Identifiers: `ID`, `id`, `CustomerId`, `CustomerID`, `HTTPId`, `customer_id`, `Asset Nr.`, `Order No`,
  `OrderNumber`, `Primary key`, `Serial #`, `#`.
- Not identifiers: `Paid`, `PAID`, `UUID`, `UUID2` (one word, not one ending in "id"), `Keys`,
  `Number of items` and `Number of items (total)` (they end in "items"), `#items`, `Paid (EUR)`.

The check of the values reads a column's distinct values once and keeps the answer for that data.

Values that all differ from each other are no sign of an identifier: a count per row can have them
too.

Such a field gets `{ agg: "count", drillFormat: "text" }`:

- When you add it to Values from the field list, by a drag or by Move to, the report counts it
  ("Count of ID"). Sum stays a choice of its menu.
- The drill-down shows its numbers as they are.

On Rows and Columns, a number field's items show without grouping separators anyway.

A host that knows better sets any of `agg`, `format` or `drillFormat` for the field. The report then
takes the host's settings as they are:

```jsx
<PivotReport data={rows} fieldDefaults={{ ID: { agg: "sum" }, OrderNo: { drillFormat: "number" } }} />
```

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

It takes one of these:

- the schema of one row: an object with `properties`, or an array of such rows
- a whole OpenAPI 3 or Swagger 2 document. Then `options.schema` names the row's schema: its name in
  `components.schemas` (or `definitions`), or a local reference such as
  `"#/components/schemas/Release"`.

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

const { defaults, issues } = fieldDefaultsFromSchema(openapi, { schema: "Item" });
// {
//   name: { label: "Name" },
//   status: { label: "Status", description: "Where the item is in its life.", order: ["planned", "active", "retired"] },
//   units: { label: "Units in stock", href: "https://example.org/docs/units", type: "number" },
//   released: { label: "Release date", description: "The day the item was first sold.", type: "date" }
// }
// issues: [] (what could not be read: a reference outside the document, a cycle, a cap)

<PivotReport data={items} fieldDefaults={defaults} />;
```

To add a field's aggregator or format, merge it: `{ ...defaults, units: { ...defaults.units, agg: "sum" } }`.
Show `issues` to whoever maintains the schema, or log them.

What it reads, and what it does not:

- It follows references inside the document only (`#/...`). It fetches nothing and skips a remote
  `$ref`.
- It merges `allOf` parts. It reads a nullable `anyOf` or `oneOf` (one schema and `null`) as that
  schema, and `type: ["integer", "null"]` as `integer`.
- The schema is data: nothing in it runs. Its sizes are capped per call, so a hostile document cannot
  ask for unbounded work:
    - 1,000 fields
    - 1,000 enum entries
    - 32 levels of references
    - 20,000 schema objects
    - 100,000 properties copied while it merges `allOf` parts
- It leaves out a property with nothing to say.
- What it cannot read never throws and is never cut silently. `issues` lists it as `{ path, message }`,
  as `normalize()` does for a view:
    - a reference that is not in the document or not local
    - a cycle
    - a cap that was reached
- It reads each `$ref` target once and reuses it, so it reads a large document whose schemas share
  parts whole.
- Input that is no schema at all throws a `PivotkitError` (`INVALID_ARGUMENT`) that says what is
  missing.
- It removes bidi controls and zero-width characters from titles and descriptions, so a text cannot
  pass itself off as another one.

The playground's "Software end of life" data set describes its fields this way, from the
endoflife.date API's own OpenAPI document.

The same document can carry shared views for its data in pivotkit's extension `x-pivotkit-views`.
`templatesFromSchema` from `pivotkit-core/templates` reads them. See
[Templates and shared views](templates.md#templates-in-an-openapi-document-x-pivotkit-views).

## In the web component

`fieldDefaults` is a property of `<pivot-report>`:

```js
import { fieldDefaultsFromSchema } from "pivotkit-core";

const report = document.querySelector("pivot-report");
report.fieldDefaults = fieldDefaultsFromSchema(await (await fetch("/api/openapi.json")).json(), { schema: "Release" }).defaults;
```

The page fetches the document itself. pivotkit never does.
