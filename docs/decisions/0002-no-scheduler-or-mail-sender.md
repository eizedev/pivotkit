---
title: No scheduler or mail sender
description: pivotkit makes the report and a schedule draft and hands both to the host. The host schedules, approves and sends.
status: accepted
date: 2026-11-16
---

# 0002 No scheduler or mail sender

Sources: [#165](https://github.com/eizedev/pivotkit/issues/165),
[PRODUCT.md](https://github.com/eizedev/pivotkit/blob/main/PRODUCT.md#what-pivotkit-is-not)
([#492](https://github.com/eizedev/pivotkit/pull/492)),
[#517](https://github.com/eizedev/pivotkit/issues/517)

## Context and Problem Statement

People want a report regularly, in a given format, sent to given recipients. Someone has to run the
schedule, resolve the recipients, send the report and keep copies. #165 first planned delivery
plugins and a `pivotkit-mail` package. Should pivotkit schedule and send reports itself?

## Considered Options

- A scheduler and a mail sender in pivotkit, such as the planned `pivotkit-mail`.
- pivotkit makes the report and a schedule draft and hands both to the host.

## Decision Outcome

Chosen option: hand the report and the schedule draft to the host.

- pivotkit makes the report (a file, or HTML for print) and a schedule draft.
- It hands both to the host through a host callback or a webhook, an HTTP call with the report
  document.
- The host schedules, approves, resolves recipients, sends and keeps copies.
- There is no `pivotkit-mail` package. Sending mail belongs to the host or to a mail service behind the
  webhook.

The reason recorded in #165: hosts own scheduling, storage and rights.

### Consequences

- Good: the services stay thin hosts around the engine, without a scheduler of their own.
