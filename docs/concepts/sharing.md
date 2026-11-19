---
title: Sharing and keeping a view
description: Share a pivotkit view as a link, as JSON or as a view file, load one (with a check when it was made for other data), keep the view per browser tab, and what the playground's address holds.
---

# Sharing and keeping a view

A report is its [view](views.md). The view is a small JSON object with field names. Its filters
also hold the values chosen there ([privacy](../reference/view-file.md#privacy)).

- The **Views** menu shares a view in three ways and loads one.
- A host can keep the view per tab.

What the report shares is a [view file](../reference/view-file.md). It holds the view with its name,
the data it was made for (the host's `source`) and the fields it uses.

Every view that comes in is user input, whether it comes from a link, pasted text, a file or the
tab's storage. `normalize()` checks it against the data. The report leaves out what does not fit and
says so in plain words.

## In the Views menu (for the people who use the report)

The Views menu has a **Share this view** group: Copy link, Copy view as JSON, Download view and Open
view file…. [Views, saving and sharing](../use/views.md#share-a-view) under Use a report describes
them and what people see while a view loads. For the host:

- **Copy link** shows only with `shareLink` ([Links](#links-for-developers)).
- **Download view** names the file `<name>.pivotkit.json`. The name is the view's name, else
  `source.name`, else `fileName`. Without any of them the file is `pivot.pivotkit.json`. Download view
  passes `onExport` (`"json"`) first.
- **Open view file…** caps the text at 1,000,000 characters and a file at 1,000,000 bytes before it
  parses them. It reads a view file, a bare view's JSON or a link, and normalizes what it gets against
  the data. It refuses a view file of a newer format or view version
  ([reading a view file](../reference/view-file.md#reading-a-view-file)).

### Before a view for other data is loaded

The report asks before it applies a loaded view or a link in two cases
([what people see](../use/views.md#before-a-view-for-other-data-is-loaded)):

- Its `source.id` is not the report's `source.id`.
- It uses fields this data does not have, or has with another type.

The report offers **Switch to … and load** when the host lists that source in `sources` and handles
`onSourceSwitch` ([below](#the-source-of-a-view-for-developers)). The report shows names from the file
as text only.

### After the load

The load is one undo step. Switching to other data starts a new history there. The report says in
plain words above the result what it left out ([after the load](../use/views.md#after-the-load)). It
reports a saved view with more fields in a zone than the limits allow the same way.

## The source of a view (for developers)

`source` names the data the report shows: `{ id, name }`. Its id and name go into the view files and
links the report shares. The report asks before it loads a view made for another id.

`sources` lists the other data the host can show. With `onSourceSwitch`, the check offers to switch to
one of them. The handler gets `{ source, view, name }`. `view` is the view as the file has it: made
for that data and not normalized here. Pass it as the start view of the report on that data.

That view is untrusted input like any loaded view, since it comes from a file or a link. Hand it only
to a report, which normalizes it. Never run or render anything from it.

```jsx
<PivotReport
    data={rows}
    source={{ id: "sales", name: "Sales 2026" }}
    sources={[{ id: "weather", name: "Weather" }]}
    onSourceSwitch={({ source, view }) => openReport(source.id, view)}
/>
```

```html
<pivot-report source-id="sales" source-name="Sales 2026"></pivot-report>
<script type="module">
    const report = document.querySelector("pivot-report");
    report.sources = [{ id: "weather", name: "Weather" }];
    report.addEventListener("pivot-source-switch", (e) => openReport(e.detail.source.id, e.detail.view));
</script>
```

Without `source`, a view file has no source id and no check compares one. The report still asks
about missing fields.

## Links (for developers)

`shareLink` turns links on. It is off by default.

- `true` links to the page's own address without its query string: origin, path and fragment. A query
  may hold a token or an id the host did not mean to share.
- A string is the base URL, used as it is. A host that wants its query in the link passes the whole
  URL.

```jsx
<PivotReport data={rows} shareLink />
<PivotReport data={rows} shareLink="https://reports.example.com/sales" storageKey="sales" />
```

```html
<pivot-report share-link></pivot-report>
<pivot-report share-link="https://reports.example.com/sales" storage-key="sales"></pivot-report>
```

The view travels in the URL fragment, which browsers do not send to the server:

- `#pivot=<text>` by default.
- `#pivot-<storageKey>=<text>` when the report has a `storageKey`. Several reports on one page then
  each have their own entry.

The report adds or replaces only that entry. The rest of the fragment stays byte for byte, also a
hash route with its own query (`#/reports/a?tab=2&pivot=1.…`).

With `shareLink` set, the report reads its entry after the first render, so a server render and its
hydration match. A link at load is where the report starts, with a new undo history. Reset still goes
to the start view. When only the fragment changes later, such as a link opened in the same tab, its
view is one step, like Open view file. Undo goes back to the view before.

The text is pivotkit's share format, written by `encodeViewLink` and read by `decodeViewLink` of
[`pivotkit-core/link`](../reference/core.md#links-pivotkit-corelink). It is `1.` followed by the JSON
of the [link profile of a view file](../reference/view-file.md#the-link-profile), compressed with
DEFLATE ([fflate](https://github.com/101arrowz/fflate)) and written in base64url. The link profile
holds the format, the version, the source's id, the view's name and the view.

The text has two caps:

- At most 32,000 characters. Share a larger view as a file. Copy link says so.
- At most 1,000,000 characters inflated. The compressed bytes go into the inflater 1 KiB at a time,
  and it stops at the first slice past the cap. A crafted link (a deflate bomb) can neither make a
  large allocation nor keep the page busy.

The report loads the module on first use, so a report that never shares does not load it.
pivotkit-element loads it as a chunk of its own ([bundle size](../reference/element.md#bundle-size)).

A host can keep the view in its own address, as the playground does. It writes the same entry with
`encodeViewLink(toViewFile(view, { source: { id } }, { link: true }))` on every `onViewChange`. A link
that holds a bare view opens too, and so does every link of view format version 1.

### Opening a link on another page

A page that is not a pivotkit report can read a link too, such as a server-side route or a
dashboard that picks the data first. It calls `readViewLink(location.hash, key, { allowParams })` of
`pivotkit-core/link` and gets:

- the view and its name
- `src`, the data source the link names

`src.id` is the host's opaque name of the data, never an address or a query. `src.params` hold what
else the host needs to find the data: a report's parameters, `toViewFile`'s `source.params`. Only the
params the host lists by name in `allowParams` come through, none by default. `sheet` is one of them:
the sheet of a workbook the user loaded in the report
([view file](../reference/view-file.md#the-sheet-of-a-workbook)).

The page resolves the source itself, with the viewer's own rights. It answers an unknown source and
one the viewer may not see the same way. The view is user input from outside, so normalize it with
`outsideLimits()`.

```js
import { readViewLink } from "pivotkit-core/link";
import { encode, normalize, outsideLimits } from "pivotkit-core";

const link = readViewLink(location.hash, "sales", { allowParams: ["year"] });
if (link.view && link.src) {
    const rows = await loadRowsFor(link.src.id, link.src.params);   // the host's own lookup
    const { view } = normalize(link.view, encode(rows), { limits: outsideLimits() });
}
```

### Parameters in the page's address { #link-params }

A link from the services' `create_link` can name a source's parameters, such as a customer. Their
values go into the page's query string, so a host's backend can read them. The view stays in the
fragment:

`https://reports.example.com/tickets?customer=acme#pivot-tickets=1.…`

- The operator lists the parameters a link may carry, per source: `sources.<id>.linkParams`
  ([options](../reference/mcp.md#configuration)). Without the list, a link carries none.
- `create_link` refuses any other parameter with `INVALID_INPUT` and names the allowed ones.
- A parameter bound to a sign-in claim never goes into a link. The server refuses such a list.
- The server checks the values with the source's parameter rules before it makes the link.
- A query that the configured page address holds stays. A name the link sets replaces the same name
  there.

Anyone can write such an address by hand. So the page passes on only the names `list_sources` or
`GET /sources` gives as the source's `linkParams`. The backend that loads the rows checks the values
again, with the viewer's rights.

How the query relates to the fragment:

- The fragment's `src.params`, read with `allowParams`, stay as they are. Copy link writes them, such
  as a workbook's `sheet`.
- Where the query and the fragment name the same parameter, the query wins.
- Only `create_link` writes the query. Copy link drops the query, unless the host passes a
  `shareLink` that keeps it ([links](#links-for-developers)).

```js
import { readViewLink } from "pivotkit-core/link";

const linkParams = ["customer"];   // the source's linkParams from GET /sources
const link = readViewLink(location.hash, "tickets", { allowParams: ["sheet"] });
const query = new URLSearchParams(location.search);
const params = { ...link.src?.params };
for (const name of linkParams) {
    if (query.has(name)) params[name] = query.get(name);   // the query wins
}
```

Values in a query string land in access logs, in the browser's history and in the `Referer` header.
[Security](../security.md#link-params) says what to list and which `Referrer-Policy` to send.

## Keeping the view per tab

`persistView="session"` (attribute `persist-view="session"`) keeps the view in the tab's
`sessionStorage` under `pivotkit:view:<storageKey>`. A reload shows it again. Another tab starts
fresh.

- The report reads the stored view after the first render, like the tips.
- Blocked storage, as in a private window, changes nothing.
- Reset goes to the start view, and the tab then keeps that.
- A link wins over the stored view.

Give each report on a page its own `storageKey`.

## The playground's address

The [playground](../demo.md) shows what a host can do with this. Its address has two parameters of its
own and the share format:

`?data=countries&start=where-do-most-people-live-region-then-country-2024#pivot-playground=1.…`

- `data` and `start` belong to the playground. They pick the data set and the start template.
  `start` is the template's name in words. The Data and Start dropdowns write them.
- `#pivot-playground=` is the share format. The playground's `storageKey` is `playground`. The
  playground writes it on every change.
- Copy link copies data, start, the view and, for generated data, `rows`. A link opens exactly that
  report. The playground passes that URL as `shareLink`. Its language, theme and height stay the
  viewer's own.
- Each data set is a `source` with its key and name, and the others are its `sources`. When you load
  a view file made for another data set, the playground offers "Switch to … and load". It picks that
  data set and starts on the view.

A React app, a page with `<pivot-report>` or a PowerShell Universal dashboard uses only the fragment
part, with its own data.
