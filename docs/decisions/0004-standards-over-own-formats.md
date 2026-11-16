---
title: Standards instead of our own formats
description: pivotkit uses existing standards for sign-in, output and interfaces, and does not rebuild what another tool does well.
status: accepted
date: 2026-11-16
---

# 0004 Standards instead of our own formats

Sources: [PRODUCT.md, principle 3](https://github.com/eizedev/pivotkit/blob/main/PRODUCT.md#principles)
([#492](https://github.com/eizedev/pivotkit/pull/492)),
[#45](https://github.com/eizedev/pivotkit/issues/45)

## Context and Problem Statement

pivotkit needs sign-in, output files and interfaces for programs. Each could follow an existing
standard or be a format of its own. A format of its own can fit pivotkit better. But everyone who uses it has to
learn it, and the project has to document and keep it.

## Considered Options

- Formats and mechanisms of our own where they fit pivotkit better.
- Existing standards.

## Decision Outcome

Chosen option: existing standards.

- Sign-in goes through existing identity providers. pivotkit stores no passwords or accounts.
- Output is Excel, HTML and CSV.
- The interfaces are REST with OpenAPI, and MCP.
- A view is JSON with a JSON Schema.

The reason recorded in PRODUCT.md: what another tool does well, pivotkit does not rebuild.

### Consequences

- Good: a client that reads OpenAPI or speaks MCP works without a client made for pivotkit.
- Bad: pivotkit builds no idea that needs a format of its own. #45, a query syntax for views, ended
  as not planned for this reason. It can come back if a host needs it and it can follow an
  existing standard.
