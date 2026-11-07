---
title: Sharing and keeping a view
description: Share a pivotkit view as a link, as JSON or as a view file, load one (with a check when it was made for other data), keep the view per browser tab, and what the playground's address holds.
---

# Sharing and keeping a view

A report is its [view](views.md): a small JSON object with field names. The **Views** menu shares
it in three ways and loads one, and a host can keep it per tab. What is shared is a
[view file](../reference/view-file.md): the view with its name, the data it was made for (the
host's `source`) and the fields it uses. Every view that comes in - from a link, pasted text, a file
or the tab's storage - is user input: it goes through `normalize()` against the data, and what does
not fit is left out and said in plain words.

## In the Views menu (for the people who use the report)

The Views menu has two sections: **Saved views** (the host's `templates` and "Save current view") and
**Share**:

- **Copy link** (when the application allows links): an address with the view in it. Whoever opens
  it sees the same report on the same data; Reset still goes to the application's start view.
- **Copy view as JSON**: the [view file](../reference/view-file.md) as text, for a message or a
  ticket.
- **Download view (.pivotkit.json)**: the view file, named `<name>.pivotkit.json` after the view's
  name (the saved view or file it came from), else the data's name (`source.name`), else the host's
  `fileName` (`pivot.pivotkit.json` without one).
- **Load view…**: paste a view file, a view's JSON or a link and press **Load** (greyed out while the
  box is empty), or **Choose file…**, which loads the file at once. Nothing changes until it is
  loaded; it is one step that Undo takes back. A text of more than 1,000,000 characters, or a file of
  more than 1,000,000 bytes, is refused before it is parsed ("This is too large for a view."); a text
  that is no view says why ("This is neither a view in JSON nor a pivotkit link.", "This view comes
  from a newer version of pivotkit and cannot be read here. Update pivotkit to open it.").
- Under the entries a line says what a shared view gives away: "A view holds the names of fields and,
  in its filters, the values chosen there: share it only where those may be seen."

![The Views menu with Saved views and Share: Copy link, Copy view as JSON, Download view, Load view](../assets/screenshots/share-menu.png)

Where a page does not allow the clipboard, the report says so and points to Download view.

### Before a view for other data is loaded

When the view was made for another source (its `source.id` is not the report's `source.id`), or uses
fields this data does not have or has with another type, the panel asks before anything changes:
"This view may not fit this data", with what does not fit ("It was made for “Weather”.", "Fields this
data does not have: “City”.", "Fields of another type here: “Units”."), and the choices **Load
anyway**, **Cancel** (back to the form) and, when the host can show that data (its `sources` and
`onSourceSwitch`), **Switch to “Weather” and load**: the host shows the other data and the view on it.
Names from the file are shown as text only.

### After the load

The load is one step that Undo takes back. A note in the status line says it was loaded, with Undo,
and goes after a few seconds: "View loaded", or "View loaded; some parts did not fit this data" (a
warning, not an error). What was left out stays in the collapsible area above the result, "Some parts
of the view were not used", until it is dismissed with its × or another view is loaded ("fields this
data does not have (“Planet”)", "1 other setting"). A saved view that has more fields in a zone than
the limits allow is said there the same way. Real errors (a damaged link, a host that could not save)
stay in the status line until they are closed.

## The source of a view (for developers)

`source` names the data the report shows: `{ id, name }`. Its id and name go into the view files and
links the report shares, and a view made for another id asks before it is loaded. `sources` lists the
other data the host can show; with `onSourceSwitch` the check offers to switch to one of them and gets
`{ source, view, name }`: the view as the file has it (made for that data, not normalized here), to
pass as the start view of the report on it.

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

Without `source` a view file has no source id and no check compares one; missing fields are still
asked about.

## Links (for developers)

`shareLink` turns links on. `true` links to the page's own address without its query string (origin,
path and fragment: a query may hold a token or an id the host did not mean to share); a string is used
as the base URL as it is, so a host that wants its query in the link passes the whole URL. It is off
by default.

```jsx
<PivotReport data={rows} shareLink />
<PivotReport data={rows} shareLink="https://reports.example.com/sales" storageKey="sales" />
```

```html
<pivot-report share-link></pivot-report>
<pivot-report share-link="https://reports.example.com/sales" storage-key="sales"></pivot-report>
```

The view travels in the URL fragment, which browsers do not send to the server: `#pivot=<text>`, or
`#pivot-<storageKey>=<text>` when the report has a `storageKey`, so several reports on one page each
have their own. Only that entry is added or replaced: the rest of the fragment stays byte for byte,
also a hash route with its own query (`#/reports/a?tab=2&pivot=1.…`). With `shareLink` set the report
reads its entry after the first render (so a server render and its hydration match): a link at load is
where the report starts, with a new undo history (Reset still goes to the start view). When only the
fragment changes later (a link opened in the same tab), its view is one step, like Load view, and Undo
goes back to the view before.

The text is pivotkit's share format, `encodeViewLink` and `decodeViewLink` of
[`pivotkit-core/link`](../reference/core.md#links-pivotkit-corelink): `1.` and the JSON of the
[link profile of a view file](../reference/view-file.md#the-link-profile) (format, version, the
source's id, the view's name and the view) compressed with DEFLATE ([fflate](https://github.com/101arrowz/fflate)), in base64url. It is capped
at 32,000 characters (a larger view is shared as a file; Copy link says so) and at 1,000,000
characters inflated: the compressed bytes go into the inflater 1 KiB at a time and it stops at the
first slice past the cap, so a crafted link (a deflate bomb) can neither make a large allocation nor
keep the page busy. The module is loaded on first use: a report that never shares does not load it
(pivotkit-element loads it as a chunk of its own, [bundle size](../reference/element.md#bundle-size)).

A host that keeps the view in its own address, as the playground does, writes the same entry with
`encodeViewLink(toViewFile(view, { source: { id } }, { link: true }))` on every `onViewChange`. A link
that holds a bare view still opens.

## Keeping the view per tab

`persistView="session"` (attribute `persist-view="session"`) keeps the view in the tab's
`sessionStorage` under `pivotkit:view:<storageKey>`: a reload shows it again, another tab starts
fresh. It is read after the first render, like the tips; blocked storage (a private window) changes
nothing. Reset goes to the start view, and that is what the tab keeps then. A link wins over the
stored view. Give each report on a page its own `storageKey`.

## The playground's address

The [playground](../demo.md) shows what a host can do with this. Its address has two parameters of its
own and the share format:

`?data=countries&start=where-do-most-people-live-region-then-country-2024#pivot-playground=1.…`

- `data` and `start` (the template's name in words) are the playground's: they pick the data set and
  the start template, and the Data and Start dropdowns write them.
- `#pivot-playground=` is the share format (the playground's `storageKey` is `playground`), written on
  every change; Copy link copies data, start (and `rows` for generated data) and the view, so a link
  opens exactly that report. The playground passes that URL as `shareLink`; its language, theme and
  height stay the viewer's own.
- Each data set is a `source` (its key and name) and the others are its `sources`: loading a view file
  made for another data set offers "Switch to … and load", which picks that data set and starts on the
  view.

A React app, a page with `<pivot-report>` or a PowerShell Universal dashboard uses only the fragment
part, with its own data.
