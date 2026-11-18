---
title: Link parameters in the page's query string
description: create_link writes a source's parameters into the page's query string, from a list per source, so a host application's backend can read them. The view stays in the fragment.
status: proposed
date: 2026-11-18
---

# 0016 Link parameters in the page's query string

Sources: [#619](https://github.com/eizedev/pivotkit/issues/619),
[#615](https://github.com/eizedev/pivotkit/issues/615),
[eizedev/powershell-universal-components#144](https://github.com/eizedev/powershell-universal-components/issues/144)

## Context and Problem Statement

A link names its data in the fragment: `src.id`, and `src.params` as far as the page lets them
through with `allowParams` ([sharing](../concepts/sharing.md#opening-a-link-on-another-page)). The
browser's Copy link writes them. `create_link` writes the source id only and takes no parameters.

A host application that fetches rows on its server side ([0015](0015-live-rows-for-a-host-page.md))
never sees the fragment. The first report takes a parameter, such as a customer. Where does a link
carry it?

## Considered Options

- In the fragment's `src.params`, and the page sends them to its backend.
- In the page's query string.

## Decision Outcome

Chosen option: the query string, because a host application's backend reads it without code in the
browser.

- `create_link` takes `params` and writes them into the query string. The view stays in the
  fragment.
- A link carries only the parameters the operator lists for the source (`sources.<id>.linkParams`).
  A parameter bound to a sign-in claim never goes into a link.
- The server checks the values with the source's parameter rules when it makes the link. The rows
  route checks them again with the rights of the person who opens the page.
- The list binds only the links the server makes. Anyone can write a URL by hand. So
  `GET /sources` returns the list, and the page passes on only those names.
- The fragment's `src.params` stay as they are, for what a browser reads, such as a workbook's
  `sheet`. Where both name a parameter, the query string wins.

### Consequences

- Good: a host application reads the parameter on its server side.
- Bad: values in a query string land in access logs, browser history and the `Referer` header. List
  only parameters whose values may show up there. The host page sends a strict `Referrer-Policy`.
- Bad: a parameter name can collide with the host page's own query. The operator chooses the names.
- Bad: in stage 1 only `create_link` writes the query string. The browser's Copy link drops it
  unless the host gives the report a share address that keeps it.
