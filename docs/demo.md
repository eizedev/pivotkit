---
title: Live demo
description: Try pivotkit in the browser - the playground with generated tickets, sales and asset data, and the web component on a plain HTML page.
hide:
  - navigation
  - toc
---

# Live demo

The playground below is `<PivotReport>` from pivotkit-react with generated data: IT tickets, sales and
assets per source system. The rows come from a fixed seed, so everyone sees the same numbers. Drag
fields, open the menus on the chips, click a value, switch to the chart, export. Templates you save
stay in this browser.

<p><a class="md-button md-button--primary" href="playground/" target="_blank" rel="noopener">Open the playground full screen</a> <a class="md-button" href="playground/examples/element/" target="_blank" rel="noopener">Open the web component example</a></p>

<iframe class="pk-demo" src="playground/?height=720" title="pivotkit playground" loading="lazy" style="width: 100%; height: 860px; border: 1px solid var(--md-default-fg-color--lightest); border-radius: 8px;"></iframe>

The playground's header picks the data set, the number of rows (2,000, 4,000 or 100,000), a start
template, the language and the theme. Its footer shows the engine timings of the last change.

## The playground's URL parameters

The full-screen playground takes its start from the address, which is handy for links:

| Parameter | Values | What |
| --- | --- | --- |
| `data` | `tickets`, `sales`, `assets` | The data set |
| `rows` | `2000`, `4000`, `100000` | The number of generated rows |
| `preset` | `0`, `1`, `2` | The start template of the data set |
| `empty` | | Start with an empty report |
| `lang` | `en`, `de` | English or German |
| `theme` | `light`, `dark` | The page's theme; without it the report follows the system |
| `height` | a number of pixels, for example `480` | The report at a fixed height, as a host's card gives it |

For example [`?data=sales&preset=1&theme=dark`](playground/?data=sales&preset=1&theme=dark){ target="_blank" }
opens the monthly revenue trend as a chart in the dark theme.

## The web component example

[The example](playground/examples/element/){ target="_blank" } is a plain HTML page without a build
step: `<pivot-report>` with its start view in an attribute, rows and templates set from a script, a
theme switch, and the last event shown under the report. Its source is in
[`examples/element/`](https://github.com/eizedev/pivotkit/tree/main/examples/element) and
[Getting started with the web component](getting-started/web-component.md) walks through it.
