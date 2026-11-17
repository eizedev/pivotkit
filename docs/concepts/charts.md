---
title: Charts
description: The chart of a pivotkit report - chart types, value labels and where a pie writes them, legend, title, smooth lines, axis labels, group labels, the tooltip and its share, fixed colours per name in the view and the host's colorMap, the PNG export, and chartOptions for developers with its precedence.
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

[Chart types](../use/charts.md#chart-types) describes what Automatic draws and the tips that suggest
another type.

pivotkit-core's `autoChartType(view, data)` says what "auto" stands for. It is `"line"` when a date
runs along the time line on Rows, else `"bar"`. `toEChartsOption()` draws it. The UI swaps the axes
for dates on Columns: pivotkit-react computes the chart from the swapped view (`chartPlan` in
`chart-types.js`).

A pie and a donut differ only in the hole:

- pivotkit-core's `DEFAULT_THEME.pieRadius` is `["0%", "70%"]`.
- `donutRadius` is `["42%", "70%"]`.

A host changes them with the `theme` option of `toEChartsOption`.

## Display settings in the view { #display-settings-for-the-people-who-use-the-report }

The Display settings of the chart type menu are part of the view. [The table of
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

`chart.tooltipShare` adds each value's share of the total to the tooltip:

- With two or more series in the chart, a share of the category's total: the sum of the series shown
  there. A category with one part left, the others empty or hidden, has no share.
- With one series, a share of the series' total over its categories.
- A pie or a donut: the slice's share of the slices shown.
- Only values that add up get one, and only without a part below zero. A heatmap gets none.

## Fixed colours { #fixed-colours }

The palette colours series and slices in turn, so a category's colour depends on what else the chart
shows. A fixed colour per name keeps it the same in every chart.

- The view's `chart.colors` lists `{ name, color }` entries. People set them with Display → Colours.
- The host's `colorMap` prop (`colorMap` property of the web component) sets them for every view:
  `{ Failed: "#e3000f", Success: ["#287233", "#4caf50"] }`. A list of two is one colour for the light
  theme and one for the dark.
- The view's colour wins over the host's. A name in neither keeps the palette's colour.
- Names match series of bars, lines and areas, and slices of a pie or a donut, without regard to case.
  A heatmap has no series to colour.
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
