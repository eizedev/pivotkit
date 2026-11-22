---
title: View file format
description: The pivotkit view file - a view with its name, its source and the fields it uses as one versioned JSON document - its fields, the rules for reading and extending it, the link profile, privacy, its JSON Schema and an in-browser check.
---

# View file format

A view file is a pivotkit [view](../concepts/views.md) plus what a person and another pivotkit need
to know about it: its name, the data it was made for and the fields it uses.

- pivotkit-react writes it for **Copy view as JSON** and **Download view** in the Views menu.
- A shortened form of it travels in links.
- **Open view file…** reads it ([Sharing](../concepts/sharing.md)).
- pivotkit-core writes it with `toViewFile` and reads it with `fromViewFile`.

## The JSON Schema

The view file's JSON Schema is published at `https://pivotkit.eize.dev/schema/view-file-2.json`
([view-file-2.json](../schema/view-file-2.json)). pivotkit-core ships the same bytes as
`pivotkit-core/schema/view-file-2.json`, so a host or an editor can use it without the website. A
file names the schema in `$schema`, but reading never depends on that key.

The schema describes two things:

- the envelope: its keys, types and limits
- the whole view inside it, through the view's own schema [view-2.json](../schema/view-2.json), which
  is built from pivotkit-core's tables

The schema cannot check what only the data can tell, such as a field's name and type. `normalize()`
checks that against the data and says what it leaves out. The repository's tests validate real
exports against the schema with a JSON Schema 2020-12 validator.

pivotkit also reads files of format version 1, which pivotkit 0.4 and before wrote. Their schema stays
published as [view-file-1.json](../schema/view-file-1.json).

## An example

```json
{
  "$schema": "https://pivotkit.eize.dev/schema/view-file-2.json",
  "format": "pivotkit-view",
  "formatVersion": 2,
  "name": "Revenue by region",
  "description": "For the monthly review",
  "createdAt": "2026-11-07T09:30:00.000Z",
  "generator": { "name": "pivotkit-react", "version": "0.9.0" },
  "source": {
    "id": "sales",
    "name": "Sales 2026",
    "fields": [
      { "name": "Region", "type": "string" },
      { "name": "Revenue", "type": "number" }
    ]
  },
  "extensions": {},
  "view": { "version": 2, "rows": ["Region"], "values": [{ "field": "Revenue", "agg": "sum" }] }
}
```

The `view` is abbreviated here. A written file holds the whole normalized view.

## The fields

