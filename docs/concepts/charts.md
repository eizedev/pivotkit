---
title: Charts
description: The chart of a pivotkit report - chart types, value labels and where a pie writes them, legend, title, smooth lines, axis labels and group labels in the view, the PNG export, and chartOptions for developers with its precedence.
---

# Charts

The chart is the same view drawn as an [Apache ECharts](https://echarts.apache.org/) chart: the items
of Rows are the categories, one series per item of Columns and value. What the people who use the
report see and choose - the chart types, the automatic type, the Display settings, the tips, the
tooltip and the PNG export - is on [Charts](../use/charts.md) under Use a report. This page is the
developer's side: the view's `chart` settings, what "auto" stands for, and `chartOptions`.

## The chart type

`chart.type` is `"auto"` (the default, also for a view without a type: the data decides), `"bar"`,
`"line"`, `"area"`, `"pie"`, `"donut"` or `"heatmap"`. What Automatic draws, and the tips that suggest
another type, are in [Chart types](../use/charts.md#chart-types).

pivotkit-core's `autoChartType(view, data)` says what "auto" stands for (`"line"` with a date along
the time line on Rows, else `"bar"`) and `toEChartsOption()` draws it; the swap for dates on Columns is
the UI's (pivotkit-react computes the chart from the swapped view, `chartPlan` in `chart-types.js`).
A pie and a donut differ only in the hole (pivotkit-core's `DEFAULT_THEME.pieRadius` `["0%", "70%"]`
and `donutRadius` `["42%", "70%"]`, which a host changes with `toEChartsOption`'s `theme`).

## Display settings in the view { #display-settings-for-the-people-who-use-the-report }

The Display settings of the chart type menu ([the table of choices](../use/charts.md#display-settings))
are part of the view, so a saved view, a link and the PNG export keep them, and they stay when the
chart type changes:

| Key | Values |
| --- | --- |
| `chart.valueLabels` | `"auto"`, `"off"`, `"value"`, `"percent"`, `"both"` |
| `chart.labelPosition` | `"outside"`, `"inside"` |
| `chart.legend` | `"auto"`, `"bottom"`, `"right"`, `"off"` |
| `chart.title` | text, at most `limits.name` characters, or `null` |
| `chart.smooth` | `true`, `false` |
| `chart.axisLabels` | `"auto"`, `"all"`, `"nth"` |
| `chart.groupLabels` | `"auto"`, `"on"`, `"off"` |

A view without them gets the defaults; an unknown value falls back to its default and is reported by
`normalize()` ([Views](views.md)). "Percent" and "Value and percent" are a pie's and a donut's; another
type writes the value.

The chart's colours, its title's size and weight and the corners of its bars, slices and tooltip come
from the report's `--pk-*` tokens, so a corporate theme reaches the chart too
([Theming](../reference/theming.md#chart-colours)).

## `chartOptions` (for developers)

`chartOptions` is a plain JSON object merged over the [Apache ECharts](https://echarts.apache.org/en/option.html)
option the report builds, for what the menus do not offer: a font size, axis names, margins, a
colour. It is a prop of pivotkit-react and a property of `<pivot-report>`.

```jsx
<PivotReport
    data={rows}
    chartOptions={{
        textStyle: { fontSize: 13 },
        title: { textStyle: { fontSize: 18 } },
        xAxis: { name: "Region", nameLocation: "middle", nameGap: 32 },
        series: { barMaxWidth: 24 },
        grid: { left: 48 }
    }}
/>
```

```js
document.querySelector("pivot-report").chartOptions = { legend: { textStyle: { fontSize: 14 } } };
```

How it is merged:

- objects key by key, so `{ title: { textStyle: { fontSize: 18 } } }` changes the font size and keeps
  the view's title text;
- a list entry by entry (`series: [{ ... }, { ... }]`), and an object given for a list into every
  entry of it: `{ series: { barMaxWidth: 24 } }` sets every series;
- any other value replaces the report's.

**Precedence.** The report builds the option from the view (its type and display settings), adds its
own styles (the theme's colours, rounded bars, the tooltip), then merges `chartOptions` over all of
it: the host wins. `{ legend: { show: false } }` hides the legend even when the user picked "Bottom",
so keep `chartOptions` to what the user should not change.

**Only JSON.** Strings, finite numbers, booleans, `null`, plain objects and arrays pass. Functions
(formatters), class instances (`Date`, `Map`), symbols, `Infinity`, the keys `__proto__`,
`constructor` and `prototype`, more than 12 levels and more than 2,000 entries are left out, with one
console warning that names them, when the chart is drawn (the check loads with ECharts). It is compared by value, so a host may build a new object on every
render. The report's own formatters (numbers in the user's language) stay.

**No markup, addresses or templates.** Some ECharts options are not data: ECharts writes a string
`formatter` of the tooltip, and the tooltip's `content`, into the page as HTML (`innerHTML`), which
would run what it holds and replace the report's tooltip of plain text nodes (the one a strict
Content-Security-Policy allows); a title's `link` and `sublink` open a window. So these are left out
wherever they are in `chartOptions`, each named in the warning:

| Left out | Why |
| --- | --- |
| a string `formatter` (any depth: tooltip, labels, legend, axes) and a string `content` | written as HTML in the tooltip; the others are templates of the same kind and refer to `rich` |
| `rich` | text styles that templates refer to |
| `link`, `sublink`, `target`, `subtarget`, `linkTarget` | open an address |
| `image` and any text that starts with `image://` (a symbol) | load an address |
| `extraCssText`, `className`, `appendTo`, `appendToBody`, `renderMode` | change the tooltip's element and where it lives |

What is left of `chartOptions` is styles, sizes, numbers and names; nothing in it is markup or an
address, and nothing in it is run. The rule follows ECharts 6.1.0 (its `TooltipHTMLContent` and
`windowOpen`).
