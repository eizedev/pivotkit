---
title: Sharing and keeping a view
description: Share a pivotkit view as a link, as JSON or as a view file, load one (with a check when it was made for other data), keep the view per browser tab, and what the playground's address holds.
---

# Sharing and keeping a view

A report is its [view](views.md): a small JSON object with field names and, in its filters, the
values chosen there ([privacy](../reference/view-file.md#privacy)). The **Views** menu shares
it in three ways and loads one, and a host can keep it per tab. What is shared is a
[view file](../reference/view-file.md): the view with its name, the data it was made for (the
host's `source`) and the fields it uses. Every view that comes in - from a link, pasted text, a file
or the tab's storage - is user input: it goes through `normalize()` against the data, and what does
not fit is left out and said in plain words.

## In the Views menu (for the people who use the report)

The **Share** level of the Views menu - Copy link, Copy view as JSON, Download view, Load view… -
and what people see while a view loads are on [Views, saving and sharing](../use/views.md#share-a-view)
under Use a report. For the host:

- **Copy link** shows only with `shareLink` ([Links](#links-for-developers)).
- **Download view** names the file `<name>.pivotkit.json` after the view's name, else `source.name`,
  else `fileName` (`pivot.pivotkit.json` without one); it passes `onExport` (`"json"`) first.
- **Load view…** caps the text at 1,000,000 characters and a file at 1,000,000 bytes before it is
  parsed, reads a view file, a bare view's JSON or a link, and normalizes what it gets against the
  data; a view file of a newer format or view version is refused
  ([reading a view file](../reference/view-file.md#reading-a-view-file)).

### Before a view for other data is loaded

A loaded view or a link asks before it is applied when its `source.id` is not the report's
`source.id`, or when it uses fields this data does not have or has with another type
([what people see](../use/views.md#before-a-view-for-other-data-is-loaded)). **Switch to … and load**
is offered when the host lists that source in `sources` and handles `onSourceSwitch`
([below](#the-source-of-a-view-for-developers)). Names from the file are shown as text only.

### After the load

The load is one undo step; switching to other data starts a new history there. What was left out is
said in plain words above the result ([after the load](../use/views.md#after-the-load)); a saved view
with more fields in a zone than the limits allow is reported the same way.

## The source of a view (for developers)

`source` names the data the report shows: `{ id, name }`. Its id and name go into the view files and
links the report shares, and a view made for another id asks before it is loaded. `sources` lists the
other data the host can show; with `onSourceSwitch` the check offers to switch to one of them and gets
`{ source, view, name }`: the view as the file has it (made for that data, not normalized here), to
pass as the start view of the report on it. That view is untrusted input like any loaded view (it
comes from a file or a link): hand it only to a report, which normalizes it, and never run or render
anything from it.

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
