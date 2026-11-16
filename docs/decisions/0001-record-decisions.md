---
title: Record decisions as decision records
description: pivotkit records lasting decisions as numbered MADR records in docs/decisions, also those that span its host integrations.
status: accepted
date: 2026-11-16
---

# 0001 Record decisions as decision records

Source: [#493](https://github.com/eizedev/pivotkit/issues/493)

## Context and Problem Statement

Lasting decisions lived in issues, in PRODUCT.md and in old discussions. People and AI agents could
not see the reasons. Some undid a decision by accident. "pivotkit has no scheduler"
was one example: it lived in [#165](https://github.com/eizedev/pivotkit/issues/165) and PRODUCT.md.

Some decisions span pivotkit and its host integrations, such as the PowerShell Universal module.
They need one place too.

## Considered Options

- Keep decisions in issues and PRODUCT.md.
- Record each decision as an Architecture Decision Record in `docs/decisions/`.

## Decision Outcome

Chosen option: decision records in `docs/decisions/`, in the minimal template of
[MADR](https://adr.github.io/madr/).

- One decision per file, numbered, about one page.
- Each record links its issue or pull request. Work and task state stay in issues.
- An accepted record is not edited. A change is a new record that supersedes or amends the old one.
  Both link each other.
- Reversible choices with little impact get no record.
- Decisions that span pivotkit and its host integrations live here too. The PowerShell Universal
  repository links to them.

Status means:

| Status | Meaning |
| --- | --- |
| accepted | binding. A task that conflicts with it stops and proposes a new record |
| proposed | context. Not binding yet |
| superseded | history. It links the record that replaced it |

Where no source gives the reason, a record says "reason not recorded".

### Consequences

- Good: anyone can check a task against the accepted records before it starts.
- Good: one place for decisions of pivotkit and its host integrations.
- Bad: the records and the index need upkeep.
