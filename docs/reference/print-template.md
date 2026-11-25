---
title: Print template
description: The HTML print template of pivotkit-report and pivotkit render --template - its placeholders, where they may stand, how values are escaped, and the default template.
---

# Print template

An HTML report is a template with placeholders, `{{name}}`, that pivotkit fills in.

- The default template ships with [pivotkit-report](report.md) (`DEFAULT_TEMPLATE`).
- A host passes its own as `template`.
- The command line takes one with `--template <file>`.

`pivotkit example templates` writes two templates to copy and adapt, Corporate and Minimal
([your own corporate design](corporate-design.md)).

pivotkit trusts a template like code and uses its own markup as it is. It does not trust what it
fills in:

- It escapes every value.
- It checks the template before it renders anything.

So a value can never become markup, a link or code. The REST service and the MCP server also check
their templates at start and in `check-config`. A typo stops the start, not the first report. They
take two keys:

- `sources.<id>.template`: the template of one source's html reports.
- `output.template`: the template of every other html report. That includes data sent in the
  request (`inline:`) and, over MCP, files by path (`file:`).

A source's own template wins over `output.template`. Without either, the built-in template applies.

## Placeholders

| Placeholder | Kind | Filled with |
| --- | --- | --- |
| `{{title}}` | text | The title: `title`, else the view file's name, the chart's title, "Report". |
| `{{description}}` | text | The view file's description, or `description`. |
| `{{source}}` | text | The data's name (the CLI: the data file's name). |
| `{{generated}}` | text | When it was made, in the locale and time zone ("Nov 13, 2026, 10:00 AM"; fixed with `now`). |
| `{{dataAsOf}}` | text | When the data is from, in the locale and time zone with the zone named ("Nov 15, 2026, 8:00 AM UTC"), from `dataAsOf`; empty without it. The REST service and the MCP server pass it. |
| `{{rows}}` | text | The data's rows ("8 rows"). When the filters leave rows out, the rows they keep of them ("6 of 8 rows"). Empty where the policy withholds the row count (`rows: false`). |
| `{{filters}}` | text | The view's filters in words, or "None", in the report's language. |
| `{{summary}}` | text | The view in one sentence, in the report's language ("sum of Units by Region", "Summe von Units nach Region"). |
| `{{lang}}`, `{{dir}}` | text | The locale ("de-DE") and its direction (`ltr`, `rtl`). |
| `{{style}}` | markup | The report's `<style>`: tokens, table, print rules. |
| `{{chart}}` | markup | The chart in a `<figure>`, or nothing. |
| `{{table}}` | markup | The table, and a note when pivotkit cut it. |
| `{{details}}` | markup | A `<dl>` of source, data as of (when known), rows, filters and generated, in the report's language. |

Spaces inside the braces are fine (`{{ title }}`). Braces that are no placeholder stay text.

## Where a placeholder may stand

- **Text** of the document: any placeholder. Inside `<title>` and `<textarea>`, only text
  placeholders. The browser never reads their text as markup.
- **A quoted attribute value**: only text placeholders. This holds for `lang`, `dir`, `title`, `alt`,
  `class`, `aria-label` and `aria-description`. It also holds for the `content` of
  `<meta name="description">` without `http-equiv`. A browser reads the `content` of a meta with
  `http-equiv` as an instruction, such as a refresh's target.

pivotkit refuses everything else with `PivotkitError` `INVALID_TEMPLATE`. The error names its
`details.reason`, the placeholder and the line. The CLI exits with 2, kind `template`:

| `details.reason` | Example |
| --- | --- |
| `attribute` | `<a href="{{source}}">`, any attribute not listed above (`src`, `style`, `on…`, `srcdoc`, `id`, `name`, `content` of another meta) |
| `unquoted` | `<p title={{title}}>` |
| `attributeName`, `tagName` | `<p {{title}}>`, `<{{title}}>` |
| `rawText` | inside `<script>`, `<style>`, `<noscript>`, `<template>`, `<iframe>`, `<xmp>`, `<noembed>`, `<noframes>`, `<plaintext>` |
| `comment`, `markup` | inside `<!-- -->` or `<!doctype>` |
| `scriptComment` | any placeholder after a `<script>` that holds `<!--`, which can hide where the script ends |
| `markupInText` | `{{table}}` in an attribute or in `<title>` |
| `unknownPlaceholder` | `{{titel}}`, with "did you mean `{{title}}`?" (`details.suggestion`) |
| `unclosed`, `nul` | `{{title` without `}}`; a NUL character |

A template has at most 262,144 characters (`TEMPLATE_LIMIT`). A longer one is `LIMIT_EXCEEDED`.

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

Keep the Content-Security-Policy first in `<head>` in your own template, so it covers everything
after it. To style the classes of `{{style}}` (`pk-report`, `pk-table`, `pk-sub`, `pk-grand`, …), put
a `<style>` into the template after `{{style}}`.

## Colours and font of your template { #template-design }

