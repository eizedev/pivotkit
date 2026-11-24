---
title: Charts
description: The chart of a pivotkit report - chart types with bars and lines and a treemap, value labels and where a pie writes them, legend, title, smooth lines, axis labels, group labels, the tooltip, the zoom slider, 100 % stacks, hidden series, reference lines and high and low points, the tooltip's share and fixed colours per name in the view, the PNG export, and chartOptions for developers with its precedence.
---

# Charts

The chart draws the same view as an [Apache ECharts](https://echarts.apache.org/) chart:

- The items of Rows are the categories.
- There is one series per item of Columns and value.

[Charts](../use/charts.md) under Use a report describes what the people who use the report see and
choose: the chart types, the automatic type, the Display settings, the tips, the tooltip and the PNG
export. This page is for developers. It covers the view's `chart` settings, what "auto" stands for,
and `chartOptions`.

## The chart type

`chart.type` takes one of these values:

- `"auto"`, the default: the data decides. A view without a type also gets it.
- `"bar"`, `"line"`, `"area"`, `"pie"`, `"donut"` or `"heatmap"`.
- `"combo"`: the first value as bars on the left axis, every other value as a line on the right
  axis. With one value it draws bars. It ignores `stacked`, `stackPercent` and `horizontal`.
- `"treemap"`: a tile per category, its area the category's total over every column, as a pie's
  slice. It has no legend. `chart.hidden` leaves tiles out.

A reader that lacks these two types reads a view with one as `"auto"`, with an `unknownSetting` issue.

[Chart types](../use/charts.md#chart-types) describes what Automatic draws and the tips that suggest
another type.

pivotkit-core's `autoChartType(view, data)` says what "auto" stands for. It is `"line"` when a date
runs along the time line on Rows, else `"bar"`. `toEChartsOption()` draws it. The UI swaps the axes
for dates on Columns: pivotkit-react computes the chart from the swapped view.

A pie and a donut differ only in the hole:

- pivotkit-core's `DEFAULT_THEME.pieRadius` is `["0%", "70%"]`.
- `donutRadius` is `["42%", "70%"]`.

A host changes them with the `theme` option of `toEChartsOption`.

## Display settings in the view { #display-settings-for-the-people-who-use-the-report }

The Display settings of Chart settings are part of the view. [The table of
choices](../use/charts.md#display-settings) lists them. A saved view, a link and the PNG export keep
them, and they stay when the chart type changes:

| Key | Values |
| --- | --- |
| `chart.valueLabels` | `"auto"`, `"off"`, `"value"`, `"percent"`, `"both"` |
| `chart.labelPosition` | `"outside"`, `"inside"` |
| `chart.legend` | `"auto"`, `"bottom"`, `"right"`, `"off"` |
| `chart.title` | text, at most `limits.name` characters, or `null` |
| `chart.smooth` | `true`, `false` |
| `chart.axisLabels` | `"auto"`, `"all"`, `"nth"` |
| `chart.groupLabels` | `"auto"`, `"on"`, `"off"` |
| `chart.tooltip` | `"auto"`, `"axis"` |
| `chart.zoom` | `"auto"`, `"on"`, `"off"` |
| `chart.stackPercent` | `true`, `false` |
| `chart.hidden` | a list of legend entries by name, at most `limits.items` |
| `chart.referenceLines` | `{ average: boolean, trend: boolean, target: number \| null, extremes: boolean }` |
| `chart.tooltipShare` | `true`, `false` |
| `chart.colors` | a list of `{ name, color }`, the colour `#rgb` or `#rrggbb`, at most `limits.items` |

A view without these keys gets the defaults. An unknown value falls back to its default, and
`normalize()` reports it ([Views](views.md)). "Percent" and "Value and percent" apply to a pie and a
donut. Other types write the value.

`chart.tooltip` applies to bars, lines and areas:

- `"auto"` shows the element under the pointer. A stacked one adds the sum of its stack's parts.
- `"axis"` shows every series at the pointer's category, the one under the pointer first.

Only sums and counts add up (`CATALOG.additiveAggregators`). A value shown as something else adds up
only when `CATALOG.additiveShowAs` lists its type: a share of the grand or the row total, and a
difference or a running total along the rows. A rank or a percent difference gets no total.

A pie, a donut and a heatmap always show the slice or cell under the pointer.

`chart.zoom` puts a slider under the category axis of bars, lines and areas:

- `"auto"` adds it for more than 20 categories, or when the axis would leave out 3 labels or more
  between two it writes.
- The first window holds as many categories as the axis can name: the latest over dates on Rows,
  else the first ones. Its ends widen it up to every category, and the labels are laid out again.
- `"on"` always adds it. `"off"` never does.
- An SVG, an HTML report and a print draw every category. The PNG image leaves the slider out.
- pivotkit-react lays a keyboard control over the slider: an element with `role="slider"` that
  moves and resizes the window with the arrow, Page and Home and End keys, and says which
  categories it shows (`aria-valuetext`). The canvas itself takes no focus.

`chart.stackPercent` stacks bars and areas to 100 %:

- It applies to stacked bars and to areas. An area is stacked by it. Lines and bars side by side
  stay as they are.
- It needs values that add up. The Display setting is offered only for them.
- Each part is its share of the category's stack. The stack is the sum of its parts' sizes, so a
  part below zero takes its share below the axis, and the stack does not fill the axis.
- A category whose parts add up to nothing gets no bar.
- Value labels write each part's share.
- The tooltip shows each part's value and share. The total adds the values.

`chart.hidden` names the legend entries that are hidden: series of bars, lines and areas, or slices
of a pie or a donut. A click on the legend adds or removes a name. A name no entry has is kept and
does nothing. Names are the labels the chart shows, so they follow the data and its labels. A
hidden series does not count in a 100 % stack.
`chart.tooltipShare` adds each value's share of the total to the tooltip:

- With two or more series in the chart, a share of the category's total: the sum of the series shown
  there. A category with one part left, the others empty or hidden, has no share.
- With one series, a share of the series' total over the categories drawn.
- A pie or a donut: the slice's share of the slices shown.
- Only values that add up get one, on a pie too, and only without a part below zero. A heatmap gets
  none.

## Fixed colours { #fixed-colours }

The palette colours series and slices in turn, so a category's colour depends on what else the chart
shows. A fixed colour per name keeps it the same in every chart.

- The view's `chart.colors` lists `{ name, color }` entries. People set them in
  Chart settings › Series, with the colour beside each series.
- The host's `colorMap` prop (`colorMap` property of the web component) sets them for every view:
  `{ Failed: "#e3000f", Success: ["#287233", "#4caf50"] }`. A list of two is one colour for the light
  theme and one for the dark.
- The view's colour wins over the host's. A name in neither keeps the palette's colour.
- Names match series of bars, lines and areas, and slices of a pie or a donut, without regard to case.
  A heatmap has no series to colour.
- A view's colour is one colour for both themes. A host's pair `[light, dark]` follows the theme
  the report shows.
- A view's colour is `#rgb` or `#rrggbb`. The host's is hex of 3, 4, 6 or 8 digits, `rgb()`,
  `rgba()`, `hsl()`, `hsla()` or a CSS name. In a browser the name must be one it reads. Other values
  are left out.
- The chart image, the SVG, the HTML report and a print show the colours. Files take the host's
  light colours. pivotkit-report's `render` takes them as its `colorMap` option, a pair too, of
  which it draws the light one.

```jsx
<PivotReport colorMap={{ Failed: "#e3000f", Success: ["#287233", "#4caf50"] }} />
```

```js
document.querySelector("pivot-report").colorMap = { Failed: "#e3000f", Success: "#287233" };
```

### Reference lines

`chart.referenceLines` switches on an average and a linear trend, and sets a target:

```json
{ "chart": { "type": "line", "referenceLines": { "average": true, "trend": true, "target": 500000 } } }
```

- A view without the key draws no lines: `{ average: false, trend: false, target: null, extremes: false }`.
- A target that is no finite number becomes `null`, and `normalize()` reports it (`unknownSetting`).
- pivotkit-core computes the numbers from the plotted categories (`referenceLines` in
  `pivotkit-core/chart`) and draws them as ECharts `markLine`s on the series.
- The lines are silent: a click opens no rows. The tooltip names them.
- The value axis reaches every line (`dataMin` and `dataMax`).
- A label writes a sample of its line's dash in the line's colour, then the value as the value
  axis does. `decorateOption` puts the labels right of the plot and keeps them a line apart. With
  `pixelOf`, the real height of a value after a first draw, they sit at their lines. Below 480 px
  it writes the names only and leaves out a label far from its line.
- A trend over the categories' order, when a category has no date, is one straight segment.

Two functions decide which chart draws which line. The chart, the menu and the report's SVG use
them:

- `referenceLineRules(view, chart, data)` in pivotkit-core's main entry decides by the view alone.
- `referenceLineChecks(result, { chart, series })` in `pivotkit-core/chart` adds what depends on the
  numbers, and gives `notes` that say why a line is off.

| Chart | Average | Trend | Target |
| --- | --- | --- | --- |
| Pie, donut, heatmap, bars and lines, treemap | no | no | no |
| Bars, lines, areas side by side | per series | per series, along a time line | yes, in one unit |
| Stacked, every value adds up | of the stack's total | of the stack's total, along a time line | yes, in one unit |
| Stacked, a part below zero | no | no | yes, in one unit |
| Stacked, a value does not add up, or stacked to 100 % | no | no | no |

- "Adds up" is `valueAddsUp(value)` in pivotkit-core's main entry, the same rule as the tooltip's total.
- "Along a time line" means every field on Rows is a date or a grouping of one along the time line.
  A sort by a value or by hand takes that order away.
- "In one unit" means one format, and no count beside a field's values.
- A series hidden in the legend (`chart.hidden`) has no lines and is no part of a stack's total.
- A setting that does not apply stays in the view and draws again where it applies.

The notes are `"noTotal"`, `"percentStack"`, `"negative"`, `"noTime"`, `"byIndex"` (a category
without a date, so the trend counts the categories' order) and `"mixedUnits"`.

A trend fits a straight line over the categories' real time: years, quarters, months, ISO weeks or
days, from each category's key. It is drawn from category to category, so it bends where the axis
leaves a gap out. An average is the unweighted mean of the plotted points, also of averages.

A series' lines take its colour. The lines of no series, a target and a stack's total, take
`--pk-chart-reference`.

#### High and low points

`extremes: true` in `chart.referenceLines` marks each series' highest and lowest value:

```json
{ "chart": { "type": "line", "referenceLines": { "extremes": true } } }
```

- `extremePoints(result, { chart, series, locale })` in `pivotkit-core/chart` gives the points:
  `{ kind: "max" | "min", series, index, value, format }`. `series` is `null` for a stack's total.
- A chart draws them where it draws an average, by the same rules (`referenceLineRules`,
  `referenceLineChecks`): per series, or of a stack's total.
- The first of equal values gets the point. A series whose values are all the same gets none.
- `toEChartsOption` draws them as a silent ECharts `markPoint` on the series: a dot in the series'
  colour (a stack's in `--pk-chart-reference`), a label with ▲ or ▼ in that colour and the value in
  the text colour. A palette colour such as yellow is too light for text, so the value keeps the
  text colour.
- `decorateOption` keeps the labels inside the plot: the value axis reaches past them
  (`dataMin`, `dataMax`). A label that would take the axis across zero sits beside its dot.
- Labels that would cover each other move beside their dots, or are left out. With `pixelOf` it
  uses the real heights after a first draw.
- With more than 8 series, only the chart's highest and lowest value keep a label. Every dot stays.
- The labels and dots get an outline in `--pk-surface`, so they read over a line.

The report's `--pk-*` tokens set these parts of the chart, so a corporate theme reaches the chart too
([Theming](../reference/theming.md#chart-colours)):

- the colours
- the title's size and weight
- the size of the other text, at least 14 px
- the corners of bars, slices and the tooltip

The report lays out the labels for the text's size. Set sizes in the tokens, not in `chartOptions`.

## `chartOptions` (for developers)

`chartOptions` is a plain JSON object. The report merges it over the [Apache ECharts](https://echarts.apache.org/en/option.html)
option it builds. Use it for what the menus and the tokens do not offer, such as axis names, margins
or a colour. It is a prop of pivotkit-react and a property of `<pivot-report>`.

```jsx
<PivotReport
    data={rows}
    chartOptions={{
        title: { left: "left" },
        xAxis: { name: "Region", nameLocation: "middle", nameGap: 32 },
        series: { barMaxWidth: 24 },
        grid: { left: 48 }
    }}
/>
```

```js
document.querySelector("pivot-report").chartOptions = { legend: { itemGap: 16 } };
```

The report merges it like this:

- Objects merge key by key. `{ title: { left: "left" } }` moves the title and keeps the view's title
  text.
- Lists merge entry by entry (`series: [{ ... }, { ... }]`).
- An object given for a list goes into every entry: `{ series: { barMaxWidth: 24 } }` sets every
  series.
- Any other value replaces the report's.

**Precedence.** The report builds the option in three steps, and the host wins:

1. It builds the option from the view: its type and display settings.
2. It adds its own styles: the theme's colours, rounded bars, the tooltip.
3. It merges `chartOptions` over all of it.

`{ legend: { show: false } }` hides the legend even when the user picked "Bottom". Keep
`chartOptions` to what the user should not change.

A pie without a legend merges its smallest slices into one slice "Other (n)" where their labels
have no room ([many slices](../use/charts.md#many-slices)). `chartOptions` cannot reach the merged
slices. Turn the legend on to draw every slice.

A pie with a legend can leave out the labels of small slices that have no room. Such a slice's
data item gets `label: { show: false }`. That item setting wins over a series `label` from
`chartOptions`. To show the label anyway, set `label.show` on that data item in `chartOptions`.

**Only JSON.** Strings, finite numbers, booleans, `null`, plain objects and arrays pass. The report
leaves out the following when it draws the chart:

- functions (formatters)
- class instances (`Date`, `Map`)
- symbols and `Infinity`
- the keys `__proto__`, `constructor` and `prototype`
- anything beyond 12 levels or 2,000 entries

One console warning names what it left out. The check loads with ECharts. The report compares
`chartOptions` by value, so a host may build a new object on every render. The report's own
formatters, which write numbers in the user's language, stay.

**No markup, addresses or templates.** Some ECharts options are not data:

- ECharts writes a string `formatter` of the tooltip, and the tooltip's `content`, into the page as
  HTML (`innerHTML`). The page would run what they hold. They would also replace the report's tooltip
  of plain text nodes, the one a strict Content-Security-Policy allows.
- A title's `link` and `sublink` open a window.

So the report leaves out these keys wherever they are in `chartOptions`, and the warning names each
one:

| Left out | Why |
| --- | --- |
| a string `formatter` (any depth: tooltip, labels, legend, axes) and a string `content` | written as HTML in the tooltip; the others are templates of the same kind and refer to `rich` |
| `rich` | text styles that templates refer to |
| `link`, `sublink`, `target`, `subtarget`, `linkTarget` | open an address |
| `image` and any text that starts with `image://` (a symbol) | load an address |
| `extraCssText`, `className`, `appendTo`, `appendToBody`, `renderMode` | change the tooltip's element and where it lives |

What is left of `chartOptions` is styles, sizes, numbers and names. Nothing in it is markup or an
address, and nothing in it runs. The rule follows ECharts 6.1.0, its `TooltipHTMLContent` and
`windowOpen`.
