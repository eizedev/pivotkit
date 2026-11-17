---
title: Templates and shared views
description: Templates are named views in two groups - shared views for everyone and the user's own views. Where they come from (your server, the browser, an OpenAPI document), who may change them, and how to provide them.
---

# Templates and shared views

A **template** is a [view](views.md) with a name: "Open work per team", "Revenue by region". The
report's **Views** menu lists them in two groups:

- **Shared views** are the same for everyone who uses the report. Your application provides them,
  for example presets or a team's standard reports.
- **My views** are the user's own. The user saves them with **Save current view**. Your application
  or the browser keeps them.

![The Views menu with Shared views, My views with a saved view, the save field and the note where it is kept](../assets/screenshots/views-menu-light.png#only-light)
![The Views menu with Shared views, My views with a saved view, the save field and the note where it is kept](../assets/screenshots/views-menu-dark.png#only-dark)

Each entry loads its view with one click.

- An entry the user may delete has a delete button. The report asks in place before it deletes.
- Someone may be able to change shared views here: a shared entry is `deletable`, or the report offers
  Publish. Then a shared view without a delete button has an "i": "Only admins can change shared
  views." The text is `labels.settingInfo.sharedView`, so a host names its own role. The "i" shows
  while **Show explanations** in More, Help is on.
- When your application allows it, each of the user's views has **Publish as shared view**. The
  report asks in place here too.
- The menu hides a group without entries. "My views" shows while people can save.
- The empty report also offers the first three entries.

Every view that comes in this way is user input. The report checks it against the data
([a view is user input](views.md#a-view-is-user-input)).

## What a template is

The `templates` prop is a list of entries. On the element it is a property.

| Key | What |
| --- | --- |
| `name` | The name in the menu, plain text. For a view file, its `name` is used when the entry has none. |
| `view` | The view, as `onViewChange` gives it. |
| `file` | Instead of `view`: a [view file](../reference/view-file.md) (`format: "pivotkit-view"`), its object or its text, as people download and share it. |
| `scope` | `"shared"` (Shared views) or `"user"` (My views). Without it, an entry marked `deletable` is the user's own and every other one is shared. Set it on every entry: a deletable shared view without it would be listed under "My views" (the console says so once). |
| `deletable` | `true` shows a delete button, when the report has a delete to call (`onDeleteTemplate`). |

The report leaves out an entry without a name or without a usable view. Names need not be unique.
The menu shows every entry in order, and a delete or publish asks about that entry.

## Where they are kept

### Your application keeps them (callbacks)

You keep the templates where you keep other data, such as a database or a settings service. You
pass them as `templates`. The report asks you to change them:

| React | Element | When |
| --- | --- | --- |
| `onSaveTemplate(name, view, { scope, source })` | `save-templates`, event `pivot-template-save` (`{ name, view, scope, source }`) | **Save current view** and **Save as…**; **Save** on one of the user's own views of `templates`; `scope` is `"user"`, `source` the data shown (below). |
| `onDeleteTemplate(name, { scope })` | event `pivot-template-delete` (`{ name, scope }`) | Delete of a `deletable` entry, after the user confirmed; `scope` is its group. |
| `onPublishTemplate(name, view, { source })` with `canPublish` | `can-publish`, event `pivot-template-publish` (`{ name, view, source }`) | **Publish as shared view** on one of the user's views, and **Save** on a shared view loaded, each after the user confirmed. |

`source` is the data the view was made on, as a [view file](../reference/view-file.md) names it:
`{ id, name, params }`. It is one of these:

- your `source`
- a file the user loaded in the report (`allowImport`). Its `params.sheet` is the sheet of a workbook.
- `null` without a source id

A view of a workbook's sheet can open on that sheet again. Keep `source` with the view and pass it
back as a view file:
`{ name, scope: "user", deletable: true, file: toViewFile(view, { name, source }) }` in `templates`.
An entry `{ name, view }` names no data and opens on the data shown.

Views you kept without `source` open on the sheet shown. The report cannot tell the sheet they were
made on.
They get it only when the user saves them again on that sheet, or when you add it by hand
([view file](../reference/view-file.md#the-sheet-of-a-workbook)).

The menu lists your `templates` whatever data the report shows. Filter them by `source` yourself
where that matters.

Each callback may return a promise. On the element, use `event.detail.respondWith(promise)`. The
report says "saved", "deleted" or "published" when the promise resolves. When it rejects, the report
shows the error's message. Then pass the new list as `templates`.

!!! warning "Save by name: replace, do not add"
    **Save** sends the loaded view's own name. **Save as** sends a name that exists once the user
    confirmed "Replace it?". Replace the view of that name: an upsert by name, per user for
    `scope: "user"`. A second entry would leave two views of one name. The report sends the view it
    shows, normalized against the data and with your custom orders (`fieldDefaults.order`). Save and
    Publish send the same. Who may publish or delete shared views is your decision: pass
    `canPublish` and mark shared entries `deletable` only for the people who may, an admin role for
    example. The report only shows what you allow. Your server must check who may save, publish or
    delete, and validate every view it receives as user input. The report sends a published view
    normalized against the data, never as it was stored.

```jsx
function Report({ rows, user }) {
    const [templates, setTemplates] = useState([]);
    const load = () => fetch("/api/views").then((r) => r.json()).then(setTemplates);
    useEffect(() => { load(); }, []);
    return (
        <PivotReport
            data={rows}
            templates={templates}
            onSaveTemplate={(name, view) => post("/api/views/mine", { name, view }).then(load)}
            onDeleteTemplate={(name, { scope }) => remove(`/api/views/${scope === "shared" ? "shared" : "mine"}/${encodeURIComponent(name)}`).then(load)}
            canPublish={user.isAdmin}
            onPublishTemplate={(name, view) => post("/api/views/shared", { name, view }).then(load)}
        />
    );
}
```

A sketch of the REST side, in any language. The paths are an example:

| Request | Answer |
| --- | --- |
| `GET /api/views` | `[{ name, view, scope, deletable }]`: the shared views (`deletable` for admins) and the user's own (`deletable: true`) |
| `POST /api/views/mine` | `{ name, view }`: saves a view of the user's |
| `POST /api/views/shared` | `{ name, view }`: publishes a shared view; admins only |
| `DELETE /api/views/mine/{name}`, `DELETE /api/views/shared/{name}` | deletes one; shared ones for admins only |

Read what comes back as user input. pivotkit-core's `parseTemplates` (below) checks a list and caps
it. The report checks every view against the data before it shows it.

### The browser keeps "My views" (`templateStore="browser"`)

Without a server of your own, the report can keep the user's own views itself:

```jsx
<PivotReport data={rows} templates={shared} templateStore="browser" storageKey="sales" source={{ id: "sales" }} />
```

```html
<pivot-report template-store="browser" storage-key="sales" source-id="sales"></pivot-report>
```

- The report keeps the views in the browser's `localStorage` under `pivotkit:views:<storageKey>`.
  Without a `storageKey` the key is `pivotkit:views`. Give each report on a page its own
  `storageKey`.
- It stores them as view files that name the data they were made for (`source`). A report shows the
  views of its own data and those made for no named data.
- The views are **only in this browser on this device**. They are gone when the site's data is
  cleared, and nobody else sees them. The menu says so under "My views".
- The store holds at most 100 views and 500,000 characters. A save beyond that says why and keeps
  nothing. So does a save the browser refuses because storage is blocked or full.
- The caps never refuse a delete, so a store over them can always shrink. A store gets over them
  through older caps or a change by hand.
- The report does not read a stored text over 500,000 characters at all. It writes one console
  warning, and the next save replaces the text.
- When another tab changed a view meanwhile, a delete of it says so and deletes nothing.
- Saving a view under a name it already has for the same data replaces it.
- A file the user loaded (`allowImport`) is data of its own ([how a loaded file is
  named](../reference/import.md#how-a-loaded-file-is-named)). A view saved on a workbook's sheet also
  names the sheet, so the store keeps a view of a name per sheet.
- While the report shows a workbook, the menu also lists the views of its other sheets, with their
  sheet. Each opens on its sheet ([Load your own data](../use/load-data.md#after-loading)).
- A view stored before views named their sheet gets its sheet when the user saves it again on that
  sheet.
- The report reads the store as user input (`parseTemplates`). It reads it after the first render, so
  a report rendered on the server hydrates without a mismatch.
- `onSaveTemplate` wins. With it, saves go to your application. The menu still lists views stored
  earlier, and the user can delete them. The menu lists your `templates`, shared views for example,
  with the stored ones.

## Templates in an OpenAPI document (`x-pivotkit-views`)

An API that describes its data with OpenAPI or JSON Schema can carry its shared views next to it.
They go in the extension `x-pivotkit-views`: a list of view files, `{ name, view }` entries or views
with a `name`. This is **pivotkit's own convention**, not part of OpenAPI or JSON Schema. Both leave
an `x-` key as the place for extensions. The views name the fields of the rows the report gets.

```yaml
components:
  schemas:
    Release:
      type: object
      properties:
        product: { type: string, title: Product }
        cycle: { type: string, title: Cycle }
        lts: { type: boolean, title: LTS }
      x-pivotkit-views:
        - name: Long-term support cycles per product
          view:
            rows: [product]
            cols: [lts]
            values: [{ field: cycle, agg: count }]
        - format: pivotkit-view
          formatVersion: 2
          name: Cycles per product (chart)
          view: { rows: [product], values: [{ field: cycle, agg: count }], display: chart }
```

```js
import { fieldDefaultsFromSchema } from "pivotkit-core";
import { templatesFromSchema } from "pivotkit-core/templates";

const fieldDefaults = fieldDefaultsFromSchema(openapi, { schema: "Release" }).defaults;
const { templates, issues } = templatesFromSchema(openapi, { schema: "Release" });
// <PivotReport templates={templates.map((t) => ({ ...t, scope: "shared" }))} fieldDefaults={fieldDefaults} ... />
```

`templatesFromSchema` reads the extension of the schema that `options.schema` names. That is a
schema of `components.schemas` or `definitions`, or a local `$ref`. Without it, it reads the
extension of the document's root. It follows references inside the document only and fetches
nothing.

The [live demo](../demo.md) shows it with the endoflife.date data. The playground adds two views to
its copy of the API's OpenAPI document and lists them under Shared views. This is a demo extension:
the API's own document has none.

## Reading a list of templates (`parseTemplates`)

```js
import { parseTemplates } from "pivotkit-core/templates";

const { templates, issues } = parseTemplates(await response.text());
// templates: [{ name, view, description?, source? }]; issues: what was left out and why
```

`parseTemplates` takes a list, or its JSON text, of view files, `{ name, view }` entries and views
with a `name`. It never throws. It does the following:

- It caps the text and the number of templates before it reads them (`TEMPLATE_LIMITS`: 5,000,000
  characters, 500 templates).
- It reads every key as an own property.
- It makes names and descriptions plain text.
- It leaves out, with an issue, an entry without a name or a usable view, or of a newer format or
  view version.

The views are still user input. The report, or `normalize()`, checks them against the data. See the
[pivotkit-core reference](../reference/core.md#templates).
