---
title: No database or file store of its own
description: Data stays in its systems. pivotkit reads it per request and keeps no lasting copies.
status: accepted
date: 2026-11-16
---

# 0003 No database or file store of its own

Sources: [#165](https://github.com/eizedev/pivotkit/issues/165),
[PRODUCT.md](https://github.com/eizedev/pivotkit/blob/main/PRODUCT.md#what-pivotkit-is-not)
([#492](https://github.com/eizedev/pivotkit/pull/492)),
[#335](https://github.com/eizedev/pivotkit/issues/335)

## Context and Problem Statement

The REST service and the MCP server read live data and deliver reports. Features such as an upload
link would make the server hold data. Should pivotkit keep data or reports of its own?

## Considered Options

- A database, data warehouse or file store in pivotkit.
- Data stays in its systems, and pivotkit reads it per request.

## Decision Outcome

Chosen option: data stays in its systems.

- pivotkit is no database, data warehouse or ETL tool. It reads data per request.
- It is no file store for teams. Download links expire. Lasting copies live in the operator's store.
- The services have no database of their own.

The reason recorded in #165: hosts own scheduling, storage and rights.

### Consequences

- Bad: pivotkit builds no feature that needs stored data. #335, an upload link that creates a
  source on the server, ended as not planned for this reason. Large files stay with the host or a source.
