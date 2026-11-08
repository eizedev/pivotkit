---
title: Views, saving and sharing
description: Undo and redo every step, reset, pick a shared view or one of your own, save and publish views, share a report as a link, as JSON or as a view file, and load one - with a check when it was made for other data.
---

# Views, saving and sharing

A report you built is a **view**: which fields are where, the filters, the chart settings. You can
undo every step, save the view under a name, pick one someone else saved, and share it as a link or a
file. A view holds the names of fields and settings, not the data: whoever opens it sees the report on
their own data.

## Undo, redo, reset

| Button | Keys | Does |
| --- | --- | --- |
| **Undo** | Ctrl+Z, on a Mac Cmd+Z | Takes back the last change. |
| **Redo** | Ctrl+Shift+Z or Ctrl+Y, on a Mac Cmd+Shift+Z | Repeats it. |
| **Reset** | | Goes back to the start view, as one step you can undo. |

Every change is a step: placing a field, a filter, a chart setting, loading a view.

## The Views menu

**Views** in the toolbar lists the saved reports in two groups, then **Share**. Each entry loads its
view with one click; the first three are also offered in the empty report.

![The Views menu with Shared views, My views with a saved view, the save field and the note where it is kept](../assets/screenshots/views-menu-light.png#only-light)
![The Views menu with Shared views, My views with a saved view, the save field and the note where it is kept](../assets/screenshots/views-menu-dark.png#only-dark)

| Group | What |
| --- | --- |
| **Shared views** | The same for everyone who uses the report: the views the application provides. Where someone can change them, an **i** next to one says who (by default "Only admins can change shared views."). |
| **My views** | Your own. **Save current view** saves the report under a name; your views can be deleted, and published for everyone where the application allows it. |

A group without entries is not shown; My views shows while you can save.

### Save a view

1. Open **Views**.
2. Type a name under **Save current view** (up to 120 characters).
3. Press **Save** or Enter. **Save** is greyed out while the name is empty.

The menu stays open with the new entry and the name field empty, so **Copy link** is one click away.
The name field has an **×**; Escape in it empties it first, then closes the menu. Names need not be
unique, and every name is shown as plain text.

### Delete or publish one of your views

- The delete button next to one of your views asks in place before the view goes.
- Where the application allows it, the arrow next to one of your views publishes it as a shared view,
  for everyone, after a confirmation in place.
- After a delete, a publish or Cancel the focus goes back to the entry in that place.

### Views kept in this browser

When the report keeps your views in the browser, the menu says so: they are only in this browser on
this device, and gone when the site's data is cleared. At most 100 views are kept. When the views were
changed in another tab since you opened the menu, a delete here deletes nothing and says so: "The view
could not be deleted: the views were changed in another tab; open the menu again".

## Share a view

![The Views menu with Shared views, My views and Share: Copy link, Copy view as JSON, Download view, Load view](../assets/screenshots/share-menu-light.png#only-light)
![The Views menu with Shared views, My views and Share: Copy link, Copy view as JSON, Download view, Load view](../assets/screenshots/share-menu-dark.png#only-dark)

The **Share** section of the Views menu:

| Entry | Gives |
| --- | --- |
| **Copy link** | An address with the view in it, when the application allows links. Whoever opens it sees the same report on the same data; Reset still goes to the application's start view. A view too large for a link says so: share it as a file. |
| **Copy view as JSON** | The view file as text, for a message or a ticket. |
| **Download view (.pivotkit.json)** | The view as a file, named `<name>.pivotkit.json` after the view's name (the saved view or file it came from), else the data's name, else the application's file name (`pivot.pivotkit.json` without one). |
| **Load view…** | Opens a view from pasted text, a link or a file (below). |

Under the entries a line says what a shared view gives away: "A view holds the names of fields and,
in its filters, the values chosen there: share it only where those may be seen." Where a page does not
allow the clipboard, the report says so and points to Download view.

## Load a view

1. **Views**, **Load view…**.
2. Paste a view file, a view's JSON or a link and press **Load** (greyed out while the box is empty),
   or press **Choose file…**, which loads the file at once.

Nothing changes until it is loaded; the load is one step Undo takes back. The box has an **×** that
empties it.

- A text of more than 1,000,000 characters, or a file of more than 1,000,000 bytes, is refused before
  it is read: "This is too large for a view."
- A text that is no view says why: "This is neither a view in JSON nor a pivotkit link."
- A view from a newer version of pivotkit is refused: "This view comes from a newer version of
  pivotkit and cannot be read here. Update pivotkit to open it."

### Before a view for other data is loaded

When the view was made for other data, or uses fields this data does not have or has with another
type, the report asks before anything changes: "This view may not fit this data", with what does not
fit ("It was made for “Weather”.", "Fields this data does not have: “City”.", "Fields of another type
here: “Units”."). Names from the file are shown as text only. The question takes the focus when it
appears.

| Choice | Does |
| --- | --- |
| **Load anyway** | Loads it; what does not fit is left out. |
| **Cancel** | Back to the form. |
| **Switch to “Weather” and load** | Where the application can show that data: shows the other data with the view on it. That starts the report on that data anew (a new history: Undo begins there); the question says so under its button. |

![A view file made for other data: asked before it is loaded, with Load anyway, Cancel and Switch](../assets/screenshots/load-check-light.png#only-light)
![A view file made for other data: asked before it is loaded, with Load anyway, Cancel and Switch](../assets/screenshots/load-check-dark.png#only-dark)

A link does the same: one in the page's address made for other data, or using fields this data does
not have, opens only after the same question, shown above the result ("The link's view may not fit
this data"): **Load anyway**, **Cancel** (the report keeps its start view; the same link given again
asks again) and **Switch to … and load** where the application allows. A link at the page's load does
not take the focus; one opened later in the tab is a step Undo takes back once loaded.

### After the load

- A note says it was loaded, with **Undo**, and goes after a few seconds: "View loaded", "Opened the
  view from the link", or "View loaded; some parts did not fit this data" (a warning, not an error).
- What was left out stays above the result, "Some parts of the view were not used", until you
  dismiss it with its **×** or load another view ([details](behaviour.md#parts-of-a-view-that-were-not-used)).
  A saved view that has more fields in a zone than the limits allow is said there the same way.
- Real errors (a damaged link, an application that could not save) stay in the status line until
  you close them.

!!! note "For developers"
    Where views are kept (`templates`, `onSaveTemplate`, `onDeleteTemplate`, `onPublishTemplate` with
    `canPublish`, `templateStore="browser"`) is in [Templates and shared views](../concepts/templates.md);
    links, `source`, `sources`, `onSourceSwitch` and keeping the view per tab (`persistView`) in
    [Sharing and keeping a view](../concepts/sharing.md); the file itself in the
    [view file format](../reference/view-file.md).
