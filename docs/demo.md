---
title: Live demo
description: Try pivotkit in the browser - the playground with real public data (weather, countries, earthquakes, Nobel laureates) and generated business data, and the web component on a plain HTML page.
hide:
  - toc
---

# Live demo

The playground below is `<PivotReport>` from pivotkit-react with four real public data sets - the
daily weather of 14 cities, population, GDP and CO2 per country, the earthquakes of 2025 and the
Nobel Prize laureates - and three generated ones: IT tickets, sales and assets per source system.
Each real data set starts with a template phrased as a question; [Learn with real data](learn.md)
walks through all of them with tasks to try. Drag fields, open the menus on the chips, click a value,
switch to the chart, export. Templates you save stay in this browser.

<p><a class="md-button md-button--primary" href="playground/" target="_blank" rel="noopener">Open the playground full screen</a> <a class="md-button" href="playground/examples/element/" target="_blank" rel="noopener">Open the web component example</a></p>

<iframe class="pk-demo" src="playground/?data=weather&height=720" title="pivotkit playground" loading="lazy" style="width: 100%; height: 860px; border: 1px solid var(--md-default-fg-color--lightest); border-radius: 8px;"></iframe>

The playground's header picks the data set, a start template, the language and the theme, and for a
generated data set the number of rows (2,000, 4,000 or 100,000). Its footer shows the engine timings
of the last change.

The real data are snapshots stored with the playground; the page calls none of the sources. Weather
data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0; contains modified Copernicus Climate
Change Service information, see [Learn with real data](learn.md#query-it-live)); countries from the
[World Bank](https://data.worldbank.org/), World Development Indicators (CC BY 4.0); earthquakes from
the [U.S. Geological Survey](https://earthquake.usgs.gov/) (public domain); laureates from
[Nobel Prize Outreach](https://www.nobelprize.org/about/developer-zone-2/) (CC0). The generated rows
come from a fixed seed, so everyone sees the same numbers.

## The playground's URL parameters

The full-screen playground takes its start from the address, which is handy for links:

| Parameter | Values | What |
| --- | --- | --- |
| `data` | `weather`, `countries`, `earthquakes`, `nobel`, `tickets`, `sales`, `assets` | The data set |
| `rows` | `2000`, `4000`, `100000` | The number of generated rows (generated data sets only) |
| `preset` | `0` to `3` | The start template of the data set (the generated ones have three) |
| `empty` | | Start with an empty report |
| `lang` | `en`, `de` | English or German |
| `theme` | `light`, `dark` | The page's theme; without it the report follows the system |
| `height` | a number of pixels, for example `480` | The report at a fixed height, as a host's card gives it |

For example [`?data=earthquakes&preset=3&theme=dark`](playground/?data=earthquakes&preset=3&theme=dark){ target="_blank" }
opens the earthquakes per month as a chart in the dark theme.

## The web component example

[The example](playground/examples/element/){ target="_blank" } is a plain HTML page without a build
step: `<pivot-report>` with its start view in an attribute, rows and templates set from a script, a
theme switch, and the last event shown under the report. Its source is in
[`examples/element/`](https://github.com/eizedev/pivotkit/tree/main/examples/element) and
[Getting started with the web component](getting-started/web-component.md) walks through it.
