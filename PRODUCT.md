# What pivotkit is (and is not)

pivotkit is Excel's PivotTable for web applications and the command line: people load their data,
build a report by dragging fields and take it to Excel, HTML or CSV. Scripts and AI clients make the
same reports through its services, which check who may see which data. This page says what pivotkit
is for, what it is not, and what we expect of a change.

## Who it is for

Every feature is checked against these three roles.

| Role | Wants | Success means |
| --- | --- | --- |
| User | a report from their data, by clicking, with curl or PowerShell, or by asking an AI client | a correct report, quickly, without studying the docs first |
| Operator | to run pivotkit in their environment and answer for it | start the container and it runs with secure defaults. Adjusting is possible, not required |
| Developer | to build reports into their own application (React, web component, REST, MCP, host integrations) | a few lines, stable interfaces, clear errors |

## What it is

- **The engine** computes a pivot view from the rows the host passes: groups, values, filters,
  sorting, totals and formats.
- **The interface** is a React component and a web component to click a report together, with a
  chart, export and print. Integrations for hosts, such as the maintainer's PowerShell Universal
  module, are optional add-ons in their own repositories. Contributors do not need to update them.
- **Reports without a browser**: the command line and the report renderer make the same file from a
  view and data as the browser does.
- **The services**: the REST service and the MCP server read live data (a file, an HTTP API, the
  operator's own code), apply a policy per person, and deliver reports in the answer, as an expiring
  download link, or to a store. They are thin hosts around the engine: they check sign-in, policy and
  delivery, and have no database or scheduler of their own.

What holds it together: the same view gives the same numbers in every output, and data is not
released beyond what the policy allows, to people or to a model.

## Principles

Every decision is measured against these. When two conflict, the earlier one wins.

1. **Data stays protected.** What the policy hides reaches no report, log, error or model answer.
   [docs/privacy.md](docs/privacy.md) lists the limits pivotkit cannot close, for example CSV
   without quotes.
2. **Secure without effort.** The default is the secure one. Loosening it is a deliberate setting.
   When a choice is unclear, it becomes a setting with a secure default rather than a guess.
3. **Standards instead of our own.** Sign-in goes through existing identity providers, output is
   Excel, HTML and CSV, and the interfaces are REST with OpenAPI and MCP. pivotkit stores no
   passwords or accounts. What another tool does well, pivotkit does not rebuild.
4. **Running in one step.** Starting the container is enough: pivotkit creates what it needs at
   start, and you can read it out afterwards. Detailed manual setups stay possible but are not the
   default.
5. **Everything with pivotkit itself.** What operators and users need is a pivotkit command, not a
   recipe with other tools. Users get by with curl or PowerShell. The maintainer decides exceptions.
6. **Any client, any model.** REST and MCP work the same for every AI client and model, hosted or
   local, and for plain programs. Nothing requires one vendor. Client-specific helpers are optional.
7. **A product, not one installation.** What one environment shows is feedback, not a requirement.
   pivotkit works everywhere or says clearly why not.
8. **Maintainable.** Each thing is defined once and reused. Every change has tests that fail without
   it and docs that describe how it works now.

## What pivotkit is not

| Not | Instead |
| --- | --- |
| An identity provider or user management (passwords, accounts) | an existing identity provider. Without one, tokens the operator issues |
| A BI suite with dashboards, a data model or a semantic layer | a BI tool. pivotkit makes the one pivot report |
| A database, data warehouse or ETL tool | data stays in its systems. pivotkit reads it per request |
| A scheduler or mail sender | pivotkit makes the report and a schedule draft and hands both to the host through a webhook or host callback. The host schedules, approves and sends |
| A general chart or table library | charts only for the pivot view |
| A file store for teams | download links expire. Lasting copies live in the operator's store |

## Promises and limits

- **Versions.** pivotkit is 0.x and under active development: a minor release can break things,
  though we break as little as possible. The [upgrading page](docs/getting-started/upgrading.md)
  lists every break. From 1.0.0 on, pivotkit follows Semantic
  Versioning strictly: only a major release removes or breaks something, after a numbered
  deprecation (`PK-DEP-NNNN`) with a warning and a migration path. The one exception is a security
  fix, marked as such. [#491](https://github.com/eizedev/pivotkit/issues/491) plans the details.
- It runs on Node.js 22 or later and in the browsers listed in
  [docs/browser-support.md](docs/browser-support.md).
- This page changes through an issue first. The maintainer decides. An idea that does not fit may
  still work as a plugin or in the host.

## Before building a feature

A new capability, setting or dependency answers these five questions in its issue. Bug fixes and
small polish do not. A "no" to the first or second means: do not build it, or change this page first.

1. **Does it fit?** It helps a user, operator or developer build, get or deliver a pivot report, and
   it is not on the "not" list.
2. **Does it keep the promise?** Same view, same numbers. No data beyond the policy.
3. **What does getting started look like?** Does it work with the defaults and without other tools?
   What does a user or operator have to do?
4. **What does it cost for good?** A new setting, dependency, docs page or test path: is it worth it,
   or can what exists solve it?
5. **Who notices the change?** Existing installations and the upgrading page are updated in the same
   pull request.

## What a contribution delivers

How you work is up to you, with or without an AI assistant. What a pull request delivers is the
same for everyone. [CONTRIBUTING.md](CONTRIBUTING.md) has the commands.

- A linked issue. For a new feature, also the answers to the five questions.
- Tests that fail without the change and pass with it. No test weakened to pass.
- Docs, upgrading notes and changelogs that describe the new state.
- Strongly recommended: an independent review before you open the pull request. Have code an AI
  assistant wrote reviewed by a reviewer that did not write it (a person or a separate AI session),
  and read, run and understand it yourself. The maintainer reviews every pull request neutrally
  anyway. What your own review would have found comes back as questions and change requests, and
  it delays the merge.
- Green CI on the commit that gets merged.
