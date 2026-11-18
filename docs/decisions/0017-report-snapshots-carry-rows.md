---
title: Report snapshots may carry rows
description: A person may share a report over data they sent as a snapshot, a report file that holds the rows it shows, under report retention. The operator turns it on, the person consents each time, and it can be deleted. This amends 0003.
status: proposed
date: 2026-11-18
---

# 0017 Report snapshots may carry rows

Sources: [#622](https://github.com/eizedev/pivotkit/issues/622),
[#364](https://github.com/eizedev/pivotkit/issues/364),
[#335](https://github.com/eizedev/pivotkit/issues/335)

This record amends [0003](0003-no-database-or-file-store.md).

## Context and Problem Statement

The server uses data sent in a request once and drops it. So a person can share a report over it as
a file, but not as a live report. #335 asked for an upload that creates a source. It ended as not
planned under 0003, with "reopen with a concrete need". Sharing a live report over one's own data is
that need.

Should the server keep uploaded data, and in which form?

## Considered Options

- Keep nothing. People share uploaded data as files only.
- A report snapshot: a report file that holds its view and the rows it shows.
- Kept datasets: stored, reusable sources with their own API.

## Decision Outcome

Chosen option: a report snapshot.

- The operator turns snapshots on. They are off by default.
- The person consents each time. Without consent, the server keeps nothing.
- A consent the model sets alone is no consent. Over MCP, the person confirms on a page.
- The server keeps a consent record with the snapshot. It has its own retention.
- A snapshot is a file in the output directory, with its own retention and size caps. It is never a
  source for other reports.
- It holds only the fields the sharer could see.
- Only the sharer may open a snapshot of a closed or per-person source: "only me".
- Other snapshots use the access levels the operator offers on the instance: only me, signed-in,
  or a group from the sign-in.
- The capability to open it travels in the link's fragment, never in its path.
- Its owner and the operator can list and delete it. pivotkit refuses to put snapshots where it
  cannot delete them.

Why: a snapshot belongs to one report and dies with it. Nothing reuses it, nothing updates it, and
it has its own retention and deletion. Kept datasets would be reusable, updatable sources with an
access model of their own, so pivotkit would become the database PRODUCT.md rules out. Snapshots
also reuse delivery, bindings and retention.

### Consequences

- Good: a person can share a live report over their own data.
- Bad: the server keeps rows until retention or a deletion removes them.
- Bad: listing and deleting per person needs a lasting owner binding. Someone can then tie two
  snapshots of one person to each other. privacy.md must say so.
- Bad: the consent record is personal data too.
- 0003 still holds for sources: no database, and no kept data that other reports read.
- "Anyone with the link" over a snapshot needs its own record.
- When this record is accepted, 0003 gets a line that links here, and PRODUCT.md's "not a database"
  and "not a file store" rows name snapshots as the exception.
