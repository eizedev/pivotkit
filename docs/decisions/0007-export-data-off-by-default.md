---
title: Source data export off by default
description: Export → Source data hands out every row and column, so it is off until the host turns it on.
status: accepted
date: 2026-11-14
---

# 0007 Source data export off by default

Sources: [#251](https://github.com/eizedev/pivotkit/pull/251),
[docs/security.md, "Source data"](../security.md#source-data)

## Context and Problem Statement

A report could not hand out the rows behind its view. So `pivotkit render` could not make
the same report again from a download. #251 added Export → **Source data**: every row and every
column of the data, as CSV or JSON. That download holds more than the report shows. Should it be on
by default?

## Considered Options

- On by default.
- Off by default. The host turns it on with `exportData` (`export-data` on the element).

## Decision Outcome

Chosen option: off by default.

The reasons recorded in #251, from its design review:

- The download holds the columns no view places and the rows the report's filters leave out.
- An update must not open a new data channel without the host deciding.

The default is also checked where the export runs, not only in the menu.

### Consequences

- Good: an existing host hands out nothing new after an update.
- Bad: a host that wants the download must turn it on.
