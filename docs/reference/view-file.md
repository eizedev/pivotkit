---
title: View file format
description: The pivotkit view file - a view with its name, its source and the fields it uses as one versioned JSON document - its fields, the rules for reading and extending it, the link profile, privacy, its JSON Schema and an in-browser check.
---

# View file format

A view file is a pivotkit [view](../concepts/views.md) with what a person and another pivotkit need
to know about it: its name, the data it was made for and the fields it uses. pivotkit-react writes it
for **Copy view as JSON** and **Download view** in the Views menu, a shortened form of it travels in
links, and **Open view file…** reads it ([Sharing](../concepts/sharing.md)). pivotkit-core writes and reads
it with `toViewFile` and `fromViewFile`.

Its JSON Schema is published at `https://pivotkit.eize.dev/schema/view-file-2.json`
([view-file-2.json](../schema/view-file-2.json)) and ships in pivotkit-core as
`pivotkit-core/schema/view-file-2.json` (the same bytes), so a host or an editor can use it without
the website. A file names it in `$schema`; reading never depends on that key. The schema describes the
envelope (its keys, types and limits) and the whole view inside it (the view's own schema,
[view-2.json](../schema/view-2.json), built from pivotkit-core's tables); what only the data can tell
(a field's name and type) is checked by `normalize()` against the data, which says what it leaves out.
The repository's tests validate real exports against the schema with a JSON Schema 2020-12 validator.
Files of format version 1 (pivotkit 0.4 and before) are read too; their schema stays published as
[view-file-1.json](../schema/view-file-1.json).

## An example

```json
{
  "$schema": "https://pivotkit.eize.dev/schema/view-file-2.json",
  "format": "pivotkit-view",
  "formatVersion": 2,
  "name": "Revenue by region",
  "description": "For the monthly review",
  "createdAt": "2026-11-07T09:30:00.000Z",
  "generator": { "name": "pivotkit-react", "version": "0.5.0" },
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

The `view` is abbreviated here; a written file holds the whole normalized view.

## The fields

| Key | Required | What |
| --- | --- | --- |
| `$schema` | no | The schema's address: `https://pivotkit.eize.dev/schema/view-file-2.json` by default, a host's own copy (`toViewFile`'s `schemaUrl`, pivotkit-react's `schemaUrl` prop, the element's `schema-url` attribute), or left out (`null`, `""`). A reader ignores it. |
| `format` | yes | `"pivotkit-view"`: marks a view file. |
| `formatVersion` | yes | `2`: the version of the envelope. Version 2 carries views of version 2 and `source.params`; files of version 1 are read too. |
| `name` | no | What the view shows, for people; plain text, at most 256 characters. pivotkit-react writes the name of the saved view or file the view came from, else `""`. |
| `description` | no | More about it; plain text, at most 2,000 characters; left out when empty. |
| `createdAt` | no | When the file was written, in UTC (ISO 8601). pivotkit-react writes it; `toViewFile` leaves it out unless it is given. |
| `generator` | no | `{ name, version }` of the program that wrote it: `pivotkit-react` and its version from its `package.json`. |
| `source` | no | The data the view was made for: `id` (the host's stable name, pivotkit-react's `source.id`), `name` (for people), `fields` (`[{ name, type }]`, the fields of the data the view uses - rows, columns, values, filters, sort, a grouping as its source field - with their type: `string`, `number`, `date`, `boolean` or `null`; derived fields are not listed), `params` (what the host needs besides the id to find the data, a report's parameters: text by name, at most 16 of at most 256 characters each, `LIMITS.srcParams` and `srcParamLength`; opaque, never an address or a query; written with an id only; `sheet` is the sheet of a workbook, [below](#the-sheet-of-a-workbook)). |
| `extensions` | no | Reserved for hosts (below); pivotkit ignores it and writes `{}`. |
| `view` | yes | The view itself, with its own `version` ([Views](../concepts/views.md)). |

### The sheet of a workbook { #the-sheet-of-a-workbook }

A view made on a sheet of a workbook loaded in the report names that sheet in `source.params.sheet`
(the sheet's name), next to the file's `source.id` ([how a loaded file is named](import.md#how-a-loaded-file-is-named)):

```json
"source": { "id": "quarters.xlsx#3c1f0a9b2d4e5f60", "name": "quarters.xlsx", "params": { "sheet": "Q3" } }
```

- pivotkit-react writes it for a loaded workbook's sheet only, in the browser store, the files and the
  links; a host's own `source` is written as the host gives it. Opening such a view while another
  sheet of a file of that name is shown reads that sheet first; a sheet the workbook does not have is
  said, and the view loads on the sheet shown.
- [pivotkit-cli](cli.md#the-sheet-of-a-workbook) reads that sheet of `--data` unless `--sheet` says
  another.
- `sheet` is the one parameter name pivotkit itself reads; a host that names a parameter of its own
  data `sheet` gets it read as a workbook's sheet by the CLI when it renders a workbook.
- A view file without it, as every file written before, is read as before: on the sheet shown in the
  report, on the first visible sheet in the CLI. To give such a file its sheet, open it in the report
  on that sheet and download it again (or Save a view of the browser store there), or add
  `"params": { "sheet": "<name>" }` to its `source` by hand. The format version stays 2.

## Writing a view file

The keys are written in this order: `$schema`, `format`, `formatVersion` first, then `name`,
`description`, `createdAt`, `generator`, `source`, `extensions`, `view`, with a 2-space indent and a
trailing newline. Without `createdAt` two exports of the same view are the same bytes, so a file kept
in a repository changes only when the view does.

The suggested file name is `<slug>.pivotkit.json`: the name in lower case, accents dropped, every run
of other characters a `-` ("Revenue by region" gives `revenue-by-region.pivotkit.json`;
`view.pivotkit.json` when nothing is left). pivotkit-react names a download after the view's name,
else the data's name, else its `fileName`.

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

- A document whose `format` is `"pivotkit-view"` is a view file. Any other JSON object is read as a
  bare view, and an object `{ name, view }` (a saved view as a host keeps it) as its view with its
  name; both still load.
- Keys a reader does not know are ignored, in the envelope and in `extensions`.
- A newer `formatVersion` than the reader knows is refused, and so is a view with a newer
  `view.version`: the file is never read as an older one, since saving it again would drop what the
  newer version added. pivotkit-react says "This view comes from a newer version of pivotkit and
  cannot be read here. Update pivotkit to open it."
- `formatVersion` is the integer 1 or 2. Any other value is refused, never read as one of them: one
  above 2 (`3`, `2.5`, `"3"`) as a newer version, any other (`0`, `"2"`, `1.5`, `true`) as no view
  file. A missing one is read as 1 and reported; a `source.params` entry that is no text or too long
  is left out and reported; a `createdAt` that is no date, a
  `source.fields` entry without a name or with an unknown type are left out and reported
  (`fromViewFile`'s `issues`).
- The text is capped before it is parsed (1,000,000 characters), names and ids at 256 characters,
  descriptions at 2,000, `source.fields` at 1,000 entries (`VIEW_FILE_LIMITS`).
- Every key is read as an own property: `__proto__`, `constructor` and inherited keys never count.
- Names, descriptions and source names are plain text: control characters become spaces, and the UI
  shows them as text, never as markup.
- The view is user input like any other: `normalize()` checks it against the data before it is shown,
  and what does not fit is left out and said in plain words.

### The check before a view is loaded

With the data at hand, `fromViewFile(input, { data, sourceId })` says how the view fits
(`compatible`): the same source (`"same"`, `"other"`, or `"unknown"` when the file or the caller names
no id), the fields it needs that the data does not have (`missing`), and the fields the file lists
with another type than the data's (`changed`). When it does not fit, pivotkit-react asks before it
changes anything: **Load anyway**, **Cancel**, and **Switch to “…” and load** when the host lists that
source in `sources` and handles `onSourceSwitch` ([Sharing](../concepts/sharing.md#before-a-view-for-other-data-is-loaded)).

## Extending the format

- A new optional key keeps `formatVersion` 2: readers that do not know it ignore it, and the schema
  allows keys it does not list (no `additionalProperties: false` on the envelope).
- A host keeps its own data in `extensions`, under a key of its own (a domain or a package name,
  `"reports.example.com": { ... }`). pivotkit never writes or reads anything there.
- A change that an older reader would get wrong (a key that changes meaning, a required key) is a new
  `formatVersion` with a new schema file (`view-file-3.json`); readers of version 2 refuse it. Version
  2 is such a change: it carries views of version 2, which a reader of version 1 would read wrong, so
  pivotkit 0.4 refuses a file or a link of version 2 as newer.
- A change of the view itself goes through `view.version` and pivotkit-core's `MIGRATIONS`, not
  through the envelope: an older view is migrated when it is read.
- A new filter type keeps both versions: a reader that does not know it reports that filter as an
  unused part ("the filter type “like” is unknown - this filter is left out") and shows the report
  without it, so nothing is read wrong. The schema of a version lists the types it knows; a view with
  a newer type does not pass it.

## The link profile

A link carries a shorter form of the file, made by `toViewFile(view, meta, { link: true })`:
`format`, `formatVersion`, `source.id` and `source.params`, `name` (when there is one) and `view` - nothing that grows
with the data (`source.fields`) or changes on every export (`createdAt`), and no `$schema`,
`generator` or `description`. Its JSON is compressed into the link text by `encodeViewLink` of
`pivotkit-core/link`, which keeps its transport prefix `1.`; the size limits and the safety of links
apply ([Sharing](../concepts/sharing.md#links-for-developers)). A link that holds a bare view still
opens.

## Privacy

A view holds field names and, in its filters, the items chosen there: those are values of the data
(a customer's name, a country). A file, a copied view and a link give them to whoever gets them. The
Share this view group of the Views menu says so: "A view holds the names of fields and, in its filters, the
values chosen there: share it only where those may be seen." A link keeps the view in the URL
fragment, which browsers do not send to the server, but it stays in the browser's history and
wherever the link is pasted.

## Check a view file

Paste a view file (or a bare view) or choose one: the check below reads it with the real
pivotkit-core in this browser - nothing is uploaded. It says whether the format is right, what
`normalize()` would leave out of the view (checked against the fields the file lists) and which
fields the view needs.

<iframe class="pk-demo" src="../playground/validator.html" title="View file check" loading="lazy" style="width: 100%; height: 760px; border: 1px solid var(--md-default-fg-color--lightest); border-radius: 8px;"></iframe>
