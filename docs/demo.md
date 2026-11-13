---
title: Live demo
description: Try pivotkit in the browser - the playground with real public data (weather, countries, earthquakes, Nobel laureates, software end of life) and generated business data, and the web component on a plain HTML page.
hide:
  - toc
---

# Live demo

The playground below is `<PivotReport>` from pivotkit-react with five real public data sets - the
daily weather of 14 cities, population, GDP and CO2 per country, the earthquakes of 2025, the
Nobel Prize laureates and the end-of-life dates of 489 software products - and three generated ones: IT tickets, sales and assets per source system.
Each real data set starts with a template phrased as a question; [Learn with real data](learn.md)
walks through all of them with tasks to try. Drag fields, open the menus on the chips, click a value,
switch to the chart, export. The Views menu lists the shared views (the questions, and for
endoflife.date the views of its OpenAPI document, a demo extension); views you save stay in this browser
(`templateStore="browser"`), and the playground lets you publish one as a shared view, kept in this
browser too ([Templates and shared views](concepts/templates.md)).

<p><a class="md-button md-button--primary" href="playground/" target="_blank" rel="noopener">Open the playground full screen</a> <a class="md-button" href="playground/examples/element/" target="_blank" rel="noopener">Open the web component example</a></p>

<iframe class="pk-demo" src="playground/?data=weather&height=720" title="pivotkit playground" loading="lazy" style="width: 100%; height: 860px; border: 1px solid var(--md-default-fg-color--lightest); border-radius: 8px;"></iframe>

The playground's header picks the data set, a start template, the language and the theme, and for a
generated data set the number of rows (2,000, 4,000 or 100,000). Its footer shows the engine timings
of the last change. With `?import` in its address it lets you [load your own data](use/load-data.md)
(`allowImport`, with the Excel plugin and the import worker; the footer shows `onDataLoad`):
<a href="playground/?data=sales&import" target="_blank" rel="noopener">open it with loading data</a>.
The file stays in your browser.

The real data are snapshots stored with the playground; the page calls none of the sources, and its source line says the day a snapshot was fetched ("as of"), the "now" of templates such as the end-of-life ones. Weather
data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0; contains modified Copernicus Climate
Change Service information, see [Learn with real data](learn.md#query-it-live)); countries from the
[World Bank](https://data.worldbank.org/), World Development Indicators (CC BY 4.0); earthquakes from
the [U.S. Geological Survey](https://earthquake.usgs.gov/) (public domain); laureates from
[Nobel Prize Outreach](https://www.nobelprize.org/about/developer-zone-2/) (CC0); release cycles from
[endoflife.date](https://endoflife.date/) (MIT). The generated rows
come from a fixed seed, so everyone sees the same numbers.

## The playground's URL parameters

The playground's address says what it shows, and it changes with it: the Data and Start dropdowns
write `data` and `start`, and every change of the report writes the view into the fragment. A reload
keeps the report; **Views**, **Copy link** copies `data`, `start` (and `rows` for generated data)
and the view, so a link opens exactly that report; the language, theme and height stay the viewer's
own (the playground passes that URL as `shareLink`). The query parameters are the playground's own; the fragment `#pivot-playground=` is
pivotkit's share format, the part a host (React, the web component, PowerShell Universal) uses too:
[Sharing and keeping a view](concepts/sharing.md).

| Parameter | Values | What |
| --- | --- | --- |
| `data` | `weather`, `countries`, `earthquakes`, `nobel`, `endoflife`, `tickets`, `sales`, `assets` | The data set |
| `start` | the start template's name in words, as the Start dropdown writes it (`which-city-is-the-sunniest-top-3`), or `empty` | The start template |
| `preset` | `0`, `1`, ... | The start template by its place in the Start dropdown, counted from `0`; `start` wins when both are given |
| `rows` | `2000`, `4000`, `100000` | The number of generated rows (generated data sets only) |
| `empty` | | Start with an empty report (as `start=empty`) |
| `lang` | `en`, `de` | English or German |
| `theme` | `light`, `dark` | The page's theme; without it the report follows the system |
| `height` | a number of pixels written with three or four digits, for example `480` | The report at a fixed height, as a host's card gives it; any other value is ignored, and the report takes the window's height below the playground's header |

For example [`?data=earthquakes&start=did-some-months-shake-more-than-others-chart&theme=dark`](playground/?data=earthquakes&start=did-some-months-shake-more-than-others-chart&theme=dark){ target="_blank" }
opens the earthquakes per month as a chart in the dark theme.

| Fragment | What |
| --- | --- |
| `#pivot-playground=1.…` | The current view in pivotkit's share format, written on every change and read on load. |

## The web component example

[The example](playground/examples/element/){ target="_blank" } is a plain HTML page without a build
step: `<pivot-report>` with its start view in an attribute, rows and templates set from a script, a
theme switch, and the last event shown under the report. Its source is in
[`examples/element/`](https://github.com/eizedev/pivotkit/tree/main/examples/element) and
[Getting started with the web component](getting-started/web-component.md) walks through it.
