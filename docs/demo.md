---
title: Try pivotkit
description: Try pivotkit in five minutes - the live demo in the browser with nothing to install, the playground from a clone, a plain HTML page of your own, the command line, and the REST service and MCP server in a container.
hide:
  - toc
---

# Try pivotkit

Pick the way that fits. The first one needs nothing but a browser.

1. **In the browser.** The live demo below, the playground with real public data. Nothing to install.

2. **On your machine.** The same playground from the source. You need Node.js 24 or later and git:

    ```bash
    git clone https://github.com/eizedev/pivotkit.git
    cd pivotkit
    npm ci
    npm run build:playground
    node examples/playground/serve.js     # runs until Ctrl-C
    ```

    Open <http://127.0.0.1:4173/>. The web component example is at
    <http://127.0.0.1:4173/examples/element/>.

3. **On your own page.** [A complete page to copy](getting-started/web-component.md#a-complete-page):
   one HTML file with `<pivot-report>` and any static server. In a React app:
   [Getting started: React](getting-started/react.md).

4. **On the command line.** `npx pivotkit-cli example` writes example data and views, and says
   how to render them as a report: [command line, try it](reference/cli.md#try-it).

5. **The services in a container.** One `docker run` starts the REST service and the MCP server with
   example data, and a Compose file does the same: [server in 5 minutes](getting-started/server-in-5-minutes.md).
   The container has the services only, not the report in the browser.

## The live demo { #live-demo }

The playground below is `<PivotReport>` from pivotkit-react. Try it here or full screen.

<p><a class="md-button md-button--primary" href="playground/" target="_blank" rel="noopener">Open the playground full screen</a> <a class="md-button" href="playground/examples/element/" target="_blank" rel="noopener">Open the web component example</a></p>

<iframe class="pk-demo" src="playground/?data=weather&height=720" title="pivotkit playground" loading="lazy" style="width: 100%; height: 860px; border: 1px solid var(--md-default-fg-color--lightest); border-radius: 8px;"></iframe>

The playground has five real public data sets:

- the daily weather of 14 cities
- population, GDP and CO2 per country
- the earthquakes of 2025
- the Nobel Prize laureates
- the end-of-life dates of 489 software products

It also has three generated data sets: IT tickets, sales and assets per source system.

Each real data set starts with a template phrased as a question.
[Learn with real data](learn.md) walks through all of them with tasks to try. Drag fields, open the
menus on the chips, click a value, switch to the chart and export.

The Views menu lists the shared views. These are the questions, and for endoflife.date also the views
of its OpenAPI document, a demo extension. Views you save stay in this browser
(`templateStore="browser"`). The playground lets you publish a view as a shared view, which is kept
in this browser too. See [Templates and shared views](concepts/templates.md).

The playground's header picks the data set, a start template, the language and the theme. For a
generated data set, it also picks the number of rows: 2,000, 4,000 or 100,000. Its footer shows the
engine timings of the last change.

Its **Data** button [loads your own data](use/load-data.md): drop a CSV, JSON or Excel file onto the
report. This uses `allowImport` with the Excel plugin and the import worker, and the footer shows
`onDataLoad`. The file stays in your browser. With `?import=off` in the address, the report has no
import, as in an application that does not offer it.

**Export**, **Source data** downloads the rows behind the report (`exportData`). With these rows and
the view (**Views**, **Download view**), the [command line](reference/cli.md#try-it) renders the same
report: `pivotkit render <view> --data <rows>`.

The real data are snapshots stored with the playground. The page calls none of the sources. Its
source line says the day a snapshot was fetched ("as of"). That day is the "now" of templates such as
the end-of-life ones. The sources:

- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0). It contains modified
  Copernicus Climate Change Service information, see [Learn with real data](learn.md#query-it-live).
- Countries from the [World Bank](https://data.worldbank.org/), World Development Indicators
  (CC BY 4.0).
- Earthquakes from the [U.S. Geological Survey](https://earthquake.usgs.gov/) (public domain).
- Laureates from [Nobel Prize Outreach](https://www.nobelprize.org/about/developer-zone-2/) (CC0).
- Release cycles from [endoflife.date](https://endoflife.date/) (MIT).

The generated rows come from a fixed seed, so everyone sees the same numbers.

### The playground's URL parameters { #the-playgrounds-url-parameters }

The playground's address says what it shows and changes with it. The Data and Start dropdowns write
`data` and `start`. Every change of the report writes the view into the fragment. A reload keeps the
report.

**Views**, **Copy link** copies `data`, `start` and the view, plus `rows` for generated data. A link
opens exactly that report. The language, theme and height stay the viewer's own. The playground
passes that URL as `shareLink`.

The query parameters are the playground's own. The fragment `#pivot-playground=` is pivotkit's share
format. A host such as React, the web component or PowerShell Universal uses it too. See
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

### The web component example { #the-web-component-example }

[The example](playground/examples/element/){ target="_blank" } is a plain HTML page without a build
step. It has:

- `<pivot-report>` with its start view in an attribute
- rows and templates set from a script
- a theme switch
- the last event shown under the report

Its source is in
[`examples/element/`](https://github.com/eizedev/pivotkit/tree/main/examples/element).
[Getting started with the web component](getting-started/web-component.md) walks through it.
