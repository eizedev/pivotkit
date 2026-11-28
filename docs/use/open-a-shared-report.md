---
title: Open a shared live report
description: For the people who get a live report link - signing in, what the page shows, what "This link is not shared with this account" means, and how to pass the report on.
---

# Open a shared live report

A live report link opens a report with the current data, straight from the report server. You
need an account at your organisation's sign-in service. Nothing to install.

## Open the link

1. Open the link in your browser.
2. The page says **Signing you in** and sends you to your organisation's sign-in page.
   Sign in there.
3. The report opens. The bar at the top names the organisation and the report.

When you are still signed in at the sign-in service, step 2 takes a moment and asks for nothing.

The report works as every pivotkit report does: move fields, filter, show a chart. See
[Use a report](index.md). This browser tab keeps your changes until you close it.

## What the page can say

| The page says | What it means | What you can do |
| --- | --- | --- |
| **This link is not shared with this account** | The person who shared the link made it for themselves or for a group you are not in. | Ask them to share it with you, or sign in with another account. |
| **This link no longer works** | The link is not complete, or belongs to another report. | Ask for a new link. |
| **Link too long** | The link carries more settings than the sign-in can take. | Ask for a link with fewer settings. |
| **No access to this data** | Your account may not see the data of this report. | Ask the person who shared it, or your IT support. |
| **Not signed in**, **Sign-in failed** or **Sign-in page out of date** | You cancelled the sign-in, it did not complete, or the page used it already. | Choose **Sign in again**. |
| **The sign-in for this report did not work** | The sign-in service let you in, but the report server could not read your rights. | Reload the page. If it keeps happening, tell your IT support. |
| **Too many sign-ins** | Many sign-ins came from your network in a short time. | Wait a minute, then sign in again. |
| **The report server is busy** | Many reports are loading at the moment. | Wait: where the page counts down, the report tries again by itself. Else choose **Try again** a little later. |
| **Report page not available** | The report server cannot show reports in the browser yet. | Tell your IT support, with the request id on the page. |

A message for IT support ends with a line "For IT support:" with a code and a request id. Give
them that line.

Everyone sees only the data their own account may see. Two people who open the same link can see
different numbers.

## Pass the report on

**Copy link** (Views menu, **Share this view**) copies the link with your current view. Whoever opens it signs in
with their own account. The link does not carry your sign-in.

The report's settings, such as a customer, stay in the link's address. The note under
**Copy link** names them.

## How long you stay signed in

The page keeps no sign-in of its own. The report keeps the data it read while the tab is open. A
reload or a new tab signs you in again, mostly without a question. When the report reads its data
again after a few minutes, such as after **Try again**, the page signs you in first. The report then
comes back with the view you had.

!!! note "For operators"
    The page is part of pivotkit-server and off by default. The
    [viewer page](../reference/records.md#records-viewer) says how to turn it on.