| Key | Required | What |
| --- | --- | --- |
| `$schema` | no | The schema's address: `https://pivotkit.eize.dev/schema/view-file-2.json` by default, a host's own copy (`toViewFile`'s `schemaUrl`, pivotkit-react's `schemaUrl` prop, the element's `schema-url` attribute), or left out (`null`, `""`). A reader ignores it. |
| `format` | yes | `"pivotkit-view"`: marks a view file. |
| `formatVersion` | yes | `2`: the version of the envelope. Version 2 carries views of version 2 and `source.params`. Files of version 1 are read too. |
| `name` | no | What the view shows, for people. Plain text, at most 256 characters. pivotkit-react writes the name of the saved view or file the view came from, else `""`. |
| `description` | no | More about it. Plain text, at most 2,000 characters. Left out when empty. |
| `createdAt` | no | When the file was written, in UTC (ISO 8601). pivotkit-react writes it. `toViewFile` leaves it out unless you give it. |
| `generator` | no | `{ name, version }` of the program that wrote it: `pivotkit-react` and its version from its `package.json`. |
| `source` | no | The data the view was made for. Left out when it has no id, name or fields. `id`: the host's stable name, pivotkit-react's `source.id`. `name`: for people. `fields`: `[{ name, type }]`, the fields of the data the view uses, each with its type: `string`, `number`, `date`, `boolean` or `null`. These are the fields on rows, columns, values, filters and sort, and a grouping as its source field. Derived fields are not listed. `params`: what the host needs besides the id to find the data, such as a report's parameters. Text by name, at most 16 entries of at most 256 characters each (`LIMITS.srcParams` and `srcParamLength`). Opaque: never an address or a query. Written only together with an id. `sheet` is the sheet of a workbook, [below](#the-sheet-of-a-workbook). |
| `extensions` | no | Reserved for hosts, see below. pivotkit ignores it and writes `{}`. |
| `view` | yes | The view itself, with its own `version` ([Views](../concepts/views.md)). |

### The sheet of a workbook { #the-sheet-of-a-workbook }

A view made on a sheet of a workbook loaded in the report names that sheet in
`source.params.sheet`. The value is the sheet's name. It stands next to the file's `source.id`
([how a loaded file is named](import.md#how-a-loaded-file-is-named)):

```json
"source": { "id": "quarters.xlsx#3c1f0a9b2d4e5f60", "name": "quarters.xlsx", "params": { "sheet": "Q3" } }
```

- pivotkit-react writes it only for the sheet of a loaded workbook, in the browser store, the files
  and the links. It writes a host's own `source` as the host gives it.
- When such a view opens while another sheet of a file with that name is shown, the report reads
  the named sheet first. If the workbook has no such sheet, the report says so and loads the view on the
  sheet shown.
- [pivotkit-cli](cli.md#the-sheet-of-a-workbook) reads that sheet of `--data` unless `--sheet` names
  another.
- `sheet` is the only parameter name pivotkit itself reads. If a host names a parameter of its own
  data `sheet`, the CLI reads it as a workbook's sheet when it renders a workbook.
- Every file written before sheets existed has no `sheet`. Such a file opens on the sheet shown in
  the report, and on the first visible sheet in the CLI. To give such a file its sheet, do one of these:
    - Open it in the report on that sheet and download it again.
    - Save a view of the browser store on that sheet.
    - Add `"params": { "sheet": "<name>" }` to its `source` by hand.

    The format version stays 2.

## Writing a view file

A writer puts the keys in this order: `$schema`, `format`, `formatVersion` first, then `name`,
`description`, `createdAt`, `generator`, `source`, `extensions`, `view`. It indents by 2 spaces and
ends with a newline. Without `createdAt`, two exports of the same view are the same bytes. So a file
kept in a repository changes only when the view does.

The writer leaves out the chart keys newer than pivotkit 0.7 (`tooltip`, `zoom`,
`stackPercent`, `hidden`, `referenceLines`, `colors`, `tooltipShare`) while they hold their default. A 0.7 reader then takes the file without a
warning. It leaves out `extremes` in `referenceLines`, newer than 0.8, while it is `false`.
`fromViewFile` puts them back at their defaults when it reads a file.

`display` is `"table"`, `"chart"` or `"both"`. `"both"` shows the table and the chart side by side.
It is newer than 0.8, and the writer keeps it. A 0.8 reader reports it as `unknownSetting` and shows
the table.

The suggested file name is `<slug>.pivotkit.json`. The slug is the name in lower case, with accents
dropped and every run of other characters turned into a `-`:

- "Revenue by region" gives `revenue-by-region.pivotkit.json`.
- When nothing is left, the name is `view.pivotkit.json`.

pivotkit-react names a download after the view's name. Without one it takes the data's name, then its
`fileName`.

```js
import { encode, fromViewFile, toViewFile, viewFileName, viewFileText } from "pivotkit-core";

const data = encode(rows);
const file = toViewFile(view, { name: "Revenue by region", source: { id: "sales", name: "Sales 2026" }, data });
const text = viewFileText(file);              // canonical JSON with a trailing newline
const fileName = viewFileName(file.name);     // "revenue-by-region.pivotkit.json"

const read = fromViewFile(text, { data, sourceId: "sales" });
if (read.failed) console.warn(read.failed);   // "notJson", "newerFormat", ...
else if (!read.compatible?.ok) console.warn(read.compatible); // another source, missing fields
const { view: checked, issues } = normalize(read.view, data); // still user input
```

The functions are listed in the [pivotkit-core reference](core.md#view-files).

## Reading a view file

- A document whose `format` is `"pivotkit-view"` is a view file. Both of these still load:
    - Any other JSON object is read as a bare view.
    - An object `{ name, view }`, a saved view as a host keeps it, is read as its view with its name.
- A reader ignores keys it does not know, in the envelope and in `extensions`.
- A reader refuses a `formatVersion` newer than it knows, and a view with a newer `view.version`. It
  never reads the file as an older one, since saving it again would drop what the newer version
  added. pivotkit-react says "This view comes from a newer version and cannot be read here. Update
  the application to open it."
- `formatVersion` is the integer 1 or 2. A reader refuses any other value and never reads it as one of
  them:
    - A value above 2 (`3`, `2.5`, `"3"`) counts as a newer version.
    - Any other value (`0`, `"2"`, `1.5`, `true`) means the document is no view file.
- A reader handles these cases and reports each in `fromViewFile`'s `issues`:
    - A missing `formatVersion` is read as 1.
    - A `source.params` entry that is no text or too long is left out.
    - A `createdAt` that is no date is left out.
    - A `source.fields` entry without a name or with an unknown type is left out.
- `VIEW_FILE_LIMITS` sets these caps:
    - the text, before it is parsed: 1,000,000 characters
    - names and ids: 256 characters
    - descriptions: 2,000 characters
    - `source.fields`: 1,000 entries
- A reader reads every key as an own property. `__proto__`, `constructor` and inherited keys never
  count.
- Names, descriptions and source names are plain text. Control characters become spaces, and the UI
  shows them as text, never as markup.
- The view is user input like any other. `normalize()` checks it against the data before the report
  shows it. It leaves out what does not fit, and the report says so in plain words.

### The check before a view is loaded

With the data at hand, `fromViewFile(input, { data, sourceId })` says in `compatible` how the view
fits:

- whether it is the same source: `"same"`, `"other"`, or `"unknown"` when the file or the caller names
  no id
- `missing`: the fields the view needs that the data does not have
- `changed`: the fields the file lists with another type than the data's

When the view does not fit, pivotkit-react asks before it changes anything. It offers **Load
anyway** and **Cancel**. It also offers **Switch to “…” and load** when the host lists that source in
`sources` and handles `onSourceSwitch` ([Sharing](../concepts/sharing.md#before-a-view-for-other-data-is-loaded)).

## Extending the format

- A new optional key keeps `formatVersion` 2. Readers that do not know the key ignore it. The schema
  allows keys it does not list: the envelope has no `additionalProperties: false`.
- A host keeps its own data in `extensions`, under a key of its own. Use a domain or a package name,
  such as `"reports.example.com": { ... }`. pivotkit never writes or reads anything there.
- A change that an older reader would get wrong is a new `formatVersion` with a new schema file
  (`view-file-3.json`). Examples are a key that changes meaning and a new required key. Readers of
  version 2 refuse such a file.
- Version 2 is such a change. It carries views of version 2, which a reader of version 1 would read
  wrong. So pivotkit 0.4 refuses a file or a link of version 2 as newer.
- A change of the view itself goes through `view.version` and pivotkit-core's `MIGRATIONS`, not
  through the envelope. A reader migrates an older view when it reads it.
- A new filter type keeps both versions. A reader that does not know the type reports that filter as
  an unused part ("the filter type “like” is unknown - this filter is left out"). It shows the report
  without that filter, so it reads nothing wrong. The schema of a version lists the types it knows,
  and a view with a newer type does not pass it.

## The link profile

A link carries a shorter form of the file. `toViewFile(view, meta, { link: true })` makes it. It
holds:

- `format` and `formatVersion`
- `source.id` and `source.params`
- `name`, when there is one
- `view`

It leaves out what grows with the data (`source.fields`) and what changes on every export
(`createdAt`). It also has no `$schema`, `generator` or `description`.

`encodeViewLink` of `pivotkit-core/link` compresses its JSON into the link text and keeps its
transport prefix `1.`. The size limits and the safety rules of links apply
([Sharing](../concepts/sharing.md#links-for-developers)). A link that holds a bare view still opens.

## Privacy

A view holds field names and, in its filters, the items chosen there. Those items are values of the
data, such as a customer's name or a country. A file, a copied view and a link give them to whoever
gets them. The Share this view group of the Views menu says so: "A view holds the names of fields
and, in its filters, the values chosen there: share it only where those may be seen."

A link keeps the view in the URL fragment. Browsers do not send the fragment to the server. But the
link stays in the browser's history and wherever someone pastes it.

## Check a view file

Paste a view file or a bare view, or choose a file. The check below reads it with the real
pivotkit-core in this browser and uploads nothing. It tells you:

- whether the format is right
- what `normalize()` would leave out of the view, checked against the fields the file lists
- which fields the view needs

<iframe class="pk-demo" src="../playground/validator.html" title="View file check" loading="lazy" style="width: 100%; height: 760px; border: 1px solid var(--md-default-fg-color--lightest); border-radius: 8px;"></iframe>