Set your design once, as `--pk-*` tokens in the template's own `<style>`. The page takes them.
pivotkit draws the chart, its card, and the table's colour scales and data bars with them. The chart
is an image that pivotkit draws before any browser sees the page. So pivotkit computes these values
from the template, as the browser computes them for the report (`.pk-report`):

```html
{{style}}
<style>
:root {
    --brand: #7a1f5c;
    --pk-chart-1: var(--brand);
    --pk-chart-2: #c0392b;
}
.pk-report { font-family: "Brand Sans", system-ui, sans-serif; }
</style>
```

The example sets colours of the chart and a font. A page colour such as `--pk-surface` or
`--pk-text` on `:root` is your light design. On a dark screen, the report's dark tokens win over it.
Put your own dark colours into a rule for the dark screen ([dark mode](#dark-mode)).

| What is read | Details |
| --- | --- |
| Custom properties (`--pk-*`, and any `--name` they refer to with `var()`) | in rules on `:root` (or `html`), `body` or `.pk-report`, also in a selector list such as `h1, .pk-report`, and in `@layer` |
| `font-family` | on `body` or `.pk-report`, also from the `font` shorthand |
| Order | as the page applies them. `.pk-report` inherits from `body`, `body` from `:root`. On each, a later rule wins over an earlier one, and `!important` over both. The report's `{{style}}` sets its tokens on `:root` where it stands. So a `:root` rule before `{{style}}` counts only for properties the report does not set (`--brand`). A rule in `@layer` or on `html` is below every other. |
| Left out | rules inside `@media`, `@supports` and other at-rules, a `<style>` with a `media` other than `all` or a `type` other than `text/css`, other selectors, and a `<style>` inside a comment, `<template>` or `<script>`. The chart uses the light colours, and the page is light on paper. |

pivotkit resolves a value as the page computes it:

- `var(--name)` takes the value the element has: its own, else the inherited one.
- `var(--name, fallback)` takes the fallback where there is none.
- A property in a cycle has no value, and neither do its fallbacks.
- `inherit` and `unset` inherit. `initial` has no value.
- `light-dark(light, dark)` gives its light colour.

A token keeps the default, or the host's `tokens`, when its value:

- has none
- is longer than 200 characters
- would load something (`url(`)
- holds a quoted string, except in a font's names

The template's values win over the host's [`tokens`](report.md#options), as on the page. pivotkit
does not check a selector list the browser would refuse as a whole, so write valid CSS.

Colours in any form a browser reads reach the chart's marks as they are. The heatmap mixes its scale
itself. So `--pk-heat-low` and `--pk-heat-high` need a form ECharts reads: `#rrggbb`, `rgb(r, g, b)`
or `hsl(h, s%, l%)` with commas. Another form, such as `oklch()`, keeps the default scale. A colour
scale or data bars in the table take `--pk-scale-low`, `--pk-scale-mid`, `--pk-scale-high` and
`--pk-chart-1` when they resolve to `#rgb` or `#rrggbb`.

## Dark mode { #dark-mode }

The report follows the reader's system: light, or dark on a dark screen. On paper and in a PDF it is
always light. The root element (`<html>`) of your template can change this:

| `<html>` | On a light screen | On a dark screen | On paper |
| --- | --- | --- | --- |
| no `data-pk-theme` | light | dark | light |
| `data-pk-theme="light"` | light | light | light |
| `data-pk-theme="dark"` | dark | dark | light |

On a dark screen, the report's dark tokens win over a plain `:root` rule of your template. So a page
colour you set there (`--pk-surface`, `--pk-text`) is your light design, and the dark one stays
readable. For dark colours of your own:

- Scope them to a dark screen, with the same selector the report uses.
- Write your other dark rules for `screen` too, so print stays light.

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

For a root with `data-pk-theme="dark"`, also write the same colours for `:root[data-pk-theme="dark"]`
inside `@media screen`.

A rule on `body` or `.pk-report` applies in both schemes. Set colours there only when they read on
both.

A colour scale whose view names no colours runs through the theme's heat colours (`--pk-scale-low`,
`--pk-scale-high`), on a dark screen too. So set its dark ends with your other dark colours. A middle
colour (`--pk-scale-mid`) of your `:root` rule is a light one. It stays out of a dark screen unless
you set one there too.

The chart uses the light colours and keeps its light card on a dark screen. The note under a cut
chart stands on that card in your light `--pk-muted`. Set the card's colour through `--pk-surface` in
your `:root` rule, not with a background on `.pk-report-chart`. The chart's image, its card and the
note on it all take the light tokens, so a background of its own would leave them on another colour.
Your own `.pk-report-note` rule colours that note too.

Your dark rules win over the colours a host passes for a dark screen (`darkTokens`), as your `:root`
rule wins over its light ones.

To see both before you share a template:

- Open the report in a browser and switch the system's appearance.
- Or use the developer tools' rendering settings: `prefers-color-scheme`, and the `print` media type
  for paper.

The browser's print preview shows the printed page.

## A logo

The policy loads nothing from an address, so put a logo into the template as a `data:` image:

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

`fillTemplate` escapes the text placeholders and writes markup placeholders as given. Pass only
pivotkit's own markup to them.
