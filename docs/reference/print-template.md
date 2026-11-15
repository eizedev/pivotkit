---
title: Print template
description: The HTML print template of pivotkit-report and pivotkit render --template - its placeholders, where they may stand, how values are escaped, and the default template.
---

# Print template

An HTML report is a template with placeholders, `{{name}}`, that pivotkit fills in. The default one
ships with [pivotkit-report](report.md) (`DEFAULT_TEMPLATE`); a host passes its own as `template`, the
command line as `--template <file>`. A template is trusted like code: its own markup is used as it is.
What pivotkit fills in is not: every value is escaped, and the template is checked before anything is
rendered, so a value can never become markup, a link or code.

## Placeholders

| Placeholder | Kind | Filled with |
| --- | --- | --- |
| `{{title}}` | text | The title: `title`, else the view file's name, the chart's title, "Report". |
| `{{description}}` | text | The view file's description, or `description`. |
| `{{source}}` | text | The data's name (the CLI: the data file's name). |
| `{{generated}}` | text | When it was made, in the locale and time zone ("Nov 13, 2026, 10:00 AM"; fixed with `now`). |
| `{{rows}}` | text | The data's rows ("8 rows"). |
| `{{filters}}` | text | The view's filters in words, or "None". |
| `{{summary}}` | text | The view in one sentence ("sum of Units by Region"). |
| `{{lang}}`, `{{dir}}` | text | The locale ("de-DE") and its direction (`ltr`, `rtl`). |
| `{{style}}` | markup | The report's `<style>`: tokens, table, print rules. |
| `{{chart}}` | markup | The chart in a `<figure>`, or nothing. |
| `{{table}}` | markup | The table, and a note when it was cut. |
| `{{details}}` | markup | A `<dl>` of source, rows, filters and generated, in the report's language. |

Spaces inside the braces are fine (`{{ title }}`); braces that are no placeholder stay text.

## Where a placeholder may stand

- **Text** of the document: any placeholder. Inside `<title>` and `<textarea>`, whose text the
  browser never reads as markup, text placeholders only.
- **A quoted attribute value** of `lang`, `dir`, `title`, `alt`, `class`, `aria-label` or
  `aria-description`, and the `content` of `<meta name="description">` without `http-equiv` (whose
  `content` a browser reads as an instruction, such as a refresh's target): text placeholders only.

Everything else is refused with `PivotkitError` `INVALID_TEMPLATE`, its `details.reason`, the
placeholder and the line (the CLI: exit 2, kind `template`):

| `details.reason` | Example |
| --- | --- |
| `attribute` | `<a href="{{source}}">`, any attribute not listed above (`src`, `style`, `on…`, `srcdoc`, `id`, `name`, `content` of another meta) |
| `unquoted` | `<p title={{title}}>` |
| `attributeName`, `tagName` | `<p {{title}}>`, `<{{title}}>` |
| `rawText` | inside `<script>`, `<style>`, `<noscript>`, `<template>`, `<iframe>`, `<xmp>`, `<noembed>`, `<noframes>`, `<plaintext>` |
| `comment`, `markup` | inside `<!-- -->` or `<!doctype>` |
| `markupInText` | `{{table}}` in an attribute or in `<title>` |
| `unknownPlaceholder` | `{{titel}}`, with "did you mean `{{title}}`?" (`details.suggestion`) |
| `unclosed`, `nul` | `{{title` without `}}`; a NUL character |

A template has at most 262,144 characters (`TEMPLATE_LIMIT`; more is `LIMIT_EXCEEDED`).

## The default template

```html
<!doctype html>
<html lang="{{lang}}" dir="{{dir}}">
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="pivotkit">
<meta name="description" content="{{summary}}">
<title>{{title}}</title>
{{style}}
</head>
<body>
<main class="pk-report">
<header>
<h1>{{title}}</h1>
<p class="pk-report-description">{{description}}</p>
</header>
{{chart}}
{{table}}
{{details}}
</main>
</body>
</html>
```

Keep the Content-Security-Policy first in `<head>` in your own template: it then covers everything
after it. The classes of `{{style}}` (`pk-report`, `pk-table`, `pk-sub`, `pk-grand`, …) can be styled
by a `<style>` of the template after `{{style}}`.

## Dark mode { #dark-mode }

The report follows the reader's system: light, or dark on a dark screen, and always light on paper
and in a PDF. The root element (`<html>`) of your template decides otherwise:

| `<html>` | On a light screen | On a dark screen | On paper |
| --- | --- | --- | --- |
| no `data-pk-theme` | light | dark | light |
| `data-pk-theme="light"` | light | light | light |
| `data-pk-theme="dark"` | dark | dark | light |

On a dark screen the report's dark tokens win over a plain `:root` rule of your template, so a page
colour you set there (`--pk-surface`, `--pk-text`) is your light design and the dark one stays
readable. For dark colours of your own, scope them to a dark screen, with the same selector the
report uses, and keep print light by writing your other dark rules for `screen` too:

```html
{{style}}
<style>
:root { --pk-surface: #fffaf0; --pk-chart-1: #7a1f5c; }
@media screen and (prefers-color-scheme: dark) {
    :root:not([data-pk-theme="light"]) { --pk-surface: #1b1712; }
    .pk-report h1 { color: #f3e3c3; }
}
</style>
```

For a root with `data-pk-theme="dark"`, write the same colours for `:root[data-pk-theme="dark"]`
inside `@media screen` as well. A rule on `body` or `.pk-report` applies in both schemes: set colours there only when they read on
both. A colour scale whose view names no colours runs through the theme's heat colours
(`--pk-scale-low`, `--pk-scale-high`) on a dark screen too, so set its dark ends with your other dark
colours. The chart is drawn in the light colours and keeps its light card on a dark screen.

To see both before you share a template: open the report in a browser and switch the system's
appearance, or use the developer tools' rendering settings (`prefers-color-scheme`, and the `print`
media type for paper); the browser's print preview shows the printed page.

## A logo

The policy loads nothing from an address, so a logo goes into the template as a `data:` image:

```html
<header>
<img alt="Company" width="120" height="32" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0i...">
<h1>{{title}}</h1>
</header>
```

## Use it from code

```js
import { parseTemplate, fillTemplate } from "pivotkit-report/template";

const template = parseTemplate(source);          // throws INVALID_TEMPLATE once, before any work
fillTemplate(template, { title: "Sales", table: "<table>…</table>" });
```

`fillTemplate` escapes the text placeholders and writes markup placeholders as given: only pivotkit's
own markup goes there.
